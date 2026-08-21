import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';

export abstract class BaseParser {
  abstract readonly providerName: string;

  /**
   * Parse transaction details offline from an SMS notification body.
   */
  abstract parseSMS(smsText: string): ParseResult;

  /**
   * Online receipt verification using verification URLs or reference codes.
   */
  abstract verifyOnline(input: string, options?: VerifierOptions): Promise<VerificationResult>;

  /**
   * Quick heuristic check to determine if an input (SMS or URL) belongs to this provider.
   */
  abstract matches(input: string): boolean;

  /**
   * Helper to structure a default unverified response.
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
