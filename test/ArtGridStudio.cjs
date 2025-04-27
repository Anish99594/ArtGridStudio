const { expect } = require("chai");
const hre = require("hardhat");

describe("ArtGridStudio on LUKSO Testnet", function () {
  let ArtGridStudio, OwnerContract, MockReceiver, artGridStudio, ownerContract, mockReceiver, owner, buyer, fan, other;
  let nftPrice, tiers;

  beforeEach(async function () {
    this.timeout(120000); // Increase timeout for Testnet

    const ethers = hre.ethers;
    [owner] = await ethers.getSigners(); // Only owner is provided by config

    // Create new wallets for buyer, fan, and other
    buyer = ethers.Wallet.createRandom().connect(ethers.provider);
    fan = ethers.Wallet.createRandom().connect(ethers.provider);
    other = ethers.Wallet.createRandom().connect(ethers.provider);

    // Initialize nftPrice and tiers
    nftPrice = ethers.utils.parseEther("0.01"); // 0.01 LYXt
    tiers = {
      likes: [10, 20],
      comments: [5, 10],
      stakes: [ethers.utils.parseEther("0.001"), ethers.utils.parseEther("0.002")],
      cids: [ethers.utils.formatBytes32String("cid1"), ethers.utils.formatBytes32String("cid2")],
    };

    // Attach to deployed contracts on LUKSO Testnet
    ArtGridStudio = await ethers.getContractFactory("ArtGridStudio");
    artGridStudio = await ArtGridStudio.attach("0x27003F055CEA888FDa02d55D0E9fB1070201e382");

    OwnerContract = await ethers.getContractFactory("OwnerContract");
    ownerContract = await OwnerContract.attach("0x453BBAb17999BD9fA4811087cF151080A15E7594");

    MockReceiver = await ethers.getContractFactory("MockReceiver");
    mockReceiver = await MockReceiver.attach("0x3D7CFcf0c8b1b10393471C9F325cce3CE271d00A");

    // Fund test accounts with LYXt from owner (0xfbabe68AD32741B2c30952D329218B62B80e2df5)
    const fundAmount = ethers.utils.parseEther("0.01"); // 0.01 LYXt each
    for (const account of [buyer, fan, other]) {
      await owner.sendTransaction({
        to: account.address,
        value: fundAmount,
        gasLimit: 21000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
    }
  });

  describe("mintNFT", function () {
    it("should mint an NFT with valid tiers", async function () {
      const ownedNftsBefore = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      console.log("Owned NFTs before mint:", ownedNftsBefore.map(nft => nft.toString()));
      try {
        const tx = await artGridStudio.connect(owner).mintNFT(
          tiers.likes,
          tiers.comments,
          tiers.stakes,
          tiers.cids,
          artGridStudio.address,
          { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        );
        const receipt = await tx.wait();
        console.log("MintNFT receipt:", receipt);
      } catch (error) {
        console.error("MintNFT failed:", error);
        throw error;
      }
      const ownedNftsAfter = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      console.log("Owned NFTs after mint:", ownedNftsAfter.map(nft => nft.toString()));
      expect(ownedNftsAfter.length).to.equal(ownedNftsBefore.length + 1); // Dynamic expectation
      const tokenId = ownedNftsAfter[ownedNftsAfter.length - 1];
      const nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.currentTier).to.equal(0);
      expect(nftData.tiers.length).to.equal(2);
      expect(nftData.tiers[0].isUnlocked).to.be.true;
      expect(nftData.tiers[1].isUnlocked).to.be.false;
      expect(nftData.tiers[0].metadataCid).to.equal(tiers.cids[0]);
    });

    it("should mint an NFT with invalid tiers", async function () {
      const ownedNftsBefore = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      await artGridStudio.connect(owner).mintNFT(
        [10],
        [5, 10, 15],
        [ethers.utils.parseEther("0.001")],
        [ethers.utils.formatBytes32String("cid1"), ethers.utils.formatBytes32String("cid2")],
        artGridStudio.address,
        { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNftsAfter = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      expect(ownedNftsAfter.length).to.equal(ownedNftsBefore.length + 1);
    });

    it("should mint an NFT with no tiers", async function () {
      const ownedNftsBefore = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      await artGridStudio.connect(owner).mintNFT(
        [],
        [],
        [],
        [],
        artGridStudio.address,
        { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNftsAfter = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      expect(ownedNftsAfter.length).to.equal(ownedNftsBefore.length + 1);
    });

    it("should revert if receiver is zero address", async function () {
      await expect(
        artGridStudio.connect(owner).mintNFT(
          tiers.likes,
          tiers.comments,
          tiers.stakes,
          tiers.cids,
          hre.ethers.constants.AddressZero,
          { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        )
      ).to.be.revertedWith("Invalid receiver address");
    });

    it("should revert if called by non-owner", async function () {
      await expect(
        artGridStudio.connect(buyer).mintNFT(
          tiers.likes,
          tiers.comments,
          tiers.stakes,
          tiers.cids,
          artGridStudio.address,
          { gasLimit: 500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        )
      ).to.be.revertedWith("OwnableCustom: caller is not the owner");
    });
  });

  describe("buyNFT", function () {
    let tokenId;
    beforeEach(async function () {
      this.timeout(60000);
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        artGridStudio.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNfts = await artGridStudio.getOwnedNFTs(artGridStudio.address);
      tokenId = ownedNfts[0];
      // Transfer ownership to ownerContract for reentrancy test
      await artGridStudio.connect(owner).transferOwnership(ownerContract.address, {
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
    });

    it("should buy an NFT with exact payment", async function () {
      const ownerBalanceBefore = await hre.ethers.provider.getBalance(ownerContract.address);
      await artGridStudio.connect(buyer).buyNFT({
        value: nftPrice,
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      expect(ownedNfts.length).to.equal(1);
      const ownerBalanceAfter = await hre.ethers.provider.getBalance(ownerContract.address);
      expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.closeTo(nftPrice, ethers.utils.parseEther("0.01"));
      expect(await artGridStudio.getOwnedNFTs(artGridStudio.address)).to.have.length(0);
    });

    it("should buy an NFT with excess payment and refund", async function () {
      const excessPayment = ethers.utils.parseEther("0.075"); // Reduced to 0.075 LYXt
      const buyerBalanceBefore = await hre.ethers.provider.getBalance(buyer.address);
      const tx = await artGridStudio.connect(buyer).buyNFT({
        value: excessPayment,
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed.mul(tx.gasPrice);
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      expect(ownedNfts.length).to.equal(1);
      const buyerBalanceAfter = await hre.ethers.provider.getBalance(buyer.address);
      expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.closeTo(nftPrice.add(gasUsed), ethers.utils.parseEther("0.01"));
      expect(await artGridStudio.getOwnedNFTs(artGridStudio.address)).to.have.length(0);
    });

    it("should prevent reentrancy and only purchase one NFT", async function () {
      const excessPayment = ethers.utils.parseEther("0.075"); // Reduced to 0.075 LYXt
      await buyer.sendTransaction({
        to: ownerContract.address,
        value: excessPayment,
        gasLimit: 21000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const tx = await ownerContract.connect(buyer).attack(tokenId, {
        value: excessPayment,
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      await expect(tx)
        .to.emit(artGridStudio, "NFTPurchased")
        .withArgs(ownerContract.address, tokenId);
      const ownedNfts = await artGridStudio.getOwnedNFTs(ownerContract.address);
      expect(ownedNfts.length).to.equal(1);
      expect(await artGridStudio.getOwnedNFTs(artGridStudio.address)).to.have.length(0);
      await expect(
        ownerContract.connect(buyer).attack(tokenId, {
          value: excessPayment,
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("No NFTs available");
    });

    it("should revert if payment is insufficient", async function () {
      await expect(
        artGridStudio.connect(buyer).buyNFT({
          value: ethers.utils.parseEther("0.025"), // Adjusted for new nftPrice
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("Insufficient payment");
    });

    it("should revert if no NFTs are available", async function () {
      await artGridStudio.connect(buyer).buyNFT({
        value: nftPrice,
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      await expect(
        artGridStudio.connect(buyer).buyNFT({
          value: nftPrice,
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("No NFTs available");
    });

    it("should revert when paused", async function () {
      await ownerContract.connect(buyer).pause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
      await expect(
        artGridStudio.connect(buyer).buyNFT({
          value: nftPrice,
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("Pausable: paused");
      await ownerContract.connect(buyer).unpause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
    });
  });

  describe("addEngagement", function () {
    let tokenId;
    beforeEach(async function () {
      this.timeout(60000);
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        buyer.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      tokenId = ownedNfts[0];
    });

    it("should add engagement and unlock next tier", async function () {
      await artGridStudio.connect(fan).addEngagement(tokenId, 20, 10, {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      let nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.totalLikes).to.equal(20);
      expect(nftData.totalComments).to.equal(10);
      expect(nftData.currentTier).to.equal(0);

      await artGridStudio.connect(fan).stakeLYX(tokenId, {
        value: tiers.stakes[1],
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.currentTier).to.equal(1);
      expect(nftData.tiers[1].isUnlocked).to.be.true;

      const metadataBaseKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("LSP4Metadata"));
      const metadataKey = ethers.utils.hexDataSlice(
        ethers.utils.concat([metadataBaseKey, tokenId]),
        0,
        32
      );
      const metadata = await artGridStudio.getData(metadataKey);
      expect(ethers.utils.hexlify(metadata)).to.equal(ethers.utils.hexlify(ethers.utils.hexZeroPad(tiers.cids[1], 32)));
    });

    it("should not unlock tier if requirements not met", async function () {
      await artGridStudio.connect(fan).addEngagement(tokenId, 5, 2, {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.currentTier).to.equal(0);
      expect(nftData.tiers[1].isUnlocked).to.be.false;
    });

    it("should revert if token does not exist", async function () {
      await expect(
        artGridStudio.connect(fan).addEngagement(ethers.utils.formatBytes32String("invalid"), 10, 5, {
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("NFT does not exist");
    });

    it("should revert if no more tiers to unlock", async function () {
      await artGridStudio.connect(fan).addEngagement(tokenId, 20, 10, {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      await artGridStudio.connect(fan).stakeLYX(tokenId, {
        value: tiers.stakes[1],
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.currentTier).to.equal(1);

      await expect(
        artGridStudio.connect(fan).addEngagement(tokenId, 10, 5, {
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("No more tiers to unlock");
    });
  });

  describe("stakeLYX", function () {
    let tokenId;
    beforeEach(async function () {
      this.timeout(60000);
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        buyer.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      tokenId = ownedNfts[0];
      // Transfer ownership to ownerContract for reentrancy test
      await artGridStudio.connect(owner).transferOwnership(ownerContract.address, {
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
    });

    it("should stake LYX and unlock next tier", async function () {
      await artGridStudio.connect(fan).addEngagement(tokenId, 20, 10, {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const ownerBalanceBefore = await hre.ethers.provider.getBalance(ownerContract.address);
      await artGridStudio.connect(fan).stakeLYX(tokenId, {
        value: tiers.stakes[1],
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.totalStakedLyx).to.equal(tiers.stakes[1]);
      expect(nftData.currentTier).to.equal(1);
      expect(nftData.tiers[1].isUnlocked).to.be.true;
      const ownerBalanceAfter = await hre.ethers.provider.getBalance(ownerContract.address);
      expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.closeTo(tiers.stakes[1], ethers.utils.parseEther("0.01"));
    });

    it("should prevent reentrancy in stakeLYX", async function () {
      await fan.sendTransaction({
        to: ownerContract.address,
        value: ethers.utils.parseEther("0.075"), // Reduced to 0.075 LYXt
        gasLimit: 21000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      // Set catchReentrancy to false to let reentrancy revert propagate
      await ownerContract.connect(owner).setCatchReentrancy(false, {
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      // First attackStake should fail due to reentrancy attempt causing transfer failure
      await expect(
        ownerContract.connect(fan).attackStake(tokenId, {
          value: tiers.stakes[0],
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("Transfer to creator failed");
      // Reset catchReentrancy for other tests
      await ownerContract.connect(owner).setCatchReentrancy(true, {
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      // Verify no LYX was staked
      const nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.totalStakedLyx).to.equal(0);
      expect(nftData.currentTier).to.equal(0);
      // Second attackStake should succeed since no reentrancy is attempted
      await expect(
        ownerContract.connect(fan).attackStake(tokenId, {
          value: tiers.stakes[0],
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      )
        .to.emit(artGridStudio, "LYXStaked")
        .withArgs(ownerContract.address, tokenId, tiers.stakes[0]);
      const nftDataAfter = await artGridStudio.getNFTData(tokenId);
      expect(nftDataAfter.totalStakedLyx).to.equal(tiers.stakes[0]);
      expect(nftDataAfter.currentTier).to.equal(0);
    });

    it("should revert if no LYX sent", async function () {
      await expect(
        artGridStudio.connect(fan).stakeLYX(tokenId, {
          value: 0,
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("No LYX sent");
    });

    it("should revert if token does not exist", async function () {
      await expect(
        artGridStudio.connect(fan).stakeLYX(ethers.utils.formatBytes32String("invalid"), {
          value: ethers.utils.parseEther("0.01"),
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("NFT does not exist");
    });

    it("should revert when paused", async function () {
      await ownerContract.connect(fan).pause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
      await expect(
        artGridStudio.connect(fan).stakeLYX(tokenId, {
          value: ethers.utils.parseEther("0.01"),
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("Pausable: paused");
      await ownerContract.connect(fan).unpause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
    });
  });

  describe("getNFTData", function () {
    let tokenId;
    beforeEach(async function () {
      this.timeout(60000);
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        buyer.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      tokenId = ownedNfts[0];
    });

    it("should return correct NFT data", async function () {
      await artGridStudio.connect(fan).addEngagement(tokenId, 20, 10, {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      await artGridStudio.connect(fan).stakeLYX(tokenId, {
        value: tiers.stakes[1],
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const nftData = await artGridStudio.getNFTData(tokenId);
      expect(nftData.currentTier).to.equal(1);
      expect(nftData.totalLikes).to.equal(20);
      expect(nftData.totalComments).to.equal(10);
      expect(nftData.totalStakedLyx).to.equal(tiers.stakes[1]);
      expect(nftData.tiers.length).to.equal(2);
    });

    it("should revert if token does not exist", async function () {
      await expect(artGridStudio.getNFTData(ethers.utils.formatBytes32String("invalid"))).to.be.revertedWith(
        "NFT does not exist"
      );
    });
  });

  describe("getOwnedNFTs", function () {
    it("should return correct owned NFTs", async function () {
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        buyer.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        buyer.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      expect(ownedNfts.length).to.equal(2);
    });

    it("should return empty array for non-owner", async function () {
      const ownedNfts = await artGridStudio.getOwnedNFTs(other.address);
      expect(ownedNfts.length).to.equal(0);
    });
  });

  describe("pause and unpause", function () {
    beforeEach(async function () {
      this.timeout(60000);
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        artGridStudio.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      await artGridStudio.connect(owner).transferOwnership(ownerContract.address, {
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
    });

    it("should pause and unpause contract", async function () {
      await ownerContract.connect(buyer).pause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
      await expect(
        artGridStudio.connect(buyer).buyNFT({
          value: nftPrice,
          gasLimit: 500000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("Pausable: paused");
      await ownerContract.connect(buyer).unpause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
      await artGridStudio.connect(buyer).buyNFT({
        value: nftPrice,
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
    });

    it("should revert if pause/unpause called by non-owner", async function () {
      await expect(
        artGridStudio.connect(buyer).pause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") })
      ).to.be.revertedWith("OwnableCustom: caller is not the owner");
      await expect(
        artGridStudio.connect(buyer).unpause({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") })
      ).to.be.revertedWith("OwnableCustom: caller is not the owner");
    });
  });

  describe("transfer", function () {
    let tokenId;
    beforeEach(async function () {
      this.timeout(60000);
      await artGridStudio.connect(owner).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        buyer.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
      const ownedNfts = await artGridStudio.getOwnedNFTs(buyer.address);
      tokenId = ownedNfts[0];
    });

    it("should transfer NFT and notify receiver", async function () {
      await artGridStudio.connect(buyer).transfer(buyer.address, mockReceiver.address, tokenId, true, "0x", {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      const ownedNfts = await artGridStudio.getOwnedNFTs(mockReceiver.address);
      expect(ownedNfts.length).to.equal(1);
      expect(ownedNfts[0]).to.equal(tokenId);
      const lastTypeId = await mockReceiver.lastTypeId();
      const lastData = await mockReceiver.lastData();
      expect(lastTypeId).to.equal(ethers.constants.HashZero);
      expect(lastData).to.equal(
        ethers.utils.hexlify(ethers.utils.concat([buyer.address, mockReceiver.address, tokenId]))
      );
    });

    it("should update owned NFTs correctly", async function () {
      await artGridStudio.connect(buyer).transfer(buyer.address, other.address, tokenId, true, "0x", {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      expect(await artGridStudio.getOwnedNFTs(buyer.address)).to.have.length(0);
      const ownedNfts = await artGridStudio.getOwnedNFTs(other.address);
      expect(ownedNfts.length).to.equal(1);
      expect(ownedNfts[0]).to.equal(tokenId);
    });
  });

  describe("OwnableCustom", function () {
    it("should transfer ownership", async function () {
      await artGridStudio.connect(owner).transferOwnership(other.address, {
        gasLimit: 100000,
        gasPrice: ethers.utils.parseUnits("10", "gwei"),
      });
      expect(await artGridStudio.owner()).to.equal(other.address);
      await expect(
        artGridStudio.connect(owner).mintNFT(
          tiers.likes,
          tiers.comments,
          tiers.stakes,
          tiers.cids,
          artGridStudio.address,
          { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        )
      ).to.be.revertedWith("OwnableCustom: caller is not the owner");
      await artGridStudio.connect(other).mintNFT(
        tiers.likes,
        tiers.comments,
        tiers.stakes,
        tiers.cids,
        artGridStudio.address,
        { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
      );
    });

    it("should renounce ownership", async function () {
      await artGridStudio.connect(owner).renounceOwnership({ gasLimit: 100000, gasPrice: ethers.utils.parseUnits("10", "gwei") });
      expect(await artGridStudio.owner()).to.equal(ethers.constants.AddressZero);
      await expect(
        artGridStudio.connect(owner).mintNFT(
          tiers.likes,
          tiers.comments,
          tiers.stakes,
          tiers.cids,
          artGridStudio.address,
          { gasLimit: 1500000, gasPrice: ethers.utils.parseUnits("10", "gwei") }
        )
      ).to.be.revertedWith("OwnableCustom: caller is not the owner");
    });

    it("should revert if non-owner tries to transfer ownership", async function () {
      await expect(
        artGridStudio.connect(buyer).transferOwnership(other.address, {
          gasLimit: 100000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("OwnableCustom: caller is not the owner");
    });
  });

  describe("receive", function () {
    it("should revert on direct ETH payments", async function () {
      await expect(
        buyer.sendTransaction({
          to: artGridStudio.address,
          value: ethers.utils.parseEther("0.05"), // Adjusted for new nftPrice
          gasLimit: 21000,
          gasPrice: ethers.utils.parseUnits("10", "gwei"),
        })
      ).to.be.revertedWith("Direct payments not allowed");
    });
  });
});