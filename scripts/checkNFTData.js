const { ethers } = require("hardhat");

async function checkNFTData() {
  const contract = await ethers.getContractAt("ArtGridStudio", "0x6Ae59b55330fDEa7952b08ad653e36e339b87aE8");
  const tokenIds = [
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000000000000000000000000002",
  ];
  for (const tokenId of tokenIds) {
    try {
      const data = await contract.getNFTData(tokenId);
      console.log(`NFT Data for ${tokenId}:`, {
        currentTier: data[0].toString(),
        totalLikes: data[1].toString(),
        totalComments: data[2].toString(),
        totalStakedLyx: data[3].toString(),
        tiers: data[4].map(tier => ({
          likesRequired: tier[0].toString(),
          commentsRequired: tier[1].toString(),
          lyxStakeRequired: tier[2].toString(),
          metadataCid: tier[3],
          isUnlocked: tier[4],
        })),
      });
    } catch (error) {
      console.error(`Error fetching ${tokenId}:`, error);
    }
  }
}

checkNFTData().catch(error => {
  console.error(error);
  process.exit(1);
});