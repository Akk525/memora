#!/usr/bin/env node
/**
 * Proof test 3: read_demo
 * Fetches CID, requests key (challenge/sign), decrypts, verifies hash ✅
 * Run: node --env-file=.env scripts/read_demo.mjs <memory_id>
 * Requires PRIVATE_KEY (owner or delegate) in .env.
 */

import { ethers } from "ethers";

const INDEXER = process.env.INDEXER_BASE_URL || "http://localhost:3001";
const KEY_BROKER = process.env.KEY_BROKER_BASE_URL || "http://localhost:3000";
const agentId = process.env.DEMO_AGENT_ID || "my-agent";
let GATEWAY = (process.env.IPFS_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/");
if (!/^https?:\/\//i.test(GATEWAY)) GATEWAY = "https://" + GATEWAY;

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

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY required in .env (owner or delegate wallet)");
  process.exit(1);
}

async function main() {
  const memoryId = await getMemoryId();
  if (!memoryId) {
    console.error("Usage: node scripts/read_demo.mjs <memory_id>");
    console.error("Or set WRITE_DEMO_MEMORY_ID in .env or run after proof:write (writes a memory for my-agent).");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(PRIVATE_KEY);

  const refRes = await fetch(`${INDEXER}/memory/${encodeURIComponent(memoryId)}`);
  if (!refRes.ok) throw new Error("Memory not found: " + (await refRes.text()));
  const ref = await refRes.json();
  const cid = (ref.cid_ciphertext || "").replace(/^ipfs:\/\//, "");
  const expectedHash = ref.payload_hash;

  const ctRes = await fetch(`${GATEWAY}${cid}`);
  if (!ctRes.ok) throw new Error("Failed to fetch IPFS: " + ctRes.status);
  const bundle = await ctRes.json();

  const challengeRes = await fetch(
    `${KEY_BROKER}/challenge?memory_id=${encodeURIComponent(memoryId)}&requester=${encodeURIComponent(wallet.address)}`
  );
  if (!challengeRes.ok) throw new Error("Challenge failed: " + (await challengeRes.text()));
  const { nonce, message } = await challengeRes.json();
  const signature = await wallet.signMessage(message);

  const keyRes = await fetch(`${KEY_BROKER}/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memory_id: memoryId, requester: wallet.address, signature, challenge: nonce }),
  });
  if (!keyRes.ok) {
    const err = await keyRes.json().catch(() => ({}));
    throw new Error(err.error || "Key release denied: " + keyRes.status);
  }
  const { key: keyB64 } = await keyRes.json();

  const key = Buffer.from(keyB64, "base64");
  const { decrypt, hashPayload } = await import("@memora/shared");
  const canonical = decrypt(bundle, key);
  const payloadHash = hashPayload(canonical);
  const expected = expectedHash.startsWith("0x") ? expectedHash.slice(2) : expectedHash;
  if (payloadHash.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Hash mismatch: payload verification failed");
  }

  let payload;
  try {
    payload = JSON.parse(canonical);
  } catch {
    payload = { content: canonical };
  }
  console.log("--- read_demo output ---");
  console.log("Fetched CID, requested key, decrypted, verified hash ✅");
  console.log("Decrypted payload:", JSON.stringify(payload, null, 2));
  console.log("---");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
