# memora-core

**Memora SDK** — verifiable long-term memory for AI agents. Write, query, read, and verify memories with a config-driven client. **No env files required:** pass your indexer and key-broker base URLs when constructing the client.

## Install

```bash
npm install memora-core
# or
pnpm add memora-core
```

## Quickstart (60 seconds)

You need two base URLs: an **indexer** and a **key-broker** (your own stack or a hosted Memora API). No `.env` required by the SDK — pass config explicitly.

```typescript
import { MemoraClient } from "memora-core";

const client = new MemoraClient({
  indexerBaseUrl: "https://your-indexer.example.com",
  keyBrokerBaseUrl: "https://your-keybroker.example.com",
});

// Write
const receipt = await client.write({
  agentId: "my-agent",
  contentType: "application/json",
  content: { note: "Hello Memora" },
});
console.log("memory_id:", receipt.memory_id);

// Read (requires a wallet that is owner or delegate of the agent)
const payload = await client.read(
  receipt.memory_id,
  (msg) => wallet.signMessage(msg),
  wallet.address
);
console.log("payload:", payload.content);
```

**Note:** The indexer and key-broker must be running (self-hosted or hosted). See [SPEC.md](./SPEC.md) for API and schema details.

## Use

The SDK only needs the **base URLs** of a Memora indexer and key-broker. Those can be:

- **Your own stack** (self-hosted indexer + key-broker on Hedera).
- **A hosted Memora API** (if one is provided).

No `.env` or environment variables are required by the SDK itself.

```typescript
import { MemoraClient } from "memora-core";

const client = new MemoraClient({
  indexerBaseUrl: "https://your-indexer.example.com",   // or process.env.INDEXER_BASE_URL
  keyBrokerBaseUrl: "https://your-keybroker.example.com",
  ipfsGatewayUrl: "https://gateway.pinata.cloud/ipfs/", // optional, for read
});

// Write (indexer uses its own operator key; your app just sends payload + agent_id)
const receipt = await client.write({
  agentId: "my-agent",
  contentType: "application/json",
  content: { summary: "Meeting notes", decisions: ["Use Memora"] },
});
console.log("memory_id:", receipt.memory_id);

// Query
const list = await client.query({ agentId: "my-agent" });

// Read (decrypt) — requires a wallet that is owner or delegate of the agent
const payload = await client.read(
  receipt.memory_id,
  (msg) => wallet.signMessage(msg),
  wallet.address
);

// Verify (integrity only, no key)
const { valid } = await client.verify(receipt.memory_id);
```

## Config

| Option | Required | Description |
|--------|----------|-------------|
| `indexerBaseUrl` | Yes | Base URL of the Memora indexer (e.g. `https://indexer.example.com`). |
| `keyBrokerBaseUrl` | Yes | Base URL of the Memora key-broker (e.g. `https://keybroker.example.com`). |
| `ipfsGatewayUrl` | No | IPFS gateway for fetching ciphertext by CID. Defaults to Pinata public gateway. |

Your app can source these from its own config, env, or secrets — the SDK does not read `process.env`.

## Self-hosting

To run your own Memora stack (indexer, key-broker, contracts, HCS topic, Supabase, Pinata), see the [main Memora repo](https://github.com/your-org/memora) setup guide. Once that is running, point this SDK at your indexer and key-broker URLs.

## License

MIT
