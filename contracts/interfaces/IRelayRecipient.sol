// SPDX-License-Identifier: Unlicense

pragma solidity ^0.7.2;

/**
 * Based on EIP 2771: https://eips.ethereum.org/EIPS/eip-2771
 * And https://github.com/opengsn/forwarder/blob/master/contracts/interfaces/IRelayRecipient.sol
 * A contract must implement this interface in order to support relayed transaction.
 * It is better to inherit the BaseRelayRecipient as its implementation.
 */
interface IRelayRecipient {
    function trustedForwarder() external view returns (address);
    
    function isTrustedForwarder(address forwarder) external view returns (bool);
}
