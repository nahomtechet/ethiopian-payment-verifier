import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';

/**
 * Abstract base class for all payment provider parsers.
 * Extend this class to add support for a new Ethiopian bank or wallet provider.
 *
 * @example
 * import { BaseParser, ParseResult, VerificationResult } from 'ethiopian-payment-verifier';
 *
 * export class NibBankParser extends BaseParser {
 *   readonly providerName = 'nib';
 *
 *   matches(input: string): boolean {
 *     return /nib\s*bank|NBE[A-Z0-9]+/i.test(input);
 *   }
 *
 *   parseSMS(text: string): ParseResult {
 *     // Extract fields using regex...
 *     return { provider: 'nib' as any, transactionId: null, amount: null, ... };
 *   }
 *
 *   async verifyOnline(input: string): Promise<VerificationResult> {
 *     // Fetch and scrape the bank portal...
 *   }
 * }
 *
 * // Register with the verifier:
 * verifier.registerParser(new NibBankParser());
 *
 * @since 1.0.0
 */
export abstract class BaseParser {
  /**
   * The unique lowercase slug identifying this provider.
   * Used by `detectProvider()` and throughout the routing logic.
   * @example 'cbe', 'telebirr', 'nib'
   */
  abstract readonly providerName: string;

  /**
   * Parses transaction details offline from an SMS notification body.
   * Must not make any network calls — extract data using regex only.
   *
   * @param smsText - The full SMS text body received by the customer.
   * @returns Extracted transaction fields, with `null` for fields not found.
   */
  abstract parseSMS(smsText: string): ParseResult;

  /**
   * Verifies a transaction online by fetching and scraping the provider's receipt portal.
   *
   * @param input - A transaction reference ID or receipt URL.
   * @param options - Optional configuration (timeout, proxy, userAgent).
   * @returns The authoritative verified result from the bank portal.
   * @throws {OnlineVerificationError} If the portal fetch fails.
   */
  abstract verifyOnline(input: string, options?: VerifierOptions): Promise<VerificationResult>;

  /**
   * Quick heuristic check to determine if an input (SMS text, URL, or reference ID)
   * belongs to this provider. Should be fast and run no network calls.
   *
   * @param input - The raw input string to test.
   * @returns `true` if this parser can handle the input.
   */
  abstract matches(input: string): boolean;

  /**
   * Helper to build a standard FAILED verification result.
   * Use this as a default return value when scraping cannot extract data.
   *
   * @param reference - The transaction reference ID.
   * @param details - Optional raw details map from the portal.
   * @returns A `VerificationResult` with `status: 'FAILED'` and all fields set to `null`.
   */
  protected createUnverifiedResult(reference: string, details: Record<string, string> = {}): VerificationResult {
    return {
      payer_name: null,
      payer_account: null,
      receiver_name: null,
      receiver_account: null,
      amount: null,
      currency: 'ETB',
      date: null,
      reference,
      status: 'FAILED',
      rawDetails: details
    };
  }
}
