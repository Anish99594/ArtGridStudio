const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Transferring LYXt from:", deployer.address);

  const recipient = "0xfbabe68AD32741B2c30952D329218B62B80e2df5";
  const amount = ethers.utils.parseEther("0.3");

  const tx = await deployer.sendTransaction({
    to: recipient,
    value: amount,
    gasLimit: 21000,
    gasPrice: ethers.utils.parseUnits("10", "gwei"),
  });
  await tx.wait();

  console.log(`Transferred ${ethers.utils.formatEther(amount)} LYXt to ${recipient}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});