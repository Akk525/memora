/**
 * Key broker routes: GET /challenge, POST /keys, GET /health.
 * POST /keys/register stores key (called by writer after encrypting; internal or signed).
 */

import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { getKey, putKey, getKeyStore } from "./keyStore.js";
import { createChallenge, getChallengeMessage, verifySignature, consumeChallenge } from "./auth.js";
import { canAccessKey, agentIdToBytes32 } from "./registry.js";

export function createRouter(env: {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  MEMORA_REGISTRY_CONTRACT_ID: string;
  HEDERA_EVM_RPC_URL?: string;
}) {
  const router = Router();
  const db = getKeyStore(env);
  const rpcUrl = env.HEDERA_EVM_RPC_URL || "https://testnet.hashio.io/api";
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "memora-key-broker" });
  });

  router.get("/challenge", (req: Request, res: Response) => {
    const memory_id = req.query.memory_id as string;
    const requester = req.query.requester as string;
    if (!memory_id || !requester) {
      return res.status(400).json({ error: "memory_id and requester required" });
    }
    if (!ethers.isAddress(requester)) {
      return res.status(400).json({ error: "invalid requester address" });
    }
    const nonce = createChallenge(memory_id, requester);
    res.json({ nonce, message: getChallengeMessage(nonce) });
  });

  router.post("/keys", async (req: Request, res: Response) => {
    const { memory_id, requester, signature, challenge: nonce } = req.body;
    if (!memory_id || !requester || !signature || !nonce) {
      return res.status(400).json({
        error: "memory_id, requester, signature, and challenge (nonce) required",
      });
    }
    if (!ethers.isAddress(requester)) {
      return res.status(400).json({ error: "invalid requester address" });
    }
    const message = getChallengeMessage(nonce);
    if (!verifySignature(requester, message, signature)) {
      return res.status(401).json({ error: "invalid signature" });
    }
    if (!consumeChallenge(memory_id, requester, nonce)) {
      return res.status(401).json({ error: "invalid or expired challenge" });
    }

    const keyRow = await getKey(db, memory_id);
    if (!keyRow) {
      return res.status(404).json({ error: "key not found for this memory" });
    }

    const agentIdBytes32 = agentIdToBytes32(keyRow.agent_id);
    const allowed = await canAccessKey(
      provider,
      env.MEMORA_REGISTRY_CONTRACT_ID,
      agentIdBytes32,
      requester
    );
    if (!allowed) {
      return res.status(403).json({ error: "not owner or delegate for this agent" });
    }

    res.json({ key: keyRow.aes_key_base64 });
  });

  /** Register key after write. In Phase 1 we accept key in body; in production would use wrapped key. */
  router.post("/keys/register", async (req: Request, res: Response) => {
    const { memory_id, agent_id, key_base64 } = req.body;
    if (!memory_id || !agent_id || !key_base64) {
      return res.status(400).json({ error: "memory_id, agent_id, key_base64 required" });
    }
    try {
      await putKey(db, memory_id, agent_id, key_base64);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
