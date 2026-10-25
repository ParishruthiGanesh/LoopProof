import "@nomicfoundation/hardhat-toolbox-viem";
import type { HardhatUserConfig } from "hardhat/config";

/**
 * Local-development EVM only. No testnet or mainnet keys are committed here;
 * an optional testnet target is documented in README.md and is read from env.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: {
    sources: "./contracts",
    tests: "./test/contracts",
    artifacts: "./artifacts",
    cache: "./cache",
  },
  mocha: { timeout: 60_000 },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
  },
};

export default config;
