const { ethers } = require("hardhat");

async function main() {
  const artGridStudio = await ethers.getContractAt("ArtGridStudio", "0x27003F055CEA888FDa02d55D0E9fB1070201e382");
  const ownedNfts = await artGridStudio.getOwnedNFTs("0x27003F055CEA888FDa02d55D0E9fB1070201e382");
  console.log("Owned NFTs:", ownedNfts.map(nft => nft.toString()));
  console.log("Number of NFTs:", ownedNfts.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});