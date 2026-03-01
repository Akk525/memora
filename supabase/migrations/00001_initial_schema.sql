-- Memora Phase 1: memories (index/cache), agents, delegates, key_store.
-- Supabase is not source of truth; can be rebuilt from HCS + contract events.

-- Memories: indexed view from HCS + contract
CREATE TABLE IF NOT EXISTS memories (
  memory_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  cid_ciphertext TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  hcs_topic_id TEXT NOT NULL,
  hcs_sequence TEXT NOT NULL,
  hcs_timestamp TEXT NOT NULL,
  contract_tx_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memories_agent_id ON memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_task_id ON memories(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);

-- Agents: optional cache of on-chain agent -> owner
CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delegates: optional cache of on-chain delegate state
CREATE TABLE IF NOT EXISTS agents_delegates (
  agent_id TEXT NOT NULL,
  delegate_address TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, delegate_address)
);

CREATE INDEX IF NOT EXISTS idx_agents_delegates_agent ON agents_delegates(agent_id);

-- Key store: memory_id -> aes_key (key-broker only; never exposed to indexer)
CREATE TABLE IF NOT EXISTS key_store (
  memory_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  aes_key_base64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS can be enabled per-table; key_store must be service-role only.
ALTER TABLE key_store ENABLE ROW LEVEL SECURITY;
-- Policy: no direct access from anon/auth; only service role
CREATE POLICY "key_store_service_only" ON key_store
  USING (false);
