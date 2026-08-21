import { PaymentProvider, BankMetadata, CBE, Telebirr, Dashen, Awash, BOA, Zemen, BANKS } from './banks.js';

export { PaymentProvider, BankMetadata, CBE, Telebirr, Dashen, Awash, BOA, Zemen, BANKS };

export interface ParseResult {
  provider: PaymentProvider | 'unknown';
  transactionId: string | null;
  amount: number | null;
  currency: string;
  sender: string | null;
  receiver: string | null;
  date: string | null;
  balance: number | null;
  raw: string;
}

export interface VerificationResult {
  payer_name?: string | null;
  payer_phone?: string | null;
  payer_account?: string | null;
  receiver_name?: string | null;
  receiver_account?: string | null;
  amount: number | null;
  currency: string;
  date: string | null;
  reference: string;
  status: string; // "SUCCESS" | "FAILED" | etc.
  rawDetails: Record<string, any>;
}

export interface VerifierOptions {
  proxy?: string;
  timeout?: number;
  userAgent?: string;
  maxAgeMinutes?: number;
  onSuccess?: (result: VerificationResult) => void | Promise<void>;
  mapResult?: <T = any>(result: VerificationResult) => T;
}
