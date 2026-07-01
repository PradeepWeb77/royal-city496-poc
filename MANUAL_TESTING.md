# Manual Testing Guide — RoyalCity Investment dApp

Follow these in order. You need two terminals plus a browser with MetaMask.

---

## Tech stack — what we used

This submission takes the **Ethereum / Solidity** path. The four Solana options
in the brief (Anchor, Solana CLI, @solana/web3.js) were not used — only one
option was required.

| Layer | Choice |
|---|---|
| Smart contract language | **Solidity** (`Investment.sol`, OpenZeppelin `Ownable` + `ReentrancyGuard`) |
| Development framework | **Hardhat** |
| Deployment & interaction library | **ethers.js** |
| Frontend wallet + contract calls | **ethers.js v5** (matches `ethers@^5.6.9` in `package.json`) |
| Wallet | **MetaMask** (injected provider) |

### How this maps to the assessment requirements

1. **Smart Contract Development** — `blockchain/contracts/Investment.sol`:
   invest ETH, record/manage investors, track total invested, simulate
   pro-rata return distribution. Security: Checks-Effects-Interactions,
   `ReentrancyGuard`, `Ownable`, pull-payment withdrawals, custom errors.
2. **Deployment & Interaction Scripts — uses `ethers.js`** (option 2 of the
   brief), run through Hardhat:
   - `blockchain/scripts/deploy.js` — deploys the contract and exports the
     ABI + address (via `hre.ethers`).
   - `blockchain/scripts/interact.js` — executes the core functions (invest,
     read totals, distribute returns, claim, withdraw capital) via
     `ethers.Contract` / `ethers.parseEther`.
3. **Frontend Integration** — wallet connection + contract execution in the
   React app, also using **ethers.js** (`src/context/Web3Context.jsx`,
   `src/hooks/useInvestment.js`, `src/components/web3/`).

> Note: **Hardhat** is the development framework; **ethers.js** is the library
> that actually performs the deployment and the contract calls. They are used
> together, not as alternatives.

---

## Prerequisites
- Node 20 or 22 (Hardhat warns on Node 18; the frontend README also wants 22+).
- MetaMask installed in your browser.

---

## Step 1 — Run the contract test suite (automated)

```bash
cd blockchain
npm install          # first time only
npx hardhat test
```

**Expected:** `14 passing`. This proves invest, pro-rata distribution, access
control, claim, and the capital-solvency rules all work.

---

## Step 2 — Start a local blockchain  (Terminal 1)

```bash
cd blockchain
npx hardhat node
```

Leave it running. It prints 20 funded test accounts with **private keys** —
keep this window visible, you'll copy keys from here. Account #0 is the
contract **owner/deployer**.

---

## Step 3 — Deploy the contract  (Terminal 2)

```bash
cd blockchain
npx hardhat run scripts/deploy.js --network localhost
```

**Expected output** includes:
- `✅ Investment deployed at: 0x...`  ← this is your deliverable address
- `📝 Wrote deployment + ABI to .../src/config/deployment.json`

The frontend is now auto-wired to this address.

**Optional quick check** that core functions work without the UI:

```bash
npx hardhat run scripts/interact.js --network localhost
```

It invests from two accounts, distributes returns, claims, and withdraws —
printing expected vs. actual values.

---

## Step 4 — Configure MetaMask

### 4a. Add the local Hardhat network

1. Click the **MetaMask icon** in your browser toolbar to open the extension.
2. Click the **network selector** at the **top-left** (it usually says
   "Ethereum Mainnet").
3. In the panel that opens, click **+ Add a custom network**
   (older versions: **Add network** → then **Add a network manually** at the
   bottom of the list).
4. Fill in the form exactly:
   - **Network name:** `Hardhat Local`
   - **Default RPC URL / New RPC URL:** `http://127.0.0.1:8545`
     - If it asks for an RPC *name*, type anything (e.g. `localhost`) — the URL
       is the part that matters.
   - **Chain ID:** `31337`
   - **Currency symbol:** `ETH`
   - **Block explorer URL:** leave blank
5. Click **Save**. MetaMask switches to "Hardhat Local" automatically (if not,
   open the network selector again and pick it).

> If you see a "could not fetch chain ID" error, make sure `npx hardhat node`
> (Step 2) is still running in Terminal 1 — MetaMask needs it live to connect.

### 4b. Import a test account

First, get a key: look at the **Terminal 1** window running `npx hardhat node`.
Near the top it lists 20 accounts, each like:

```
Account #0: 0xf39F...2266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Copy the **`Private Key`** line (the long `0x…` string), then in MetaMask:

1. Open MetaMask and click the **account name at the top-center** (this opens
   the account list).
2. At the bottom of that list, click **+ Add account or hardware wallet**
   (some versions just say **Add account**).
3. In the menu that appears, click the **Import account** option. Depending on
   your MetaMask version it may be labeled:
   - **Import account**, or
   - **Private key**, or
   - **Import a wallet or account** → then choose **Private key**.
4. Paste the private key into the box (make sure the type is **Private Key**,
   not "JSON file") and click **Import**.
5. The imported account appears in your list. Repeat for a second key if you
   want a second investor.
   - Import **Account #0** if you want to also test owner actions (distribute).
   - Import a second account (#1) to test as a plain investor.

> If you don't see an "Import account" option at all, your MetaMask may be
> locked or you may be on the wrong screen — click the account name at the very
> top-center first; the import option lives inside that account list, not in
> Settings.

> These keys are well-known local test keys with no real value — never paste a
> private key that controls real funds.

---

## Step 5 — Run the frontend  (Terminal 3, from repo root)

```bash
npm install          # first time only
npm run dev
```

Opens http://localhost:8000.

---

## Step 6 — Test the wallet + invest flow in the browser

1. **Connect:** click **Connect Wallet** (top-right navbar). Approve in
   MetaMask. The button should now show your address (e.g. `0x12ab…cd34`).
2. **Go to a property:** open `/properties` → click any property → you're on
   the Property Detail page. The right-hand card now shows the live
   **InvestPanel** (Total Invested + Investors count read from the contract).
3. **Wrong-network check:** switch MetaMask to Ethereum Mainnet — the panel
   should show **"Switch to Hardhat Local to invest"**. Switch back.
4. **Invest:** enter an amount ≥ `0.01` ETH → click **Invest Now** → confirm
   in MetaMask. Watch the status box: *Sending → Confirming → Success!*
5. **Verify it took:** Total Invested and Investors count update, and a
   **"My investment"** row appears with your amount.
6. **Below-minimum check:** try `0.001` ETH → the tx should revert
   (`BelowMinimumInvestment`) and the status box shows an error.

---

## Step 7 — Test the returns flow (owner action)

The "Invest" and "Claim" buttons are for investors; **distributing returns is
an owner-only action** not exposed in the UI by design. Trigger it from a
console using the owner account (Account #0):

```bash
cd blockchain
npx hardhat console --network localhost
```

```js
const dep = require("./deployment.json");
const c = await ethers.getContractAt("Investment", dep.address);
// Send 1 ETH of simulated returns, credited pro-rata to all investors:
await (await c.distributeReturns({ value: ethers.parseEther("1") })).wait();
.exit
```

Then back in the browser, refresh the property page (or re-open it):
**Claimable returns** should now show a non-zero amount, and a **Claim Returns**
button appears. Click it → confirm in MetaMask → balance increases, claimable
resets to 0.

---

## What to verify — checklist

- [ ] `npx hardhat test` → 14 passing
- [ ] Deploy prints an address and writes `src/config/deployment.json`
- [ ] Navbar "Connect Wallet" connects and shows the shortened address
- [ ] Wrong-network state appears off-chain and offers a switch
- [ ] Investing ≥ 0.01 ETH succeeds; Total Invested + Investors update
- [ ] Investing < 0.01 ETH is rejected with a clear error
- [ ] "My investment" reflects your contribution
- [ ] After owner `distributeReturns`, claimable returns show pro-rata
- [ ] Claim Returns pays out and resets claimable to 0
- [ ] Transaction status box shows pending/success/error correctly

---

## Deliverables to collect for submission

1. **Contract address** — from the Step 3 deploy output (also in
   `src/config/deployment.json` → `address`).
2. **ABI** — `src/config/deployment.json` → `abi` field (or
   `blockchain/artifacts/contracts/Investment.sol/Investment.json`).
3. **Loom video** — screen-record Steps 5–7: connect wallet, invest, show the
   on-chain numbers update, distribute + claim returns. Narrate the security
   choices (ReentrancyGuard, Ownable, pull-payments, solvent accounting).

---

## Troubleshooting

- **"Smart contract not deployed yet" banner** → run Step 3; it regenerates
  `deployment.json`.
- **Nonce / "tx expected" errors after restarting `hardhat node`** → in
  MetaMask: Settings → Advanced → *Clear activity tab data* (the chain reset).
- **Buffer/`global` errors in the browser console** → Vite needs a polyfill;
  add `vite-plugin-node-polyfills` or `define: { global: 'globalThis' }` in
  `vite.config.js` (do **not** use the dead `config-overrides.js`).
- **Node 18 Hardhat warning** → harmless, but Node 20/22 removes it.
