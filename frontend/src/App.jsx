import { useState, useEffect, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import NFTCard from './components/NFTCard';
import CreateNFT from './components/CreateNFT';
import Header from './components/Header';
import Footer from './components/Footer';
import ErrorBoundary from './components/ErrorBoundary';
import artGridStudioABI from '../abis/ArtGridStudio.json';
import toast from 'react-hot-toast';
import './App.css';

const ARTGRIDSTUDIO_ADDRESS = '0xb5ba6Af3E140277FB214D3aCfd42cB818020236E';

function App() {
  const [activeTab, setActiveTab] = useState('marketplace');
  const [ownedNFTs, setOwnedNFTs] = useState(null);
  const [nftData, setNftData] = useState({});
  const [nftMetadata, setNftMetadata] = useState({});
  const [nftPrices, setNftPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [tokenIdQueue, setTokenIdQueue] = useState([]);
  const [currentTokenId, setCurrentTokenId] = useState(null);

  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { waitForTransactionReceipt } = useWaitForTransactionReceipt();
  const publicClient = usePublicClient();

  const cidOverrides = {
    '0x0000000000000000000000000000000000000000000000000000000000000003': 'new-valid-metadata-cid-for-legacybronze',
    '0x0000000000000000000000000000000000000000000000000000000000000004': 'new-valid-metadata-cid-for-genesisbronze',
  };

  const { data: ownedNFTsData, refetch: refetchOwnedNFTs, isError: ownedNFTsError } = useReadContract({
    address: ARTGRIDSTUDIO_ADDRESS,
    abi: artGridStudioABI,
    functionName: 'getOwnedNFTs',
    args: [address || '0x0000000000000000000000000000000000000000'],
    enabled: !!address,
    retry: 5,
    retryDelay: 2000,
    pollingInterval: 10000,
  });

  const { data: availableNFTs, refetch: refetchAvailableNFTs, isError: availableNFTsError } = useReadContract({
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
        console.log('NFTMinted event detected:', logs);
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
        console.log('EngagementUpdated event detected:', logs);
        const tokenId = logs[0].args.tokenId;
        setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
      },
    });

    const unwatchComment = publicClient.watchContractEvent({
      address: ARTGRIDSTUDIO_ADDRESS,
      abi: artGridStudioABI,
      eventName: 'CommentAdded',
      onLogs: (logs) => {
        console.log('CommentAdded event detected:', logs);
        const tokenId = logs[0].args.tokenId;
        setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
      },
    });

    return () => {
      unwatchMinted();
      unwatchEngagement();
      unwatchComment();
    };
  }, [publicClient, refetchAvailableNFTs, refetchOwnedNFTs]);

  const allTokenIds = useMemo(() => {
    const tokenIds = [
      ...(ownedNFTsData || []),
      ...(availableNFTs || []),
    ].filter((tokenId, index, self) => tokenId && self.indexOf(tokenId) === index && tokenId !== '0x0000000000000000000000000000000000000000');
    return tokenIds;
  }, [ownedNFTsData, availableNFTs]);

  useEffect(() => {
    setTokenIdQueue((prev) => {
      const newTokenIds = allTokenIds.filter(
        (tokenId) => tokenId && !prev.includes(tokenId) && !nftData[tokenId]
      );
      const updatedQueue = [...new Set([...prev, ...newTokenIds])].filter((id) => id);
      if (updatedQueue.length > 0 && !currentTokenId) {
        setCurrentTokenId(updatedQueue[0]);
      }
      return updatedQueue;
    });
  }, [allTokenIds, nftData, currentTokenId]);

  const { data: nftQueryData, isError, error } = useReadContract({
    address: ARTGRIDSTUDIO_ADDRESS,
    abi: artGridStudioABI,
    functionName: 'getNFTData',
    args: [currentTokenId],
    enabled: !!currentTokenId && currentTokenId !== '0x0000000000000000000000000000000000000000000000000000000000000000',
    retry: 5,
    retryDelay: 2000,
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
        tiers: (tiers || []).map((tier) => ({
          likesRequired: Number(tier.likesRequired || 0),
          commentsRequired: Number(tier.commentsRequired || 0),
          lyxStakeRequired: Number(tier.lyxStakeRequired || 0),
          metadataCid: tier.metadataCid || '',
          isUnlocked: tier.isUnlocked || false,
        })),
        comments: (comments || []).map((c) => ({
          commenter: c.commenter,
          text: c.text,
          timestamp: Number(c.timestamp),
        })),
        price: price ? Number(price) : 0,
      };
      console.log('Processed nftData for tokenId', currentTokenId, { totalLikes, totalComments });
      setNftData((prev) => ({
        ...prev,
        [currentTokenId]: updatedData,
      }));
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
      toast.error(`Failed to fetch NFT data for ${currentTokenId.slice(0, 8)}...`);
      console.error(`Error fetching NFT data for tokenId ${currentTokenId}:`, error);
      setTokenIdQueue((prev) => {
        const newQueue = prev.filter((id) => id !== currentTokenId);
        setCurrentTokenId(newQueue[0] || null);
        return newQueue;
      });
    }
  }, [nftQueryData, isError, error, currentTokenId]);

  useEffect(() => {
    const fetchMetadata = async (tokenId, metadataCid) => {
      if (!metadataCid || nftMetadata[tokenId]) return;
      const workerUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8787';
      const effectiveCid = cidOverrides[tokenId] || metadataCid;
      try {
        const response = await fetch(`${workerUrl}/ipfs/${effectiveCid}`, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SERVER_API_KEY}`,
          },
        });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Invalid metadata format');
        console.log(`Metadata for tokenId ${tokenId}:`, data);
        console.log(`Token ${tokenId} image CID:`, data.image);
        setNftMetadata((prev) => ({
          ...prev,
          [tokenId]: data,
        }));
      } catch (error) {
        console.error(`Failed to fetch metadata for tokenId ${tokenId}:`, error);
        setNftMetadata((prev) => ({
          ...prev,
          [tokenId]: { name: `NFT #${tokenId.slice(0, 8)}...`, description: 'Metadata unavailable' },
        }));
      }
    };

    const fetchAllMetadata = async () => {
      for (const tokenId of allTokenIds) {
        const data = nftData[tokenId];
        if (data && data.tiers && data.tiers[data.currentTier]?.metadataCid) {
          const metadataCid = data.tiers[data.currentTier].metadataCid;
          await fetchMetadata(tokenId, metadataCid);
        }
      }
    };

    if (allTokenIds.length > 0) {
      fetchAllMetadata();
    }
  }, [allTokenIds, nftData, nftMetadata]);

  const buyNFT = async (tokenId) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    const price = nftPrices[tokenId];
    if (!price || price <= 0) {
      toast.error('NFT price not loaded or invalid. Please try again.');
      return;
    }
    try {
      setLoading(true);
      toast.loading('Buying NFT...');
      const tx = await writeContractAsync({
        address: ARTGRIDSTUDIO_ADDRESS,
        abi: artGridStudioABI,
        functionName: 'buyNFT',
        value: BigInt(price),
      });
      toast.dismiss();
      toast.loading('Transaction pending...');
      await waitForTransactionReceipt({ hash: tx });
      toast.dismiss();
      toast.success('NFT purchased successfully!');
      refetchOwnedNFTs();
      refetchAvailableNFTs();
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      if (reason.includes('Insufficient payment')) {
        toast.error('Not enough LYX to purchase NFT');
      } else if (reason.includes('No NFTs available')) {
        toast.error('No NFTs available for purchase');
      } else {
        toast.error(`Failed to buy NFT: ${reason}`);
      }
      console.error('Buy NFT error:', error);
    } finally {
      setLoading(false);
    }
  };

  const addEngagement = async (tokenId, likes = 0, comment = '') => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    if (typeof comment !== 'string') {
      console.error('Invalid comment type, expected string, got:', comment);
      toast.error('Invalid comment format');
      return;
    }
    console.log('addEngagement called for tokenId', tokenId, { likes, comment });
    try {
      setLoading(true);
      toast.loading('Adding engagement...');
      setNftData((prev) => {
        const currentData = prev[tokenId] || {
          currentTier: 0,
          totalLikes: 0,
          totalComments: 0,
          totalStakedLyx: 0,
          tiers: [],
          comments: [],
        };
        const newTotalComments = currentData.totalComments + (comment.length > 0 ? 1 : 0);
        console.log('Optimistic update for tokenId', tokenId, {
          totalLikes: currentData.totalLikes + likes,
          totalComments: newTotalComments,
        });
        return {
          ...prev,
          [tokenId]: {
            ...currentData,
            totalLikes: currentData.totalLikes + likes,
            totalComments: newTotalComments,
            comments: comment.length > 0
              ? [...currentData.comments, { commenter: address, text: comment, timestamp: Math.floor(Date.now() / 1000) }]
              : currentData.comments,
          },
        };
      });

      const tx = await writeContractAsync({
        address: ARTGRIDSTUDIO_ADDRESS,
        abi: artGridStudioABI,
        functionName: 'addEngagement',
        args: [tokenId, BigInt(likes), comment],
      });
      toast.dismiss();
      toast.loading('Transaction pending...');
      await waitForTransactionReceipt({ hash: tx });
      toast.dismiss();
      toast.success('Engagement added successfully!');
      setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      setNftData((prev) => {
        const currentData = prev[tokenId] || {
          currentTier: 0,
          totalLikes: 0,
          totalComments: 0,
          totalStakedLyx: 0,
          tiers: [],
          comments: [],
        };
        const newTotalComments = currentData.totalComments - (comment.length > 0 ? 1 : 0);
        console.log('Reverting optimistic update for tokenId', tokenId, {
          totalLikes: currentData.totalLikes - likes,
          totalComments: newTotalComments,
        });
        return {
          ...prev,
          [tokenId]: {
            ...currentData,
            totalLikes: currentData.totalLikes - likes,
            totalComments: newTotalComments,
            comments: comment.length > 0 ? currentData.comments.slice(0, -1) : currentData.comments,
          },
        };
      });
      toast.error(`Failed to add engagement: ${reason}`);
      console.error('Add engagement error:', error);
    } finally {
      setLoading(false);
    }
  };

  const stakeLYX = async (tokenId, amount) => {
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }
    try {
      setLoading(true);
      toast.loading('Staking LYX...');
      const lyxAmount = parseEther(amount.toString());
      setNftData((prev) => {
        const currentData = prev[tokenId] || {
          currentTier: 0,
          totalLikes: 0,
          totalComments: 0,
          totalStakedLyx: 0,
          tiers: [],
          comments: [],
        };
        return {
          ...prev,
          [tokenId]: {
            ...currentData,
            totalStakedLyx: Number(currentData.totalStakedLyx) + Number(lyxAmount),
          },
        };
      });

      const tx = await writeContractAsync({
        address: ARTGRIDSTUDIO_ADDRESS,
        abi: artGridStudioABI,
        functionName: 'stakeLYX',
        args: [tokenId],
        value: lyxAmount,
      });
      toast.dismiss();
      toast.loading('Transaction pending...');
      await waitForTransactionReceipt({ hash: tx });
      toast.dismiss();
      toast.success('LYX staked successfully!');
      setTokenIdQueue((prev) => [...new Set([...prev, tokenId])]);
    } catch (error) {
      toast.dismiss();
      const reason = error.reason || error.message || 'Unknown error';
      setNftData((prev) => {
        const currentData = prev[tokenId] || {
          currentTier: 0,
          totalLikes: 0,
          totalComments: 0,
          totalStakedLyx: 0,
          tiers: [],
          comments: [],
        };
        return {
          ...prev,
          [tokenId]: {
            ...currentData,
            totalStakedLyx: Number(currentData.totalStakedLyx) - Number(parseEther(amount.toString())),
          },
        };
      });
      toast.error(`Failed to stake LYX: ${reason}`);
      console.error('Stake LYX error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ownedNFTsData) {
      setOwnedNFTs(ownedNFTsData);
    }
  }, [ownedNFTsData]);

  return (
    <div className="app-container">
      <Header>
      <nav className="app-nav">
        <button
          className={activeTab === 'marketplace' ? 'active' : ''}
          onClick={() => setActiveTab('marketplace')}
        >
          Marketplace
        </button>
        <button
          className={activeTab === 'my-nfts' ? 'active' : ''}
          onClick={() => setActiveTab('my-nfts')}
        >
          My NFTs
        </button>
        <button
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
        >
          Create NFT
        </button>
      </nav>
        <div className="focus:outline-none">
          <ConnectButton />
        </div>
      </Header>
      
      <main className="app-content">
        {activeTab === 'marketplace' && (
          <div className="marketplace">
            <h2>Available NFTs</h2>
            <ErrorBoundary>
              {availableNFTs === null ? (
                <p>Loading available NFTs...</p>
              ) : availableNFTs?.length > 0 ? (
                <div className="nft-grid">
                  {availableNFTs.map((tokenId) => (
                    <div key={tokenId} className="marketplace-nft-card">
                      <NFTCard
                        tokenId={tokenId}
                        nftData={nftData[tokenId]}
                        metadata={nftMetadata[tokenId]}
                        onBuy={() => buyNFT(tokenId)}
                        onAddEngagement={addEngagement}
                        onStakeLYX={stakeLYX}
                        isOwned={false}
                        price={nftPrices[tokenId] || 0}
                        loading={loading}
                        isConnected={isConnected}
                        comments={nftData[tokenId]?.comments || []}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-nfts">No NFTs available for purchase.</p>
              )}
            </ErrorBoundary>
          </div>
        )}
        {activeTab === 'my-nfts' && (
          <div className="my-nfts">
            <h2>My NFTs</h2>
            <ErrorBoundary>
              {isConnected ? (
                ownedNFTs === null ? (
                  <p>Loading your NFTs...</p>
                ) : ownedNFTs?.length > 0 ? (
                  <div className="nft-grid">
                    {ownedNFTs.map((tokenId) => (
                      <NFTCard
                        key={tokenId}
                        tokenId={tokenId}
                        nftData={nftData[tokenId]}
                        metadata={nftMetadata[tokenId]}
                        onAddEngagement={addEngagement}
                        onStakeLYX={stakeLYX}
                        isOwned={true}
                        price={nftPrices[tokenId] || 0}
                        loading={loading}
                        isConnected={isConnected}
                        comments={nftData[tokenId]?.comments || []}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="no-nfts">You don't own any NFTs yet.</p>
                )
              ) : (
                <p className="connect-wallet">Please connect your wallet to view your NFTs.</p>
              )}
            </ErrorBoundary>
          </div>
        )}
        {activeTab === 'create' && (
          <CreateNFT
            address={ARTGRIDSTUDIO_ADDRESS}
            onSuccess={() => {
              refetchAvailableNFTs();
              refetchOwnedNFTs();
            }}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;