/**
 * MemoraClient: cloud mode (calls indexer + key-broker + IPFS gateway).
 */

import {
  canonicalizePayload,
  hashPayload,
  decrypt,
  type MemoryPayload,
  type MemoryRef,
  type EncryptedPayloadBundle,
  type AccessPolicySummary,
} from "./shared/index.js";

export interface MemoraClientConfig {
  indexerBaseUrl: string;
  keyBrokerBaseUrl: string;
  /** IPFS gateway for fetching ciphertext by CID (e.g. https://gateway.pinata.cloud/ipfs/) */
  ipfsGatewayUrl?: string;
}

export interface WriteOptions {
  agentId: string;
  contentType: string;
  content: unknown;
  tags?: string[];
  taskId?: string;
  access?: AccessPolicySummary;
}

export interface WriteReceipt {
  memory_id: string;
  cid_ciphertext: string;
  payload_hash: string;
  hcs_topic_id: string;
  contract_tx_hash: string;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

export class MemoraClient {
  constructor(private config: MemoraClientConfig) {}

  /** Write memory via indexer POST /write (cloud mode). */
  async write(options: WriteOptions): Promise<WriteReceipt> {
    const payload: MemoryPayload = {
      contentType: options.contentType,
      content: options.content,
      tags: options.tags,
      taskId: options.taskId,
      access: options.access,
    };
    const res = await fetch(`${this.config.indexerBaseUrl}/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload,
        agent_id: options.agentId,
        task_id: options.taskId,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || String(err));
    }
    return res.json() as Promise<WriteReceipt>;
  }

  /** Query memories by agent_id and/or task_id. */
  async query(params: { agentId?: string; taskId?: string; limit?: number; offset?: number }): Promise<MemoryRef[]> {
    const q = new URLSearchParams();
    if (params.agentId) q.set("agent_id", params.agentId);
    if (params.taskId) q.set("task_id", params.taskId);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    const res = await fetch(`${this.config.indexerBaseUrl}/memories?${q}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  /**
   * Read memory: fetch ref from indexer, ciphertext from IPFS, key from key-broker (with challenge/signature),
   * decrypt and verify payload_hash.
   */
  async read(
    memoryId: string,
    signMessage: (message: string) => Promise<string>,
    requesterAddress: string
  ): Promise<MemoryPayload> {
    const ref = await this.getRef(memoryId);
    let gateway = this.config.ipfsGatewayUrl || "https://gateway.pinata.cloud/ipfs/";
    if (!/^https?:\/\//i.test(gateway)) gateway = "https://" + gateway;
    gateway = gateway.replace(/\/?$/, "/");
    const cid = ref.cid_ciphertext.replace(/^ipfs:\/\//, "");
    const ctRes = await fetch(`${gateway}${cid}`);
    if (!ctRes.ok) throw new Error(`Failed to fetch IPFS: ${ctRes.status}`);
    const bundle = (await ctRes.json()) as EncryptedPayloadBundle;

    const challengeRes = await fetch(
      `${this.config.keyBrokerBaseUrl}/challenge?memory_id=${encodeURIComponent(memoryId)}&requester=${encodeURIComponent(requesterAddress)}`
    );
    if (!challengeRes.ok) throw new Error("Failed to get challenge");
    const challengeData = (await challengeRes.json()) as { nonce: string; message: string };
    const signature = await signMessage(challengeData.message);

    const keyRes = await fetch(`${this.config.keyBrokerBaseUrl}/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memory_id: memoryId,
        requester: requesterAddress,
        signature,
        challenge: challengeData.nonce,
      }),
    });
    if (!keyRes.ok) {
      const err = await keyRes.json().catch(() => ({}));
      throw new Error(err.error || "Key release denied");
    }
    const keyData = (await keyRes.json()) as { key: string };
    const key = Buffer.from(keyData.key, "base64");
    const plaintext = decrypt(bundle, key);
    const payload = JSON.parse(plaintext) as MemoryPayload;
    const canonical = canonicalizePayload(payload);
    const computedHash = hashPayload(canonical);
    const expectedHash = ref.payload_hash.startsWith("0x") ? ref.payload_hash.slice(2) : ref.payload_hash;
    if (computedHash !== expectedHash) {
      throw new Error("Payload hash mismatch: tampered or corrupted");
    }
    return payload;
  }

  /** Verify: fetch ref, optionally verify hash matches (and HCS inclusion). */
  async verify(memoryId: string, expectedPayloadHash?: string): Promise<VerifyResult> {
    try {
      const ref = await this.getRef(memoryId);
      if (expectedPayloadHash) {
        const expected = expectedPayloadHash.startsWith("0x") ? expectedPayloadHash.slice(2) : expectedPayloadHash;
        const stored = ref.payload_hash.startsWith("0x") ? ref.payload_hash.slice(2) : ref.payload_hash;
        if (expected !== stored) {
          return { valid: false, reason: "payload_hash mismatch" };
        }
      }
      if (!ref.contract_tx_hash) {
        return { valid: false, reason: "no contract_tx_hash" };
      }
      return { valid: true };
    } catch (e) {
      return { valid: false, reason: String(e) };
    }
  }

  private async getRef(memoryId: string): Promise<MemoryRef> {
    const res = await fetch(`${this.config.indexerBaseUrl}/memory/${encodeURIComponent(memoryId)}`);
    if (!res.ok) throw new Error("Memory not found");
    return res.json();
  }
}
