import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying MemoraRegistry with account:", deployer.address);

  const MemoraRegistry = await ethers.getContractFactory("MemoraRegistry");
  const registry = await MemoraRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log("MemoraRegistry deployed to:", address);
  console.log("Export: MEMORA_REGISTRY_CONTRACT_ID=" + address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
