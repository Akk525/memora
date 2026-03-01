#!/usr/bin/env node
/**
 * Proof test 1: write_demo
 * Writes a memory, then fetches the row (including hcs_sequence once HCS subscriber updates it) and prints:
 *   memory_id, cid, payload_hash, hcs_seq, hcs_timestamp, contract_tx
 * Run: node --env-file=.env scripts/write_demo.mjs [payload.json] [agent_id]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const INDEXER = process.env.INDEXER_BASE_URL || "http://localhost:3001";
const AGENT = process.env.DEMO_AGENT_ID || "my-agent";
const PAYLOAD_PATH = resolve(process.cwd(), process.argv[2] || "examples/payload.json");
const TASK_ID = process.argv[3] || undefined;

async function main() {
  const payload = JSON.parse(readFileSync(PAYLOAD_PATH, "utf8"));
  const body = { payload, agent_id: AGENT, task_id: TASK_ID };
  const res = await fetch(`${INDEXER}/write`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || String(err));
  }
  const receipt = await res.json();
  const memory_id = receipt.memory_id;

  // Poll for hcs_sequence (HCS subscriber may lag a moment)
  let row = null;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r2 = await fetch(`${INDEXER}/memory/${encodeURIComponent(memory_id)}`);
    if (r2.ok) {
      row = await r2.json();
      if (row.hcs_sequence != null && row.hcs_sequence !== "") break;
    }
  }

  console.log("--- write_demo output (keep for README/demo) ---");
  console.log("memory_id:", memory_id);
  console.log("cid:", receipt.cid_ciphertext);
  console.log("payload_hash:", receipt.payload_hash);
  console.log("hcs_seq:", row?.hcs_sequence ?? receipt.hcs_topic_id ? "(pending)" : "n/a");
  console.log("hcs_timestamp:", row?.hcs_timestamp ?? "n/a");
  console.log("contract_tx:", receipt.contract_tx_hash);
  console.log("---");
  console.log("WRITE_DEMO_MEMORY_ID=" + memory_id);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
