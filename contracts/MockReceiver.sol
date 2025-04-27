// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.15;

contract MockReceiver {
    bytes32 public lastTypeId;
    bytes public lastData;

    function universalReceiver(bytes32 typeId, bytes memory data) external returns (bytes memory) {
        lastTypeId = typeId;
        lastData = data;
        return "";
    }
}