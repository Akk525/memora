/**
 * Create an HCS topic on Hedera testnet and print the topic ID.
 * Uses HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY from env.
 *
 * Run from repo root:
 *   pnpm run create-topic
 * Or from packages/indexer with .env in repo root:
 *   node --env-file=../../.env scripts/create-topic.js
 */

import { Client, TopicCreateTransaction, PrivateKey } from "@hashgraph/sdk";

const operatorId = process.env.HEDERA_OPERATOR_ID;
const operatorKey = process.env.HEDERA_OPERATOR_KEY?.trim();

if (!operatorId || !operatorKey) {
  console.error("Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY. Load .env (e.g. node --env-file=../../.env scripts/create-topic.js)");
  process.exit(1);
}

// Hedera SDK requires explicit key type. Portal often exports DER (hex); otherwise raw hex ED25519/ECDSA.
function parseOperatorKey(keyStr) {
  const hex = keyStr.startsWith("0x") ? keyStr.slice(2).trim() : keyStr.trim();
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("HEDERA_OPERATOR_KEY must be hex only (no spaces/newlines). Use DER hex or 64-char ED25519/ECDSA hex.");
  }
  // DER-encoded keys from Hedera portal start with 30 (ASN.1 SEQUENCE) and are longer than 64 chars
  if (hex.length > 64 && hex.startsWith("30")) {
    try {
      return PrivateKey.fromStringDer(hex);
    } catch (_) {
      // fall through to try raw hex
    }
  }
  // Raw 64-char hex: ECDSA (portal ECDSA accounts) then ED25519
  if (hex.length === 64) {
    try {
      return PrivateKey.fromStringECDSA(hex);
    } catch (_) {
      try {
        return PrivateKey.fromStringED25519(hex);
      } catch (_) {
        throw new Error("Could not parse 64-char key as ECDSA or ED25519. Check it matches your Hedera account.");
      }
    }
  }
  try {
    return PrivateKey.fromStringDer(hex);
  } catch (_) {
    throw new Error("HEDERA_OPERATOR_KEY: use DER hex (from portal export) or 64-char ED25519/ECDSA hex.");
  }
}

const privateKey = parseOperatorKey(operatorKey);
const client = process.env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
client.setOperator(operatorId, privateKey);

const tx = await new TopicCreateTransaction()
  .setTopicMemo("Memora HCS topic")
  .execute(client);

const receipt = await tx.getReceipt(client);
const topicId = receipt.topicId?.toString();

if (!topicId) {
  console.error("Topic creation failed: no topicId in receipt");
  process.exit(1);
}

console.log("Created HCS topic. Add to your .env:");
console.log("HCS_TOPIC_ID=" + topicId);

client.close();
