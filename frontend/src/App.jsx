import { useState, useEffect, useMemo, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import NFTCard from './components/NFTCard';
import CreateNFT from './components/CreateNFT';
import Header from './components/Header';
import Footer from './components/Footer';
import About from './components/Aboutwebsite';
import ErrorBoundary from './components/ErrorBoundary';
import { SignJWT } from 'jose';
import artGridStudioABI from '../abis/ArtGridStudio.json';
import toast from 'react-hot-toast';
import PQueue from 'p-queue';
import { motion, AnimatePresence } from 'framer-motion';
import './App.css';

const ARTGRIDSTUDIO_ADDRESS = '0x2a2f4030db2108Db832a25b22A24286673A2D265';

function App() {
  const [activeTab, setActiveTab] = useState('about');
  const [ownedNFTs, setOwnedNFTs] = useState(null);
  const [nftData, setNftData] = useState({});
  const [nftMetadata, setNftMetadata] = useState({});
  const [nftPrices, setNftPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [tokenIdQueue, setTokenIdQueue] = useState([]);
  const [currentTokenId, setCurrentTokenId] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('latest');
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [showStats, setShowStats] = useState(false);

  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const statsRef = useRef(null);
  const marketplaceRef = useRef(null);

  const metadataCache = useMemo(() => new Map(), []);
  const imageCache = useMemo(() => new Map(), []); // Stores { url, refCount }
  const jwtCache = useMemo(() => ({ token: null, expires: 0 }), []);

  const generateJwt = async () => {
    const now = Date.now();
    if (jwtCache.token && jwtCache.expires > now) {
      return jwtCache.token;
    }
    const sharedSecret = import.meta.env.VITE_SHARED_SECRET;
    if (!sharedSecret) {
      throw new Error('Shared secret not configured');
    }
    try {
      const secret = new TextEncoder().encode(sharedSecret);
      const jwt = await new SignJWT({ sub: 'nft-fetch' })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(secret);
      jwtCache.token = jwt;
      jwtCache.expires = now + 55 * 60 * 1000;
      return jwt;
    } catch (error) {
      console.error('JWT generation failed:', error);
      throw error;
    }
  };

  const { data: ownedNFTsData, refetch: refetchOwnedNFTs } = useReadContract({
    address: ARTGRIDSTUDIO_ADDRESS,
    abi: artGridStudioABI,
    functionName: 'getOwnedNFTs',
    args: [address || '0x0000000000000000000000000000000000000000'],
    enabled: !!address,
    retry: 5,
    retryDelay: 2000,
    pollingInterval: 10000,
  });

  const { data: availableNFTs, refetch: refetchAvailableNFTs } = useReadContract({
    address: ARTGRIDSTUDIO_ADDRESS,
    abi: artGridStudioABI,
    functionName: 'getOwnedNFTs',
    args: [ARTGRIDSTUDIO_ADDRESS],
    watch: true,
    retry: 5,
    retryDelay: 2000,
    pollingInterval: 10000,
  });

  useEffect(() => {
    if (!publicClient) return;

    const unwatchMinted = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'NFTMinted',
      onLogs: (logs) => {
        logs.forEach((log) => {
          const { tokenId } = log.args;
          setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
          toast.success('New NFT minted!', {
            icon: '🎨',
            style: {
              background: 'var(--surface)',
              color: 'var(--text)',
              borderLeft: '4px solid var(--primary)',
              borderRadius: 'var(--border-radius-sm)',
            },
          });
        });
        setTimeout(() => {
          refetchAvailableNFTs();
          refetchOwnedNFTs();
        }, 2000);
      },
    });

    const unwatchEngagement = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'EngagementUpdated',
      onLogs: (logs) => {
        const tokenId = logs[0].args.tokenId;
        setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
      },
    });

    const unwatchComment = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'CommentAdded',
      onLogs: async (logs) => {
        const tokenId = logs[0].args.tokenId;
        toast.success('New comment added!', {
          icon: '💬',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--secondary)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        try {
          const nftDataResult = await publicClient.readContract({
            address: ARTGRIDSTUDIO_ADDRESS,
            abi: artGridStudioABI,
            functionName: 'getNFTData',
            args: [tokenId],
          });
          const [currentTier, totalLikes, totalComments, totalStakedLyx, tiers, comments, price] = nftDataResult;
          setNftData((prev) => ({
            ...prev,
            [tokenId]: {
              currentTier: Number(currentTier || 0),
              totalLikes: Number(totalLikes || 0),
              totalComments: Number(totalComments || 0),
              totalStakedLyx: totalStakedLyx ? Number(totalStakedLyx) : 0,
              tiers: (tiers || []).map((tier, index) => ({
                likesRequired: Number(tier.likesRequired || 0),
                commentsRequired: Number(tier.commentsRequired || 0),
                lyxStakeRequired: Number(tier.lyxStakeRequired || 0),
                metadataCid: tier.metadataCid || '',
                isUnlocked: tier.isUnlocked || false,
                tierIndex: index,
              })),
              comments: (comments || []).map((c) => ({
                commenter: c.commenter,
                text: c.text,
                timestamp: Number(c.timestamp),
              })),
              price: price ? Number(price) : 0,
            },
          }));
        } catch (error) {
          console.error(`Failed to fetch NFT data for tokenId ${tokenId}:`, error);
        }
      },
    });

    const unwatchLike = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'LikeAdded',
      onLogs: async (logs) => {
        const tokenId = logs[0].args.tokenId;
        toast.success('NFT liked!', {
          icon: '❤️',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--secondary)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        try {
          const nftDataResult = await publicClient.readContract({
            address: ARTGRIDSTUDIO_ADDRESS,
            abi: artGridStudioABI,
            functionName: 'getNFTData',
            args: [tokenId],
          });
          const [currentTier, totalLikes, totalComments, totalStakedLyx, tiers, comments, price] = nftDataResult;
          setNftData((prev) => ({
            ...prev,
            [tokenId]: {
              currentTier: Number(currentTier || 0),
              totalLikes: Number(totalLikes || 0),
              totalComments: Number(totalComments || 0),
              totalStakedLyx: totalStakedLyx ? Number(totalStakedLyx) : 0,
              tiers: (tiers || []).map((tier, index) => ({
                likesRequired: Number(tier.likesRequired || 0),
                commentsRequired: Number(tier.commentsRequired || 0),
                lyxStakeRequired: Number(tier.lyxStakeRequired || 0),
                metadataCid: tier.metadataCid || '',
                isUnlocked: tier.isUnlocked || false,
                tierIndex: index,
              })),
              comments: (comments || []).map((c) => ({
                commenter: c.commenter,
                text: c.text,
                timestamp: Number(c.timestamp),
              })),
              price: price ? Number(price) : 0,
            },
          }));
        } catch (error) {
          console.error(`Failed to fetch NFT data for tokenId ${tokenId}:`, error);
        }
      },
    });

    const unwatchListed = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'NFTListed',
      onLogs: () => {
        refetchAvailableNFTs();
        refetchOwnedNFTs();
        toast.success('New NFT listed for sale!', {
          icon: '🛒',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--primary)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
      },
    });

    const unwatchCanceled = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'NFTListingCanceled',
      onLogs: () => {
        refetchAvailableNFTs();
        refetchOwnedNFTs();
        toast.success('NFT listing canceled!', {
          icon: '❌',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--warning)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
      },
    });

    return () => {
      unwatchMinted();
      unwatchEngagement();
      unwatchComment();
      unwatchLike();
      unwatchListed();
      unwatchCanceled();
    };
  }, [publicClient, refetchAvailableNFTs, refetchOwnedNFTs]);

  const allTokenIds = useMemo(() => {
    const owned = (ownedNFTsData || []).filter(
      (tokenId) => tokenId && tokenId !== '0x0000000000000000000000000000000000000000'
    );
    const available = (availableNFTs || []).filter(
      (tokenId) => tokenId && tokenId !== '0x0000000000000000000000000000000000000000' && !owned.includes(tokenId)
    );
    return [...new Set([...owned, ...available])];
  }, [ownedNFTsData, availableNFTs]);

  useEffect(() => {
    setTokenIdQueue((prev) => {
      const newTokenIds = allTokenIds.filter(
        (tokenId) => tokenId && !prev.includes(tokenId) && !nftData[tokenId]
      );
      return [...new Set([...prev, ...newTokenIds])].filter((id) => id);
    });
  }, [allTokenIds, nftData]);

  useEffect(() => {
    if (tokenIdQueue.length > 0 && !currentTokenId) {
      setCurrentTokenId(tokenIdQueue[0]);
    }
  }, [tokenIdQueue, currentTokenId]);

  const { data: nftQueryData, isError, error } = useReadContract({
    address: ARTGRIDSTUDIO_ADDRESS,
    abi: artGridStudioABI,
    functionName: 'getNFTData',
    args: [currentTokenId],
    enabled: !!currentTokenId && currentTokenId !== '0x0000000000000000000000000000000000000000',
    retry: 5,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    pollingInterval: 10000,
  });

  useEffect(() => {
    if (nftQueryData && currentTokenId) {
      const [currentTier, totalLikes, totalComments, totalStakedLyx, tiers, comments, price] = nftQueryData;
      const updatedData = {
        currentTier: Number(currentTier || 0),
        totalLikes: Number(totalLikes || 0),
        totalComments: Number(totalComments || 0),
        totalStakedLyx: totalStakedLyx ? Number(totalStakedLyx) : 0,
        tiers: (tiers || []).map((tier, index) => ({
          likesRequired: Number(tier.likesRequired || 0),
          commentsRequired: Number(tier.commentsRequired || 0),
          lyxStakeRequired: Number(tier.lyxStakeRequired || 0),
          metadataCid: tier.metadataCid || '',
          isUnlocked: tier.isUnlocked || false,
          tierIndex: index,
        })),
        comments: (comments || []).map((c) => ({
          commenter: c.commenter,
          text: c.text,
          timestamp: Number(c.timestamp),
        })),
        price: price ? Number(price) : 0,
      };
      setNftData((prev) => {
        const existingData = prev[currentTokenId] || {};
        return {
          ...prev,
          [currentTokenId]: {
            ...existingData,
            ...updatedData,
            comments: updatedData.comments,
          },
        };
      });
      setNftPrices((prev) => ({
        ...prev,
        [currentTokenId]: updatedData.price,
      }));
      setTokenIdQueue((prev) => {
        const newQueue = prev.filter((id) => id !== currentTokenId);
        setCurrentTokenId(newQueue[0] || null);
        return newQueue;
      });
    }
    if (isError && currentTokenId) {
      toast.error(`Failed to fetch NFT data for ${currentTokenId.slice(0, 8)}...`, {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      setTokenIdQueue((prev) => {
        const newQueue = prev.filter((id) => id !== currentTokenId);
        setCurrentTokenId(newQueue[0] || null);
        return newQueue;
      });
    }
  }, [nftQueryData, isError, error, currentTokenId]);

  const backendUrl = 'https://artgridstudio.onrender.com';
  const proxyUrl = `${backendUrl}/proxy-image`;

  const fetchMetadata = async (tokenId, metadataCid, tierIndex, retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        if (!metadataCid) {
          console.error(`No metadataCid provided for tokenId ${tokenId}, tierIndex ${tierIndex}`);
          return null;
        }

        let url = metadataCid;
        if (url.startsWith('ipfs://')) {
          url = url.replace(/^ipfs:\/\//, '');
        }
        if (!url.startsWith('https://drive.google.com')) {
          url = `https://drive.google.com/uc?id=${url}&export=download`;
        }
        if (!url.match(/^https:\/\/drive\.google\.com\/uc\?id=[a-zA-Z0-9_-]+&export=download$/)) {
          console.error(`Invalid Google Drive URL format for tokenId ${tokenId}, tierIndex ${tierIndex}: ${url}`);
          return null;
        }

        const jwt = await generateJwt();
        const fetchUrl = `${backendUrl}/fetch-drive-metadata?url=${encodeURIComponent(url)}`;
        const startTime = Date.now();
        const response = await fetch(fetchUrl, {
          method: 'GET',
          mode: 'cors',
          redirect: 'follow',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        console.log('Metadata fetch response:', {
          tokenId,
          tierIndex,
          status: response.status,
          duration: `${Date.now() - startTime}ms`,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Fetch failed: ${errorText}`);
        }

        const metadata = await response.json();
        if (metadata.image && metadata.image.startsWith('https://drive.google.com')) {
          metadata.image = `${proxyUrl}?url=${encodeURIComponent(metadata.image)}`;
        }
        return metadata;
      } catch (error) {
        console.error(`Attempt ${attempt} failed for tokenId ${tokenId}, tierIndex ${tierIndex}:`, {
          error: error.message,
          stack: error.stack,
        });
        if (attempt === retries) {
          toast.error(`Failed to fetch metadata for NFT ${tokenId.slice(0, 8)}...`, {
            style: {
              background: 'var(--surface)',
              color: 'var(--text)',
              borderLeft: '4px solid var(--error)',
              borderRadius: 'var(--border-radius-sm)',
            },
          });
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  };

  const fetchImage = async (imageUrl, tokenId, tierIndex) => {
    const cacheKey = `${tokenId}-${tierIndex}`;
    const cached = imageCache.get(cacheKey);
    if (cached && cached.url) {
      try {
        await fetch(cached.url);
        cached.refCount++;
        console.log(`Reusing cached image for ${cacheKey}, refCount: ${cached.refCount}`);
        return cached.url;
      } catch {
        console.log(`Cached blob URL invalid for ${cacheKey}, refetching`);
        imageCache.delete(cacheKey);
      }
    }
    try {
      const jwt = await generateJwt();
      const startTime = Date.now();
      const response = await fetch(imageUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${jwt}` },
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
        throw new Error(`Image fetch failed: ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('image')) {
        throw new Error(`Invalid content type: ${contentType}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      imageCache.set(cacheKey, { url: objectUrl, refCount: 1 });
      console.log(`Cached image for ${cacheKey}, refCount: 1`);
      return objectUrl;
    } catch (error) {
      console.error(`Failed to fetch image for tokenId ${tokenId}, tierIndex ${tierIndex}:`, {
        error: error.message,
        stack: error.stack,
        url: imageUrl,
      });
      return '/fallback-image.png';
    }
  };

  useEffect(() => {
    let mounted = true;

    const fetchAllMetadata = async () => {
      setIsInitialLoading(true);
      if (allTokenIds.length === 0) {
        console.log('No NFTs found, setting isInitialLoading to false');
        if (mounted) {
          setIsInitialLoading(false);
        }
        return;
      }

      const queue = new PQueue({ concurrency: 3 });

      const fetchPromises = allTokenIds
        .filter((tokenId) => tokenId && tokenId !== '0x0000000000000000000000000000000000000000')
        .map((tokenId) =>
          queue.add(async () => {
            const tokenData = nftData[tokenId];
            if (!tokenData || !tokenData.tiers || tokenData.tiers.length === 0) {
              return;
            }
            const currentTierIndex = tokenData.currentTier;
            const tier = tokenData.tiers[currentTierIndex];
            if (!tier || !tier.metadataCid) {
              return;
            }
            const cacheKey = `${tokenId}-${currentTierIndex}`;
            if (metadataCache.has(cacheKey)) {
              if (mounted) {
                setNftMetadata((prev) => ({
                  ...prev,
                  [cacheKey]: metadataCache.get(cacheKey),
                }));
              }
              return;
            }
            const metadata = await fetchMetadata(tokenId, tier.metadataCid, currentTierIndex);
            if (metadata && mounted) {
              metadataCache.set(cacheKey, metadata);
              setNftMetadata((prev) => ({
                ...prev,
                [cacheKey]: metadata,
              }));
              if (metadata.image) {
                const imageUrl = await fetchImage(metadata.image, tokenId, currentTierIndex);
                setNftMetadata((prev) => ({
                  ...prev,
                  [cacheKey]: { ...prev[cacheKey], imageUrl },
                }));
              }
            }
          })
        );

      await Promise.all(fetchPromises);
      if (mounted) {
        setIsInitialLoading(false);
      }
    };

    if (publicClient) {
      fetchAllMetadata().catch((err) => {
        console.error('Error in fetchAllMetadata:', err);
        toast.error('Failed to fetch metadata for some NFTs', {
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--error)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        if (mounted) {
          setIsInitialLoading(false);
        }
      });
    }

    return () => {
      mounted = false;
    };
  }, [allTokenIds, publicClient, nftData, imageCache]);

  const buyNFT = async (tokenId) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      return;
    }
    const price = nftPrices[tokenId];
    if (!price || price <= 0) {
      toast.error('NFT price not loaded or invalid. Please try again.', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      return;
    }
    try {
      setLoading(true);
      toast.loading('Buying NFT...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--primary)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      const tx = await writeContractAsync({
        address: ARTGRIDSTUDIO_ADDRESS,
        abi: artGridStudioABI,
        functionName: 'buyNFT',
        args: [tokenId],
        value: BigInt(price),
      });
      toast.dismiss();
      toast.loading('Transaction pending...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--warning)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status === 'success') {
        toast.dismiss();
        toast.success('NFT purchased successfully!', {
          icon: '🎉',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--success)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        showConfetti();
        refetchOwnedNFTs();
        refetchAvailableNFTs();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      if (reason.includes('Insufficient payment')) {
        toast.error('Not enough LYX to purchase NFT', {
          icon: '💸',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--error)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
      } else if (reason.includes('No NFTs available')) {
        toast.error('No NFTs available for purchase', {
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--error)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
      } else {
        toast.error(`Failed to buy NFT: ${reason}`, {
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--error)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const addEngagement = async (tokenId, likes = 0, comment = '') => {
    if (!isConnected) {
      toast.error('Please connect your wallet first', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      return;
    }
    if (typeof comment !== 'string') {
      toast.error('Invalid comment format', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      return;
    }
    try {
      setLoading(true);
      toast.loading('Adding engagement...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--primary)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      console.log(`Adding engagement for tokenId ${tokenId}:`, { likes, comment });
      const tx = await writeContractAsync({
        address: ARTGRIDSTUDIO_ADDRESS,
        abi: artGridStudioABI,
        functionName: 'addEngagement',
        args: [tokenId, BigInt(likes), comment],
      });
      toast.dismiss();
      toast.loading('Transaction pending...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--warning)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      console.log(`Transaction hash: ${tx}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      console.log(`Receipt status: ${receipt.status}`);
      if (receipt.status === 'success') {
        toast.dismiss();
        toast.success('Engagement added successfully!', {
          icon: likes > 0 ? '❤️' : '💬',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--success)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      toast.error(`Failed to add engagement: ${reason}`, {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const stakeLYX = async (tokenId, amount) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      return;
    }
    try {
      setLoading(true);
      toast.loading('Staking LYX...', {
        icon: '🔒',
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--primary)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      const lyxAmount = parseEther(amount.toString());
      const tx = await writeContractAsync({
        address: ARTGRIDSTUDIO_ADDRESS,
        abi: artGridStudioABI,
        functionName: 'stakeLYX',
        args: [tokenId],
        value: lyxAmount,
      });
      toast.dismiss();
      toast.loading('Transaction pending...', {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--warning)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
      if (receipt.status === 'success') {
        toast.dismiss();
        toast.success('LYX staked successfully!', {
          icon: '💎',
          style: {
            background: 'var(--surface)',
            color: 'var(--text)',
            borderLeft: '4px solid var(--success)',
            borderRadius: 'var(--border-radius-sm)',
          },
        });
        setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
      } else {
        throw new Error('Transaction failed');
      }
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      toast.error(`Failed to stake LYX: ${reason}`, {
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          borderLeft: '4px solid var(--error)',
          borderRadius: 'var(--border-radius-sm)',
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ownedNFTsData) {
      setOwnedNFTs(ownedNFTsData);
    }
  }, [ownedNFTsData]);

  const showConfetti = () => {
    const colors = ['var(--primary)', 'var(--secondary)', 'var(--success)', 'var(--warning)'];
    for (let i = 0; i < 100; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      confetti.style.left = Math.random() * 100 + 'vw';
      confetti.style.animationDelay = Math.random() * 3 + 's';
      confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
      document.body.appendChild(confetti);
      setTimeout(() => {
        confetti.remove();
      }, 5000);
    }
  };

  const marketplaceStats = useMemo(() => {
    if (!availableNFTs || !nftData) return { totalNFTs: 0, totalValue: 0, avgLikes: 0 };
    const availableCount = availableNFTs.filter(
      (tokenId) => tokenId && tokenId !== '0x0000000000000000000000000000000000000000'
    ).length;
    let totalValue = 0;
    let totalLikes = 0;
    Object.entries(nftData).forEach(([tokenId, data]) => {
      if (data) {
        totalValue += data.price || 0;
        totalLikes += data.totalLikes || 0;
      }
    });
    return {
      totalNFTs: availableCount,
      totalValue: formatEther(BigInt(totalValue)),
      avgLikes: availableCount > 0 ? Math.round(totalLikes / availableCount) : 0,
    };
  }, [availableNFTs, nftData]);

  const filteredNFTs = useMemo(() => {
    const nfts = (activeTab === 'marketplace' ? availableNFTs : ownedNFTs) || [];
    return [...new Set(nfts)]
      .filter((tokenId) => {
        if (!tokenId || tokenId === '0x0000000000000000000000000000000000000000') return false;
        const tokenData = nftData[tokenId];
        const currentTierIndex = tokenData?.currentTier;
        const cacheKey = `${tokenId}-${currentTierIndex}`;
        const metadata = nftMetadata[cacheKey];
        if (!tokenData || !tokenData.tiers?.length || !metadata) return false;
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        return (
          metadata.name?.toLowerCase().includes(searchLower) ||
          metadata.description?.toLowerCase().includes(searchLower) ||
          tokenId.toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => {
        const dataA = nftData[a];
        const dataB = nftData[b];
        switch (sortOrder) {
          case 'price-low':
            return (dataA?.price || 0) - (dataB?.price || 0);
          case 'price-high':
            return (dataB?.price || 0) - (dataA?.price || 0);
          case 'likes':
            return (dataB?.totalLikes || 0) - (dataA?.totalLikes || 0);
          case 'latest':
          default:
            return Number(b) - Number(a);
        }
      });
  }, [availableNFTs, ownedNFTs, nftData, nftMetadata, searchTerm, sortOrder, activeTab]);

  const featuredNFTs = useMemo(() => {
    return filteredNFTs
      .filter((tokenId) => nftData[tokenId]?.totalLikes >= 10)
      .slice(0, 5);
  }, [filteredNFTs, nftData]);

  useEffect(() => {
    if (featuredNFTs.length <= 1) return;
    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % featuredNFTs.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredNFTs.length]);

  return (
    <div className="app-container">
      <AnimatePresence>
        {isInitialLoading && (
          <motion.div
            className="loading-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="loading-logo"
              animate={{ scale: [1, 1.1, 1], rotate: [0, 360] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              ArtGrid Studio
            </motion.div>
            <motion.div
              className="loading-spinner"
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Header>
        <nav className="app-nav">
          {['about', 'marketplace', 'my-nfts', 'create'].map((tab) => (
            <motion.button
              key={tab}
              className={`nav-button ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {tab
                .split('-')
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')}
            </motion.button>
          ))}
        </nav>
        <motion.div
          className="wallet-button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ConnectButton showBalance={false} />
        </motion.div>
      </Header>

      <main className="app-content">
        <AnimatePresence mode="wait">
          {activeTab === 'about' && (
            <motion.div
              key="about"
              className="about active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <About />
            </motion.div>
          )}

          {activeTab === 'marketplace' && (
            <motion.div
              key="marketplace"
              className="marketplace active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              ref={marketplaceRef}
            >
              <div className="marketplace-header">
                <h2>Explore NFTs</h2>
                <div className="marketplace-controls">
                  <motion.input
                    type="text"
                    placeholder="Search NFTs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                    whileFocus={{ scale: 1.02 }}
                  />
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="sort-select"
                  >
                    <option value="latest">Latest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="likes">Most Liked</option>
                  </select>
                  <motion.button
                    className="stats-toggle"
                    onClick={() => setShowStats(!showStats)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {showStats ? 'Hide Stats' : 'Show Stats'}
                  </motion.button>
                </div>
              </div>

              <AnimatePresence>
                {showStats && (
                  <motion.div
                    className="marketplace-stats glass-card"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    ref={statsRef}
                  >
                    <h3>Marketplace Stats</h3>
                    <div className="stats-grid">
                      <div className="stat-item">
                        <span>Total NFTs</span>
                        <strong>{marketplaceStats.totalNFTs}</strong>
                      </div>
                      <div className="stat-item">
                        <span>Total Value (LYX)</span>
                        <strong>{parseFloat(marketplaceStats.totalValue).toFixed(2)}</strong>
                      </div>
                      <div className="stat-item">
                        <span>Average Likes</span>
                        <strong>{marketplaceStats.avgLikes}</strong>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {featuredNFTs.length > 0 && (
                <motion.div
                  className="featured-carousel glass-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <h3>Featured NFTs</h3>
                  <div className="carousel-container">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={carouselIndex}
                        className="carousel-item"
                        initial={{ opacity: 0, x: 100 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -100 }}
                        transition={{ duration: 0.5 }}
                      >
                        {(() => {
                          const tokenId = featuredNFTs[carouselIndex];
                          const tokenData = nftData[tokenId];
                          const currentTierIndex = tokenData?.currentTier;
                          const cacheKey = `${tokenId}-${currentTierIndex}`;
                          return (
                            <NFTCard
                              tokenId={tokenId}
                              nftData={tokenData}
                              metadata={nftMetadata[cacheKey]}
                              onBuy={() => buyNFT(tokenId)}
                              onAddEngagement={addEngagement}
                              onStakeLYX={stakeLYX}
                              isOwned={false}
                              price={nftPrices[tokenId] || 0}
                              loading={loading}
                              isConnected={isConnected}
                              comments={tokenData?.comments || []}
                              tierIndex={currentTierIndex}
                              imageCache={imageCache}
                            />
                          );
                        })()}
                      </motion.div>
                    </AnimatePresence>
                    <div className="carousel-controls">
                      <motion.button
                        className="carousel-prev"
                        onClick={() =>
                          setCarouselIndex((prev) =>
                            prev === 0 ? featuredNFTs.length - 1 : prev - 1
                          )
                        }
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        ←
                      </motion.button>
                      <motion.button
                        className="carousel-next"
                        onClick={() =>
                          setCarouselIndex((prev) => (prev + 1) % featuredNFTs.length)
                        }
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        →
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}

              <div className="nft-grid">
                {filteredNFTs.length > 0 ? (
                  filteredNFTs.map((tokenId) => {
                    const tokenData = nftData[tokenId];
                    const currentTierIndex = tokenData?.currentTier;
                    const cacheKey = `${tokenId}-${currentTierIndex}`;
                    return (
                      <motion.div
                        key={cacheKey}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: filteredNFTs.indexOf(tokenId) * 0.1 }}
                      >
                        <ErrorBoundary>
                          <NFTCard
                            tokenId={tokenId}
                            nftData={tokenData || {
                              totalLikes: 0,
                              totalComments: 0,
                              totalStakedLyx: 0,
                              tiers: [],
                              comments: [],
                              currentTier: 0,
                              price: 0,
                            }}
                            metadata={nftMetadata[cacheKey]}
                            onBuy={() => buyNFT(tokenId)}
                            onAddEngagement={addEngagement}
                            onStakeLYX={stakeLYX}
                            isOwned={activeTab === 'my-nfts'}
                            price={nftPrices[tokenId] || 0}
                            loading={loading}
                            isConnected={isConnected}
                            comments={tokenData?.comments || []}
                            tierIndex={currentTierIndex}
                            imageCache={imageCache}
                          />
                        </ErrorBoundary>
                      </motion.div>
                    );
                  })
                ) : (
                  <motion.p
                    className="no-nfts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    {searchTerm ? 'No NFTs match your search.' : 'No NFTs available.'}
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'my-nfts' && (
            <motion.div
              key="my-nfts"
              className="my-nfts active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="marketplace-header">
                <h2>My NFTs</h2>
                <div className="marketplace-controls">
                  <motion.input
                    type="text"
                    placeholder="Search your NFTs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                    whileFocus={{ scale: 1.02 }}
                  />
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="sort-select"
                  >
                    <option value="latest">Latest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="likes">Most Liked</option>
                  </select>
                </div>
              </div>
              {isConnected ? (
                filteredNFTs.length > 0 ? (
                  <div className="nft-grid">
                    {filteredNFTs.map((tokenId) => {
                      const tokenData = nftData[tokenId];
                      const currentTierIndex = tokenData?.currentTier;
                      const cacheKey = `${tokenId}-${currentTierIndex}`;
                      return (
                        <motion.div
                          key={cacheKey}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: filteredNFTs.indexOf(tokenId) * 0.1 }}
                        >
                          <ErrorBoundary>
                            <NFTCard
                              tokenId={tokenId}
                              nftData={tokenData}
                              metadata={nftMetadata[cacheKey]}
                              onAddEngagement={addEngagement}
                              onStakeLYX={stakeLYX}
                              isOwned={true}
                              price={nftPrices[tokenId] || 0}
                              loading={loading}
                              isConnected={isConnected}
                              comments={tokenData?.comments || []}
                              tierIndex={currentTierIndex}
                              imageCache={imageCache}
                            />
                          </ErrorBoundary>
                        </motion.div>
                      );
                    })}
                  </div>
                ) : (
                  <motion.p
                    className="no-nfts"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  >
                    {searchTerm ? 'No NFTs match your search.' : "You don't own any NFTs yet."}
                  </motion.p>
                )
              ) : (
                <motion.p
                  className="connect-wallet"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  Please connect your wallet to view your NFTs.
                </motion.p>
              )}
            </motion.div>
          )}

          {activeTab === 'create' && (
            <motion.div
              key="create"
              className="create active"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <CreateNFT
                address={ARTGRIDSTUDIO_ADDRESS}
                onSuccess={() => {
                  refetchAvailableNFTs();
                  refetchOwnedNFTs();
                  toast.success('NFT created successfully!', {
                    icon: '🎨',
                    style: {
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      borderLeft: '4px solid var(--success)',
                      borderRadius: 'var(--border-radius-sm)',
                    },
                  });
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
}

export default App;