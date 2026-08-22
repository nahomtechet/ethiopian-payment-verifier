import { PaymentProvider, BankMetadata, CBE, Telebirr, Dashen, Awash, BOA, Zemen, BANKS } from './banks.js';
import { DuplicateStore, BlacklistStore } from './stores.js';

export { PaymentProvider, BankMetadata, CBE, Telebirr, Dashen, Awash, BOA, Zemen, BANKS };
export { DuplicateStore, BlacklistStore };
export * from './errors.js';
export * from './stores.js';

/**
 * The result of parsing a bank SMS notification offline.
 * All fields are extracted using regex rules — no network calls are made.
 */
export interface ParseResult {
  /** The detected payment provider (e.g. `'cbe'`, `'telebirr'`) or `'unknown'`. */
  provider: PaymentProvider | 'unknown';
  /** Transaction reference or ID extracted from the SMS (e.g. `'FT260821ABCD'`). */
  transactionId: string | null;
  /** Amount transferred in ETB. */
  amount: number | null;
  /** Currency code. Always `'ETB'` for Ethiopian providers. */
  currency: string;
  /** Sender name or phone number if present in the SMS. */
  sender: string | null;
  /** Receiver name or phone number if present in the SMS. */
  receiver: string | null;
  /** ISO 8601 date string of the transaction, if present in the SMS. */
  date: string | null;
  /** Account balance after the transaction, if present. */
  balance: number | null;
  /** The raw original SMS text. */
  raw: string;
}

/**
 * The authoritative result returned by online bank/wallet portal verification.
 * This is the source of truth — never rely on SMS data alone.
 */
export interface VerificationResult {
  payer_name?: string | null;
  payer_phone?: string | null;
  payer_account?: string | null;
  receiver_name?: string | null;
  receiver_account?: string | null;
  /** Amount in ETB as recorded by the bank. */
  amount: number | null;
  currency: string;
  /** ISO 8601 date string as recorded by the bank. */
  date: string | null;
  /** The canonical transaction reference ID from the bank. */
  reference: string;
  /** Transaction outcome: `'SUCCESS'`, `'FAILED'`, or `'PENDING'`. */
  status: string;
  /** Raw key-value details scraped from the bank portal. */
  rawDetails: Record<string, any>;
}

/**
 * A per-field check entry in a `VerificationReport`.
 * @since 2.0.0
 */
export interface FieldCheck {
  /** Whether this field passed its validation rule. */
  passed: boolean;
  /** Expected value (if configured by the developer). */
  expected?: any;
  /** Received value from the online verification result. */
  received?: any;
  /** Additional context specific to this check. */
  detail?: string;
}

/**
 * The rich structured result of `verifyDetails()`.
 * Replaces the old `{ verified: boolean; reasons: string[] }` shape while remaining backward-compatible
 * (both `verified` and `reasons` fields are still present).
 *
 * @since 2.0.0
 *
 * @example
 * const report = verifier.verifyDetails(result, { amount: 5000, maxAgeMinutes: 120 });
 * console.log(report.score);         // 85
 * console.log(report.risk);          // 'LOW'
 * console.log(report.checks.amount); // { passed: true, expected: 5000, received: 5000 }
 */
export interface VerificationReport {
  /** `true` only if ALL configured checks passed. */
  verified: boolean;
  /**
   * Confidence score from 0 to 100.
   * - 90–100: Very low risk, highly trusted.
   * - 60–89: Some checks failed, review recommended.
   * - 0–59: High risk, likely invalid or tampered.
   */
  score: number;
  /** Risk level derived from the score. */
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Per-field breakdown of each validation check. */
  checks: {
    status: FieldCheck;
    amount: FieldCheck;
    receiverName: FieldCheck;
    receiverAccount: FieldCheck;
    age: FieldCheck & { ageMinutes?: number; maxAllowed?: number };
  };
  /** Human-readable list of reasons why verification failed (empty if verified). */
  reasons: string[];
}

/**
 * Result of a cross-check between offline SMS parse and the authoritative online result.
 * Detects if the SMS text was tampered/fabricated by a bad actor.
 * @since 2.0.0
 */
export interface CrossCheckResult {
  /** `true` only if online verification passed AND SMS data matches online data. */
  trusted: boolean;
  /** Specific fields where the SMS data contradicts the online verified data. */
  tampered: string[];
  /** The authoritative online result (source of truth). */
  onlineResult: VerificationResult;
  /** The raw offline SMS parse (potentially faked). */
  smsResult: ParseResult;
}

/**
 * Webhook configuration for automatic result dispatch on successful verification.
 * @since 2.0.0
 */
export interface WebhookOptions {
  /** The HTTPS URL to POST the verified result to. */
  url: string;
  /**
   * Optional HMAC-SHA256 signing secret.
   * When provided, every webhook POST will include an `X-EPV-Signature: sha256=<hmac>` header.
   * Use `verifyWebhookSignature()` on your server to validate incoming requests.
   */
  secret?: string;
  /** Optional extra HTTP headers to include in webhook requests. */
  headers?: Record<string, string>;
}

/**
 * Configuration options for `PaymentVerifier`.
 * All options are optional — sensible defaults are applied if not set.
 */
export interface VerifierOptions {
  /**
   * HTTP request timeout in milliseconds.
   * @default 10000 (10 seconds)
   */
  timeout?: number;

  /**
   * HTTP/HTTPS proxy URL for routing online verification requests.
   * Required when running outside Ethiopia (e.g., on Vercel, AWS, Render).
   * @example 'http://196.189.x.x:8080'
   */
  proxy?: string;

  /**
   * Custom `User-Agent` header sent to bank portals.
   * @default 'ethiopian-payment-verifier/2.0.0'
   */
  userAgent?: string;

  /**
   * Maximum receipt age in minutes. Receipts older than this threshold are considered expired.
   * @default 1440 (24 hours)
   */
  maxAgeMinutes?: number;

  /**
   * Enables duplicate transaction detection to prevent double-spend fraud.
   * - `true`: Uses a built-in `InMemoryDuplicateStore` (data lost on restart).
   * - `DuplicateStore`: Your own persistent store adapter.
   * @since 2.0.0
   */
  duplicateGuard?: boolean | DuplicateStore;

  /**
   * Blocks known fraudulent senders or accounts before hitting the bank portal.
   * - `string[]`: A static list of phone numbers or account IDs to block.
   * - `BlacklistStore`: Your own dynamic store adapter.
   * @since 2.0.0
   */
  blacklist?: string[] | BlacklistStore;

  /**
   * Automatically dispatch verified results to a webhook URL.
   * Supports HMAC-SHA256 payload signing.
   * @since 2.0.0
   */
  webhook?: WebhookOptions;

  /**
   * Callback fired automatically when a transaction verifies as `SUCCESS`.
   * Use this to save results to your database without extra code.
   * @param result - The verified payment result.
   */
  onSuccess?: (result: VerificationResult) => void | Promise<void>;

  /**
   * Transform the raw `VerificationResult` into any custom shape before returning.
   * When set, `verifyOnline()` returns `T` instead of `VerificationResult`.
   * @param result - The raw verified result.
   * @returns Your custom data shape.
   */
  mapResult?: <T = any>(result: VerificationResult) => T;
}
