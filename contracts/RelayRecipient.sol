// SPDX-License-Identifier: Unlicense

pragma solidity ^0.7.2;
import "./interfaces/IRelayRecipient.sol";

/**
 * Based on EIP 2771: https://eips.ethereum.org/EIPS/eip-2771
 * And https://github.com/opengsn/forwarder/blob/master/contracts/BaseRelayRecipient.sol
 * A base contract to be inherited by any contract that want to receive relayed transactions
 * A subclass must use "_msgSender()" instead of "msg.sender"
 */
contract RelayRecipient is IRelayRecipient {

    address public override trustedForwarder;

    function isTrustedForwarder(address forwarder) public view override returns (bool) {
        return forwarder == trustedForwarder;
    }

    function _setTrustedForwarder(address forwarder) internal {
        trustedForwarder = forwarder;
    }

    function _msgSender() internal view virtual returns (address payable _ret) {
        if (msg.data.length >= 24 && isTrustedForwarder(msg.sender)) {
            assembly {
                _ret := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            return msg.sender;
        }
    }
}
