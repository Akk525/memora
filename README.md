# Memora

**Verifiable long-term memory infrastructure for AI agents.** Phase 1: core infra + SDK with encrypted payloads on IPFS, commitments on Hedera Consensus Service (HCS), and a registry contract for discoverability and permissions.

## Architecture (Phase 1)

- **IPFS**: Encrypted memory payloads (AES-256-GCM); only ciphertext is stored.
- **Hedera Consensus Service (HCS)**: Canonical ordering layer; commit messages carry `memory_id`, `cid_ciphertext`, `payload_hash`, etc.
- **Registry contract (Hedera EVM)**: Agent ownership, delegates, and memory refs (pointers + hashes). Writer must be owner or delegate.
- **Supabase**: Index/cache of memories (HCS + contract); can be rebuilt from chain. Also `key_store` for the Key Broker (keys never on-chain).
- **Key Broker**: Challenge/response auth; checks registry (owner or delegate); returns decryption key over TLS. Phase 1 returns raw key; production should use wrapped keys.
- **SDK (`@memora/core`)**: Write, query, read (decrypt + verify), and verify with minimal code. **Config-only; no .env required** — pass indexer and key-broker base URLs. See [packages/sdk/README.md](packages/sdk/README.md). To publish the SDK: [docs/SHIPPING-SDK.md](docs/SHIPPING-SDK.md).

## Monorepo structure

```
packages/
  contracts/   # MemoraRegistry.sol, Hardhat, deploy to Hedera testnet
  indexer/     # HCS subscribe + contract events → Supabase; REST API + POST /write
  key-broker/ # Challenge/response + key store; on-chain permission check
  sdk/        # @memora/core – MemoraClient (cloud mode)
  cli/        # memora write|query|read|verify|tamper-test
  shared/     # Types, canonicalization, crypto (AES-256-GCM, SHA-256)
supabase/migrations/  # memories, agents, delegates, key_store
examples/     # Sample payloads
```

## Setup

1. **Clone and install**
   ```bash
   pnpm install
   ```

2. **Environment**
   - Copy `.env.example` to `.env` and fill in:
     - `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY` (testnet account)
     - `HEDERA_EVM_RPC_URL` (e.g. `https://testnet.hashio.io/api`)
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
     - `PINATA_JWT` (for IPFS pinning)
   - After deploy: set `HCS_TOPIC_ID`, `MEMORA_REGISTRY_CONTRACT_ID`, `KEY_BROKER_BASE_URL`, `INDEXER_BASE_URL`.
   - For CLI read: set `PRIVATE_KEY` (wallet that is owner or delegate of the agent).

3. **Supabase**
   - Create a project and run migrations:
     ```bash
     # Apply supabase/migrations/00001_initial_schema.sql in Supabase SQL editor
     ```

4. **Create HCS topic (testnet)**
   - Use Hedera portal or SDK to create a topic; set `HCS_TOPIC_ID`.

5. **Deploy contract**
   ```bash
   cd packages/contracts && pnpm run deploy
   ```
   Set `MEMORA_REGISTRY_CONTRACT_ID` to the deployed contract address.

6. **Start services**
   ```bash
   pnpm run key-broker:start   # port 3000
   pnpm run indexer:start     # port 3001
   ```

## 5-line integration (SDK)

```typescript
import { MemoraClient } from "@memora/core";

const client = new MemoraClient({
  indexerBaseUrl: process.env.INDEXER_BASE_URL!,
  keyBrokerBaseUrl: process.env.KEY_BROKER_BASE_URL!,
});

const receipt = await client.write({
  agentId: "my-agent",
  contentType: "application/json",
  content: { summary: "Meeting notes", decisions: ["Use Memora"] },
});
const list = await client.query({ agentId: "my-agent" });
```

Read (with wallet for challenge signature):

```typescript
const payload = await client.read(
  memoryId,
  (msg) => wallet.signMessage(msg),
  wallet.address
);
```

## CLI demo

From repo root after `pnpm run build`:

```bash
# Write (uses indexer POST /write; ensure indexer + key-broker are running and .env is set)
node packages/cli/dist/cli.js write --agent my-agent --file examples/payload.json

# Query
node packages/cli/dist/cli.js query --agent my-agent

# Read (requires PRIVATE_KEY = owner or delegate)
node packages/cli/dist/cli.js read --memory <memory_id>

# Verify
node packages/cli/dist/cli.js verify --memory <memory_id>

# Tamper test (verify + read; tampered content fails on read)
node packages/cli/dist/cli.js tamper-test --memory <memory_id>
```

Or from `packages/cli`: `node dist/cli.js write --agent my-agent --file ../../examples/payload.json`.

## Required Proof Tests (before building apps)

Run these five scripts and **keep outputs** for your README/demo. If they pass, Phase 1 infra is real and you’re ready to build mission coordination + skills on top.

| Script | What it does |
|--------|----------------|
| **write_demo** | Prints: `memory_id`, `cid`, `payload_hash`, `hcs_seq`, `hcs_timestamp`, `contract_tx` |
| **query_demo** | Lists last N memories for agent ordered by `hcs_sequence` |
| **read_demo** | Fetches CID, requests key, decrypts, verifies hash ✅ |
| **tamper_demo** | Explains: modified ciphertext/plaintext → verify fails ❌ |
| **delegate_demo** | Add delegate → delegate can decrypt ✅; revoke → delegate gets 403 ❌ |

**How to run** (from repo root; indexer + key-broker must be running, `.env` set):

```bash
pnpm run proof:write          # run first; optionally set WRITE_DEMO_MEMORY_ID in .env
pnpm run proof:query
pnpm run proof:read           # uses memory_id from WRITE_DEMO_MEMORY_ID or: pnpm run proof:read -- <memory_id>
pnpm run proof:tamper         # pass memory_id as arg or use WRITE_DEMO_MEMORY_ID
pnpm run proof:delegate       # pass <memory_id> [agent_id] or use WRITE_DEMO_MEMORY_ID and DEMO_AGENT_ID
```

**delegate_demo** requires a second wallet: set `DELEGATE_PRIVATE_KEY` in `.env`. Owner is `HEDERA_OPERATOR_KEY`; owner calls `setDelegate(agentId, delegateAddr, true)` then revokes; delegate requests key before (success) and after (403).

## Tests

- **Shared**: canonicalization stable hashing; AES round-trip; tamper causes auth/hash failure.
- **Contracts**: `pnpm --filter @memora/contracts run test`
- **Integration**: Write to Hedera testnet + indexer; SDK read + verify; unauthorised key request denied; delegate revoke stops key release.

Run all: `pnpm test` (from root).

## Env vars reference

| Variable | Used by | Description |
|----------|---------|-------------|
| `HEDERA_NETWORK` | indexer, contracts | `testnet` or `mainnet` |
| `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` | indexer (HCS + contract), contracts deploy | Hedera account |
| `HEDERA_EVM_RPC_URL` | indexer, key-broker, contracts | EVM RPC (e.g. Hashio testnet) |
| `HCS_TOPIC_ID` | indexer | HCS topic for commit messages |
| `MEMORA_REGISTRY_CONTRACT_ID` | indexer, key-broker | Deployed MemoraRegistry address |
| `PINATA_JWT` | indexer (write) | IPFS pinning (Pinata) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | indexer, key-broker | Supabase project |
| `KEY_BROKER_BASE_URL` | indexer (register key), SDK, CLI | Key broker base URL |
| `INDEXER_BASE_URL` | SDK, CLI | Indexer base URL |
| `PRIVATE_KEY` | CLI read | Wallet (owner or delegate) for signing challenge |

## Phase 2 / Phase 3 roadmap (not implemented)

**Phase 2: Multi-agent Mission Memory**
- Task model with per-task HCS topics (or shared topic with `task_id`).
- Task participants permissioning and SHARED memory mode.
- Mission timeline UI (optional).
- Snapshot builder: derive current task state from event log.

**Phase 3: Skill Capsules Marketplace**
- Derive “Skill Capsule” artifacts from memory sets / mission logs.
- HTS-based Skill NFT licensing with royalties.
- Token-gated key release (Key Broker checks HTS ownership).
- Performance evaluation harness (before/after).

---

**Note (production)**: Key Broker should return wrapped keys (e.g. encrypted for requester’s key) rather than raw keys over TLS. Phase 1 uses raw key for simplicity.
