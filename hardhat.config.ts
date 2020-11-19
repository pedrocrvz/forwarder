// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config()
import { HardhatUserConfig } from 'hardhat/config'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-typechain'
import 'hardhat-gas-reporter'
import 'hardhat-typechain'

const privateKeyForwarder = process.env.PRIVATE_KEY_BUIDLER_ACCOUNT_1 as string

const infuraKey = process.env.INFURA_API_KEY

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  // This is a sample solc configuration that specifies which version of solc to use
  solidity: {
    version: '0.7.2',
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
    },
  },
  networks: {
    ropsten: {
      url: `https://ropsten.infura.io/v3/${infuraKey}`,
      accounts: [privateKeyForwarder],
      gasPrice: 80000000000,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === 'yes' ? true : false,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    showTimeSpent: true,
    currency: 'EUR',
  },
  typechain: {
    outDir: 'types',
    target: 'ethers-v5',
  },
}

export default config
