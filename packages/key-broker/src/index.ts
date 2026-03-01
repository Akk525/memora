/**
 * Memora Key Broker: challenge/response auth + on-chain permission check + key release.
 */

import path from "path";
import { config as loadEnv } from "dotenv";

// Load repo root .env when run via pnpm from package dir (cwd = packages/key-broker)
loadEnv({ path: path.resolve(process.cwd(), "../../.env") });

import express from "express";
import { createRouter } from "./routes.js";

const port = Number(process.env.PORT) || 3000;

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  MEMORA_REGISTRY_CONTRACT_ID: process.env.MEMORA_REGISTRY_CONTRACT_ID!,
  HEDERA_EVM_RPC_URL: process.env.HEDERA_EVM_RPC_URL,
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.MEMORA_REGISTRY_CONTRACT_ID) {
  console.error("Missing required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEMORA_REGISTRY_CONTRACT_ID");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(createRouter(env));

app.listen(port, () => {
  console.log(`Memora Key Broker listening on port ${port}`);
});
