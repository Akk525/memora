/**
 * Parse HEDERA_OPERATOR_KEY for use with @hashgraph/sdk.
 * Supports DER hex, 64-char ECDSA hex (portal ECDSA accounts), and 64-char ED25519 hex.
 */

import { PrivateKey } from "@hashgraph/sdk";

export function parseOperatorKey(keyStr: string): PrivateKey {
  const hex = keyStr.startsWith("0x") ? keyStr.slice(2).trim() : keyStr.trim();
  if (!/^[0-9a-fA-F]+$/i.test(hex)) {
    return PrivateKey.fromStringDer(keyStr);
  }
  if (hex.length > 64 && hex.startsWith("30")) {
    return PrivateKey.fromStringDer(hex);
  }
  if (hex.length === 64) {
    try {
      return PrivateKey.fromStringECDSA(hex);
    } catch {
      return PrivateKey.fromStringED25519(hex);
    }
  }
  return PrivateKey.fromStringDer(hex);
}
