/**
 * Stable JSON canonicalization for deterministic hashing (RFC 8785 style).
 * Ensures same payload always produces same bytes across machines.
 */

import type { MemoryPayload } from "./types.js";

const SCHEMA_VERSION = 1;

/**
 * Canonicalize MemoryPayload to a deterministic JSON string.
 * Keys sorted; no extra whitespace; consistent number/string encoding.
 */
export function canonicalizePayload(payload: MemoryPayload): string {
  const normalized: Record<string, unknown> = {
    contentType: payload.contentType,
    content: payload.content,
    schemaVersion: SCHEMA_VERSION,
  };
  if (payload.tags != null && payload.tags.length > 0) {
    normalized.tags = [...payload.tags].sort();
  }
  if (payload.taskId != null) {
    normalized.taskId = payload.taskId;
  }
  if (payload.access != null) {
    normalized.access = sortKeys(payload.access as Record<string, unknown>);
  }
  if (payload.meta != null) {
    normalized.meta = sortKeys(payload.meta);
  }
  return canonicalStringify(normalized);
}

/**
 * Recursively sort object keys and stringify deterministically.
 */
function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sortKeys(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * JSON.stringify with sorted keys for any object (recursive).
 */
function canonicalStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return obj ? "true" : "false";
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) return "null";
    return String(obj);
  }
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    const parts = obj.map((item) => canonicalStringify(item));
    return "[" + parts.join(",") + "]";
  }
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ":" + canonicalStringify(o[k]));
    return "{" + parts.join(",") + "}";
  }
  return "null";
}
