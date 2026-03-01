#!/usr/bin/env node
/**
 * Proof test 5: delegate_demo
 * Add delegate → delegate can decrypt ✅
 * Revoke delegate → delegate gets 403 ❌
 * Run: node --env-file=.env scripts/delegate_demo.mjs <memory_id> <agent_id>
 * Requires: HEDERA_OPERATOR_KEY (owner), DELEGATE_PRIVATE_KEY, MEMORA_REGISTRY_CONTRACT_ID, HEDERA_EVM_RPC_URL
 */

import { ethers } from "ethers";

const INDEXER = process.env.INDEXER_BASE_URL || "http://localhost:3001";
const KEY_BROKER = process.env.KEY_BROKER_BASE_URL || "http://localhost:3000";
const RPC = process.env.HEDERA_EVM_RPC_URL || "https://testnet.hashio.io/api";
const REGISTRY = process.env.MEMORA_REGISTRY_CONTRACT_ID;
const OWNER_KEY = process.env.HEDERA_OPERATOR_KEY;
const DELEGATE_KEY = process.env.DELEGATE_PRIVATE_KEY;

const agentId = process.argv[3] || process.env.DEMO_AGENT_ID || "my-agent";

async function getMemoryId() {
  const arg = process.argv[2];
  if (arg) return arg;
  if (process.env.WRITE_DEMO_MEMORY_ID) return process.env.WRITE_DEMO_MEMORY_ID;
  const res = await fetch(
    `${INDEXER}/memories?agent_id=${encodeURIComponent(agentId)}&limit=1&order_by=hcs_sequence`
  );
  if (!res.ok) return null;
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.memories || data.items || [];
  return list[0]?.memory_id || null;
}

const REGISTRY_ABI = [
  "function setDelegate(bytes32 agentId, address delegateAddr, bool enabled)",
  "function ownerOfAgent(bytes32 agentId) view returns (address)",
  "function isDelegate(bytes32 agentId, address addr) view returns (bool)",
];

async function requestKeyAsDelegate(memoryId, wallet) {
  const challengeRes = await fetch(
    `${KEY_BROKER}/challenge?memory_id=${encodeURIComponent(memoryId)}&requester=${encodeURIComponent(wallet.address)}`
  );
  if (!challengeRes.ok) return { ok: false, status: challengeRes.status, error: await challengeRes.text() };
  const { nonce, message } = await challengeRes.json();
  const signature = await wallet.signMessage(message);
  const keyRes = await fetch(`${KEY_BROKER}/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memory_id: memoryId,
      requester: wallet.address,
      signature,
      challenge: nonce,
    }),
  });
  if (!keyRes.ok) {
    const err = await keyRes.json().catch(() => ({ error: keyRes.statusText }));
    return { ok: false, status: keyRes.status, error: err.error || keyRes.statusText };
  }
  return { ok: true };
}

async function main() {
  const missing = [];
  if (!REGISTRY) missing.push("MEMORA_REGISTRY_CONTRACT_ID");
  if (!OWNER_KEY) missing.push("HEDERA_OPERATOR_KEY (owner)");
  if (!DELEGATE_KEY) missing.push("DELEGATE_PRIVATE_KEY");
  if (missing.length) {
    console.error("proof:delegate requires in .env:", missing.join(", "));
    console.error("DELEGATE_PRIVATE_KEY = a second EVM wallet (e.g. 0x... from MetaMask or a new burner).");
    process.exit(1);
  }
  const memoryId = await getMemoryId();
  if (!memoryId) {
    console.error("Usage: node scripts/delegate_demo.mjs <memory_id> [agent_id]");
    console.error("Or set WRITE_DEMO_MEMORY_ID in .env or run after proof:write (writes a memory for my-agent).");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const owner = new ethers.Wallet(OWNER_KEY, provider);
  const delegate = new ethers.Wallet(DELEGATE_KEY, provider);
  const agentIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(agentId));
  const registry = new ethers.Contract(REGISTRY, REGISTRY_ABI, owner);

  console.log("--- delegate_demo output ---");
  console.log("Agent:", agentId, "| Owner:", owner.address, "| Delegate:", delegate.address);
  console.log("");

  // 1) Add delegate
  console.log("1) Add delegate (owner calls setDelegate(agentId, delegate, true))...");
  const tx1 = await registry.setDelegate(agentIdBytes32, delegate.address, true);
  await tx1.wait();
  console.log("   Tx:", tx1.hash);
  console.log("");

  // 2) Delegate requests key → expect success
  console.log("2) Delegate requests key (read flow)...");
  const result1 = await requestKeyAsDelegate(memoryId, delegate);
  if (result1.ok) {
    console.log("   ✅ Delegate can decrypt (key released)");
  } else {
    console.log("   ❌ Unexpected:", result1.status, result1.error);
    process.exit(1);
  }
  console.log("");

  // 3) Revoke delegate
  console.log("3) Revoke delegate (owner calls setDelegate(agentId, delegate, false))...");
  const tx2 = await registry.setDelegate(agentIdBytes32, delegate.address, false);
  await tx2.wait();
  console.log("   Tx:", tx2.hash);
  console.log("");

  // 4) Delegate requests key again → expect 403
  console.log("4) Delegate requests key again...");
  const result2 = await requestKeyAsDelegate(memoryId, delegate);
  if (!result2.ok && result2.status === 403) {
    console.log("   ❌ Delegate gets 403 (key release denied) ✅ expected");
  } else {
    console.log("   Unexpected: status", result2.status, result2.error || "");
    process.exit(1);
  }
  console.log("---");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
