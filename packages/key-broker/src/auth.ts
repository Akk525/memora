/**
 * Challenge/response: verify that requester owns the private key for the given address.
 * GET /challenge?memory_id=...&requester=0x... returns a nonce; POST /keys sends signature.
 */

import { ethers } from "ethers";

const CHALLENGE_PREFIX = "Memora key access: ";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const challenges = new Map<string, { nonce: string; expires: number }>();

export function createChallenge(memoryId: string, requester: string): string {
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const key = `${memoryId}:${requester.toLowerCase()}`;
  challenges.set(key, { nonce, expires: Date.now() + CHALLENGE_TTL_MS });
  return nonce;
}

export function getChallengeMessage(nonce: string): string {
  return CHALLENGE_PREFIX + nonce;
}

export function verifySignature(
  requesterAddress: string,
  message: string,
  signature: string
): boolean {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === requesterAddress.toLowerCase();
  } catch {
    return false;
  }
}

export function consumeChallenge(memoryId: string, requester: string, nonce: string): boolean {
  const key = `${memoryId}:${requester.toLowerCase()}`;
  const c = challenges.get(key);
  if (!c) return false;
  if (Date.now() > c.expires) {
    challenges.delete(key);
    return false;
  }
  if (c.nonce !== nonce) return false;
  challenges.delete(key);
  return true;
}
