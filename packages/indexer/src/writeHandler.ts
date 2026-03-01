/**
 * Write flow: canonicalize -> hash -> encrypt -> IPFS -> HCS -> contract -> key register.
 * Uses operator key for HCS and contract; operator must be owner or delegate of agent_id.
 */

import { ethers } from "ethers";
import {
  canonicalizePayload,
  hashPayload,
  encrypt,
  generateAesKey,
  type MemoryPayload,
  type MemoryCommit,
} from "@memora/shared";
import { Client, TopicMessageSubmitTransaction, PrivateKey } from "@hashgraph/sdk";
import { uploadToIpfs } from "./ipfs.js";
import { parseOperatorKey } from "./hederaKey.js";

const REGISTRY_ABI = [
  "function registerAgent(bytes32 agentId)",
  "function commitMemory(bytes32 memoryId, bytes32 agentId, bytes32 taskId, string calldata cid, bytes32 payloadHash)",
  "function ownerOfAgent(bytes32 agentId) view returns (address)",
];

export async function handleWrite(
  payload: MemoryPayload,
  agentId: string,
  taskId: string | undefined,
  env: {
    HEDERA_NETWORK: string;
    HEDERA_OPERATOR_ID: string;
    HEDERA_OPERATOR_KEY: string;
    HEDERA_EVM_RPC_URL: string;
    HCS_TOPIC_ID: string;
    MEMORA_REGISTRY_CONTRACT_ID: string;
    PINATA_JWT?: string;
    KEY_BROKER_BASE_URL: string;
  }
): Promise<{
  memory_id: string;
  cid_ciphertext: string;
  payload_hash: string;
  hcs_topic_id: string;
  contract_tx_hash: string;
}> {
  const canonical = canonicalizePayload(payload);
  const payload_hash = hashPayload(canonical);
  const key = generateAesKey();
  const bundle = encrypt(canonical, key);
  const keyBase64 = key.toString("base64");

  const cid_ciphertext = await uploadToIpfs(bundle, env);
  const memoryIdBytes32 = ethers.keccak256(
    ethers.toUtf8Bytes(payload_hash + cid_ciphertext + Date.now())
  );
  const agentIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(agentId));
  const taskIdBytes32 = taskId
    ? ethers.keccak256(ethers.toUtf8Bytes(taskId))
    : ethers.ZeroHash;

  const client =
    env.HEDERA_NETWORK === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(env.HEDERA_OPERATOR_ID, parseOperatorKey(env.HEDERA_OPERATOR_KEY));

  const commit: MemoryCommit = {
    memory_id: memoryIdBytes32,
    agent_id: agentId,
    task_id: taskId,
    cid_ciphertext,
    payload_hash,
    schema_version: 1,
  };
  const commitJson = JSON.stringify(commit);

  const hcsTx = await new TopicMessageSubmitTransaction()
    .setTopicId(env.HCS_TOPIC_ID)
    .setMessage(commitJson)
    .execute(client);
  await hcsTx.getReceipt(client);

  const provider = new ethers.JsonRpcProvider(env.HEDERA_EVM_RPC_URL);
  const signer = new ethers.Wallet(env.HEDERA_OPERATOR_KEY, provider);
  const registry = new ethers.Contract(
    env.MEMORA_REGISTRY_CONTRACT_ID,
    REGISTRY_ABI,
    signer
  );
  const owner = await registry.ownerOfAgent(agentIdBytes32);
  if (owner === ethers.ZeroAddress) {
    const tx1 = await registry.registerAgent(agentIdBytes32);
    await tx1.wait();
  }
  const payloadHashBytes32 = payload_hash.startsWith("0x") ? payload_hash : "0x" + payload_hash;
  const tx2 = await registry.commitMemory(
    memoryIdBytes32,
    agentIdBytes32,
    taskIdBytes32,
    cid_ciphertext,
    payloadHashBytes32
  );
  const rec = await tx2.wait();
  const contract_tx_hash = rec?.hash ?? "";

  await fetch(`${env.KEY_BROKER_BASE_URL}/keys/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memory_id: memoryIdBytes32,
      agent_id: agentId,
      key_base64: keyBase64,
    }),
  });

  return {
    memory_id: memoryIdBytes32,
    cid_ciphertext,
    payload_hash,
    hcs_topic_id: env.HCS_TOPIC_ID,
    contract_tx_hash,
  };
}
