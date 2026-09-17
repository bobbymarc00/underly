import type { RwaProfile } from "@/lib/binance/rwa";

export function attestationStatus(value: boolean | undefined): "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN" {
  if (value === true) return "AVAILABLE";
  if (value === false) return "UNAVAILABLE";
  return "UNKNOWN";
}

export function buildPassport(platform: string, profile: RwaProfile) {
  const daily = profile.protections?.dailyAttestationReport?.supported;
  const monthly = profile.protections?.monthlyAttestationReport?.supported;
  const dailyStatus = attestationStatus(daily);
  const monthlyStatus = attestationStatus(monthly);

  const missing = [
    !profile.tokenToShareRatio ? "tokenShareRatio" : null,
    dailyStatus === "UNKNOWN" ? "dailyAttestation" : null,
    monthlyStatus === "UNKNOWN" ? "monthlyAttestation" : null,
  ].filter(Boolean);

  return {
    provider: platform,
    attestation: {
      daily: dailyStatus,
      monthly: monthlyStatus,
      dailyUrl: profile.protections?.dailyAttestationReport?.url ?? null,
      monthlyUrl: profile.protections?.monthlyAttestationReport?.url ?? null,
    },
    dataCompleteness: missing.length ? "PARTIAL" : "COMPLETE",
    missingFields: missing,
  };
}
