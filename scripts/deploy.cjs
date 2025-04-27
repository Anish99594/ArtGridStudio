const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.utils.formatEther(balance), "LYXt");

  // Deploy ArtGridStudio
  const name = "ArtGrid Collection";
  const description = "A collection of interactive NFTs";
  const creator = deployer.address;

  const ArtGridStudio = await ethers.getContractFactory("ArtGridStudio");
  const artGridStudio = await ArtGridStudio.deploy(name, description, creator);
  await artGridStudio.deployed();
  console.log("ArtGridStudio deployed to:", artGridStudio.address);

  // Deploy OwnerContract
  const OwnerContract = await ethers.getContractFactory("OwnerContract");
  const ownerContract = await OwnerContract.deploy(artGridStudio.address);
  await ownerContract.deployed();
  console.log("OwnerContract deployed to:", ownerContract.address);

  // Deploy MockReceiver
  const MockReceiver = await ethers.getContractFactory("MockReceiver");
  const mockReceiver = await MockReceiver.deploy();
  await mockReceiver.deployed();
  console.log("MockReceiver deployed to:", mockReceiver.address);

  // Optional: Verify contracts on LUKSO Testnet explorer
  if (hre.network.name === "luksoTestnet") {
    console.log("Verifying contracts on LUKSO Testnet...");
    try {
      await hre.run("verify:verify", {
        address: artGridStudio.address,
        constructorArguments: [name, description, creator],
      });
      console.log("ArtGridStudio verified successfully");
    } catch (error) {
      console.error("ArtGridStudio verification failed:", error);
    }

    try {
      await hre.run("verify:verify", {
        address: ownerContract.address,
        constructorArguments: [artGridStudio.address],
      });
      console.log("OwnerContract verified successfully");
    } catch (error) {
      console.error("OwnerContract verification failed:", error);
    }

    try {
      await hre.run("verify:verify", {
        address: mockReceiver.address,
        constructorArguments: [],
      });
      console.log("MockReceiver verified successfully");
    } catch (error) {
      console.error("MockReceiver verification failed:", error);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });