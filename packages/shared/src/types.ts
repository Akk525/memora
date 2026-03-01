/**
 * Memora shared types – canonical definitions for payloads, commits, and refs.
 */

/** Plaintext memory content (before encryption). */
export interface MemoryPayload {
  contentType: string;
  content: unknown;
  tags?: string[];
  taskId?: string;
  access?: AccessPolicySummary;
  /** Optional metadata; included in canonical bytes for hashing */
  meta?: Record<string, unknown>;
}

/** Summary of access policy (stored on-chain / HCS for discovery only). */
export interface AccessPolicySummary {
  owner?: string;
  delegates?: string[];
  mode?: "private" | "shared";
}

/** Encrypted payload bundle stored on IPFS (ciphertext only). */
export interface EncryptedPayloadBundle {
  version: number;
  alg: "AES-256-GCM";
  nonce: string; // base64
  ciphertext: string; // base64
  tag: string; // base64 auth tag
}

/** Message published to HCS topic (canonical ordering layer). */
export interface MemoryCommit {
  memory_id: string;
  agent_id: string;
  task_id?: string;
  cid_ciphertext: string;
  payload_hash: string; // hex or base64 of sha256
  schema_version: number;
  access_policy_summary?: AccessPolicySummary;
}

/** Indexed view (Supabase / indexer). */
export interface MemoryRef {
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

/** Agent record (optional in indexer). */
export interface AgentRef {
  agent_id: string;
  owner_address: string;
  created_at: string;
}

/** Delegate record. */
export interface DelegateRef {
  agent_id: string;
  delegate_address: string;
  enabled: boolean;
  updated_at: string;
}

/** Key store row (key-broker only; never exposed). */
export interface KeyStoreRow {
  memory_id: string;
  agent_id: string;
  aes_key_base64: string;
  created_at: string;
}
