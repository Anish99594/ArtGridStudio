import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatEther, parseEther } from 'viem';
import { useReadContract, useWriteContract, useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import debounce from 'lodash.debounce';
import './NFTCard.css';
import { SignJWT } from 'jose';
import artGridStudioABI from '../../abis/ArtGridStudio.json';

const ARTGRIDSTUDIO_ADDRESS = '0x3101Ab5c760FD9BD5cE573Ed09902E39354aF492';

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

    const handleLike = () => {
      if (!isConnected) {
        toast.error('Please connect your wallet to like');
        return;
      }
      if (hasLiked) {
        toast.error('You have already liked this NFT');
        return;
      }
      if (onAddEngagement) {
        console.log('handleLike called for tokenId', tokenId, { likes: 1, comment: '' });
        onAddEngagement(tokenId, 1, '');
      }
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
        console.log('handleComment called for tokenId', tokenId, { likes: 0, comment });
        onAddEngagement(tokenId, 0, comment);
        setComment('');
        setIsCommentFormOpen(false);
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
        await writeContractAsync({
          address: ARTGRIDSTUDIO_ADDRESS,
          abi: artGridStudioABI,
          functionName: 'listNFTForSale',
          args: [tokenId, parseEther(price)],
        });
        toast.success('NFT listed for sale!');
      } catch (error) {
        toast.error('Failed to list NFT: ' + error.message);
      }
    };

    const handleCancelListing = async () => {
      try {
        await writeContractAsync({
          address: ARTGRIDSTUDIO_ADDRESS,
          abi: artGridStudioABI,
          functionName: 'cancelListing',
          args: [tokenId],
        });
        toast.success('Listing canceled!');
      } catch (error) {
        toast.error('Failed to cancel listing: ' + error.message);
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

    if (!nftData) {
      console.log('No nftData for tokenId', tokenId, 'showing loading state');
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
              {console.log('Rendering engagement stats for tokenId', tokenId, 'with nftData:', nftData)}
              <div className="stat">
                <div className="stat-icon likes-icon">❤️</div>
                <span className="stat-value">{nftData.totalLikes || 0}</span>
                <span className="stat-label">Likes</span>
              </div>
              <div className="stat">
                <div className="stat-icon comments-icon">💬</div>
                <span className="stat-value">{nftData.totalComments || 0}</span>
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
                disabled={loading || hasLiked}
                title={hasLiked ? 'You have already liked this NFT' : !isConnected ? 'Connect wallet to like' : ''}
              >
                <span className="action-icon">❤️</span>
                {hasLiked ? 'Liked' : 'Like'}
              </button>
              <button
                className={`action-button comment ${isCommentFormOpen ? 'active' : ''}`}
                onClick={handleCommentToggle}
                disabled={loading}
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
                  <button onClick={handleComment} className="submit-button" disabled={loading}>
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
            <div className="stake-form">
              <div className="section-header">
                <h4>Stake LYX</h4>
                <button className="close-button" onClick={() => setIsStakeFormOpen(false)}>✕</button>
              </div>
              <div className="stake-info">
                <p>Staking LYX helps this NFT level up to the next tier!</p>
              </div>
              <div className="input-group">
                <label htmlFor="stake-amount">Amount (LYX)</label>
                <div className="input-with-buttons">
                  <button
                    className="amount-button"
                    onClick={() => setStakeAmount(Math.max(0.01, stakeAmount - 0.1))}
                  >
                    -
                  </button>
                  <input
                    id="stake-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(Number(e.target.value))}
                    required
                    className="stake-input"
                  />
                  <button className="amount-button" onClick={() => setStakeAmount(stakeAmount + 0.1)}>
                    +
                  </button>
                </div>
                <div className="quick-amounts">
                  <button onClick={() => setStakeAmount(0.1)}>0.1</button>
                  <button onClick={() => setStakeAmount(0.5)}>0.5</button>
                  <button onClick={() => setStakeAmount(1)}>1.0</button>
                  <button onClick={() => setStakeAmount(5)}>5.0</button>
                </div>
              </div>
              <div className="form-actions">
                <button onClick={handleStake} className="submit-button stake-submit" disabled={loading}>
                  <span className="stake-submit-icon">💎</span>
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
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.tokenId === nextProps.tokenId &&
      prevProps.tierIndex === nextProps.tierIndex &&
      prevProps.metadata === nextProps.metadata &&
      prevProps.nftData === nextProps.nftData &&
      prevProps.price === nextProps.price &&
      prevProps.loading === nextProps.loading &&
      prevProps.isConnected === nextProps.isConnected &&
      prevProps.comments === nextProps.comments &&
      prevProps.isOwned === nextProps.isOwned
    );
  }
);

export default NFTCard;