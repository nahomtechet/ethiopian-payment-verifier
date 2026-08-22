import { z } from 'zod';

/**
 * Zod schema for `ParseResult` from `parseSMS()`.
 * Use this to validate offline parsing results in your API layer.
 * @since 2.3.0
 */
export const ParseResultSchema = z.object({
  provider: z.string(),
  transactionId: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string(),
  sender: z.string().nullable(),
  receiver: z.string().nullable(),
  date: z.string().nullable(),
  balance: z.number().nullable(),
  raw: z.string()
});

/**
 * Zod schema for `VerificationResult` from `verifyOnline()`.
 * Use this to validate the raw payload retrieved from bank portals.
 * @since 2.3.0
 */
export const VerificationResultSchema = z.object({
  payer_name: z.string().nullable().optional(),
  payer_phone: z.string().nullable().optional(),
  payer_account: z.string().nullable().optional(),
  receiver_name: z.string().nullable().optional(),
  receiver_account: z.string().nullable().optional(),
  amount: z.number().nullable(),
  currency: z.string(),
  date: z.string().nullable(),
  reference: z.string(),
  status: z.string(),
  rawDetails: z.record(z.string(), z.any())
});

/**
 * Zod schema for a single field check in a VerificationReport.
 * @since 2.3.0
 */
const FieldCheckSchema = z.object({
  passed: z.boolean(),
  expected: z.any().optional(),
  received: z.any().optional(),
  detail: z.string().optional()
});

/**
 * Zod schema for the rich `VerificationReport` from `verifyDetails()`.
 * Use this to strongly type your API response payloads when returning verification outcomes.
 * @since 2.3.0
 */
export const VerificationReportSchema = z.object({
  verified: z.boolean(),
  score: z.number(),
  risk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  checks: z.object({
    status: FieldCheckSchema,
    amount: FieldCheckSchema,
    receiverName: FieldCheckSchema,
    receiverAccount: FieldCheckSchema,
    age: FieldCheckSchema.extend({
      ageMinutes: z.number().optional(),
      maxAllowed: z.number().optional()
    })
  }),
  reasons: z.array(z.string())
});

/**
 * Zod schema for `CrossCheckResult` from `crossCheck()`.
 * @since 2.3.0
 */
export const CrossCheckResultSchema = z.object({
  trusted: z.boolean(),
  tampered: z.array(z.string()),
  onlineResult: VerificationResultSchema,
  smsResult: ParseResultSchema
});
