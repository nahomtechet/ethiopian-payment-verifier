import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount } from '../utils.js';

export class MPESAParser extends BaseParser {
  readonly providerName = 'mpesa';

  matches(input: string): boolean {
    return /m-?pesa|safaricom/i.test(input) || /^[A-Z0-9]{10}$/i.test(input); // M-PESA receipts usually have a 10 char alphanumeric ID
  }

  parseSMS(smsText: string): ParseResult {
    // M-PESA reference pattern: e.g. QKT5D3C4E5 Confirmed.
    const refMatch = smsText.match(/^([A-Z0-9]{10})\s+Confirmed/i) || smsText.match(/\b([A-Z0-9]{10})\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/Ksh\s*([\d,]+\.\d{2})/i) || smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})/i) || smsText.match(/([\d,]+\.\d{2})\s*(?:ETB|Birr|Ksh)/i);
    const amount = amountMatch ? cleanAmount(amountMatch[1] || amountMatch[2] || amountMatch[3]) : null;

    // Detect sender from something like "You have received Ksh 500 from John Doe 07..."
    let sender = null;
    const senderMatch = smsText.match(/from\s+([a-zA-Z\s]+)\s+\d{9,}/i);
    if (senderMatch) {
        sender = senderMatch[1].trim();
    }

    return {
      provider: 'mpesa',
      transactionId,
      amount,
      currency: /Ksh/i.test(smsText) ? 'KES' : 'ETB',
      sender,
      receiver: null,
      date: null,
      balance: null,
      raw: smsText
    };
  }

  async verifyOnline(input: string, options: VerifierOptions = {}): Promise<VerificationResult> {
    const transactionId = input.trim().toUpperCase();
    return this.createUnverifiedResult(transactionId, { 
      note: 'Online verification for M-PESA requires the Daraja API with OAuth credentials.' 
    });
  }
}
