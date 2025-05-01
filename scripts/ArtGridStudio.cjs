require('@nomiclabs/hardhat-ethers');
require('dotenv').config();

async function main() {
  const { ethers } = require('hardhat');

  // Configuration
  const luksoRpcUrl = 'https://rpc.testnet.lukso.network';
  const contractAddress = '0xBEA5c3e1c2Fc9fA05484c319DFbf55086b6617A8';
  const privateKey = process.env.PRIVATE_KEY;
  const otherPrivateKey = '0x9652a9695844ba778d27ad163c27a54b9ba9e63ea87b791f2f3ff0188f2e204d'; // Replace with test wallet private key

  if (!privateKey || !otherPrivateKey) {
    throw new Error('PRIVATE_KEY or otherPrivateKey not set in .env');
  }

  // NFT parameters
  const likesRequired = [10, 20, 30];
  const commentsRequired = [5, 10, 15];
  const lyxStakeRequired = [ethers.utils.parseEther('0.1'), ethers.utils.parseEther('0.2'), ethers.utils.parseEther('0.3')];
  const metadataCids = [
    'bafkreia5ji7nyojtct5jetucpyfrbxjx346kxdv2wo2mvypctsoibgqb6e',
    'bafkreibf3j7k2n3m4k5j6k7l8m9n1o2p3q4r5s6t7u8v9w0x1y2z3',
    'bafkreicd4j7k2n3m4k5j6k7l8m9n1o2p3q4r5s6t7u8v9w0x1y2z4'
  ];
  const price = ethers.utils.parseEther('0.5');

  try {
    // Connect to LUKSO
    const provider = new ethers.providers.JsonRpcProvider(luksoRpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = await ethers.getContractAt('ArtGridStudio', contractAddress, wallet);

    console.log('Connected to ArtGridStudio at:', contractAddress);
    console.log('Wallet address:', wallet.address);

    // Check wallet balance
    const balance = await provider.getBalance(wallet.address);
    console.log('Wallet balance:', ethers.utils.formatEther(balance), 'LYX');
    if (balance.isZero()) {
      throw new Error('Wallet has no funds. Fund the wallet: https://faucet.testnet.lukso.network/');
    }

    // Compute metadata key prefix
    const lsp4MetadataKeyPrefix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('LSP4Metadata'));

    // Test 1: Mint and Buy NFT with main wallet
    try {
      console.log('Minting NFT with main wallet...');
      const mintTx = await contract.mintNFT(
        likesRequired,
        commentsRequired,
        lyxStakeRequired,
        metadataCids,
        price,
        { gasLimit: 5000000 }
      );
      const mintReceipt = await mintTx.wait();
      const newTokenId = mintReceipt.events.find(e => e.event === 'NFTMinted').args.tokenId;
      console.log('Minted NFT with tokenId:', newTokenId);

      // Verify metadata
      const newMetadataKey = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'bytes32'], [lsp4MetadataKeyPrefix, newTokenId])
      );
      const newMetadataValue = await contract.getTokenIdData(newTokenId, newMetadataKey);
      console.log('Raw metadata value:', newMetadataValue);
      try {
        console.log('Metadata for new tokenId', newTokenId, ':', ethers.utils.toUtf8String(newMetadataValue));
      } catch (e) {
        console.error('Failed to decode metadata:', e.message);
      }

      // Buy NFT
      console.log('Buying NFT...');
      const buyTx = await contract.buyNFT({ value: price, gasLimit: 2000000 });
      const buyReceipt = await buyTx.wait();
      console.log('Bought NFT, tx hash:', buyTx.hash);
    } catch (e) {
      console.error('Test 1 failed:', e.message);
    }

    // Test 2: Mint NFT with other wallet
    const otherWallet = new ethers.Wallet(otherPrivateKey, provider);
    const contractOther = await ethers.getContractAt('ArtGridStudio', contractAddress, otherWallet);

    try {
      console.log('Minting NFT with other wallet:', otherWallet.address);
      const balanceOther = await provider.getBalance(otherWallet.address);
      console.log('Other wallet balance:', ethers.utils.formatEther(balanceOther), 'LYX');
      if (balanceOther.isZero()) {
        throw new Error('Other wallet has no funds. Fund the wallet: https://faucet.testnet.lukso.network/');
      }

      const mintTx = await contractOther.mintNFT(
        likesRequired,
        commentsRequired,
        lyxStakeRequired,
        metadataCids,
        price,
        { gasLimit: 5000000 }
      );
      const mintReceipt = await mintTx.wait();
      const otherTokenId = mintReceipt.events.find(e => e.event === 'NFTMinted').args.tokenId;
      console.log('Minted NFT with tokenId:', otherTokenId);

      // Verify metadata
      const newMetadataKey = ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'bytes32'], [lsp4MetadataKeyPrefix, otherTokenId])
      );
      const newMetadataValue = await contract.getTokenIdData(otherTokenId, newMetadataKey);
      console.log('Raw metadata value:', newMetadataValue);
      try {
        console.log('Metadata for new tokenId', otherTokenId, ':', ethers.utils.toUtf8String(newMetadataValue));
      } catch (e) {
        console.error('Failed to decode metadata:', e.message);
      }
    } catch (e) {
      console.error('Test 2 failed:', e.message);
    }
  } catch (error) {
    console.error('Script error:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });