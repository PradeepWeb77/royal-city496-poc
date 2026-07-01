/**
 * Deploy the Investment contract and export its ABI + address to the frontend.
 *
 *   Local:   npx hardhat node           (in a separate terminal)
 *            npx hardhat run scripts/deploy.js --network localhost
 *   Testnet: npx hardhat run scripts/deploy.js --network sepolia
 *
 * After deploying, this script writes ../src/config/deployment.json so the
 * React app picks up the new address + ABI automatically (no manual copy).
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

// Minimum investment for the POC: 0.01 ETH.
const MIN_INVESTMENT = hre.ethers.parseEther("0.01");

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();

  console.log(`\nDeploying Investment to "${network}"`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(
    `Balance:  ${hre.ethers.formatEther(
      await hre.ethers.provider.getBalance(deployer.address)
    )} ETH`
  );

  const Investment = await hre.ethers.getContractFactory("Investment");
  const investment = await Investment.deploy(MIN_INVESTMENT);
  await investment.waitForDeployment();

  const address = await investment.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();

  console.log(`\n✅ Investment deployed at: ${address}`);
  console.log(`   chainId: ${chainId}`);
  console.log(`   minInvestment: ${hre.ethers.formatEther(MIN_INVESTMENT)} ETH`);

  // Pull the freshly-compiled ABI from the build artifact.
  const artifact = await hre.artifacts.readArtifact("Investment");

  const deployment = {
    network,
    chainId: Number(chainId),
    address,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    minInvestmentWei: MIN_INVESTMENT.toString(),
    abi: artifact.abi,
  };

  // Write into the React app so the frontend is wired automatically.
  const frontendConfigDir = path.resolve(__dirname, "../../src/config");
  fs.mkdirSync(frontendConfigDir, { recursive: true });
  const outPath = path.join(frontendConfigDir, "deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`\n📝 Wrote deployment + ABI to ${outPath}`);

  // Also keep a copy alongside the contract for convenience.
  const localCopy = path.resolve(__dirname, "../deployment.json");
  fs.writeFileSync(localCopy, JSON.stringify(deployment, null, 2));
  console.log(`📝 Wrote a copy to ${localCopy}\n`);

  console.log("Deliverables for submission:");
  console.log(`  • Contract address: ${address}`);
  console.log(`  • ABI: src/config/deployment.json (\"abi\" field)\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
