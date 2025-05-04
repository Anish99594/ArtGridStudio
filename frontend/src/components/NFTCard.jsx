import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatEther, parseEther } from 'viem';
import { useReadContract, useWriteContract, useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import debounce from 'lodash.debounce';
import './NFTCard.css';
import { SignJWT } from 'jose';
import artGridStudioABI from '../../abis/ArtGridStudio.json';

const ARTGRIDSTUDIO_ADDRESS = '0x2a2f4030db2108Db832a25b22A24286673A2D265'; // Standardized address

const NFTCard = React.memo(
  ({
    tokenId,
    nftData,
    metadata,
    onBuy,
    onAddEngagement,
    onStakeLYX,
    isOwned = false,
    price,
    loading = false,
    isConnected = false,
    comments = [],
    tierIndex,
    imageCache,
  }) => {
    const [comment, setComment] = useState('');
    const [stakeAmount, setStakeAmount] = useState(0.1);
    const [isCommentFormOpen, setIsCommentFormOpen] = useState(false);
    const [isStakeFormOpen, setIsStakeFormOpen] = useState(false);
    const [imageSrc, setImageSrc] = useState('');
    const [isLoadingImage, setIsLoadingImage] = useState(true);
    const [imageError, setImageError] = useState(false);
    const [attemptCount, setAttemptCount] = useState(0);
    const [pendingAction, setPendingAction] = useState(null);
    const isFetchingRef = useRef(false);

    const { address } = useAccount();
    const { writeContractAsync } = useWriteContract();

    const workerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';
    const proxyUrl = `${workerUrl}/proxy-image`;

    const { data: hasLiked } = useReadContract({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      functionName: 'hasLiked',
      args: [tokenId, address],
      enabled: !!address && !!tokenId,
    });

    const { data: isListed } = useReadContract({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      functionName: 'isListed',
      args: [tokenId],
      enabled: !!tokenId,
    });

    const { data: isOperator } = useReadContract({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      functionName: 'isOperatorFor',
      args: [ARTGRIDSTUDIO_ADDRESS, tokenId],
      enabled: !!tokenId && isOwned,
    });

    const generateJwt = useCallback(async () => {
      const now = Date.now();
      const cachedJwt = sessionStorage.getItem(`jwt-nft-image-feed-${tokenId}`);
      const jwtExpiration = Number(sessionStorage.getItem(`jwt-expiration-${tokenId}`)) || 0;
      if (cachedJwt && jwtExpiration > now) {
        console.log('Using cached JWT for nft-image-fetch');
        return cachedJwt;
      }
      const sharedSecret = import.meta.env.VITE_SHARED_SECRET;
      if (!sharedSecret) {
        throw new Error('Shared secret not configured');
      }
      try {
        const secret = new TextEncoder().encode(sharedSecret);
        const jwt = await new SignJWT({ sub: 'nft-image-fetch' })
          .setProtectedHeader({ alg: 'HS256' })
          .setExpirationTime('1h')
          .sign(secret);
        sessionStorage.setItem(`jwt-nft-image-feed-${tokenId}`, jwt);
        sessionStorage.setItem(`jwt-expiration-${tokenId}`, now + 55 * 60 * 1000);
        console.log('Generated new JWT for nft-image-fetch:', jwt);
        return jwt;
      } catch (error) {
        console.error('JWT generation failed in NFTCard:', error);
        throw error;
      }
    }, [tokenId]);

    const loadImage = useCallback(
      async (attempt = 1, maxAttempts = 4) => {
        if (isFetchingRef.current) {
          console.log(`Skipping fetch for tokenId ${tokenId}, tierIndex ${tierIndex}: already fetching`);
          return;
        }
        isFetchingRef.current = true;
        setIsLoadingImage(true);
        setImageError(false);

        if (!metadata || !metadata.image) {
          console.warn(`Invalid or missing image in metadata for tokenId ${tokenId}, tierIndex ${tierIndex}:`, metadata);
          setImageSrc('/fallback-image.png');
          setImageError(true);
          setIsLoadingImage(false);
          isFetchingRef.current = false;
          return;
        }

        let imageUrl = metadata.image;
        if (!imageUrl.startsWith(proxyUrl) && imageUrl.startsWith('https://drive.google.com')) {
          imageUrl = `${proxyUrl}?url=${encodeURIComponent(imageUrl)}`;
          console.log(`Using proxy for image URL: ${imageUrl}`);
        }

        if (!imageUrl.startsWith(proxyUrl) && !imageUrl.startsWith('/')) {
          console.warn(`Invalid image URL format for tokenId ${tokenId}, tierIndex ${tierIndex}: ${imageUrl}`);
          setImageSrc('/fallback-image.png');
          setImageError(true);
          setIsLoadingImage(false);
          isFetchingRef.current = false;
          return;
        }

        const cacheKey = `${tokenId}-${tierIndex}`;
        const cached = imageCache.get(cacheKey);
        if (cached && cached.url) {
          try {
            await fetch(cached.url);
            cached.refCount++;
            console.log(`Using cached image for ${cacheKey}, refCount: ${cached.refCount}`);
            setImageSrc(cached.url);
            setIsLoadingImage(false);
            isFetchingRef.current = false;
            return;
          } catch {
            console.log(`Cached blob URL invalid for ${cacheKey}, refetching`);
            imageCache.delete(cacheKey);
          }
        }

        try {
          const startTime = Date.now();
          console.log(`Fetching image for tokenId ${tokenId}, tierIndex ${tierIndex}: ${imageUrl}, Attempt: ${attempt}`);
          let headers = {};
          if (imageUrl.startsWith(proxyUrl)) {
            const jwt = await generateJwt();
            headers = { Authorization: `Bearer ${jwt}` };
          }

          const response = await fetch(imageUrl, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(30000),
          });

          console.log('Image fetch response:', {
            tokenId,
            tierIndex,
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            duration: `${Date.now() - startTime}ms`,
          });

          if (!response.ok) {
            throw new Error(`Image fetch failed: ${response.status} ${response.statusText}`);
          }

          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('image')) {
            throw new Error(`Invalid content type: ${contentType}`);
          }

          const blob = await response.blob();
          console.log(`Blob size: ${blob.size}, type: ${blob.type}`);

          const objectUrl = URL.createObjectURL(blob);
          imageCache.set(cacheKey, { url: objectUrl, refCount: 1 });
          setImageSrc(objectUrl);
          setIsLoadingImage(false);
          setAttemptCount(0);
          isFetchingRef.current = false;
          console.log(`Image loaded successfully: ${objectUrl}, refCount: 1`);
        } catch (error) {
          console.error(`Image fetch attempt ${attempt} failed for tokenId ${tokenId}, tierIndex ${tierIndex}:`, {
            error: error.message,
            stack: error.stack,
            url: imageUrl,
          });
          if (attempt < maxAttempts) {
            setAttemptCount(attempt);
            await new Promise((resolve) => setTimeout(resolve, 5000 * Math.pow(2, attempt)));
            isFetchingRef.current = false;
            await loadImage(attempt + 1, maxAttempts);
          } else {
            setImageSrc('/fallback-image.png');
            setImageError(true);
            setIsLoadingImage(false);
            setAttemptCount(0);
            isFetchingRef.current = false;
            toast.error('Failed to load NFT image after retries');
          }
        }
      },
      [metadata, tokenId, tierIndex, proxyUrl, generateJwt, imageCache]
    );

    const debouncedLoadImage = useCallback(
      debounce((attempt = 1) => loadImage(attempt), 500),
      [loadImage]
    );

    useEffect(() => {
      console.log(`useEffect triggered for tokenId ${tokenId}, tierIndex ${tierIndex}, metadata:`, metadata);
      if (!metadata?.image || imageSrc) {
        console.log(`No image to load for tokenId ${tokenId}, tierIndex ${tierIndex} or image already loaded`);
        setIsLoadingImage(false);
        return;
      }

      debouncedLoadImage();

      return () => {
        debouncedLoadImage.cancel();
        const cacheKey = `${tokenId}-${tierIndex}`;
        const cached = imageCache.get(cacheKey);
        if (cached && cached.url === imageSrc) {
          cached.refCount--;
          console.log(`Decremented refCount for ${cacheKey}: ${cached.refCount}`);
          if (cached.refCount <= 0) {
            console.log(`Revoking blob URL for ${cacheKey}: ${cached.url}`);
            URL.revokeObjectURL(cached.url);
            imageCache.delete(cacheKey);
          }
        }
      };
    }, [metadata, tokenId, tierIndex, debouncedLoadImage, imageSrc, imageCache]);

    const debouncedHandleLike = useCallback(
      debounce(() => {
        if (!isConnected) {
          toast.error('Please connect your wallet to like');
          return;
        }
        if (hasLiked) {
          toast.error('You have already liked this NFT');
          return;
        }
        if (onAddEngagement) {
          setPendingAction('like');
          onAddEngagement(tokenId, 1, '').finally(() => setPendingAction(null));
        }
      }, 500),
      [isConnected, hasLiked, onAddEngagement, tokenId]
    );

    const handleLike = () => {
      debouncedHandleLike();
    };

    const handleCommentToggle = () => {
      if (!isConnected) {
        toast.error('Please connect your wallet to comment');
        return;
      }
      setIsCommentFormOpen(!isCommentFormOpen);
    };

    const handleComment = (e) => {
      e.preventDefault();
      if (onAddEngagement && comment.trim()) {
        setPendingAction('comment');
        onAddEngagement(tokenId, 0, comment).finally(() => {
          setPendingAction(null);
          setComment('');
          setIsCommentFormOpen(false);
        });
      }
    };

    const handleStakeToggle = () => {
      if (!isConnected) {
        toast.error('Please connect your wallet to stake LYX');
        return;
      }
      setIsStakeFormOpen(!isStakeFormOpen);
    };

    const handleStake = (e) => {
      e.preventDefault();
      if (onStakeLYX && stakeAmount > 0) {
        onStakeLYX(tokenId, stakeAmount);
        setStakeAmount(0.1);
        setIsStakeFormOpen(false);
      }
    };

    const handleApproveOperator = async () => {
      try {
        console.log(`Approving operator for tokenId ${tokenId}`);
        await writeContractAsync({
          address: ARTGRIDSTUDIO_ADDRESS,
          abi: artGridStudioABI,
          functionName: 'authorizeOperator',
          args: [ARTGRIDSTUDIO_ADDRESS, tokenId, '0x'],
        });
        toast.success('Operator approved successfully!');
        return true;
      } catch (error) {
        console.error('Failed to approve operator:', error);
        toast.error(`Failed to approve operator: ${error.message}`);
        return false;
      }
    };

    const handleListForSale = async () => {
      if (!isConnected) {
        toast.error('Please connect your wallet to list');
        return;
      }
      const price = prompt('Enter sale price in LYX:');
      if (!price || isNaN(price) || Number(price) <= 0) {
        toast.error('Invalid price');
        return;
      }

      try {
        // Check if contract is already an operator
        if (!isOperator) {
          toast.loading('Approving contract as operator...');
          const approved = await handleApproveOperator();
          if (!approved) {
            return;
          }
        }

        console.log(`Listing NFT for sale: tokenId=${tokenId}, price=${price} LYX`);
        toast.loading('Listing NFT for sale...');
        await writeContractAsync({
          address: ARTGRIDSTUDIO_ADDRESS,
          abi: artGridStudioABI,
          functionName: 'listNFTForSale',
          args: [tokenId, parseEther(price)],
          gas: 300000, // Set a reasonable gas limit
        });
        toast.dismiss();
        toast.success('NFT listed for sale!');
      } catch (error) {
        toast.dismiss();
        console.error('Failed to list NFT:', error);
        const reason = error.reason || error.message || 'Unknown error';
        toast.error(`Failed to list NFT: ${reason}`);
      }
    };

    const handleCancelListing = async () => {
      try {
        console.log(`Canceling listing for tokenId ${tokenId}`);
        toast.loading('Canceling listing...');
        await writeContractAsync({
          address: ARTGRIDSTUDIO_ADDRESS,
          abi: artGridStudioABI,
          functionName: 'cancelListing',
          args: [tokenId],
          gas: 200000, // Set a reasonable gas limit
        });
        toast.dismiss();
        toast.success('Listing canceled!');
      } catch (error) {
        toast.dismiss();
        console.error('Failed to cancel listing:', error);
        toast.error(`Failed to cancel listing: ${error.message}`);
      }
    };

    const calculateTierProgress = () => {
      if (!nftData || !nftData.tiers || nftData.currentTier + 1 >= nftData.tiers.length) {
        return { likes: 100, comments: 100, lyx: 100 };
      }

      const nextTier = nftData.tiers[nftData.currentTier + 1];
      const currentLikes = nftData.totalLikes || 0;
      const currentComments = nftData.totalComments || 0;
      const currentLyx = nftData.totalStakedLyx ? Number(formatEther(BigInt(nftData.totalStakedLyx))) : 0;

      const requiredLikes = nextTier?.likesRequired || 1;
      const requiredComments = nextTier?.commentsRequired || 1;
      const requiredLyx = nextTier?.lyxStakeRequired ? Number(formatEther(BigInt(nextTier.lyxStakeRequired))) : 1;

      return {
        likes: Math.min(Math.round((currentLikes / requiredLikes) * 100), 100),
        comments: Math.min(Math.round((currentComments / requiredComments) * 100), 100),
        lyx: Math.min(Math.round((currentLyx / requiredLyx) * 100), 100),
      };
    };

    const tierProgress = calculateTierProgress();

    if (!tokenId || tokenId === '0x0000000000000000000000000000000000000000') {
      console.warn('Invalid tokenId:', tokenId);
      return null;
    }

    if (!nftData || !nftData.tiers) {
      console.log('No nftData or tiers for tokenId', tokenId, 'showing loading state');
      return (
        <div className="nft-card-wrapper">
          <div className="nft-card loading">
            <div className="nft-image placeholder animate-pulse bg-gray-200 h-48 w-full rounded-t-lg"></div>
            <div className="nft-info p-4">
              <div className="h-6 bg-gray-200 rounded w-3/4 mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="nft-card-wrapper">
        <div className="nft-card-glow"></div>
        <div className="nft-card">
          <div className="nft-rank-badge">Tier {nftData.currentTier + 1}</div>
          <div className="nft-image-container">
            {isLoadingImage ? (
              <div className="placeholder-image">
                <div className="loading-spinner"></div>
                <span>Loading masterpiece...</span>
              </div>
            ) : imageError ? (
              <div className="error-image">
                <img src="/fallback-image.png" alt="Fallback" className="fallback-icon" />
                <span>Failed to load image</span>
                <button className="retry-button" onClick={() => debouncedLoadImage(1)}>
                  <span className="retry-icon">↻</span> Retry
                </button>
              </div>
            ) : (
              <>
                <div className="nft-image-overlay">
                  <div className="nft-image-actions">
                    <button className="image-action-button preview-button" title="Preview">
                      <span className="action-icon">🔍</span>
                    </button>
                    <button className="image-action-button share-button" title="Share">
                      <span className="action-icon">↗️</span>
                    </button>
                  </div>
                </div>
                <img
                  src={imageSrc}
                  alt={metadata?.name || `NFT #${tokenId.slice(0, 8)}...`}
                  className="nft-image"
                  loading="lazy"
                  onError={(e) => {
                    console.error('Image onError triggered:', { imageSrc, attemptCount });
                    if (!imageSrc.includes('/fallback-image.png') && attemptCount < 4) {
                      setImageError(true);
                      setAttemptCount((prev) => {
                        const newCount = prev + 1;
                        console.log(`Incrementing attemptCount to ${newCount}`);
                        return newCount;
                      });
                      debouncedLoadImage(attemptCount + 1);
                    }
                  }}
                />
              </>
            )}
          </div>
          <div className="nft-content">
            <div className="nft-header">
              {metadata ? (
                <>
                  <h3 className="nft-title">{metadata.name || `NFT #${tokenId.slice(0, 8)}...`}</h3>
                  {nftData.creator && (
                    <div className="nft-creator">
                      <span className="creator-label">Creator:</span>
                      <span className="creator-address">{`${nftData.creator.slice(0, 6)}...${nftData.creator.slice(-4)}`}</span>
                      <span className="creator-verified-badge" title="Verified Creator">✓</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="nft-title-placeholder animate-pulse"></div>
                  <div className="nft-creator-placeholder animate-pulse"></div>
                </>
              )}
            </div>
            {metadata && (
              <div className="nft-description-container">
                <p className="nft-description">{metadata.description || 'No description available'}</p>
              </div>
            )}
            <div className="engagement-stats">
              <div className="stat">
                <div className="stat-icon likes-icon">❤️</div>
                <span className="stat-value">
                  {pendingAction === 'like' ? (
                    <span className="pending">+1 (Pending)</span>
                  ) : (
                    nftData.totalLikes || 0
                  )}
                </span>
                <span className="stat-label">Likes</span>
              </div>
              <div className="stat">
                <div className="stat-icon comments-icon">💬</div>
                <span className="stat-value">
                  {pendingAction === 'comment' ? (
                    <span className="pending">+1 (Pending)</span>
                  ) : (
                    nftData.totalComments || 0
                  )}
                </span>
                <span className="stat-label">Comments</span>
              </div>
              <div className="stat">
                <div className="stat-icon stake-icon">💎</div>
                <span className="stat-value">
                  {nftData.totalStakedLyx ? formatEther(BigInt(nftData.totalStakedLyx)).slice(0, 6) : '0'}
                </span>
                <span className="stat-label">LYX Staked</span>
              </div>
            </div>
            {nftData.tiers && nftData.currentTier + 1 < nftData.tiers.length && (
              <div className="next-tier-info">
                <h4>Next Tier Progress</h4>
                <div className="tier-progress-bars">
                  <div className="progress-item">
                    <div className="progress-label">
                      <span>Likes</span>
                      <span className="progress-value">
                        {nftData.totalLikes || 0}/{nftData.tiers[nftData.currentTier + 1]?.likesRequired || 0}
                      </span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${tierProgress.likes}%` }}></div>
                    </div>
                  </div>
                  <div className="progress-item">
                    <div className="progress-label">
                      <span>Comments</span>
                      <span className="progress-value">
                        {nftData.totalComments || 0}/{nftData.tiers[nftData.currentTier + 1]?.commentsRequired || 0}
                      </span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${tierProgress.comments}%` }}></div>
                    </div>
                  </div>
                  <div className="progress-item">
                    <div className="progress-label">
                      <span>LYX Staked</span>
                      <span className="progress-value">
                        {nftData.totalStakedLyx ? formatEther(BigInt(nftData.totalStakedLyx)).slice(0, 6) : '0'}/
                        {nftData.tiers[nftData.currentTier + 1]?.lyxStakeRequired
                          ? formatEther(BigInt(nftData.tiers[nftData.currentTier + 1].lyxStakeRequired)).slice(0, 6)
                          : '0'}
                      </span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar" style={{ width: `${tierProgress.lyx}%` }}></div>
                    </div>
                  </div>
                </div>
                <div className="tier-reward">
                  <div className="reward-icon">🏆</div>
                  <div className="reward-text">Next tier unlocks higher quality NFT version!</div>
                </div>
              </div>
            )}
            {nftData.tiers && nftData.currentTier + 1 >= nftData.tiers.length && (
              <div className="max-tier">
                <div className="max-tier-icon">🌟</div>
                <p>Maximum Tier Achieved</p>
                <div className="max-tier-banner">Elite Collection</div>
              </div>
            )}
            <div className="nft-actions">
              <button
                className={`action-button like ${hasLiked ? 'liked' : ''}`}
                onClick={handleLike}
                disabled={loading || hasLiked || pendingAction === 'like'}
                title={hasLiked ? 'You have already liked this NFT' : !isConnected ? 'Connect wallet to like' : ''}
              >
                <span className="action-icon">❤️</span>
                {hasLiked ? 'Liked' : 'Like'}
              </button>
              <button
                className={`action-button comment ${isCommentFormOpen ? 'active' : ''}`}
                onClick={handleCommentToggle}
                disabled={loading || pendingAction === 'comment'}
                title={!isConnected ? 'Connect wallet to comment' : ''}
              >
                <span className="action-icon">💬</span>
                Comment
              </button>
              <button
                className={`action-button stake ${isStakeFormOpen ? 'active' : ''}`}
                onClick={handleStakeToggle}
                disabled={loading}
                title={!isConnected ? 'Connect wallet to stake' : ''}
              >
                <span className="action-icon">💎</span>
                Stake LYX
              </button>
            </div>
            {isOwned && !isListed && (
              <div className="nft-ownership-actions">
                <button
                  onClick={handleListForSale}
                  disabled={loading || !isConnected}
                  className="sell-button"
                >
                  <span className="sell-icon">🏷️</span>
                  List for Sale
                </button>
              </div>
            )}
            {isOwned && isListed && (
              <div className="nft-ownership-actions">
                <button
                  onClick={handleCancelListing}
                  disabled={loading || !isConnected}
                  className="cancel-listing-button"
                >
                  <span className="cancel-icon">✖️</span>
                  Cancel Listing
                </button>
              </div>
            )}
            {!isOwned && (
              <div className="nft-buy-action">
                <button
                  onClick={onBuy}
                  disabled={!price || loading || !isConnected}
                  className="buy-button"
                  title={!isConnected ? 'Connect wallet to buy' : !price ? 'Price not available' : ''}
                >
                  <span className="buy-icon">🛒</span>
                  Buy Now
                  <span className="buy-price">{price ? (Number(price) / 1e18).toFixed(2) : '0'} LYX</span>
                </button>
              </div>
            )}
          </div>
          {isCommentFormOpen && (
            <div className="comment-section">
              <div className="section-header">
                <h4>Add Comment</h4>
                <button className="close-button" onClick={() => setIsCommentFormOpen(false)}>✕</button>
              </div>
              <div className="comment-form">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your thoughts about this NFT..."
                  required
                  className="comment-textarea"
                />
                <div className="form-actions">
                  <button onClick={handleComment} className="submit-button" disabled={loading || pendingAction === 'comment'}>
                    <span className="submit-icon">📤</span>
                    Submit
                  </button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => setIsCommentFormOpen(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {comments.length > 0 && (
                <div className="comments-list">
                  <h4>Latest Comments</h4>
                  {comments.map((c, index) => (
                    <div key={index} className="comment-item">
                      <div className="comment-header">
                        <div className="commenter-avatar">{c.commenter.slice(0, 2)}</div>
                        <div className="commenter-info">
                          <p className="commenter-address">{c.commenter.slice(0, 6)}...{c.commenter.slice(-4)}</p>
                          <p className="comment-date">{new Date(c.timestamp * 1000).toLocaleString()}</p>
                        </div>
                      </div>
                      <p className="comment-text">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isStakeFormOpen && (
            <div className="stake-section">
              <div className="section-header">
                <h4>Stake LYX</h4>
                <button className="close-button" onClick={() => setIsStakeFormOpen(false)}>✕</button>
              </div>
              <div className="stake-form">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(Number(e.target.value))}
                  placeholder="Enter LYX amount"
                  min="0.1"
                  step="0.1"
                  required
                  className="stake-input"
                />
                <div className="form-actions">
                  <button onClick={handleStake} className="submit-button" disabled={loading || stakeAmount <= 0}>
                    <span className="submit-icon">💎</span>
                    Stake
                  </button>
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() => setIsStakeFormOpen(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default NFTCard;