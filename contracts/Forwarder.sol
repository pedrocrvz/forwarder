// SPDX-License-Identifier: Unlicense

pragma solidity ^0.7.2;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./interfaces/IForwarder.sol";

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

/**
 * @title Forwarder
 * @notice The Forwarder contract is responsible for forwarding requests to contracts that trusts it.
 * @author Pedro Cruz
 *
 * Trusted forward for EIP 2771: https://eips.ethereum.org/EIPS/eip-2771
 * Based on EIP 2585: https://github.com/ethereum/EIPs/issues/2585
 * And opengsn forwarder: https://github.com/opengsn/forwarder/blob/master/contracts/Forwarder.sol (https://github.com/opengsn/gsn/pull/392)
 * Uses EIP-712: Ethereum typed structured data hashing and signing https://eips.ethereum.org/EIPS/eip-712
 * EIP-712 info: https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
 */
contract Forwarder is IForwarder {
    using Address for address;
    using ECDSA for bytes32;

    /****************************************/
    /*                STORAGE               */
    /****************************************/

    bytes4 private constant ERC1271_MAGICVALUE = 0x1626ba7e;

    bytes32 public constant override FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address from,address to,uint256 value,uint256 nonce,bytes data)"
    );

    bytes32 public constant override EIP712DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public override DOMAIN_SEPARATOR;
    mapping(address => uint256) private _nonces;

    /****************************************/
    /*             CONSTRUCTOR              */
    /****************************************/

    constructor() {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712DOMAIN_TYPEHASH,
                keccak256(bytes("Forwarder")),
                keccak256(bytes("0.0.1")),
                chainId,
                address(this)
            )
        );
    }

    /****************************************/
    /*               EXTERNAL               */
    /****************************************/

    /**
     * @notice Executes a given request after verifying it.
     * @param req The request to verify and execute.
     * @param sig The signature.
     */
    function execute(ForwardRequest memory req, bytes calldata sig)
        external
        payable
        override
        returns (bool, bytes memory)
    {
        _verifyNonce(req);
        _updateNonce(req);
        _verifySig(req, sig);
        (bool success, bytes memory ret) = _call(req.from, req.to, req.value, req.data);
        if (!success) {
            emit TransactionReverted(_getRevertReason(ret));
            assembly {
                let returnDataSize := returndatasize()
                returndatacopy(0, 0, returnDataSize)
                revert(0, returnDataSize)
            }
        }
        return (success, ret);
    }

    /**
     * @notice Executes a batch of requests after verifying them.
     * @notice It acts as the same as calling `execute` for each request.
     * @param reqs The requests to verify and execute.
     * @param revertOnFail Flag to revert on failure.
     */
    function executeBatch(BatchRequest[] memory reqs, bool revertOnFail) external payable override {
        for (uint256 i = 0; i < reqs.length; i++) {
            _verifyNonce(reqs[i].req);
            _updateNonce(reqs[i].req);
            _verifySig(reqs[i].req, reqs[i].sig);

            (bool success, bytes memory ret) = _call(
                reqs[i].req.from,
                reqs[i].req.to,
                reqs[i].req.value,
                reqs[i].req.data
            );

            if (!success) {
                emit TransactionReverted(_getRevertReason(ret));
            }

            if (revertOnFail) {
                require(success, "FWDR: TX_REVERTED");
            }
        }
    }

    /**
     * @notice Executes a batch of requests from the same sender.
     * @dev It can only be callable bu the forwarder itself via `execute`.
     * E.g We call `execute` with ForwardRequest.data = forwarder.populateTransaction.batch([approvalCall, doSomethingCall]);
     * Can be called as part of a meta transaction (allowing to batch call atomically).
     * @param calls The list of call data, value and destination.
     */
    function batch(Call[] memory calls) external payable override {
        require(msg.sender == address(this), "FWDR: ONLY_FORWARDER");
        bytes memory data = msg.data;
        uint256 length = msg.data.length;
        address signer;

        assembly {
            signer := and(mload(sub(add(data, length), 0x00)), 0xffffffffffffffffffffffffffffffffffffffff)
        }

        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory ret) = _call(signer, calls[i].to, calls[i].value, calls[i].data);

            if (!success) {
                emit TransactionReverted(_getRevertReason(ret));
                assembly {
                    let returnDataSize := returndatasize()
                    returndatacopy(0, 0, returnDataSize)
                    revert(0, returnDataSize)
                }
            }
        }
    }

    /****************************************/
    /*                PUBLIC                */
    /****************************************/

    /**
     * @notice Get the nonce for a given sender.
     * @param from The address of the sender of the request.
     * @return The nonce of the given address.
     */
    function getNonce(address from) public view override returns (uint256) {
        return _nonces[from];
    }

    /**
     * @notice Verifies the signature of a given request.
     * @param req The request to verify.
     * @param sig The signature.
     */
    function verify(ForwardRequest memory req, bytes memory sig) public view override {
        _verifyNonce(req);
        _verifySig(req, sig);
    }

    /****************************************/
    /*               INTERNAL               */
    /****************************************/

    function _call(
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal returns (bool, bytes memory) {
        (bool success, bytes memory ret) = to.call{ value: value }(abi.encodePacked(data, from));
        return (success, ret);
    }

    function _verifyNonce(ForwardRequest memory req) internal view {
        require(_nonces[req.from] == req.nonce, "FWDR: INVALID_NONCE");
    }

    function _updateNonce(ForwardRequest memory req) internal {
        _nonces[req.from]++;
    }

    function _verifySig(ForwardRequest memory req, bytes memory sig) internal view {
        bytes memory dataToHash = _getEncoded(req);
        if (req.from.isContract()) {
            require(
                IERC1271(req.from).isValidSignature(keccak256(dataToHash), sig) == ERC1271_MAGICVALUE,
                "FWDR: SIGNATURE_INVALID"
            );
        } else {
            require(keccak256(dataToHash).recover(sig) == req.from, "FWDR: SIGNATURE_INVALID");
        }
    }

    function _getEncoded(ForwardRequest memory req) internal view returns (bytes memory) {
        return
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(FORWARD_REQUEST_TYPEHASH, req.from, req.to, req.value, req.nonce, keccak256(req.data))
                )
            );
    }

    function _getRevertReason(bytes memory ret) internal pure returns (string memory) {
        if (ret.length < 68) return "Transaction reverted silently";

        assembly {
            ret := add(ret, 0x04)
        }

        return abi.decode(ret, (string));
    }
}
