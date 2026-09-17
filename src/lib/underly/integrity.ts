import type { CheckState } from "@/types";

export function buildIntegrity(params: {
  tokenShareRatio?: string;
  referencePrice?: string;
  attestationAvailable: boolean | null;
}): {
  tokenShareRatioKnown: boolean;
  referenceAvailable: boolean;
  attestationAvailable: boolean | null;
  status: CheckState;
} {
  const tokenShareRatioKnown = Boolean(params.tokenShareRatio);
  const referenceAvailable = Boolean(params.referencePrice);

  let status: CheckState = "PASS";
  if (!tokenShareRatioKnown || !referenceAvailable || params.attestationAvailable === null) status = "UNKNOWN";
  if (params.attestationAvailable === false) status = "WARN";

  return { tokenShareRatioKnown, referenceAvailable, attestationAvailable: params.attestationAvailable, status };
}
