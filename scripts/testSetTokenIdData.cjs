require('@nomiclabs/hardhat-ethers');
require('dotenv').config();

async function main() {
  const { ethers } = require('hardhat');

  // Configuration
  const luksoRpcUrl = 'https://rpc.testnet.lukso.network';
  const contractAddress = '0xBEA5c3e1c2Fc9fA05484c319DFbf55086b6617A8';
  const privateKey = process.env.PRIVATE_KEY;
  const tokenId = '0x0000000000000000000000000000000000000000000000000000000000000002';

  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

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

    // Test collection metadata with getData
    try {
      const collectionMetadataKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('LSP4Metadata'));
      console.log('Collection metadata key:', collectionMetadataKey);
      const collectionMetadataValue = await contract.getData(collectionMetadataKey);
      console.log('Raw collection metadata value:', collectionMetadataValue);
      try {
        console.log('Collection metadata:', ethers.utils.toUtf8String(collectionMetadataValue));
      } catch (e) {
        console.error('Failed to decode collection metadata:', e.message);
      }
    } catch (e) {
      console.error('Failed to retrieve collection metadata:', e.message);
    }

    // Compute token metadata key
    const lsp4MetadataKeyPrefix = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('LSP4Metadata'));
    const metadataKey = ethers.utils.keccak256(
      ethers.utils.solidityPack(['bytes32', 'bytes32'], [lsp4MetadataKeyPrefix, tokenId])
    );
    console.log('Token metadata key:', metadataKey);

    // Test setTokenIdData
    try {
      console.log('Testing setTokenIdData for tokenId:', tokenId);
      const metadataValue = ethers.utils.toUtf8Bytes('ipfs://bafkreia5ji7nyojtct5jetucpyfrbxjx346kxdv2wo2mvypctsoibgqb6e');
      const tx = await contract.setTokenIdData(tokenId, metadataKey, metadataValue, { gasLimit: 2000000 });
      const receipt = await tx.wait();
      console.log('setTokenIdData successful, tx hash:', tx.hash);
      console.log('Receipt events:', receipt.events);

      // Verify token metadata with getTokenIdData
      const retrievedValue = await contract.getTokenIdData(tokenId, metadataKey);
      console.log('Raw token metadata value:', retrievedValue);
      try {
        console.log('Token metadata:', ethers.utils.toUtf8String(retrievedValue));
      } catch (e) {
        console.error('Failed to decode token metadata:', e.message);
      }

      // Also try getData for comparison
      const getDataValue = await contract.getData(metadataKey);
      console.log('Raw metadata value (getData):', getDataValue);
      try {
        console.log('Metadata (getData):', ethers.utils.toUtf8String(getDataValue));
      } catch (e) {
        console.error('Failed to decode metadata (getData):', e.message);
      }
    } catch (e) {
      console.error('Failed to setTokenIdData:', e.message);
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