// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.15;

contract OwnableCustom {
    address private _owner;

    event OwnershipTransferredCustom(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _owner = msg.sender;
        emit OwnershipTransferredCustom(address(0), msg.sender);
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwnerCustom() {
        require(owner() == msg.sender, "OwnableCustom: caller is not the owner");
        _;
    }

    function renounceOwnership() public virtual onlyOwnerCustom {
        emit OwnershipTransferredCustom(_owner, address(0));
        _owner = address(0);
    }

    function transferOwnership(address newOwner) public virtual onlyOwnerCustom {
        require(newOwner != address(0), "OwnableCustom: new owner is the zero address");
        emit OwnershipTransferredCustom(_owner, newOwner);
        _owner = newOwner;
    }

    function _checkOwner() internal view virtual {
        require(owner() == msg.sender, "OwnableCustom: caller is not the owner");
    }
}