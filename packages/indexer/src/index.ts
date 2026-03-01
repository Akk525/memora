/**
 * Memora Indexer: HCS subscription + contract events -> Supabase; REST API for query.
 */

import path from "path";
import { config as loadEnv } from "dotenv";

// Load repo root .env when run via pnpm from package dir (cwd = packages/indexer)
loadEnv({ path: path.resolve(process.cwd(), "../../.env") });

import express from "express";
import { createRouter } from "./routes.js";
import { startContractListener } from "./contractListener.js";
import { startHcsSubscriber } from "./hcsSubscriber.js";

const port = Number(process.env.PORT) || 3001;

const env = {
  HEDERA_NETWORK: process.env.HEDERA_NETWORK || "testnet",
  HEDERA_OPERATOR_ID: process.env.HEDERA_OPERATOR_ID || "",
  HEDERA_OPERATOR_KEY: process.env.HEDERA_OPERATOR_KEY || "",
  HEDERA_EVM_RPC_URL: process.env.HEDERA_EVM_RPC_URL || "https://testnet.hashio.io/api",
  HCS_TOPIC_ID: process.env.HCS_TOPIC_ID || "",
  MEMORA_REGISTRY_CONTRACT_ID: process.env.MEMORA_REGISTRY_CONTRACT_ID || "",
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  PINATA_JWT: process.env.PINATA_JWT,
  KEY_BROKER_BASE_URL: process.env.KEY_BROKER_BASE_URL || "",
};

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(createRouter({ ...env, ...process.env }));

if (env.MEMORA_REGISTRY_CONTRACT_ID) {
  startContractListener(env);
}
if (env.HCS_TOPIC_ID && env.HEDERA_OPERATOR_ID && env.HEDERA_OPERATOR_KEY) {
  startHcsSubscriber(env);
}

app.listen(port, () => {
  console.log(`Memora Indexer listening on port ${port}`);
});
