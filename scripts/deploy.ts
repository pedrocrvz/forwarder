import { ethers } from 'hardhat'
import { Forwarder } from 'types/Forwarder'
import { ERC20Mock as Token } from 'types/ERC20Mock'

async function main() {
  const signers = await ethers.getSigners()
  console.log('Deploying Contracts from account: ', await signers[0].getAddress())
  console.log('Account balance: ', (await signers[0].getBalance()).toString())
  console.log('\n')

  console.log('Deploying Trusted Forwarder...')
  const TrustedForwarder = await ethers.getContractFactory('Forwarder')
  const forwarder: Forwarder = (await TrustedForwarder.deploy()) as Forwarder
  await forwarder.deployed()

  console.log('Deploying Mock Token...\n')
  const MockToken = await ethers.getContractFactory('ERC20Mock')
  const token: Token = (await MockToken.deploy(forwarder.address)) as Token
  await token.deployed()

  console.log('Deployed Trusted Forwarder to address: ', forwarder.address)
  console.log('Deployed Mock Token to address: ', token.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
