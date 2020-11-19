//SPDX-License-Identifier: Unlicense

pragma solidity ^0.7.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./RelayRecipient.sol";

contract ERC20Mock is ERC20, RelayRecipient {
    constructor(address forwarder) ERC20("MockToken", "MOCK") {
    _setTrustedForwarder(forwarder);
    }

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }

    function _msgSender() internal view override(Context, RelayRecipient) returns (address payable) {
        return RelayRecipient._msgSender();
    }
}
