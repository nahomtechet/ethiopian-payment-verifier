import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount, normalizeName, parseDate } from '../utils.js';

export class WegagenParser extends BaseParser {
  readonly providerName = 'wegagen';

  matches(input: string): boolean {
    return /wegagen/i.test(input) || /WGB[A-Z0-9]+/i.test(input);
  }

  parseSMS(smsText: string): ParseResult {
    // Typical Wegagen SMS
    const refMatch = smsText.match(/ref(?:erence)?\s*[:\-]?\s*([A-Z0-9]+)/i) || smsText.match(/\b(WGB[A-Z0-9]{8,})\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})|([\d,]+\.\d{2})\s*(?:ETB|Birr)/i);
    const amount = amountMatch ? cleanAmount(amountMatch[1] || amountMatch[2]) : null;

    const dateMatch = smsText.match(/\b\d{1,2}[/\-]\d{1,2}[/\-]\d{4}\b/);
    const date = dateMatch ? parseDate(dateMatch[0]) : null;

    return {
      provider: 'wegagen',
      transactionId,
      amount,
      currency: 'ETB',
      sender: null,
      receiver: null,
      date,
      balance: null,
      raw: smsText
    };
  }

  async verifyOnline(input: string, options: VerifierOptions = {}): Promise<VerificationResult> {
    const transactionId = input.trim().toUpperCase();
    
    // For Wegagen, since there's no public open portal without auth known universally,
    // this acts as a stub that can be expanded if an API becomes available.
    // In a real scenario, this would use `utils.request` to hit the portal.
    return this.createUnverifiedResult(transactionId, { 
      note: 'Online verification for Wegagen Bank requires API credentials.' 
    });
  }
}
