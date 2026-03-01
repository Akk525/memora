/**
 * Poll MemoraRegistry MemoryCommitted events and upsert into Supabase.
 * Uses getLogs (no eth_newFilter) so it works with Hedera RPC, which does not support filters.
 */

import { ethers } from "ethers";
import { getSupabase, upsertMemory } from "./supabase.js";

const POLL_INTERVAL_MS = 12_000;
const ABI = [
  "event MemoryCommitted(bytes32 indexed memoryId, bytes32 indexed agentId, bytes32 taskId, string cid, bytes32 payloadHash, address writer, uint256 createdAt)",
];

const iface = new ethers.Interface(ABI);
const MEMORY_COMMITTED_TOPIC = iface.getEvent("MemoryCommitted")!.topicHash;

function processLog(db: ReturnType<typeof getSupabase>, log: ethers.Log): Promise<void> {
  try {
    const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed || parsed.name !== "MemoryCommitted") return Promise.resolve();
    const [memoryId, agentId, taskId, cid, payloadHash, writer, createdAt] = parsed.args;
    const task_id = taskId === ethers.ZeroHash ? null : taskId;
    const row = {
      memory_id: memoryId,
      agent_id: agentId,
      task_id,
      cid_ciphertext: cid,
      payload_hash: payloadHash,
      hcs_topic_id: "",
      hcs_sequence: "",
      hcs_timestamp: "",
      contract_tx_hash: log.transactionHash ?? "",
      created_at: new Date(Number(createdAt) * 1000).toISOString(),
    };
    return upsertMemory(db, row);
  } catch {
    return Promise.resolve();
  }
}

export function startContractListener(env: {
  HEDERA_EVM_RPC_URL: string;
  MEMORA_REGISTRY_CONTRACT_ID: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}) {
  const provider = new ethers.JsonRpcProvider(env.HEDERA_EVM_RPC_URL || "https://testnet.hashio.io/api");
  const db = getSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const filter = { address: env.MEMORA_REGISTRY_CONTRACT_ID, topics: [MEMORY_COMMITTED_TOPIC] };

  let lastBlock = 0;

  async function poll() {
    try {
      const current = await provider.getBlockNumber();
      if (current <= lastBlock) return;
      const fromBlock = lastBlock + 1;
      const toBlock = current;
      const logs = await provider.getLogs({ ...filter, fromBlock, toBlock });
      for (const log of logs) {
        await processLog(db, log).catch((err: unknown) => console.error("contract upsert error:", err));
      }
      lastBlock = toBlock;
    } catch (err) {
      console.error("Contract listener poll error:", (err as Error).message);
    }
  }

  void (async () => {
    try {
      lastBlock = await provider.getBlockNumber();
    } catch {
      // start from 0 if we can't get block number
    }
    setInterval(poll, POLL_INTERVAL_MS);
    void poll();
  })();

  console.log("Contract listener started (polling every", POLL_INTERVAL_MS / 1000, "s)");
}
