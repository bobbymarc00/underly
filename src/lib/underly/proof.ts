import crypto from "node:crypto";

export function buildProof(payloadWithoutProof: unknown) {
  const canonical = JSON.stringify(payloadWithoutProof);
  const hash = crypto.createHash("sha256").update(canonical).digest("hex");
  return {
    proofId: `up_${hash.slice(0, 16)}`,
    schemaVersion: "underly-proof-v1",
    generatedAt: new Date().toISOString(),
    dataHash: `sha256:${hash}`,
  };
}
