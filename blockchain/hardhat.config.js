require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Built-in in-process network used by `npx hardhat test`.
    hardhat: {
      chainId: 31337,
    },
    // Standalone local node started with `npx hardhat node`.
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Public testnet. Requires SEPOLIA_RPC_URL + PRIVATE_KEY in .env.
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
};
