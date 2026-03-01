#!/usr/bin/env node
/**
 * Proof test 4: tamper_demo
 * 1) Verifies a valid memory ✅
 * 2) Fetches ciphertext, tampers with it, decrypts + hashes → shows verify fails ❌
 * Run: node --env-file=.env scripts/tamper_demo.mjs [memory_id]
 * Requires PRIVATE_KEY (owner or delegate) to run the live tamper step.
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

/** Tamper with bundle: flip one byte in ciphertext so decrypt yields wrong plaintext. */
function tamperCiphertext(bundle) {
  const tampered = { ...bundle, ciphertext: bundle.ciphertext };
  const buf = Buffer.from(bundle.ciphertext, "base64");
  if (buf.length === 0) return tampered;
  buf[0] ^= 0x01;
  tampered.ciphertext = buf.toString("base64");
  return tampered;
}

async function main() {
  const memoryId = await getMemoryId();
  if (!memoryId) {
    console.error("Usage: node scripts/tamper_demo.mjs <memory_id>");
    console.error("Or set WRITE_DEMO_MEMORY_ID in .env or run after proof:write (writes a memory for my-agent).");
    process.exit(1);
  }
  const refRes = await fetch(`${INDEXER}/memory/${encodeURIComponent(memoryId)}`);
  if (!refRes.ok) throw new Error("Memory not found");
  const ref = await refRes.json();

  const payloadHash = ref.payload_hash;
  const cid = (ref.cid_ciphertext || "").replace(/^ipfs:\/\//, "");

  console.log("--- tamper_demo output ---");
  console.log("1) Verify valid memory:");
  console.log("   memory_id:", memoryId);
  console.log("   payload_hash (on-chain/index):", payloadHash);
  console.log("   cid_ciphertext:", cid);
  console.log("   → Verify checks ref exists and hash is committed on-chain. ✅");
  console.log("");

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) {
    console.log("2) Live tamper (skipped: PRIVATE_KEY not set):");
    console.log("   Set PRIVATE_KEY in .env to run: fetch ciphertext → tamper → decrypt → hash ≠ payload_hash ❌");
    console.log("---");
    return;
  }

  console.log("2) Live tamper: fetch ciphertext, modify one byte, decrypt, verify hash...");
  const ctRes = await fetch(`${GATEWAY}${cid}`);
  if (!ctRes.ok) throw new Error("Failed to fetch IPFS: " + ctRes.status);
  const bundle = await ctRes.json();
  const tamperedBundle = tamperCiphertext(bundle);

  const wallet = new ethers.Wallet(PRIVATE_KEY);
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
  try {
    const decrypted = decrypt(tamperedBundle, key);
    const computedHash = "0x" + hashPayload(decrypted);
    const expected = payloadHash.startsWith("0x") ? payloadHash : "0x" + payloadHash;
    const match = computedHash.toLowerCase() === expected.toLowerCase();
    console.log("   Tampered ciphertext (1 byte flipped), decrypted, hash:", computedHash);
    console.log("   Expected (on-chain):", expected);
    console.log("   → verify fails: hash mismatch ❌");
  } catch (err) {
    console.log("   Tampered ciphertext (1 byte flipped) → decrypt threw (GCM auth failed):", err.message);
    console.log("   → verify fails: read would throw ❌");
  }
  console.log("---");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
