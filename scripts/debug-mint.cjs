const { ethers } = require("hardhat");

async function main() {
  const [owner] = await ethers.getSigners();
  const artGridStudio = await ethers.getContractAt("ArtGridStudio", "0x27003F055CEA888FDa02d55D0E9fB1070201e382");
  const tiers = {
    likes: [10, 20],
    comments: [5, 10],
    stakes: [ethers.utils.parseEther("0.001"), ethers.utils.parseEther("0.002")],
    cids: [ethers.utils.formatBytes32String("cid1"), ethers.utils.formatBytes32String("cid2")],
  };
  console.log("Minting NFT with owner:", owner.address);
  try {
    const tx = await artGridStudio.connect(owner).mintNFT(
      tiers.likes,
      tiers.comments,
      tiers.stakes,
      tiers.cids,
      artGridStudio.address,
      { gasLimit: 2000000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
    );
    const receipt = await tx.wait();
    console.log("Transaction receipt:", receipt);
    const ownedNfts = await artGridStudio.getOwnedNFTs(artGridStudio.address);
    console.log("Owned NFTs after mint:", ownedNfts.map(nft => nft.toString()));
  } catch (error) {
    console.error("MintNFT failed:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});