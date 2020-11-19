require('dotenv').config()
import { ethers } from 'hardhat'
import { Signer, Wallet, BigNumber } from 'ethers'
import { expect } from 'chai'
import { fixture } from './fixtures'
import { createFixtureLoader } from 'ethereum-waffle'
import { Forwarder, ERC20Mock } from 'types'
import { TypedDataUtils, signTypedData_v4 } from 'eth-sig-util'

// First account buidler created
const privateKey = process.env.PRIVATE_KEY_BUIDLER_ACCOUNT_1 as string

const EIP712DomainType = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]

const ForwardRequestType = [
  { name: 'from', type: 'address' },
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'data', type: 'bytes' },
]
export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18))
}

export const signTypedData = (typedData: any, privateKey: any): string => {
  return signTypedData_v4(Buffer.from(privateKey.slice(2), 'hex'), {
    data: typedData,
  })
}

describe('Forwarder', function () {
  let token: ERC20Mock
  let txSigner: Wallet
  let relayerAccount: Signer
  let receiverAccount: Signer
  let forwarder: Forwarder
  let chainId: number
  let typedData: any
  let forwardRequest: any

  const forwarderVersion = '0.0.1'

  beforeEach(async function () {
    const signers = await ethers.getSigners()
    txSigner = new Wallet(privateKey)

    const loadFixture = createFixtureLoader()

    relayerAccount = signers[1]
    receiverAccount = signers[2]
    chainId = await relayerAccount.getChainId()

    const contracts = await loadFixture(fixture)
    forwarder = contracts.forwarder.connect(relayerAccount)
    token = contracts.token

    await token.mint(txSigner.address, expandTo18Decimals(100))
  })

  it('Should have the correct ForwardRequest type', async () => {
    const types = {
      EIP712Domain: EIP712DomainType,
      ForwardRequest: ForwardRequestType,
    }
    const calcType = TypedDataUtils.encodeType('ForwardRequest', types)
    expect(calcType).to.equal('ForwardRequest(address from,address to,uint256 value,uint256 nonce,bytes data)')
  })

  it('Should have minted tokens', async () => {
    const balance1 = await token.balanceOf(txSigner.address)
    expect(balance1).to.equal(expandTo18Decimals(100))
  })

  describe('EOA', function () {
    beforeEach(async function () {
      // construct message
      const call = await token.populateTransaction.transfer(await receiverAccount.getAddress(), expandTo18Decimals(1))

      forwardRequest = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: await (await forwarder.getNonce(await txSigner.getAddress())).toString(),
        data: call.data as string,
      }

      typedData = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest,
      }
    })

    it('Should verify correctly a signature', async () => {
      const sig = signTypedData(typedData, txSigner.privateKey)
      await expect(forwarder.verify(forwardRequest, sig)).to.not.be.reverted
    })

    it('Should forward a call and correctly execute it', async () => {
      const sig = signTypedData(typedData, txSigner.privateKey)
      await expect(forwarder.execute(forwardRequest, sig)).to.emit(token, 'Transfer')
    })

    it('Should fail when domain separator is wrong', async () => {
      const wrongTypedData = {
        domain: {
          name: 'Wrong',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest,
      }

      const sig = signTypedData(wrongTypedData, txSigner.privateKey)
      await expect(forwarder.execute(forwardRequest, sig)).to.be.revertedWith('FWDR: SIGNATURE_INVALID')
    })

    it('Should fail to forward a call when the message is not properly signed (req.from != signature)', async () => {
      const sig = signTypedData(typedData, '0x' + '1'.repeat(64))
      await expect(forwarder.execute(forwardRequest, sig)).to.be.revertedWith('FWDR: SIGNATURE_INVALID')
    })

    it('Should fail when the nonce is incorrect', async () => {
      const call = await token.populateTransaction.transfer(await receiverAccount.getAddress(), expandTo18Decimals(1))

      const forwardRequestBadNonce = {
        from: await txSigner.getAddress(),
        to: txSigner.address,
        value: '0',
        nonce: '11',
        data: call.data as string,
      }

      const typedDataBadNonce = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequestBadNonce,
      }

      const sig = signTypedData(typedDataBadNonce, txSigner.privateKey)
      await expect(forwarder.execute(forwardRequestBadNonce, sig)).to.be.revertedWith('FWDR: INVALID_NONCE')
    })

    it('Should forward a call, correctly execute it and revert', async () => {
      const nonOwnerWallet = Wallet.createRandom()
      const call = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1000),
      )

      const forwardRequestNonOwner = {
        from: nonOwnerWallet.address,
        to: token.address,
        value: '0',
        nonce: await (await forwarder.getNonce(nonOwnerWallet.address)).toString(),
        data: call.data as string,
      }

      const typedDataNonOwner = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequestNonOwner,
      }

      const sig = signTypedData(typedDataNonOwner, nonOwnerWallet.privateKey)

      await expect(forwarder.execute(forwardRequestNonOwner, sig)).to.be.revertedWith(
        'ERC20: transfer amount exceeds balance',
      )
    })

    it('Should batch transactions from same sender, execute and revert due a bad call', async () => {
      const transfersBad = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1000),
      )
      transfersBad.value = BigNumber.from(0)

      const transfersBad2 = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(2),
      )
      transfersBad2.value = BigNumber.from(0)

      const call = await forwarder.populateTransaction.batch([transfersBad as any, transfersBad2 as any])

      const forwardRequestBatch = {
        from: await txSigner.getAddress(),
        to: forwarder.address,
        value: '0',
        nonce: await (await forwarder.getNonce(await txSigner.getAddress())).toString(),
        data: call.data as string,
      }

      const typedDataBatch = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequestBatch,
      }

      const sig = signTypedData(typedDataBatch, txSigner.privateKey)

      await expect(forwarder.execute(forwardRequestBatch, sig)).to.be.revertedWith(
        'ERC20: transfer amount exceeds balance',
      )
    })

    it('Should batch transactions from same sender and execute', async () => {
      const transferGood = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1),
      )
      transferGood.value = BigNumber.from(0)

      const transferGood2 = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(2),
      )
      transferGood2.value = BigNumber.from(0)

      const call = await forwarder.populateTransaction.batch([transferGood as any, transferGood2 as any])

      const forwardRequestBatch = {
        from: await txSigner.getAddress(),
        to: forwarder.address,
        value: '0',
        nonce: await (await forwarder.getNonce(await txSigner.getAddress())).toString(),
        data: call.data as string,
      }

      const typedDataBatch = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequestBatch,
      }

      const sig = signTypedData(typedDataBatch, txSigner.privateKey)

      await expect(forwarder.execute(forwardRequestBatch, sig))
        .to.emit(token, 'Transfer')
        .withArgs(await txSigner.getAddress(), await receiverAccount.getAddress(), expandTo18Decimals(1))
        .to.emit(token, 'Transfer')
        .withArgs(await txSigner.getAddress(), await receiverAccount.getAddress(), expandTo18Decimals(2))

      const balance = await token.balanceOf(await receiverAccount.getAddress())
      expect(balance).to.eq(expandTo18Decimals(3))
    })

    it('Should batch several requests/txs in independent calls (diff reqs) and execute', async () => {
      const nonce = await forwarder.getNonce(await txSigner.getAddress())
      const transfer = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1),
      )

      const forwardRequest1 = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: nonce.toString(),
        data: transfer.data as string,
      }

      const typedData1 = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest1,
      }

      const sig1 = signTypedData(typedData1, txSigner.privateKey)

      const transfer2 = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1),
      )

      const forwardRequest2 = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: nonce.add(BigNumber.from(1)).toString(),
        data: transfer2.data as string,
      }

      const typedData2 = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest2,
      }

      const sig2 = signTypedData(typedData2, txSigner.privateKey)

      const firstRequest = {
        req: forwardRequest1,
        sig: sig1,
      }

      const secondRequest = {
        req: forwardRequest2,
        sig: sig2,
      }

      await expect(forwarder.executeBatch([firstRequest, secondRequest], true))
        .to.emit(token, 'Transfer')
        .withArgs(await txSigner.getAddress(), await receiverAccount.getAddress(), expandTo18Decimals(1))
        .to.emit(token, 'Transfer')
        .withArgs(await txSigner.getAddress(), await receiverAccount.getAddress(), expandTo18Decimals(1))

      const balance = await token.balanceOf(await receiverAccount.getAddress())
      expect(balance).to.eq(expandTo18Decimals(2))
    })

    it('Should batch several requests/txs in independent calls (diff reqs) and execute even if one tx reverts', async () => {
      const nonce = await forwarder.getNonce(await txSigner.getAddress())

      // BAD AMOUNT; IT SHOULD FAIL
      const badTransfer = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(10000),
      )

      const forwardRequest1 = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: nonce.toString(),
        data: badTransfer.data as string,
      }

      const typedData1 = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest1,
      }

      const sig1 = signTypedData(typedData1, txSigner.privateKey)

      const goodTransfer = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1),
      )

      const forwardRequest2 = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: nonce.add(BigNumber.from(1)).toString(),
        data: goodTransfer.data as string,
      }

      const typedData2 = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest2,
      }

      const sig2 = signTypedData(typedData2, txSigner.privateKey)

      const firstRequest = {
        req: forwardRequest1,
        sig: sig1,
      }

      const secondRequest = {
        req: forwardRequest2,
        sig: sig2,
      }

      // We want to execute first the failing tx
      // to make sure the second still executes
      // as we are passing "revertOnFail" = false
      await expect(forwarder.executeBatch([firstRequest, secondRequest], false))
        .to.emit(forwarder, 'TransactionReverted')
        .withArgs('ERC20: transfer amount exceeds balance')
        .to.emit(token, 'Transfer')
        .withArgs(await txSigner.getAddress(), await receiverAccount.getAddress(), expandTo18Decimals(1))

      const balance = await token.balanceOf(await receiverAccount.getAddress())
      expect(balance).to.eq(expandTo18Decimals(1))
    })

    it('Should batch several requests/txs in independent calls (diff reqs) and revert if one fails', async () => {
      const nonce = await forwarder.getNonce(await txSigner.getAddress())

      // BAD AMOUNT; IT SHOULD FAIL
      const badTransfer = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(10000),
      )

      const forwardRequest1 = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: nonce.toString(),
        data: badTransfer.data as string,
      }

      const typedData1 = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest1,
      }

      const sig1 = signTypedData(typedData1, txSigner.privateKey)

      const goodTransfer = await token.populateTransaction.transfer(
        await receiverAccount.getAddress(),
        expandTo18Decimals(1),
      )

      const forwardRequest2 = {
        from: await txSigner.getAddress(),
        to: token.address,
        value: '0',
        nonce: nonce.add(BigNumber.from(1)).toString(),
        data: goodTransfer.data as string,
      }

      const typedData2 = {
        domain: {
          name: 'Forwarder',
          version: forwarderVersion,
          chainId: chainId,
          verifyingContract: forwarder.address,
        },
        primaryType: 'ForwardRequest' as any,
        types: {
          EIP712Domain: EIP712DomainType,
          ForwardRequest: ForwardRequestType,
        },
        message: forwardRequest2,
      }

      const sig2 = signTypedData(typedData2, txSigner.privateKey)

      const firstRequest = {
        req: forwardRequest1,
        sig: sig1,
      }

      const secondRequest = {
        req: forwardRequest2,
        sig: sig2,
      }

      // It should revert on fail
      await expect(forwarder.executeBatch([firstRequest, secondRequest], true)).to.be.revertedWith('FWDR: TX_REVERTED')

      // No effects
      const balance = await token.balanceOf(await receiverAccount.getAddress())
      expect(balance).to.eq(BigNumber.from(0))
    })

    it('Should fail if ether is sent directly to forwarder contract', async () => {
      await expect(
        relayerAccount.sendTransaction({
          to: forwarder.address,
          value: ethers.utils.parseUnits('0.1', 'ether').toHexString(),
        }),
      ).to.be.reverted
    })
  })
})
