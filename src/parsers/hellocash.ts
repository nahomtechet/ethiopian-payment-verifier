import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount } from '../utils.js';

export class HelloCashParser extends BaseParser {
  readonly providerName = 'hellocash';

  matches(input: string): boolean {
    return /hellocash/i.test(input) || /HC[A-Z0-9]+/i.test(input);
  }

  parseSMS(smsText: string): ParseResult {
    const refMatch = smsText.match(/ref(?:erence)?\s*[:\-]?\s*([A-Z0-9]+)/i) || smsText.match(/\b(HC[A-Z0-9]{8,})\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})|([\d,]+\.\d{2})\s*(?:ETB|Birr)/i);
    const amount = amountMatch ? cleanAmount(amountMatch[1] || amountMatch[2]) : null;

    return {
      provider: 'hellocash',
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
      note: 'Online verification for HelloCash requires API credentials.' 
    });
  }
}
