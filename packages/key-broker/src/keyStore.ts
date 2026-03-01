/**
 * Key store: get/put aes_key_base64 by memory_id. Uses Supabase with service role.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface KeyStoreEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

let supabase: SupabaseClient | null = null;

export function getKeyStore(env: KeyStoreEnv): SupabaseClient {
  if (!supabase) {
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabase;
}

export async function getKey(
  db: SupabaseClient,
  memoryId: string
): Promise<{ agent_id: string; aes_key_base64: string } | null> {
  const { data, error } = await db
    .from("key_store")
    .select("agent_id, aes_key_base64")
    .eq("memory_id", memoryId)
    .single();
  if (error || !data) return null;
  return data as { agent_id: string; aes_key_base64: string };
}

export async function putKey(
  db: SupabaseClient,
  memoryId: string,
  agentId: string,
  aesKeyBase64: string
): Promise<void> {
  const { error } = await db.from("key_store").upsert(
    {
      memory_id: memoryId,
      agent_id: agentId,
      aes_key_base64: aesKeyBase64,
      created_at: new Date().toISOString(),
    },
    { onConflict: "memory_id" }
  );
  if (error) throw new Error(`key_store put failed: ${error.message}`);
}
