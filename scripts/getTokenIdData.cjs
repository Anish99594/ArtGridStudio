const { ethers } = require("hardhat");

const ARTGRIDSTUDIO_ADDRESS = "0xBEA5c3e1c2Fc9fA05484c319DFbf55086b6617A8";

// Replace with the tokenId of the NFT you want to query (in bytes32 format, e.g., "0x...")
// You can get this from the NFTMinted event or your frontend
const tokenId = "0x0000000000000000000000000000000000000000000000000000000000000003"; // Example tokenId

// Partial ABI including only the getTokenIdData function
const artGridStudioABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "tokenId", type: "bytes32" },
      { internalType: "bytes32", name: "dataKey", type: "bytes32" },
    ],
    name: "getTokenIdData",
    outputs: [{ internalType: "bytes", name: "dataValues", type: "bytes" }],
    stateMutability: "view",
    type: "function",
  },
];

async function main() {
  try {
    // Get the provider for LUKSO Testnet
    const provider = ethers.provider;

    // Compute the LSP4Metadata data key
    const lsp4MetadataKeyPrefix = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("LSP4Metadata")
    );
    const dataKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ["bytes32", "bytes32"],
        [lsp4MetadataKeyPrefix, tokenId]
      )
    );

    // Create contract instance
    const contract = new ethers.Contract(
      ARTGRIDSTUDIO_ADDRESS,
      artGridStudioABI,
      provider
    );

    // Call getTokenIdData
    const result = await contract.getTokenIdData(tokenId, dataKey);

    // Decode the result (assuming it's a string CID)
    const cid = ethers.utils.toUtf8String(result);
    console.log("Metadata CID:", cid);

    // Validate CID format (basic check for ipfs:// prefix)
    if (cid.startsWith("ipfs://")) {
      console.log("Valid IPFS CID format");
    } else {
      console.warn("CID does not start with 'ipfs://'. It might be invalid.");
    }
  } catch (error) {
    console.error("Error fetching tokenId data:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });