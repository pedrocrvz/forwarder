// SPDX-License-Identifier: Unlicense

pragma solidity ^0.7.2;
pragma experimental ABIEncoderV2;

interface IForwarder {
    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 nonce;
        bytes data;
    }

    struct BatchRequest {
        ForwardRequest req;
        bytes sig;
    }

    struct Call {
        address to;
        bytes data;
        uint256 value;
    }

    event TransactionReverted(string reason);

    function FORWARD_REQUEST_TYPEHASH() external view returns (bytes32);

    function EIP712DOMAIN_TYPEHASH() external view returns (bytes32);

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function getNonce(address from) external view returns (uint256);

    function verify(ForwardRequest calldata req, bytes calldata sig) external view;

    function execute(ForwardRequest calldata req, bytes calldata sig)
        external
        payable
        returns (bool success, bytes memory ret);

    function batch(Call[] calldata calls) external payable;

    function executeBatch(BatchRequest[] calldata reqs, bool revertOnFail) external payable;
}
