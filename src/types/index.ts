export type Intent = "BUY" | "HOLD" | "SELL" | "COLLATERAL";
export type CheckState = "PASS" | "WARN" | "BLOCKED" | "UNKNOWN" | "NOT_APPLICABLE";
export type FindingSeverity = "info" | "warning" | "critical" | "unknown";

export interface Finding {
  code: string;
  severity: FindingSeverity;
  title: string;
  message: string;
  evidence?: Record<string, string | number | boolean | null>;
}
