// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.15;

import "@lukso/lsp-smart-contracts/contracts/LSP8IdentifiableDigitalAsset/LSP8IdentifiableDigitalAsset.sol";
import "@lukso/lsp-smart-contracts/contracts/LSP1UniversalReceiver/ILSP1UniversalReceiver.sol";
import "./OwnableCustom.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@erc725/smart-contracts/contracts/custom/OwnableUnset.sol";

contract ArtGridStudio is LSP8IdentifiableDigitalAsset, OwnableCustom, ReentrancyGuard, Pausable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct EngagementTier {
        uint256 likesRequired;
        uint256 commentsRequired;
        uint256 lyxStakeRequired;
        string metadataCid;
        bool isUnlocked;
    }

    struct Comment {
        address commenter;
        string text;
        uint256 timestamp;
    }

    struct NFTData {
        EngagementTier[] tiers;
        uint256 currentTier;
        uint256 totalLikes;
        uint256 totalComments;
        uint256 totalStakedLyx;
        Comment[] comments;
    }

    mapping(bytes32 => NFTData) private _nftData;
    mapping(address => bytes32[]) private _ownedNfts;
    mapping(bytes32 => mapping(address => bool)) private _userLikes;
    mapping(bytes32 => uint256) private _nftPrices;

    event NFTMinted(bytes32 indexed tokenId, address indexed creator, uint256 price);
    event NFTPurchased(address indexed buyer, bytes32 indexed tokenId, uint256 price);
    event EngagementUpdated(bytes32 indexed tokenId, uint256 newTier, string newMetadataCid);
    event LYXStaked(address indexed fan, bytes32 indexed tokenId, uint256 amount);
    event CommentAdded(bytes32 indexed tokenId, address indexed commenter, string text, uint256 timestamp);
    event LikeAdded(bytes32 indexed tokenId, address indexed user, uint256 likes);
    event NFTListed(bytes32 indexed tokenId, address indexed seller, uint256 price);
    event NFTListingCanceled(bytes32 indexed tokenId, address indexed seller);
    event UniversalReceiverCalled(address indexed to, bytes32 typeId, bytes data);

    constructor(
        string memory _name,
        string memory _description,
        address _creator
    ) LSP8IdentifiableDigitalAsset(_name, "AGS", _creator, 2, 0) OwnableCustom() {
        require(bytes(_name).length <= 100, "Name too long");
        require(bytes(_description).length <= 500, "Description too long");

        bytes32 metadataKey = keccak256(abi.encodePacked("LSP4Metadata"));
        string memory collectionMetadata = string(abi.encodePacked(
            "{\"LSP4Metadata\":{\"name\":\"", _name,
            "\",\"description\":\"", _description,
            "\",\"links\":[{\"title\":\"UP\",\"url\":\"profile.link/artgridstudio@1234\"}]}}"
        ));
        _setData(metadataKey, bytes(collectionMetadata));
    }

    function mintNFT(
        uint256[] memory likesRequired,
        uint256[] memory commentsRequired,
        uint256[] memory lyxStakeRequired,
        string[] memory metadataCids,
        uint256 price
    ) external whenNotPaused nonReentrant {
        require(likesRequired.length == commentsRequired.length, "Invalid tiers");
        require(commentsRequired.length == lyxStakeRequired.length, "Invalid tiers");
        require(lyxStakeRequired.length == metadataCids.length, "Invalid tiers");
        require(likesRequired.length > 0, "At least one tier required");
        require(price > 0, "Price must be greater than zero");
        require(bytes(metadataCids[0]).length > 0, "Invalid metadata CID");

        _tokenIds.increment();
        bytes32 tokenId = bytes32(uint256(_tokenIds.current()));
        
        _mint(address(this), tokenId, true, "");

        NFTData storage nft = _nftData[tokenId];
        for (uint256 i = 0; i < likesRequired.length; i++) {
            string memory ipfsUrl = string(abi.encodePacked("ipfs://", metadataCids[i]));
            nft.tiers.push(EngagementTier({
                likesRequired: likesRequired[i],
                commentsRequired: commentsRequired[i],
                lyxStakeRequired: lyxStakeRequired[i],
                metadataCid: ipfsUrl,
                isUnlocked: i == 0
            }));
        }
        nft.currentTier = 0;

        _ownedNfts[address(this)].push(tokenId);
        _nftPrices[tokenId] = price;

        bytes32 metadataKey = keccak256(
            abi.encodePacked(
                keccak256(abi.encodePacked("LSP4Metadata")),
                tokenId
            )
        );
        string memory metadataUrl = string(abi.encodePacked("ipfs://", metadataCids[0]));
        _setTokenIdData(tokenId, metadataKey, bytes(metadataUrl));

        emit NFTMinted(tokenId, msg.sender, price);
    }

    function buyNFT(bytes32 tokenId) external payable whenNotPaused nonReentrant {
        require(_exists(tokenId), "NFT does not exist");
        bool nftIsListed = false;
        for (uint256 i = 0; i < _ownedNfts[address(this)].length; i++) {
            if (_ownedNfts[address(this)][i] == tokenId) {
                nftIsListed = true;
                _ownedNfts[address(this)][i] = _ownedNfts[address(this)][_ownedNfts[address(this)].length - 1];
                _ownedNfts[address(this)].pop();
                break;
            }
        }
        require(nftIsListed, "NFT not listed");
        uint256 price = _nftPrices[tokenId];
        require(msg.value >= price, "Insufficient payment");

        address seller = tokenOwnerOf(tokenId);
        require(seller == address(this), "Seller must be the contract");

        _transfer(address(this), msg.sender, tokenId, true, "");

        if (msg.value > price) {
            (bool refundSent,) = payable(msg.sender).call{value: msg.value - price}("");
            require(refundSent, "Refund failed");
        }

        // No need to send funds to seller (contract itself); funds are already in the contract via msg.value

        emit NFTPurchased(msg.sender, tokenId, price);
    }

    function listNFTForSale(bytes32 tokenId, uint256 price) external whenNotPaused nonReentrant {
        require(_exists(tokenId), "NFT does not exist");
        require(_isOperatorOrOwner(msg.sender, tokenId), "Not owner or operator");
        require(price > 0, "Price must be greater than zero");

        _transfer(msg.sender, address(this), tokenId, true, "");
        _nftPrices[tokenId] = price;
        _ownedNfts[address(this)].push(tokenId);

        emit NFTListed(tokenId, msg.sender, price);
    }

    function cancelListing(bytes32 tokenId) external whenNotPaused nonReentrant {
        require(_exists(tokenId), "NFT does not exist");
        require(_ownedNfts[address(this)].length > 0, "No NFTs listed");
        
        bool nftIsListed = false;
        for (uint256 i = 0; i < _ownedNfts[address(this)].length; i++) {
            if (_ownedNfts[address(this)][i] == tokenId) {
                nftIsListed = true;
                _ownedNfts[address(this)][i] = _ownedNfts[address(this)][_ownedNfts[address(this)].length - 1];
                _ownedNfts[address(this)].pop();
                break;
            }
        }
        require(nftIsListed, "NFT not listed");

        address nftOwner = tokenOwnerOf(tokenId);
        _transfer(address(this), nftOwner, tokenId, true, "");
        delete _nftPrices[tokenId];

        emit NFTListingCanceled(tokenId, msg.sender);
    }

    function isListed(bytes32 tokenId) external view returns (bool) {
        for (uint256 i = 0; i < _ownedNfts[address(this)].length; i++) {
            if (_ownedNfts[address(this)][i] == tokenId) {
                return true;
            }
        }
        return false;
    }

    function hasLiked(bytes32 tokenId, address user) external view returns (bool) {
        return _userLikes[tokenId][user];
    }

    function addEngagement(bytes32 tokenId, uint256 likes, string memory comment) external whenNotPaused {
        require(_exists(tokenId), "NFT does not exist");
        NFTData storage nft = _nftData[tokenId];
        require(nft.tiers.length > nft.currentTier + 1, "No more tiers to unlock");

        if (likes > 0) {
            require(!_userLikes[tokenId][msg.sender], "You have already liked this NFT");
            _userLikes[tokenId][msg.sender] = true;
            nft.totalLikes += likes;
            emit LikeAdded(tokenId, msg.sender, likes);
        }

        if (bytes(comment).length > 0) {
            require(bytes(comment).length <= 500, "Comment too long");
            nft.totalComments += 1;
            nft.comments.push(Comment({
                commenter: msg.sender,
                text: comment,
                timestamp: block.timestamp
            }));
            emit CommentAdded(tokenId, msg.sender, comment, block.timestamp);
        }

        EngagementTier storage nextTier = nft.tiers[nft.currentTier + 1];
        if (
            nft.totalLikes >= nextTier.likesRequired &&
            nft.totalComments >= nextTier.commentsRequired &&
            nft.totalStakedLyx >= nextTier.lyxStakeRequired &&
            !nextTier.isUnlocked
        ) {
            nft.currentTier++;
            nextTier.isUnlocked = true;
            bytes32 metadataKey = keccak256(
                abi.encodePacked(
                    keccak256(abi.encodePacked("LSP4Metadata")),
                    tokenId
                )
            );
            _setTokenIdData(tokenId, metadataKey, bytes(nextTier.metadataCid));
            emit EngagementUpdated(tokenId, nft.currentTier, nextTier.metadataCid);
        }
    }

    function stakeLYX(bytes32 tokenId) external payable whenNotPaused nonReentrant {
        require(_exists(tokenId), "NFT does not exist");
        require(msg.value > 0, "No LYX sent");
        NFTData storage nft = _nftData[tokenId];
        require(nft.tiers.length > nft.currentTier + 1, "No more tiers to unlock");

        nft.totalStakedLyx += msg.value;

        (bool sent,) = payable(owner()).call{value: msg.value}("");
        require(sent, "Transfer to creator failed");

        EngagementTier storage nextTier = nft.tiers[nft.currentTier + 1];
        if (
            nft.totalLikes >= nextTier.likesRequired &&
            nft.totalComments >= nextTier.commentsRequired &&
            nft.totalStakedLyx >= nextTier.lyxStakeRequired &&
            !nextTier.isUnlocked
        ) {
            nft.currentTier++;
            nextTier.isUnlocked = true;
            bytes32 metadataKey = keccak256(
                abi.encodePacked(
                    keccak256(abi.encodePacked("LSP4Metadata")),
                    tokenId
                )
            );
            _setTokenIdData(tokenId, metadataKey, bytes(nextTier.metadataCid));
            emit EngagementUpdated(tokenId, nft.currentTier, nextTier.metadataCid);
        }

        emit LYXStaked(msg.sender, tokenId, msg.value);
    }

    function getNFTData(bytes32 tokenId) external view returns (
        uint256 currentTier,
        uint256 totalLikes,
        uint256 totalComments,
        uint256 totalStakedLyx,
        EngagementTier[] memory tiers,
        Comment[] memory comments,
        uint256 price
    ) {
        require(_exists(tokenId), "NFT does not exist");
        NFTData storage nft = _nftData[tokenId];
        return (
            nft.currentTier,
            nft.totalLikes,
            nft.totalComments,
            nft.totalStakedLyx,
            nft.tiers,
            nft.comments,
            _nftPrices[tokenId]
        );
    }

    function getOwnedNFTs(address user) external view returns (bytes32[] memory) {
        return _ownedNfts[user];
    }

    function getNFTPrice(bytes32 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "NFT does not exist");
        return _nftPrices[tokenId];
    }

    function pause() external onlyOwnerCustom {
        _pause();
    }

    function unpause() external onlyOwnerCustom {
        _unpause();
    }

    function _transfer(
        address from,
        address to,
        bytes32 tokenId,
        bool force,
        bytes memory data
    ) internal virtual override {
        super._transfer(from, to, tokenId, force, data);
        bytes32[] storage fromNfts = _ownedNfts[from];
        for (uint256 i = 0; i < fromNfts.length; i++) {
            if (fromNfts[i] == tokenId) {
                fromNfts[i] = fromNfts[fromNfts.length - 1];
                fromNfts.pop();
                break;
            }
        }
        _ownedNfts[to].push(tokenId);
        _notifyTokenReceiver(from, to, tokenId);
    }

    function _notifyTokenReceiver(address from, address to, bytes32 tokenId) private {
        if (to.code.length > 0) {
            bytes memory data = abi.encodePacked(from, to, tokenId);
            emit UniversalReceiverCalled(to, bytes32(0), data);
            try ILSP1UniversalReceiver(to).universalReceiver(
                bytes32(0),
                data
            ) returns (bytes memory) {} catch {}
        }
    }

    receive() external payable override {
        revert("Direct payments not allowed");
    }

    function owner() public view virtual override(OwnableCustom, OwnableUnset) returns (address) {
        return OwnableCustom.owner();
    }

    function renounceOwnership() public virtual override(OwnableCustom, OwnableUnset) onlyOwnerCustom {
        OwnableCustom.renounceOwnership();
    }

    function transferOwnership(address newOwner) public virtual override(OwnableCustom, OwnableUnset) onlyOwnerCustom {
        OwnableCustom.transferOwnership(newOwner);
    }

    function _checkOwner() internal view virtual override(OwnableCustom, OwnableUnset) {
        OwnableCustom._checkOwner();
    }
}