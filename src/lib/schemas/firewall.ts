import { z } from "zod";

const positiveDecimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "must be a decimal string")
  .refine((value) => !/^0+(?:\.0+)?$/.test(value), {
    message: "must be greater than zero",
  });

export const FirewallCheckRequestSchema = z
  .object({
    ticker: z.string().trim().min(1).max(20).optional(),
    contractAddress: z
      .string()
      .trim()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
    intent: z.enum(["BUY", "HOLD", "SELL", "COLLATERAL"]),
    amountUsd: positiveDecimalString.optional(),
    tokenAmount: positiveDecimalString.optional(),
    platform: z.enum(["ondo", "bstock"]).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.ticker && !value.contractAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ticker or contractAddress is required",
        path: ["ticker"],
      });
    }

    if (value.ticker && value.contractAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide ticker or contractAddress, not both",
        path: ["contractAddress"],
      });
    }

    if (value.intent === "BUY") {
      if (!value.amountUsd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "amountUsd is required for BUY intent",
          path: ["amountUsd"],
        });
      }
      if (value.tokenAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tokenAmount is not accepted for BUY intent",
          path: ["tokenAmount"],
        });
      }
      return;
    }

    if (value.amountUsd && value.tokenAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide amountUsd or tokenAmount, not both",
        path: ["tokenAmount"],
      });
    }

    if (
      (value.intent === "SELL" || value.intent === "COLLATERAL") &&
      !value.amountUsd &&
      !value.tokenAmount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.intent} requires amountUsd or tokenAmount`,
        path: ["amountUsd"],
      });
    }
  });

export type FirewallCheckRequest = z.infer<typeof FirewallCheckRequestSchema>;
