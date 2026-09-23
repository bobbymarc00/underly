import { z } from "zod";

const evmAddress = z
  .string()
  .trim()
  .regex(/^0x[a-fA-F0-9]{40}$/, "must be a valid EVM address")
  .refine(
    (value) =>
      value.toLowerCase() !==
      "0x0000000000000000000000000000000000000000",
    { message: "must not be the zero address" },
  );

const positiveRawAmount = z
  .string()
  .trim()
  .regex(/^[0-9]+$/, "must be a raw integer string")
  .refine((value) => !/^0+$/.test(value), {
    message: "must be greater than zero",
  });

const nonNegativeDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a non-negative decimal string");

const positiveDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a decimal string")
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), {
    message: "must be greater than zero",
  });

export const ExecutionReadinessRequestSchema = z
  .object({
    ticker: z.string().trim().min(1).max(20),
    wrapperContractAddress: evmAddress,
    walletAddress: evmAddress,
    amountRaw: positiveRawAmount,
    maxReferenceGapPct: nonNegativeDecimalString.optional(),
    slippagePercent: positiveDecimalString.refine(
      (value) => Number(value) <= 5,
      { message: "must be less than or equal to 5" },
    ),
  })
  .strict();

export type ExecutionReadinessRequest = z.infer<
  typeof ExecutionReadinessRequestSchema
>;
