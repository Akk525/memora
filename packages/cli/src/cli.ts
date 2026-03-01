#!/usr/bin/env node
/**
 * Memora CLI: write, query, read, verify, tamper-test.
 * Env: INDEXER_BASE_URL, KEY_BROKER_BASE_URL, and for read/verify a wallet (PRIVATE_KEY or signer).
 */

import path from "path";
import { config as loadEnv } from "dotenv";

// Load repo root .env when run via pnpm from package dir (cwd = packages/cli)
loadEnv({ path: path.resolve(process.cwd(), "../../.env") });

import { MemoraClient } from "memora-core";
import { ethers } from "ethers";

const INDEXER_BASE_URL = process.env.INDEXER_BASE_URL || "http://localhost:3001";
const KEY_BROKER_BASE_URL = process.env.KEY_BROKER_BASE_URL || "http://localhost:3000";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const client = new MemoraClient({
  indexerBaseUrl: INDEXER_BASE_URL,
  keyBrokerBaseUrl: KEY_BROKER_BASE_URL,
  ipfsGatewayUrl: process.env.IPFS_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/",
});

async function cmdWrite(agentId: string, filePath: string) {
  const fs = await import("fs");
  const path = await import("path");
  let fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath) && !path.isAbsolute(filePath) && !filePath.startsWith("..")) {
    const repoRoot = path.resolve(process.cwd(), "../..");
    const alt = path.resolve(repoRoot, filePath);
    if (fs.existsSync(alt)) fullPath = alt;
  }
  const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const receipt = await client.write({
    agentId,
    contentType: payload.contentType ?? "application/json",
    content: payload.content ?? payload,
    tags: payload.tags,
    taskId: payload.taskId,
    access: payload.access,
  });
  console.log("Write receipt:");
  console.log(JSON.stringify(receipt, null, 2));
  console.log("memory_id:", receipt.memory_id);
  console.log("cid:", receipt.cid_ciphertext);
  console.log("payload_hash:", receipt.payload_hash);
  console.log("hcs_topic_id:", receipt.hcs_topic_id);
  console.log("contract_tx_hash:", receipt.contract_tx_hash);
}

async function cmdQuery(agentId: string) {
  const list = await client.query({ agentId, limit: 20 });
  console.log("Memories:", list.length);
  console.log(JSON.stringify(list, null, 2));
}

async function cmdRead(memoryId: string) {
  if (!PRIVATE_KEY) {
    console.error("PRIVATE_KEY env required for read (to sign challenge)");
    process.exit(1);
  }
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const signMessage = (msg: string) => wallet.signMessage(msg);
  const payload = await client.read(memoryId, signMessage, wallet.address);
  console.log("Decrypted payload:");
  console.log(JSON.stringify(payload, null, 2));
}

async function cmdVerify(memoryId: string) {
  const result = await client.verify(memoryId);
  console.log("Verify result:", result);
  if (!result.valid) process.exit(1);
}

async function cmdTamperTest(memoryId: string) {
  console.log("Tamper test: verify should still check on-chain hash; modified content would fail on read (hash mismatch).");
  const result = await client.verify(memoryId);
  console.log("Verify (integrity of ref):", result);
  if (!PRIVATE_KEY) {
    console.log("No PRIVATE_KEY: skip read-after-tamper (would need to decrypt and compare hash).");
    return;
  }
  try {
    const wallet = new ethers.Wallet(PRIVATE_KEY);
    await client.read(memoryId, (m) => wallet.signMessage(m), wallet.address);
    console.log("Read succeeded (payload hash matched). Tamper would cause read to throw.");
  } catch (e) {
    console.log("Read failed (expected if tampered or unauthorised):", (e as Error).message);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd) {
    console.log("Usage: memora <write|query|read|verify|tamper-test> [options]");
    console.log("  memora write --agent <id> --file payload.json");
    console.log("  memora query --agent <id>");
    console.log("  memora read --memory <id>");
    console.log("  memora verify --memory <id>");
    console.log("  memora tamper-test --memory <id>");
    process.exit(1);
  }
  const getArg = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    if (cmd === "write") {
      const agent = getArg("--agent");
      const file = getArg("--file");
      if (!agent || !file) throw new Error("--agent and --file required");
      await cmdWrite(agent, file);
    } else if (cmd === "query") {
      const agent = getArg("--agent");
      if (!agent) throw new Error("--agent required");
      await cmdQuery(agent);
    } else if (cmd === "read") {
      const memory = getArg("--memory");
      if (!memory) throw new Error("--memory required");
      await cmdRead(memory);
    } else if (cmd === "verify") {
      const memory = getArg("--memory");
      if (!memory) throw new Error("--memory required");
      await cmdVerify(memory);
    } else if (cmd === "tamper-test") {
      const memory = getArg("--memory");
      if (!memory) throw new Error("--memory required");
      await cmdTamperTest(memory);
    } else {
      throw new Error("Unknown command: " + cmd);
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}

main();
