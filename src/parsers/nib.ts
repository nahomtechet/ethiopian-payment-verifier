import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount } from '../utils.js';

export class NibParser extends BaseParser {
  readonly providerName = 'nib';

  matches(input: string): boolean {
    return /nib\s*bank/i.test(input) || /NBE[A-Z0-9]+/i.test(input);
  }

  parseSMS(smsText: string): ParseResult {
    const refMatch = smsText.match(/ref(?:erence)?\s*[:\-]?\s*([A-Z0-9]+)/i) || smsText.match(/\b(NBE[A-Z0-9]{8,})\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})|([\d,]+\.\d{2})\s*(?:ETB|Birr)/i);
    const amount = amountMatch ? cleanAmount(amountMatch[1] || amountMatch[2]) : null;

    return {
      provider: 'nib',
      transactionId,
      amount,
      currency: 'ETB',
      sender: null,
      receiver: null,
      date: null,
      balance: null,
      raw: smsText
    };
  }

  async verifyOnline(input: string, options: VerifierOptions = {}): Promise<VerificationResult> {
    const transactionId = input.trim().toUpperCase();
    return this.createUnverifiedResult(transactionId, { 
      note: 'Online verification for Nib Bank requires API credentials.' 
    });
  }
}
