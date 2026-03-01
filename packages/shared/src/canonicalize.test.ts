import { describe, it, expect } from "vitest";
import { canonicalizePayload } from "./canonicalize.js";
import { hashPayload } from "./crypto.js";
import type { MemoryPayload } from "./types.js";

describe("canonicalizePayload", () => {
  it("produces stable output for same payload", () => {
    const p: MemoryPayload = {
      contentType: "application/json",
      content: { foo: "bar", num: 42 },
      tags: ["a", "b"],
    };
    const a = canonicalizePayload(p);
    const b = canonicalizePayload({ ...p });
    expect(a).toBe(b);
  });

  it("key order does not affect output", () => {
    const p1: MemoryPayload = {
      contentType: "text/plain",
      content: "hello",
      tags: ["z", "a"],
    };
    const p2: MemoryPayload = {
      contentType: "text/plain",
      content: "hello",
      tags: ["a", "z"],
    };
    expect(canonicalizePayload(p1)).toBe(canonicalizePayload(p2));
  });

  it("different content produces different output", () => {
    const a = canonicalizePayload({
      contentType: "text/plain",
      content: "alpha",
    });
    const b = canonicalizePayload({
      contentType: "text/plain",
      content: "beta",
    });
    expect(a).not.toBe(b);
  });
});

describe("hashPayload", () => {
  it("same canonical string gives same hash", () => {
    const s = '{"content":"x","contentType":"text/plain","schemaVersion":1}';
    expect(hashPayload(s)).toBe(hashPayload(s));
  });

  it("different string gives different hash", () => {
    expect(hashPayload("a")).not.toBe(hashPayload("b"));
  });

  it("hash is 64 hex chars (sha256)", () => {
    const h = hashPayload("test");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});
