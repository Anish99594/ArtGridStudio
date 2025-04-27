const { ethers } = require("hardhat");

async function main() {
  const walletAddress = "0x112c20B65992904a379BD3Fe64F84BdF93d8b3C3";
  const balance = await ethers.provider.getBalance(walletAddress);
  console.log(`Balance of ${walletAddress}: ${ethers.utils.formatEther(balance)} LYXt`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});