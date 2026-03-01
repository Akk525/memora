/**
 * Check on-chain: is requester the owner of agent_id or a delegate?
 */

import { ethers } from "ethers";

const ABI = [
  "function ownerOfAgent(bytes32) view returns (address)",
  "function isDelegate(bytes32, address) view returns (bool)",
];

export async function canAccessKey(
  provider: ethers.Provider,
  contractAddress: string,
  agentIdBytes32: string,
  requesterAddress: string
): Promise<boolean> {
  const contract = new ethers.Contract(contractAddress, ABI, provider);
  const owner = await contract.ownerOfAgent(agentIdBytes32);
  if (owner === ethers.ZeroAddress) return false;
  if (owner.toLowerCase() === requesterAddress.toLowerCase()) return true;
  const isDel = await contract.isDelegate(agentIdBytes32, requesterAddress);
  return isDel;
}

export function agentIdToBytes32(agentId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(agentId));
}
