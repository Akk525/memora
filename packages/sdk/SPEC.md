# Memora Protocol Specification

Public specification for **@memora/core** — verifiable long-term memory for AI agents. This document describes versioning, schemas, and external service contracts.

---

## Versioning

- **memora_version**: `"0.1"` — included in payload canonical form and in commit messages.
- **Semver**: The SDK and this spec follow semantic versioning. Patch: backwards-compatible fixes. Minor: new optional fields or endpoints. Major: breaking changes to schemas or required fields.

---

## MemoryPayload (plaintext)

Plaintext JSON before encryption. Canonicalized for deterministic hashing.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `contentType` | string | Yes | MIME type (e.g. `application/json`) |
| `content` | unknown | Yes | Opaque payload (object, string, etc.) |
| `tags` | string[] | No | Sorted for canonical form |
| `taskId` | string | No | Optional task scope |
| `access` | AccessPolicySummary | No | Owner, delegates, mode |
| `meta` | Record<string, unknown> | No | Included in canonical bytes for hashing |

---

## Encrypted payload bundle (IPFS)

What is uploaded to IPFS. Ciphertext only; key is never on-chain.

```json
{
  "version": 1,
  "alg": "AES-256-GCM",
  "nonce": "<base64>",
  "ciphertext": "<base64>",
  "tag": "<base64>"
}
```

- **Optional**: `aad` (additional authenticated data) may be added in future versions.
- **Plaintext** before encryption is the canonical string of `MemoryPayload` (see Hashing).

---

## MemoryCommit (HCS message)

Message published to the Hedera Consensus Service topic (canonical ordering).

| Field | Type | Description |
|-------|------|-------------|
| `memory_id` | string | bytes32 hex (derived from payload_hash + cid + timestamp) |
| `agent_id` | string | Agent identifier |
| `task_id` | string? | Optional task scope |
| `cid_ciphertext` | string | IPFS CID of the encrypted bundle |
| `payload_hash` | string | SHA-256 hex of canonical plaintext (see Hashing) |
| `schema_version` | number | Protocol schema version (e.g. 1) |
| `access_policy_summary` | object? | Owner, delegates, mode (discovery only) |

---

## Hashing and canonicalization

- **Deterministic JSON**: Canonical form uses sorted keys, no extra whitespace, consistent number/string encoding (RFC 8785 style).
- **Order of operations**: Payload → canonicalize → **hash canonical string** → encrypt canonical string. The **payload_hash** is computed on the canonical plaintext bytes **before** encryption.
- **Hash algorithm**: SHA-256 of UTF-8 canonical string; stored as hex (with or without `0x` prefix; comparison strips prefix).

---

## External services (cloud mode)

The SDK in “cloud mode” calls two external HTTP APIs.

### Indexer API

- **GET** `/memories?agent_id=...&limit=&offset=&task_id=&order_by=`
  - Returns list of memory refs (e.g. `memory_id`, `cid_ciphertext`, `payload_hash`, `hcs_sequence`, `hcs_timestamp`, `contract_tx_hash`).
- **GET** `/memory/:memory_id`
  - Returns a single memory ref (same shape).

### Key Broker API

- **GET** `/challenge?memory_id=...&requester=...`
  - Returns `{ nonce, message }`. Requester signs `message` (e.g. with wallet).
- **POST** `/keys`
  - Body: `{ memory_id, requester, signature, challenge }` (challenge = nonce).
  - Returns `{ key }` (base64 AES key) if requester is owner or delegate; otherwise 403.

---

## Verification flow

1. **Fetch ref** from indexer (`GET /memory/:memory_id`).
2. **Fetch ciphertext** from IPFS (gateway + `cid_ciphertext`).
3. **Request key** from key broker (challenge → sign → POST /keys).
4. **Decrypt** bundle with key to get canonical plaintext.
5. **Recompute hash** of canonical plaintext (SHA-256 hex).
6. **Compare** to `ref.payload_hash` (strip `0x` if present). Mismatch ⇒ tampered or corrupted.

---

## Summary

- **MemoryPayload** → canonicalize → **payload_hash** → encrypt → IPFS → **MemoryCommit** (HCS) + contract + key stored at key broker.
- Readers: ref → IPFS → key (challenge/sign) → decrypt → verify hash.
