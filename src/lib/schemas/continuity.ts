import { z } from "zod";

const positiveDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a decimal string")
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), {
    message: "must be greater than zero",
  });

export const ContinuityRequestSchema = z.object({
  sourceContractAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/),
  sourceTokenAmount: positiveDecimalString,
  walletAddress: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

export type ContinuityRequest = z.infer<
  typeof ContinuityRequestSchema
>;