# RoyalCity — Investment Smart Contract

Solidity investment contract, deployment/interaction scripts, and the bridge
into the RoyalCity React frontend. Built with **Hardhat** + **ethers** +
**OpenZeppelin**.

## What the contract does

`contracts/Investment.sol` is a secure ETH investment pool:

- **Invest ETH** — `invest()` (payable, enforces a minimum) records the sender
  and accumulates `totalInvested`.
- **Investor records** — per-address struct (`totalInvested`, `pendingReturns`,
  `exists`) plus an enumerable `investorList`.
- **Track total funds** — `totalInvested`, `getContractBalance()`,
  `getInvestorCount()`.
- **Simulate return distribution** — the owner calls `distributeReturns()` with
  ETH; each investor is credited a pro-rata share of their principal. Investors
  withdraw with `claimReturns()` (pull-payment).
- **Capital deployment** — `withdrawCapital()` lets the owner move *raised*
  capital out, but never the ETH owed to investors as returns
  (`availableCapital()` is the enforced cap).

### Security practices
Checks-Effects-Interactions ordering · OpenZeppelin `ReentrancyGuard` on all
ETH-moving functions · pull-over-push withdrawals · `Ownable` admin gating ·
custom errors · always-solvent accounting (`totalPendingReturns` is never
withdrawable by the owner).

## Setup

```bash
cd blockchain
npm install
```

## Test

```bash
npx hardhat test
```

## Deploy + interact (local)

```bash
# Terminal 1 — start a local chain
npx hardhat node

# Terminal 2 — deploy (auto-writes ../src/config/deployment.json with the
# real address + freshly compiled ABI, so the frontend wires up automatically)
npx hardhat run scripts/deploy.js --network localhost

# Exercise every core function end-to-end
npx hardhat run scripts/interact.js --network localhost
```

## Deploy to Sepolia testnet

```bash
cp .env.example .env      # then fill in SEPOLIA_RPC_URL and PRIVATE_KEY
npx hardhat run scripts/deploy.js --network sepolia
```

## Connecting the frontend

The React app reads `src/config/deployment.json` (address + ABI). The deploy
script regenerates that file, so after deploying you only need to:

1. Import the Hardhat local network into MetaMask (RPC `http://127.0.0.1:8545`,
   chain ID `31337`) and import a test private key printed by `hardhat node`.
2. From the repo root, run the frontend: `npm install && npm run dev`
   (serves on http://localhost:8000).
3. Open a property detail page, connect your wallet, and invest.

## Deliverables for the assessment

- **Contract address** — printed by `deploy.js` and saved in
  `src/config/deployment.json` (`address`).
- **ABI** — the `abi` field of `src/config/deployment.json`
  (also in `artifacts/contracts/Investment.sol/Investment.json` after compile).
