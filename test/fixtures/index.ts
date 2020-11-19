import { ethers } from 'hardhat'
import { ERC20Mock as ERC20 } from 'types/ERC20Mock'
import { Forwarder } from 'types/Forwarder'

async function tokenFixture(forwarderAddress: string): Promise<ERC20> {
  const TokenContract = await ethers.getContractFactory('ERC20Mock')
  const token = (await TokenContract.deploy(forwarderAddress)) as ERC20
  await token.deployed()
  return token
}

async function forwarderFixture(): Promise<Forwarder> {
  const ForwarderContract = await ethers.getContractFactory('Forwarder')
  const forwarder = (await ForwarderContract.deploy()) as Forwarder
  await forwarder.deployed()
  return forwarder
}

export async function fixture(): Promise<{ forwarder: Forwarder; token: ERC20 }> {
  const forwarder = await forwarderFixture()
  const token = await tokenFixture(forwarder.address)
  return { forwarder, token }
}
