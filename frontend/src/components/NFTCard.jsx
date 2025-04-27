import React from 'react';
import { useState, useEffect } from 'react';
import { formatEther } from 'viem';
import toast from 'react-hot-toast';
import './NFTCard.css';

const NFTCard = ({
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
}) => {
  const [comment, setComment] = useState('');
  const [stakeAmount, setStakeAmount] = useState(0.1);
  const [isCommentFormOpen, setIsCommentFormOpen] = useState(false);
  const [isStakeFormOpen, setIsStakeFormOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState('');
  const [isLoadingImage, setIsLoadingImage] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const workerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';

  console.log('NFTCard props for tokenId', tokenId, {
    price,
    loading,
    isConnected,
    disabled: !price || loading || !isConnected,
    totalComments: nftData?.totalComments || 0,
    totalLikes: nftData?.totalLikes || 0,
    metadata,
  });

  const fetchQueue = [];
  let isFetching = false;

  async function processQueue() {
    if (isFetching || fetchQueue.length === 0) return;
    isFetching = true;
    const { cid, callback } = fetchQueue.shift();
    try {
      let imageCid = cid.replace('ipfs://', '');
      if (!imageCid.match(/^(baf[0-9a-z]+|Qm[0-9a-zA-Z]+)/)) {
        throw new Error(`Invalid image CID: ${imageCid}`);
      }
      const imageFetchUrl = `${workerUrl}/ipfs/image/${imageCid}`;
      console.log('Fetching image for CID:', imageCid, 'URL:', imageFetchUrl, `Attempt: ${attemptCount + 1}`);
      const response = await fetch(imageFetchUrl, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow',
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await response.clone().text().catch(() => 'No response body');
      console.log('Image fetch response:', response.status, response.statusText, 'URL:', response.url, 'Body:', responseText);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      callback(response.url, false);
    } catch (error) {
      callback(null, true);
    } finally {
      isFetching = false;
      processQueue();
    }
  }

  const fetchImage = async (cid) => {
    return new Promise((resolve) => {
      fetchQueue.push({
        cid,
        callback: (url, error) => {
          if (error && attemptCount < 4) {
            setTimeout(() => setAttemptCount((prev) => prev + 1), 2000 * Math.pow(2, attemptCount));
          } else if (error) {
            setImageSrc('/fallback-image.png');
            setImageError(true);
            setIsLoadingImage(false);
            setAttemptCount(0);
            toast.error('Failed to load NFT image');
          } else {
            setImageSrc(url);
            setImageError(false);
            setIsLoadingImage(false);
            setAttemptCount(0);
          }
          resolve();
        },
      });
      processQueue();
    });
  };

  useEffect(() => {
    setAttemptCount(0);
    if (!metadata) {
      setIsLoadingImage(true);
    } else if (metadata.image && metadata.image.startsWith('ipfs://')) {
      console.log(`Processing image for tokenId ${tokenId}: ${metadata.image}`);
      fetchImage(metadata.image);
    } else {
      console.warn('Invalid or missing image in metadata:', metadata);
      setImageSrc('/fallback-image.png');
      setImageError(true);
      setIsLoadingImage(false);
    }
  }, [metadata, workerUrl, tokenId, retryTrigger]);

  const handleLike = () => {
    if (!isConnected) {
      toast.error('Please connect your wallet to like');
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

  if (!nftData) {
    console.log('No nftData for tokenId', tokenId, 'showing loading state');
    return (
      <div className="nft-card loading">
        <div className="nft-image placeholder"></div>
        <div className="nft-info">
          <h3>Loading...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="nft-card">
      <div className="nft-image">
        {isLoadingImage ? (
          <div className="placeholder-image w-full h-48 bg-gray-200 flex items-center justify-center rounded">
            <span>Loading image...</span>
          </div>
        ) : imageError ? (
          <div className="error-image w-full h-48 bg-gray-200 flex flex-col items-center justify-center rounded">
            <span>Failed to load image</span>
            <button
              className="retry-button mt-2 px-4 py-2 bg-blue-500 text-white rounded"
              onClick={() => setRetryTrigger((prev) => prev + 1)}
            >
              Retry
            </button>
          </div>
        ) : (
          <img
            src={imageSrc}
            alt={metadata?.name || `NFT #${tokenId.slice(0, 8)}...`}
            className="w-full h-48 object-cover rounded"
            loading="lazy"
            onError={() => {
              if (!imageSrc.includes('/fallback-image.png')) {
                setImageError(true);
                setAttemptCount((prev) => prev + 1);
              }
            }}
          />
        )}
      </div>
      <div className="nft-info">
        <h3>{metadata?.name || `NFT #${tokenId.slice(0, 8)}...`}</h3>
        <p className="nft-description">{metadata?.description || 'No description available'}</p>
        <div className="engagement-stats">
          <div className="stat">
            <span className="label">Likes:</span>
            <span className="value">{nftData.totalLikes || 0}</span>
          </div>
          <div className="stat">
            <span className="label">Comments:</span>
            <span className="value">{nftData.totalComments || 0}</span>
          </div>
          <div className="stat">
            <span className="label">Staked LYX:</span>
            <span className="value">
              {nftData.totalStakedLyx ? formatEther(BigInt(nftData.totalStakedLyx)).slice(0, 6) : '0'} LYX
            </span>
          </div>
        </div>
        {nftData.tiers && nftData.currentTier + 1 < nftData.tiers.length && (
          <div className="next-tier-info">
            <h4>Next Tier Requirements:</h4>
            <div className="tier-requirements">
              <div className="requirement">
                <span className="label">Likes:</span>
                <span className="value">
                  {nftData.totalLikes || 0}/{nftData.tiers[nftData.currentTier + 1]?.likesRequired || 0}
                </span>
              </div>
              <div className="requirement">
                <span className="label">Comments:</span>
                <span className="value">
                  {nftData.totalComments || 0}/{nftData.tiers[nftData.currentTier + 1]?.commentsRequired || 0}
                </span>
              </div>
              <div className="requirement">
                <span className="label">Staked LYX:</span>
                <span className="value">
                  {nftData.totalStakedLyx ? formatEther(BigInt(nftData.totalStakedLyx)).slice(0, 6) : '0'}/
                  {nftData.tiers[nftData.currentTier + 1]?.lyxStakeRequired
                    ? formatEther(BigInt(nftData.tiers[nftData.currentTier + 1].lyxStakeRequired)).slice(0, 6)
                    : '0'} LYX
                </span>
              </div>
            </div>
          </div>
        )}
        {nftData.tiers && nftData.currentTier + 1 >= nftData.tiers.length && (
          <p className="max-tier">This NFT has reached its final tier.</p>
        )}
      </div>
      <div className="nft-actions">
        <button
          className="action-button like"
          onClick={handleLike}
          disabled={loading}
          title={!isConnected ? 'Connect wallet to like' : ''}
        >
          <span className="icon">❤️</span> Like
        </button>
        <button
          className="action-button comment"
          onClick={handleCommentToggle}
          disabled={loading}
          title={!isConnected ? 'Connect wallet to comment' : ''}
        >
          <span className="icon">💬</span> Comment
        </button>
        <button
          className="action-button stake"
          onClick={handleStakeToggle}
          disabled={loading}
          title={!isConnected ? 'Connect wallet to stake' : ''}
        >
          <span className="icon">💎</span> Stake LYX
        </button>
      </div>
      {!isOwned && (
        <div className="nft-buy-action">
          <button
            onClick={onBuy}
            disabled={!price || loading || !isConnected}
            className="buy-button"
            title={!isConnected ? 'Connect wallet to buy' : !price ? 'Price not available' : ''}
          >
            Buy ({price ? (Number(price) / 1e18).toFixed(2) : '0'} LYX)
          </button>
        </div>
      )}
      {isCommentFormOpen && (
        <div className="comment-section">
          <form className="comment-form" onSubmit={handleComment}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add your comment..."
              required
              className="w-full p-2 border rounded"
            />
            <div className="form-actions">
              <button type="submit" className="submit-button" disabled={loading}>
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
          </form>
          {comments.length > 0 && (
            <div className="comments-list">
              <h4>Comments</h4>
              {comments.map((c, index) => (
                <div key={index} className="comment-item">
                  <p className="comment-text">{c.text}</p>
                  <p className="comment-meta">
                    By {c.commenter.slice(0, 6)}...{c.commenter.slice(-4)} at{' '}
                    {new Date(c.timestamp * 1000).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {isStakeFormOpen && (
        <form className="stake-form" onSubmit={handleStake}>
          <div className="input-group">
            <label htmlFor="stake-amount">Amount (LYX)</label>
            <input
              id="stake-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(Number(e.target.value))}
              required
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="submit-button" disabled={loading}>
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
        </form>
      )}
    </div>
  );
};

export default React.memo(NFTCard);