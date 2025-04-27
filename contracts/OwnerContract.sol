// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.15;

interface IArtGridStudio {
    function pause() external;
    function unpause() external;
    function buyNFT() external payable;
    function stakeLYX(bytes32 tokenId) external payable;
}

contract OwnerContract {
    address public immutable target;
    bool private attacking;
    bytes32 private reentrantTokenId;
    bool private reentrancyAttempted;
    bool public catchReentrancy; // New flag to control catching reentrancy failure

    constructor(address _target) {
        target = _target;
        catchReentrancy = true; // Default to true for buyNFT compatibility
    }

    function setCatchReentrancy(bool _catch) external {
        catchReentrancy = _catch;
    }

    function pause() external {
        IArtGridStudio(target).pause();
    }

    function unpause() external {
        IArtGridStudio(target).unpause();
    }

    function attack(bytes32 tokenId) external payable {
        attacking = true;
        reentrantTokenId = tokenId;
        reentrancyAttempted = false;
        IArtGridStudio(target).buyNFT{value: msg.value}();
        attacking = false;
        reentrantTokenId = bytes32(0);
        reentrancyAttempted = false;
    }

    function attackStake(bytes32 tokenId) external payable {
        attacking = true;
        reentrantTokenId = tokenId;
        reentrancyAttempted = false;
        IArtGridStudio(target).stakeLYX{value: msg.value}(tokenId);
        attacking = false;
        reentrantTokenId = bytes32(0);
        reentrancyAttempted = false;
    }

    receive() external payable {
        if (attacking && reentrantTokenId != bytes32(0) && !reentrancyAttempted) {
            reentrancyAttempted = true;
            if (catchReentrancy) {
                try IArtGridStudio(target).stakeLYX{value: msg.value}(reentrantTokenId) {
                    // Success (should not happen due to nonReentrant)
                } catch {
                    // Expected failure due to ReentrancyGuard
                }
            } else {
                IArtGridStudio(target).stakeLYX{value: msg.value}(reentrantTokenId);
                // Reentrancy blocked by nonReentrant will revert here
            }
        }
    }
}