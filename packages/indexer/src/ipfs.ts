/**
 * Upload JSON to IPFS via Pinata (or similar). Returns CID.
 */

export async function uploadToIpfs(
  body: string | object,
  env: { PINATA_JWT?: string; PINATA_API_URL?: string }
): Promise<string> {
  const url = env.PINATA_API_URL || "https://api.pinata.cloud/pinning/pinJSONToIPFS";
  const jwt = env.PINATA_JWT;
  if (!jwt) {
    throw new Error("PINATA_JWT required for IPFS upload");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Pinata upload failed: ${res.status} ${t}`);
  }
  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) throw new Error("Pinata response missing IpfsHash");
  return data.IpfsHash;
}
