/**
 * Subscribe to HCS topic and update Supabase with hcs_sequence + hcs_timestamp per memory_id.
 */

import { Client, TopicMessageQuery } from "@hashgraph/sdk";
import { getSupabase, upsertMemoryHcs } from "./supabase.js";
import { parseOperatorKey } from "./hederaKey.js";
import type { MemoryCommit } from "@memora/shared";

export function startHcsSubscriber(env: {
  HEDERA_NETWORK: string;
  HEDERA_OPERATOR_ID: string;
  HEDERA_OPERATOR_KEY: string;
  HCS_TOPIC_ID: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}) {
  const client =
    env.HEDERA_NETWORK === "mainnet"
      ? Client.forMainnet()
      : Client.forTestnet();
  client.setOperator(env.HEDERA_OPERATOR_ID, parseOperatorKey(env.HEDERA_OPERATOR_KEY));

  const db = getSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const topicId = env.HCS_TOPIC_ID;

  new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0)
    .subscribe(client, (err) => console.error("HCS subscription error:", err), async (message) => {
      if (!message) return;
      try {
        const json = Buffer.from(message.contents).toString("utf8");
        const commit: MemoryCommit = JSON.parse(json);
        const seq = (message as unknown as { sequenceNumber?: { toString?: () => string } }).sequenceNumber;
        const sequence = seq != null && typeof seq.toString === "function" ? seq.toString() : String(seq ?? "");
        const ts = (message as unknown as { consensusTimestamp?: { seconds?: { toNumber?: () => number }; nanos?: number } }).consensusTimestamp;
        const timestamp =
          ts?.seconds != null && typeof (ts.seconds as { toNumber?: () => number })?.toNumber === "function"
            ? new Date((ts.seconds as { toNumber: () => number }).toNumber() * 1000).toISOString()
            : new Date().toISOString();
        await upsertMemoryHcs(db, commit.memory_id, topicId, sequence, timestamp);
      } catch (e) {
        console.error("HCS parse/upsert error:", e);
      }
    });

  console.log("HCS subscriber started for topic", topicId);
}
