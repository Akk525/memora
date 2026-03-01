import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { getSupabase } from "./supabase.js";
import { handleWrite } from "./writeHandler.js";
import type { MemoryPayload } from "@memora/shared";

/** Normalize agent_id: store/contract uses bytes32 (keccak256); query may pass string like "my-agent". */
function normalizeAgentId(agentId: string): string {
  if (/^0x[0-9a-fA-F]{64}$/.test(agentId)) return agentId;
  return ethers.keccak256(ethers.toUtf8Bytes(agentId));
}

export function createRouter(env: {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  HEDERA_NETWORK?: string;
  HEDERA_OPERATOR_ID?: string;
  HEDERA_OPERATOR_KEY?: string;
  HEDERA_EVM_RPC_URL?: string;
  HCS_TOPIC_ID?: string;
  MEMORA_REGISTRY_CONTRACT_ID?: string;
  PINATA_JWT?: string;
  KEY_BROKER_BASE_URL?: string;
}) {
  const router = Router();
  const db = getSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", service: "memora-indexer" });
  });

  router.get("/memories", async (req: Request, res: Response) => {
    const agent_id = req.query.agent_id as string | undefined;
    const task_id = req.query.task_id as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const orderBy = (req.query.order_by as string) || "created_at";

    const orderColumn = orderBy === "hcs_sequence" ? "hcs_sequence" : "created_at";
    let q = db.from("memories").select("*").order(orderColumn, { ascending: false }).range(offset, offset + limit - 1);
    if (agent_id) q = q.eq("agent_id", normalizeAgentId(agent_id));
    if (task_id != null && task_id !== "") {
      const tid = /^0x[0-9a-fA-F]{64}$/.test(task_id) ? task_id : ethers.keccak256(ethers.toUtf8Bytes(task_id));
      q = q.eq("task_id", tid);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data ?? []);
  });

  router.get("/memory/:memory_id", async (req: Request, res: Response) => {
    const { memory_id } = req.params;
    const { data, error } = await db.from("memories").select("*").eq("memory_id", memory_id).single();
    if (error || !data) return res.status(404).json({ error: "Memory not found" });
    res.json(data);
  });

  router.post("/write", async (req: Request, res: Response) => {
    const { payload, agent_id, task_id } = req.body as {
      payload: MemoryPayload;
      agent_id: string;
      task_id?: string;
    };
    if (!payload || !agent_id) {
      return res.status(400).json({ error: "payload and agent_id required" });
    }
    if (
      !env.HEDERA_OPERATOR_ID ||
      !env.HEDERA_OPERATOR_KEY ||
      !env.HCS_TOPIC_ID ||
      !env.MEMORA_REGISTRY_CONTRACT_ID ||
      !env.KEY_BROKER_BASE_URL
    ) {
      return res.status(503).json({ error: "write not configured" });
    }
    try {
      const result = await handleWrite(payload, agent_id, task_id, {
        HEDERA_NETWORK: env.HEDERA_NETWORK || "testnet",
        HEDERA_OPERATOR_ID: env.HEDERA_OPERATOR_ID,
        HEDERA_OPERATOR_KEY: env.HEDERA_OPERATOR_KEY,
        HEDERA_EVM_RPC_URL: env.HEDERA_EVM_RPC_URL || "https://testnet.hashio.io/api",
        HCS_TOPIC_ID: env.HCS_TOPIC_ID,
        MEMORA_REGISTRY_CONTRACT_ID: env.MEMORA_REGISTRY_CONTRACT_ID,
        PINATA_JWT: env.PINATA_JWT,
        KEY_BROKER_BASE_URL: env.KEY_BROKER_BASE_URL,
      });
      res.json(result);
    } catch (e) {
      console.error("write error:", e);
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
