const { ethers } = require("hardhat");

async function main() {
  const walletAddress = "0xfbabe68AD32741B2c30952D329218B62B80e2df5";
  const balance = await ethers.provider.getBalance(walletAddress);
  console.log(`Balance of ${walletAddress}: ${ethers.utils.formatEther(balance)} LYXt`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});