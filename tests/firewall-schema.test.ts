import { describe, expect, it } from "vitest";
import { FirewallCheckRequestSchema } from "@/lib/schemas/firewall";

describe("FirewallCheckRequestSchema", () => {
  it("requires amountUsd for BUY", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({ ticker: "NVDA", intent: "BUY" }).success,
    ).toBe(false);
  });

  it("rejects tokenAmount for BUY", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        intent: "BUY",
        amountUsd: "1000",
        tokenAmount: "4.5",
      }).success,
    ).toBe(false);
  });

  it("accepts SELL with exact tokenAmount", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        intent: "SELL",
        tokenAmount: "4.5",
      }).success,
    ).toBe(true);
  });

  it("accepts SELL with amountUsd fallback", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        intent: "SELL",
        amountUsd: "1000",
      }).success,
    ).toBe(true);
  });

  it("accepts COLLATERAL with exact tokenAmount", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        intent: "COLLATERAL",
        tokenAmount: "4.5",
      }).success,
    ).toBe(true);
  });

  it("accepts HOLD without a position size", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({ ticker: "NVDA", intent: "HOLD" }).success,
    ).toBe(true);
  });

  it("accepts HOLD with tokenAmount", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        intent: "HOLD",
        tokenAmount: "4.5",
      }).success,
    ).toBe(true);
  });

  it("rejects amountUsd and tokenAmount together outside BUY", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        intent: "SELL",
        amountUsd: "1000",
        tokenAmount: "4.5",
      }).success,
    ).toBe(false);
  });

  it("rejects ticker and contractAddress together", () => {
    expect(
      FirewallCheckRequestSchema.safeParse({
        ticker: "NVDA",
        contractAddress: "0xa9ee28c80f960b889dfbd1902055218cba016f75",
        intent: "HOLD",
      }).success,
    ).toBe(false);
  });
});
