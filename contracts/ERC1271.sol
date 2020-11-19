//SPDX-License-Identifier: Unlicense

pragma solidity ^0.7.2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @dev ERC1271 started as (bytes, bytes) but evolved to (bytes32, bytes).
 * See change: https://github.com/ethereum/EIPs/pull/2776
 * ERC1654 and ERC1271 now have the same interface.
 * Discussion: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1271.md
 * The standard interface name will be mention as ERC1271 in this project.
 */
interface IERC1271 {
    function isValidSignature(bytes32 data, bytes calldata signature) external view returns (bytes4 magicValue);
}

contract ERC1271 is IERC1271 {
    using Address for address;
    using ECDSA for bytes32;

    address public owner;

    bytes4 internal constant ERC1271_MAGICVALUE = 0x1626ba7e;
    bytes4 internal constant ERC1271_FAILVALUE = 0xffffffff;

    event ValueReceived(address indexed sender, uint256 indexed value);

    /**
     * @notice Sets the owner of the contract
     * @param owner_ the owner of the contract.
     */
    constructor(address owner_) {
        owner = owner_;
    }

    /**
     * @notice Checks if an owner signed `data`.
     * ERC1271 interface.
     * @param data hash of the data signed
     * @param signature owner's signature(s) of the data
     */
    function isValidSignature(bytes32 data, bytes calldata signature)
        external
        view
        override
        returns (bytes4 magicValue)
    {
        if (owner.isContract()) {
            return IERC1271(owner).isValidSignature(data, signature);
        } else {
            return owner == data.recover(signature) ? ERC1271_MAGICVALUE : ERC1271_FAILVALUE;
        }
    }
}
