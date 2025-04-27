const { ethers } = require("hardhat");

async function main() {
  const artGridStudio = await ethers.getContractAt("ArtGridStudio", "0x27003F055CEA888FDa02d55D0E9fB1070201e382");
  const owner = await artGridStudio.owner();
  console.log("ArtGridStudio owner:", owner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});