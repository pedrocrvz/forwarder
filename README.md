# Simple Trusted Forwarder

A Trusted Forwarder contract that is able to relay verified/signed transactions on behalf of users to contracts that trust it. For a contract recipient to be compatible it must implement `RelayRecipient` and use `_msgSender()` instead of `msg.sender`.

Uses `EIP-712` and supports `ERC1271`.

Multiple transactions from different/same signer can be batched in a single call. Using `executeBatch` a flag can be passed to revert all on a single revert or continue executing other calls.

## Getting Started

### Install dependencies:

```
npm i
```

### Run tests

```
npm run test-contracts
```

## Ropsten

```
Deployed Trusted Forwarder to address:  0x7F0936Be36D1961D68b3334eC751Ad8F934f1739
Deployed Mock Token to address:  0xbC7Ab6F930D83CB7e80A207d4dD3DD80aA8a2153
```
