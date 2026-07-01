/**
 * Exercise the deployed Investment contract end-to-end against a local node.
 *
 *   npx hardhat node                                  (separate terminal)
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/interact.js --network localhost
 *
 * Demonstrates: invest (two accounts) -> read totals -> distribute returns ->
 * claim returns -> owner withdraws capital.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function loadDeployment() {
  const p = path.resolve(__dirname, "../deployment.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      "deployment.json not found. Run scripts/deploy.js first."
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const eth = (v) => hre.ethers.formatEther(v);

async function main() {
  const { address, abi } = loadDeployment();
  const signers = await hre.ethers.getSigners();
  const [owner, alice, bob, treasury] = signers;

  const contract = new hre.ethers.Contract(address, abi, owner);
  console.log(`Investment @ ${address}\n`);

  // 1. Two investors invest.
  console.log("→ Alice invests 1 ETH");
  await (await contract.connect(alice).invest({ value: hre.ethers.parseEther("1") })).wait();
  console.log("→ Bob invests 3 ETH");
  await (await contract.connect(bob).invest({ value: hre.ethers.parseEther("3") })).wait();

  // 2. Read state.
  console.log(`\nTotal invested:  ${eth(await contract.totalInvested())} ETH`);
  console.log(`Investor count:  ${await contract.getInvestorCount()}`);
  console.log(`Contract balance: ${eth(await contract.getContractBalance())} ETH`);

  // 3. Owner distributes 2 ETH of simulated returns.
  console.log("\n→ Owner distributes 2 ETH of returns");
  await (await contract.connect(owner).distributeReturns({ value: hre.ethers.parseEther("2") })).wait();

  const [, alicePending] = await contract.getInvestor(alice.address);
  const [, bobPending] = await contract.getInvestor(bob.address);
  console.log(`   Alice pending returns: ${eth(alicePending)} ETH (expected 0.5)`);
  console.log(`   Bob   pending returns: ${eth(bobPending)} ETH (expected 1.5)`);

  // 4. Alice claims.
  console.log("\n→ Alice claims her returns");
  await (await contract.connect(alice).claimReturns()).wait();
  const [, alicePendingAfter] = await contract.getInvestor(alice.address);
  console.log(`   Alice pending after claim: ${eth(alicePendingAfter)} ETH`);

  // 5. Owner withdraws available capital to a treasury.
  const available = await contract.availableCapital();
  console.log(`\n→ Owner withdraws available capital (${eth(available)} ETH) to treasury`);
  await (await contract.connect(owner).withdrawCapital(treasury.address, available)).wait();
  console.log(`   Contract balance now: ${eth(await contract.getContractBalance())} ETH`);
  console.log(`   (still covers Bob's ${eth(await contract.totalPendingReturns())} ETH owed)\n`);

  console.log("✅ Interaction flow complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
