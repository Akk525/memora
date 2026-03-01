import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(url: string, serviceKey: string): SupabaseClient {
  if (!client) {
    client = createClient(url, serviceKey);
  }
  return client;
}

export async function upsertMemory(
  db: SupabaseClient,
  row: {
    memory_id: string;
    agent_id: string;
    task_id: string | null;
    cid_ciphertext: string;
    payload_hash: string;
    hcs_topic_id: string;
    hcs_sequence: string;
    hcs_timestamp: string;
    contract_tx_hash: string;
    created_at: string;
  }
): Promise<void> {
  const { error } = await db.from("memories").upsert(row, { onConflict: "memory_id" });
  if (error) throw error;
}

export async function upsertMemoryHcs(
  db: SupabaseClient,
  memoryId: string,
  hcsTopicId: string,
  hcsSequence: string,
  hcsTimestamp: string
): Promise<void> {
  const { error } = await db
    .from("memories")
    .update({
      hcs_topic_id: hcsTopicId,
      hcs_sequence: hcsSequence,
      hcs_timestamp: hcsTimestamp,
    })
    .eq("memory_id", memoryId);
  if (error) throw error;
}
