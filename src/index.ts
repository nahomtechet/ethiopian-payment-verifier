import { CBEParser } from './parsers/cbe.js';
import { TelebirrParser } from './parsers/telebirr.js';
import { DashenParser } from './parsers/dashen.js';
import { AwashParser } from './parsers/awash.js';
import { BOAParser } from './parsers/boa.js';
import { ZemenParser } from './parsers/zemen.js';
import { ParseResult, VerificationResult, VerifierOptions, PaymentProvider } from './types.js';

export * from './types.js';

import { cleanAmount, normalizeName, parseDate } from './utils.js';

const parsers = [
  new CBEParser(),
  new TelebirrParser(),
  new DashenParser(),
  new AwashParser(),
  new BOAParser(),
  new ZemenParser()
];

/**
 * Detect the payment provider from an SMS string, transaction ID, or verification URL.
 */
export function detectProvider(input: string): PaymentProvider | 'unknown' {
  for (const parser of parsers) {
    if (parser.matches(input)) {
      return parser.providerName as PaymentProvider;
    }
  }
  return 'unknown';
}

/**
 * Offline parse transaction information from SMS text.
 */
export function parseSMS(smsText: string): ParseResult {
  const provider = detectProvider(smsText);
  if (provider === 'unknown') {
    return {
      provider: 'unknown',
      transactionId: null,
      amount: null,
      currency: 'ETB',
      sender: null,
      receiver: null,
      date: null,
      balance: null,
      raw: smsText
    };
  }
  const parser = parsers.find(p => p.providerName === provider);
  return parser ? parser.parseSMS(smsText) : {
    provider: 'unknown',
    transactionId: null,
    amount: null,
    currency: 'ETB',
    sender: null,
    receiver: null,
    date: null,
    balance: null,
    raw: smsText
  };
}

/**
 * Online verify a transaction via URL or ID.
 */
export async function verifyOnline(input: string, options?: VerifierOptions): Promise<any> {
  const provider = detectProvider(input);
  if (provider === 'unknown') {
    throw new Error('Could not identify payment provider from input transaction ID or URL.');
  }
  const parser = parsers.find(p => p.providerName === provider);
  if (!parser) {
    throw new Error(`Parser for provider ${provider} not found.`);
  }
  const result = await parser.verifyOnline(input, options);

  if (result.status === 'SUCCESS' && options?.onSuccess) {
    try {
      await Promise.resolve(options.onSuccess(result));
    } catch (err) {
      console.error("onSuccess callback error:", err);
    }
  }

  if (options?.mapResult) {
    return options.mapResult(result);
  }

  return result;
}

/**
 * Scan an uploaded image screenshot for receipt details and verify it.
 */
export async function verifyImage(imageInput: string | Buffer, options?: VerifierOptions): Promise<any> {
  const { extractTextFromImage, extractReferenceFromText } = await import('./ocr.js');
  const text = await extractTextFromImage(imageInput);
  const refData = extractReferenceFromText(text);

  let lookupInput = refData.url || refData.reference;
  if (lookupInput) {
    try {
      return await verifyOnline(lookupInput, options);
    } catch (err: any) {
      // Fall back to offline parsing on network failures or bad transaction ID OCR
    }
  }

  // Fallback layout scanner for OCR text
  const parsed = parseSMS(text);
  
  // Scraped details directly from receipt layout lines
  let payerName = parsed.sender;
  let receiverName = parsed.receiver;
  let receiverAccount = null;
  let amount = parsed.amount;
  let date = parsed.date;

  // Scan layout lines
  const lines = text.split('\n')
    .flatMap(line => line.split('  '))
    .map(l => l.trim())
    .filter(l => l.length > 0);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Payer Name
    if (/Payer\s*Name/i.test(line)) {
      const match = line.match(/Payer\s*Name\s*(?:Name)?\s*(.+)/i) || (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (match && match[1]) {
        payerName = match[1].replace(/[^A-Za-z\s]/g, '').trim();
      }
    }
    
    // Receiver Name
    if (/Receiver\s*Name|Credited\s*Party\s*name/i.test(line)) {
      const match = line.match(/(?:Receiver\s*Name|Credited\s*Party\s*name)\s*(.+)/i) || (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (match && match[1]) {
        receiverName = match[1].replace(/[^A-Za-z\s]/g, '').trim();
      }
    }

    // Receiver Account
    if (/Receiver\s*Account|Credited\s*party\s*account/i.test(line)) {
      const match = line.match(/(?:Receiver\s*Account|Credited\s*party\s*account\s*no)\s*(.+)/i) || (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (match && match[1]) {
        receiverAccount = match[1].replace(/[^\d*]/g, '').trim();
      }
    }

    // Amount
    if (/Settled\s*Amount|Total\s*Paid\s*Amount|Amount/i.test(line)) {
      const match = line.match(/(?:Settled\s*Amount|Total\s*Paid\s*Amount|Amount)\s*(.+)/i) || (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (match && match[1]) {
        const cleanAmt = cleanAmount(match[1]);
        if (cleanAmt && !amount) amount = cleanAmt;
      }
    }

    // Date
    if (/Payment\s*date|Date/i.test(line)) {
      const match = line.match(/(?:Payment\s*date|Date)\s*(.+)/i) || (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (match && match[1] && !date) {
        const parsedDate = parseDate(match[1]);
        if (parsedDate) date = parsedDate;
      }
    }
  }

  // Additional regex check for amount in text if still null
  if (!amount) {
    const amtMatch = text.match(/([\d,]+(?:\.\d{2})?)\s*(?:ETB|Birr)/i);
    if (amtMatch) amount = cleanAmount(amtMatch[1]);
  }

  const finalResult = {
    payer_name: payerName,
    payer_account: null,
    receiver_name: receiverName,
    receiver_account: receiverAccount,
    amount: amount,
    currency: parsed.currency || 'ETB',
    date: date,
    reference: parsed.transactionId || (refData.reference ?? 'OCR_TXN'),
    status: amount !== null ? 'SUCCESS' : 'FAILED',
    rawDetails: { ocrText: text, parsed }
  };

  if (finalResult.status === 'SUCCESS' && options?.onSuccess) {
    try {
      await Promise.resolve(options.onSuccess(finalResult));
    } catch (err) {
      console.error("onSuccess callback error:", err);
    }
  }

  if (options?.mapResult) {
    return options.mapResult(finalResult);
  }

  return finalResult;
}

/**
 * Compares parsed receipt metadata against expected amount and receiver information.
 */
export function verifyDetails(
  result: VerificationResult,
  expected: { amount: number; receiverAccount?: string; receiverName?: string; maxAgeMinutes?: number; strictReceiverName?: boolean }
): { verified: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Validate Status
  if (result.status !== 'SUCCESS') {
    reasons.push(`Transaction status is ${result.status} (expected SUCCESS).`);
  }

  // Validate Amount
  if (result.amount === null || result.amount < expected.amount) {
    reasons.push(`Amount mismatch: Received ${result.amount ?? 0} ETB (expected at least ${expected.amount} ETB).`);
  }

  // Validate Receiver Account (Handling masking like 1********3485)
  if (expected.receiverAccount && result.receiver_account) {
    const cleanExpected = expected.receiverAccount.replace(/\D/g, '');
    const isMasked = result.receiver_account.includes('*');
    
    if (isMasked) {
      // Escape regex chars and map * to \d*
      const regexPattern = '^' + result.receiver_account
        .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace(/\\\*/g, '\\d*')
        + '$';
      const regex = new RegExp(regexPattern);
      if (!regex.test(cleanExpected)) {
        reasons.push(`Receiver account mismatch: Received ${result.receiver_account} (expected ${expected.receiverAccount}).`);
      }
    } else {
      const cleanResult = result.receiver_account.replace(/\D/g, '');
      if (cleanExpected !== cleanResult) {
        reasons.push(`Receiver account mismatch: Received ${result.receiver_account} (expected ${expected.receiverAccount}).`);
      }
    }
  }

  // Validate Receiver Name
  if (expected.receiverName && result.receiver_name) {
    if (expected.strictReceiverName) {
      if (expected.receiverName.trim().toLowerCase() !== result.receiver_name.trim().toLowerCase()) {
        reasons.push(`Receiver name mismatch (strict): Received "${result.receiver_name}" (expected "${expected.receiverName}").`);
      }
    } else {
      const cleanExpected = expected.receiverName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanResult = result.receiver_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!cleanExpected.includes(cleanResult) && !cleanResult.includes(cleanExpected)) {
        reasons.push(`Receiver name mismatch: Received "${result.receiver_name}" (expected "${expected.receiverName}").`);
      }
    }
  }

  // Validate Transaction Age Threshold (Expiry checking)
  if (expected.maxAgeMinutes && result.date) {
    try {
      const txTime = new Date(result.date).getTime();
      const now = Date.now();
      const diffMs = now - txTime;
      const diffMinutes = diffMs / (1000 * 60);

      if (!isNaN(txTime)) {
        if (diffMinutes > expected.maxAgeMinutes) {
          reasons.push(`Transaction expired: Receipt is ${Math.round(diffMinutes)} minutes old (maximum allowed age is ${expected.maxAgeMinutes} minutes).`);
        } else if (diffMinutes < -60) {
          reasons.push(`Transaction date is in the future: Receipt timestamp is ${result.date} (current time is ${new Date().toISOString()}).`);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return {
    verified: reasons.length === 0,
    reasons
  };
}

/**
 * Main unified client class for handling payment receipt extraction and verification.
 */
export class PaymentVerifier {
  private options: VerifierOptions;

  constructor(options: VerifierOptions = {}) {
    this.options = options;
  }

  detectProvider(input: string): PaymentProvider | 'unknown' {
    return detectProvider(input);
  }

  parseSMS(smsText: string): ParseResult {
    return parseSMS(smsText);
  }

  async verifyOnline(input: string, customOptions?: VerifierOptions): Promise<VerificationResult> {
    const mergedOptions = { ...this.options, ...customOptions };
    return verifyOnline(input, mergedOptions);
  }

  async verifyImage(imageInput: string | Buffer, customOptions?: VerifierOptions): Promise<VerificationResult> {
    const mergedOptions = { ...this.options, ...customOptions };
    return verifyImage(imageInput, mergedOptions);
  }

  verifyDetails(
    result: VerificationResult,
    expected: { amount: number; receiverAccount?: string; receiverName?: string; maxAgeMinutes?: number; strictReceiverName?: boolean }
  ): { verified: boolean; reasons: string[] } {
    return verifyDetails(result, expected);
  }
}
