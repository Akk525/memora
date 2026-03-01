# Memora quickstart

1. **Install and build**
   ```bash
   pnpm install && pnpm run build
   ```

2. **Configure**
   - Copy `.env.example` to `.env`.
   - Set Hedera testnet operator ID/key, Supabase URL and service key, Pinata JWT.
   - Create an HCS topic (e.g. via [Portal](https://portal.hedera.com)) and set `HCS_TOPIC_ID`.

3. **Deploy contract**
   ```bash
   cd packages/contracts && pnpm run deploy
   ```
   Set `MEMORA_REGISTRY_CONTRACT_ID` in `.env`.

4. **Apply Supabase migrations**
   - In Supabase dashboard → SQL Editor, run `supabase/migrations/00001_initial_schema.sql`.

5. **Start services**
   ```bash
   pnpm run key-broker:start   # terminal 1, port 3000
   pnpm run indexer:start      # terminal 2, port 3001
   ```

6. **Write a memory**
   ```bash
   node packages/cli/dist/cli.js write --agent my-agent --file examples/payload.json
   ```
   Note the returned `memory_id`.

7. **Query and read**
   ```bash
   node packages/cli/dist/cli.js query --agent my-agent
   # Set PRIVATE_KEY to the operator key (owner of my-agent), then:
   node packages/cli/dist/cli.js read --memory <memory_id>
   node packages/cli/dist/cli.js verify --memory <memory_id>
   ```
