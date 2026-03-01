#!/usr/bin/env node
/**
 * Proof test 2: query_demo
 * Lists last N memories for agent ordered by hcs_sequence.
 * Run: node --env-file=.env scripts/query_demo.mjs [agent_id] [limit]
 */

const INDEXER = process.env.INDEXER_BASE_URL || "http://localhost:3001";
const AGENT = process.env.DEMO_AGENT_ID || process.argv[2] || "my-agent";
const LIMIT = Math.min(Number(process.argv[3]) || 10, 100);

async function main() {
  const url = `${INDEXER}/memories?agent_id=${encodeURIComponent(AGENT)}&limit=${LIMIT}&order_by=hcs_sequence`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();

  // Sort by hcs_sequence numeric desc if present
  const sorted = [...data].sort((a, b) => {
    const sa = a.hcs_sequence ? Number(a.hcs_sequence) : 0;
    const sb = b.hcs_sequence ? Number(b.hcs_sequence) : 0;
    return sb - sa;
  });

  console.log("--- query_demo output (last N memories by hcs_sequence) ---");
  console.log("agent_id:", AGENT, "limit:", LIMIT);
  console.log("Memories:", sorted.length);
  console.log(JSON.stringify(sorted.map((m) => ({
    memory_id: m.memory_id,
    hcs_sequence: m.hcs_sequence,
    hcs_timestamp: m.hcs_timestamp,
    payload_hash: m.payload_hash,
    contract_tx_hash: m.contract_tx_hash,
  })), null, 2));
  console.log("---");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
