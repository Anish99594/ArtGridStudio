import { useReadContract } from 'wagmi';
import artGridStudioABI from '../abis/ArtGridStudio.json';
import { ARTGRIDSTUDIO_ADDRESS } from '../constants';

export const useNFTList = (owner) => {
  return useReadContract({
    address: ARTGRIDSTUDIO_ADDRESS,
    abi: artGridStudioABI,
    functionName: 'getOwnedNFTs',
    args: [owner || '0x0000000000000000000000000000000000000000'],
    enabled: !!owner,
    retry: 5,
    retryDelay: 2000,
    pollingInterval: 30000, // Increased to 30 seconds
  });
};