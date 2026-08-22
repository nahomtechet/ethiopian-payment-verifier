import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount, parseDate } from '../utils.js';

export class HibretParser extends BaseParser {
  readonly providerName = 'hibret';

  matches(input: string): boolean {
    return /hibret|united\s*bank/i.test(input) || /HBR[A-Z0-9]+/i.test(input);
  }

  parseSMS(smsText: string): ParseResult {
    const refMatch = smsText.match(/ref\s*[:\-]?\s*([A-Z0-9]+)/i) || smsText.match(/\b(HBR[A-Z0-9]{8,})\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/(?:amount|ETB|Birr)\s*[:\-]?\s*([\d,]+\.\d{2})/i) || smsText.match(/([\d,]+\.\d{2})\s*(?:ETB|Birr)/i);
    const amount = amountMatch ? cleanAmount(amountMatch[1] || amountMatch[2]) : null;

    return {
      provider: 'hibret',
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
      note: 'Online verification for Hibret Bank requires API credentials.' 
    });
  }
}
