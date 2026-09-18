import { z } from "zod";

const positiveDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a decimal string")
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), {
    message: "must be greater than zero",
  });

const nonNegativeDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a non-negative decimal string");

const slippagePercent = positiveDecimalString.refine(
  (value) => Number(value) <= 5,
  { message: "must be less than or equal to 5" },
);

export const PreflightRequestSchema = z.object({
  ticker: z.string().trim().min(1).max(20),
  amountUsd: positiveDecimalString,
  walletAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  maxReferenceGapPct: nonNegativeDecimalString.optional(),
  slippagePercent: slippagePercent.default("0.5"),
});

export type PreflightRequest = z.infer<typeof PreflightRequestSchema>;
