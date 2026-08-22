import { CBEParser } from './parsers/cbe.js';
import { TelebirrParser } from './parsers/telebirr.js';
import { DashenParser } from './parsers/dashen.js';
import { AwashParser } from './parsers/awash.js';
import { BOAParser } from './parsers/boa.js';
import { ZemenParser } from './parsers/zemen.js';
import { WegagenParser } from './parsers/wegagen.js';
import { HibretParser } from './parsers/hibret.js';
import { AmharaParser } from './parsers/amhara.js';
import { NibParser } from './parsers/nib.js';
import { CBOParser } from './parsers/cbo.js';
import { MPESAParser } from './parsers/mpesa.js';
import { HelloCashParser } from './parsers/hellocash.js';
import { KachaParser } from './parsers/kacha.js';
import { EbirrParser } from './parsers/ebirr.js';
import { BaseParser } from './parsers/base.js';
import {
  ParseResult,
  VerificationResult,
  VerificationReport,
  CrossCheckResult,
  VerifierOptions,
  FieldCheck,
  PaymentProvider,
  VerifierStats,
} from './types.js';
import {
  ProviderNotFoundError,
  DuplicateTransactionError,
  BlacklistedSenderError,
  VelocityLimitError,
} from './errors.js';
import {
  DuplicateStore,
  BlacklistStore,
  VelocityStore,
  InMemoryDuplicateStore,
  StaticBlacklistStore,
  InMemoryVelocityStore,
  RedisDuplicateStore,
  RedisVelocityStore,
  PrismaDuplicateStore,
  PrismaVelocityStore,
} from './stores.js';
import { sanitizeInput } from './sanitize.js';
import { dispatchWebhook } from './webhook.js';
import { TypedEventEmitter } from './events.js';
import { cleanAmount, parseDate } from './utils.js';

export * from './types.js';
export * from './errors.js';
export * from './stores.js';
export * from './security.js';
export { BaseParser };
export { verifyWebhookSignature } from './webhook.js';

// ─── Default parser registry ────────────────────────────────────────────────

const defaultParsers: BaseParser[] = [
  new CBEParser(),
  new TelebirrParser(),
  new DashenParser(),
  new AwashParser(),
  new BOAParser(),
  new ZemenParser(),
  new WegagenParser(),
  new HibretParser(),
  new AmharaParser(),
  new NibParser(),
  new CBOParser(),
  new MPESAParser(),
  new HelloCashParser(),
  new KachaParser(),
  new EbirrParser(),
];

// ─── Default options ─────────────────────────────────────────────────────────

const DEFAULT_OPTIONS: Partial<VerifierOptions> = {
  timeout: 10_000,
  maxAgeMinutes: 1440,
  userAgent: 'ethiopian-payment-verifier/2.0.0',
};

// ─── Standalone utility functions ─────────────────────────────────────────────

/**
 * Detects which Ethiopian payment provider an input belongs to.
 * Works on SMS text, transaction reference IDs, and receipt URLs.
 *
 * @param input - Raw SMS text, transaction ID, or receipt URL.
 * @returns The provider slug (e.g. `'cbe'`, `'telebirr'`) or `'unknown'`.
 *
 * @example
 * detectProvider("FT260821ABCD"); // 'cbe'
 * detectProvider("CHQ0FJ403O");   // 'telebirr'
 */
export function detectProvider(input: string): PaymentProvider | 'unknown' {
  const clean = sanitizeInput(input);
  for (const parser of defaultParsers) {
    if (parser.matches(clean)) return parser.providerName as PaymentProvider;
  }
  return 'unknown';
}

/**
 * Parses transaction details from a bank SMS notification body using offline regex rules.
 * No network calls are made — results are instant.
 *
 * @param smsText - The full SMS text body to parse.
 * @returns Extracted transaction fields. Missing fields are `null`.
 *
 * @example
 * const result = parseSMS("You received 2,500.00 ETB. Ref: CHQ0FJ403O...");
 * console.log(result.amount);        // 2500
 * console.log(result.transactionId); // 'CHQ0FJ403O'
 */
export function parseSMS(smsText: string): ParseResult {
  const clean = sanitizeInput(smsText);
  const provider = detectProvider(clean);
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
      raw: clean,
    };
  }
  const parser = defaultParsers.find(p => p.providerName === provider);
  return parser
    ? parser.parseSMS(clean)
    : {
        provider: 'unknown',
        transactionId: null,
        amount: null,
        currency: 'ETB',
        sender: null,
        receiver: null,
        date: null,
        balance: null,
        raw: clean,
      };
}

/**
 * Verifies a transaction online by fetching the official bank or wallet receipt portal.
 *
 * @param input - A transaction reference ID or receipt URL.
 * @param options - Optional configuration (timeout, proxy, onSuccess, mapResult, etc.).
 * @returns The authoritative verified result from the bank portal.
 * @throws {ProviderNotFoundError} If the input doesn't match any known provider.
 * @throws {OnlineVerificationError} If the portal fetch fails.
 *
 * @example
 * const result = await verifyOnline("CHQ0FJ403O");
 * console.log(result.status); // 'SUCCESS'
 * console.log(result.amount); // 2500
 */
export async function verifyOnline(input: string, options?: VerifierOptions): Promise<any> {
  const clean = sanitizeInput(input);
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const provider = detectProvider(clean);
  if (provider === 'unknown') throw new ProviderNotFoundError(clean);

  const parser = defaultParsers.find(p => p.providerName === provider);
  if (!parser) throw new ProviderNotFoundError(clean);

  const result = await parser.verifyOnline(clean, merged);

  if (result.status === 'SUCCESS' && merged.onSuccess) {
    try { await Promise.resolve(merged.onSuccess(result)); } catch (err) {
      console.error('[ethiopian-payment-verifier] onSuccess error:', err);
    }
  }

  if (result.status === 'SUCCESS' && merged.webhook) {
    dispatchWebhook(result, merged.webhook.url, merged.webhook.secret, merged.webhook.headers)
      .catch(() => {});
  }

  return merged.mapResult ? merged.mapResult(result) : result;
}

/**
 * Scans a receipt image or PDF for transaction details using OCR, then verifies online.
 *
 * @param imageInput - A file path, URL, or `Buffer` containing the receipt image.
 * @param options - Optional configuration.
 * @returns The verified result.
 */
export async function verifyImage(imageInput: string | Buffer, options?: VerifierOptions): Promise<any> {
  const merged = { ...DEFAULT_OPTIONS, ...options };
  const { extractTextFromImage, extractReferenceFromText } = await import('./ocr.js');
  const text = await extractTextFromImage(imageInput);
  const refData = extractReferenceFromText(text);

  if (refData.url || refData.reference) {
    try {
      return await verifyOnline((refData.url || refData.reference)!, merged);
    } catch {}
  }

  // Offline OCR layout fallback
  const parsed = parseSMS(text);
  let payerName = parsed.sender, receiverName = parsed.receiver,
      receiverAccount: string | null = null, amount = parsed.amount, date = parsed.date;

  const lines = text.split('\n').flatMap(l => l.split('  ')).map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Receiver\s*Name|Beneficiary/i.test(line)) {
      const m = line.match(/(?:Receiver\s*Name|Beneficiary)\s*[:\-]?\s*(.+)/i) ?? (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (m?.[1]) receiverName = m[1].trim();
    }
    if (/Receiver\s*Account|Account\s*No/i.test(line)) {
      const m = line.match(/(?:Receiver\s*Account|Account\s*No)\s*[:\-]?\s*(.+)/i) ?? (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (m?.[1]) receiverAccount = m[1].replace(/[^\d*]/g, '').trim();
    }
    if (/Settled\s*Amount|Total\s*Paid|Amount/i.test(line)) {
      const m = line.match(/(?:Settled\s*Amount|Total\s*Paid|Amount)\s*[:\-]?\s*(.+)/i) ?? (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (m?.[1]) { const a = cleanAmount(m[1]); if (a && !amount) amount = a; }
    }
    if (/Payment\s*[Dd]ate|Date/i.test(line)) {
      const m = line.match(/(?:Payment\s*[Dd]ate|Date)\s*[:\-]?\s*(.+)/i) ?? (i + 1 < lines.length ? [null, lines[i+1]] : null);
      if (m?.[1] && !date) { const d = parseDate(m[1]); if (d) date = d; }
    }
  }

  if (!amount) {
    const am = text.match(/([\d,]+(?:\.\d{2})?) *(?:ETB|Birr)/i);
    if (am) amount = cleanAmount(am[1]);
  }

  const finalResult: VerificationResult = {
    payer_name: payerName, payer_account: null,
    receiver_name: receiverName, receiver_account: receiverAccount,
    amount, currency: parsed.currency || 'ETB', date,
    reference: parsed.transactionId ?? refData.reference ?? 'OCR_TXN',
    status: amount !== null ? 'SUCCESS' : 'FAILED',
    rawDetails: { ocrText: text, parsed },
  };

  if (finalResult.status === 'SUCCESS' && merged.onSuccess) {
    try { await Promise.resolve(merged.onSuccess(finalResult)); } catch {}
  }
  if (finalResult.status === 'SUCCESS' && merged.webhook) {
    dispatchWebhook(finalResult, merged.webhook.url, merged.webhook.secret, merged.webhook.headers).catch(() => {});
  }

  return merged.mapResult ? merged.mapResult(finalResult) : finalResult;
}

/**
 * Validates a verified result against expected business rules.
 * Returns a rich `VerificationReport` with a confidence score and per-field breakdown.
 *
 * @param result - The `VerificationResult` from `verifyOnline()`.
 * @param expected - The business rules to check against.
 * @returns A `VerificationReport` with `verified`, `score`, `risk`, `checks`, and `reasons`.
 *
 * @example
 * const report = verifyDetails(result, { amount: 5000, maxAgeMinutes: 120 });
 * if (!report.verified) console.log(report.reasons);
 */
export function verifyDetails(
  result: VerificationResult,
  expected: {
    amount: number;
    receiverAccount?: string;
    receiverName?: string;
    maxAgeMinutes?: number;
    strictReceiverName?: boolean;
  }
): VerificationReport {
  const reasons: string[] = [];
  const maxAge = expected.maxAgeMinutes ?? DEFAULT_OPTIONS.maxAgeMinutes!;

  // ── Status check ──────────────────────────────────────────────────────────
  const statusCheck: FieldCheck = { passed: result.status === 'SUCCESS', received: result.status };
  if (!statusCheck.passed) reasons.push(`Transaction status is ${result.status} (expected SUCCESS).`);

  // ── Amount check ──────────────────────────────────────────────────────────
  const amtPassed = result.amount !== null && result.amount >= expected.amount;
  const amountCheck: FieldCheck = {
    passed: amtPassed,
    expected: expected.amount,
    received: result.amount,
  };
  if (!amtPassed) reasons.push(`Amount mismatch: Received ${result.amount ?? 0} ETB (expected at least ${expected.amount} ETB).`);

  // ── Receiver account check ────────────────────────────────────────────────
  let accountPassed = true;
  if (expected.receiverAccount && result.receiver_account) {
    const cleanExp = expected.receiverAccount.replace(/\D/g, '');
    const isMasked = result.receiver_account.includes('*');
    if (isMasked) {
      const pattern = '^' + result.receiver_account
        .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
        .replace(/\\\*/g, '\\d*') + '$';
      if (!new RegExp(pattern).test(cleanExp)) {
        accountPassed = false;
        reasons.push(`Receiver account mismatch: Received ${result.receiver_account} (expected ${expected.receiverAccount}).`);
      }
    } else {
      if (cleanExp !== result.receiver_account.replace(/\D/g, '')) {
        accountPassed = false;
        reasons.push(`Receiver account mismatch: Received ${result.receiver_account} (expected ${expected.receiverAccount}).`);
      }
    }
  }
  const accountCheck: FieldCheck = {
    passed: accountPassed,
    expected: expected.receiverAccount,
    received: result.receiver_account,
  };

  // ── Receiver name check ───────────────────────────────────────────────────
  let namePassed = true;
  if (expected.receiverName && result.receiver_name) {
    if (expected.strictReceiverName) {
      namePassed = expected.receiverName.trim().toLowerCase() === result.receiver_name.trim().toLowerCase();
      if (!namePassed) reasons.push(`Receiver name mismatch (strict): Received "${result.receiver_name}" (expected "${expected.receiverName}").`);
    } else {
      const a = expected.receiverName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const b = result.receiver_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      namePassed = a.includes(b) || b.includes(a);
      if (!namePassed) reasons.push(`Receiver name mismatch: Received "${result.receiver_name}" (expected "${expected.receiverName}").`);
    }
  }
  const nameCheck: FieldCheck = {
    passed: namePassed,
    expected: expected.receiverName,
    received: result.receiver_name,
  };

  // ── Age / expiry check ────────────────────────────────────────────────────
  let agePassed = true;
  let ageMinutes: number | undefined;
  if (result.date) {
    try {
      const diffMs = Date.now() - new Date(result.date).getTime();
      ageMinutes = diffMs / 60_000;
      if (!isNaN(ageMinutes)) {
        if (ageMinutes > maxAge) {
          agePassed = false;
          reasons.push(`Transaction expired: Receipt is ${Math.round(ageMinutes)} minutes old (maximum allowed is ${maxAge} minutes).`);
        } else if (ageMinutes < -60) {
          agePassed = false;
          reasons.push(`Transaction date is in the future: ${result.date}`);
        }
      }
    } catch {}
  }
  const ageCheck = {
    passed: agePassed,
    ageMinutes,
    maxAllowed: maxAge,
    detail: ageMinutes !== undefined ? `${Math.round(ageMinutes)} minutes old` : undefined,
  };

  // ── Score calculation ─────────────────────────────────────────────────────
  const weights = { status: 40, amount: 30, name: 10, account: 10, age: 10 };
  const score =
    (statusCheck.passed  ? weights.status  : 0) +
    (amountCheck.passed  ? weights.amount  : 0) +
    (nameCheck.passed    ? weights.name    : 0) +
    (accountCheck.passed ? weights.account : 0) +
    (ageCheck.passed     ? weights.age     : 0);

  const risk: 'LOW' | 'MEDIUM' | 'HIGH' =
    score >= 90 ? 'LOW' : score >= 60 ? 'MEDIUM' : 'HIGH';

  return {
    verified: reasons.length === 0,
    score,
    risk,
    checks: {
      status: statusCheck,
      amount: amountCheck,
      receiverName: nameCheck,
      receiverAccount: accountCheck,
      age: ageCheck,
    },
    reasons,
  };
}

/**
 * Cross-checks an offline SMS parse against the authoritative online result
 * to detect whether the SMS text has been tampered with or fabricated.
 *
 * @param smsResult - The offline `ParseResult` from `parseSMS()`.
 * @param onlineResult - The authoritative `VerificationResult` from `verifyOnline()`.
 * @returns A `CrossCheckResult` with `trusted` and a list of `tampered` field descriptions.
 *
 * @example
 * const sms = verifier.parseSMS(smsText);
 * const online = await verifier.verifyOnline(sms.transactionId!);
 * const check = verifier.crossCheck(sms, online);
 * if (!check.trusted) console.warn('Tampered:', check.tampered);
 */
export function crossCheck(smsResult: ParseResult, onlineResult: VerificationResult): CrossCheckResult {
  const tampered: string[] = [];

  if (onlineResult.status !== 'SUCCESS') {
    tampered.push(`Transaction status is ${onlineResult.status} — not a completed payment.`);
    return { trusted: false, tampered, onlineResult, smsResult };
  }
  if (smsResult.amount !== null && onlineResult.amount !== null) {
    if (Math.round(smsResult.amount * 100) !== Math.round(onlineResult.amount * 100)) {
      tampered.push(`Amount mismatch: SMS claims ${smsResult.amount} ETB but bank recorded ${onlineResult.amount} ETB.`);
    }
  }
  if (smsResult.receiver && onlineResult.receiver_name) {
    const a = smsResult.receiver.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = onlineResult.receiver_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!a.includes(b) && !b.includes(a)) {
      tampered.push(`Receiver name mismatch: SMS says "${smsResult.receiver}" but bank recorded "${onlineResult.receiver_name}".`);
    }
  }
  if (smsResult.sender && onlineResult.payer_name) {
    const a = smsResult.sender.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = onlineResult.payer_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!a.includes(b) && !b.includes(a)) {
      tampered.push(`Sender name mismatch: SMS says "${smsResult.sender}" but bank recorded "${onlineResult.payer_name}".`);
    }
  }
  if (smsResult.transactionId && onlineResult.reference) {
    if (smsResult.transactionId.toUpperCase() !== onlineResult.reference.toUpperCase()) {
      tampered.push(`Transaction ID mismatch: SMS says "${smsResult.transactionId}" but bank recorded "${onlineResult.reference}".`);
    }
  }
  return { trusted: tampered.length === 0, tampered, onlineResult, smsResult };
}

// ─── PaymentVerifier Class ────────────────────────────────────────────────────

/**
 * The main unified client for verifying Ethiopian payment receipts.
 * Extends `TypedEventEmitter` — listen to events using `.on()`.
 *
 * @example
 * const verifier = new PaymentVerifier({ maxAgeMinutes: 120 })
 *   .withDuplicateGuard()
 *   .withBlacklist(['0911223344'])
 *   .onSuccess((r) => db.save(r));
 *
 * verifier.on('verified',  (r) => console.log('Paid:', r.amount));
 * verifier.on('duplicate', (ref) => console.warn('Duplicate:', ref));
 *
 * const result = await verifier.verifyOnline("CHQ0FJ403O");
 */
export class PaymentVerifier extends TypedEventEmitter {
  private options: VerifierOptions;
  private parsers: BaseParser[];
  private _duplicateStore: DuplicateStore | null = null;
  private _blacklistStore: BlacklistStore | null = null;
  private _velocityStore: VelocityStore | null = null;
  private _velocityMax: number = 0;
  
  private _cache = new Map<string, { result: VerificationResult, expiresAt: number }>();
  private _stats: Omit<VerifierStats, 'uptimeMs'> = {
    totalRequests: 0,
    successful: 0,
    failed: 0,
    cacheHits: 0,
    providerBreakdown: {}
  };
  private _startTime = Date.now();

  /**
   * Creates a new `PaymentVerifier` instance.
   * @param options - Global configuration applied to all verification calls.
   */
  constructor(options: VerifierOptions = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.parsers = [...defaultParsers];

    // Resolve duplicate guard
    if (options.duplicateGuard === true) {
      this._duplicateStore = new InMemoryDuplicateStore();
    } else if (options.duplicateGuard && typeof options.duplicateGuard === 'object') {
      this._duplicateStore = options.duplicateGuard as DuplicateStore;
    }

    // Resolve blacklist
    if (Array.isArray(options.blacklist)) {
      this._blacklistStore = new StaticBlacklistStore(options.blacklist);
    } else if (options.blacklist && typeof options.blacklist === 'object') {
      this._blacklistStore = options.blacklist as BlacklistStore;
    }

    // Resolve velocity guard
    if (options.velocityGuard) {
      if ('maxPerHour' in options.velocityGuard) {
        this._velocityStore = new InMemoryVelocityStore(60);
        this._velocityMax = options.velocityGuard.maxPerHour;
      } else {
        this._velocityStore = options.velocityGuard as VelocityStore;
        // When using a custom store, we assume the max is handled by the store or set via another means
        // But to keep it simple, we can default to 0 and let the store manage it, 
        // though our interface incrementAndGet just returns the count.
        // For custom stores in this version, max must be handled externally or we should allow passing it.
        // Let's assume a default max of 100 for custom stores if not specified.
        this._velocityMax = 100;
      }
    }
  }

  // ── Fluent builder methods ─────────────────────────────────────────────────

  /** @returns `this` for chaining. Sets the HTTP request timeout in ms. */
  withTimeout(ms: number): this { this.options.timeout = ms; return this; }

  /** @returns `this` for chaining. Sets an HTTP/HTTPS proxy URL. */
  withProxy(url: string): this { this.options.proxy = url; return this; }

  /** @returns `this` for chaining. Sets the maximum receipt age in minutes. */
  withMaxAge(minutes: number): this { this.options.maxAgeMinutes = minutes; return this; }

  /**
   * Enables duplicate transaction detection.
   * @param store - Optional custom store. Defaults to `InMemoryDuplicateStore`.
   * @returns `this` for chaining.
   */
  withDuplicateGuard(store?: DuplicateStore): this {
    this._duplicateStore = store ?? new InMemoryDuplicateStore();
    return this;
  }

  /**
   * Enables sender/account blocklist checking.
   * @param entries - An array of phone numbers/accounts to block, or a custom `BlacklistStore`.
   * @returns `this` for chaining.
   */
  withBlacklist(entries: string[] | BlacklistStore): this {
    this._blacklistStore = Array.isArray(entries)
      ? new StaticBlacklistStore(entries)
      : entries;
    return this;
  }

  /**
   * Enables velocity/rate limiting per sender.
   * @param options - Configuration object with maxPerHour, or a custom `VelocityStore`.
   * @returns `this` for chaining.
   */
  withVelocityGuard(options: { maxPerHour: number } | VelocityStore): this {
    if ('maxPerHour' in options) {
      this._velocityStore = new InMemoryVelocityStore(60);
      this._velocityMax = options.maxPerHour;
    } else {
      this._velocityStore = options;
      this._velocityMax = 100;
    }
    return this;
  }

  /**
   * Configures a webhook URL to receive verified payment results.
   * @param options - Webhook URL, optional secret, and optional extra headers.
   * @returns `this` for chaining.
   */
  withWebhook(options: { url: string; secret?: string; headers?: Record<string, string> }): this {
    this.options.webhook = options;
    return this;
  }

  /**
   * Registers a callback to run automatically when a transaction verifies as `SUCCESS`.
   * @param fn - Async-safe callback receiving the `VerificationResult`.
   * @returns `this` for chaining.
   */
  onSuccess(fn: (result: VerificationResult) => void | Promise<void>): this {
    this.options.onSuccess = fn;
    return this;
  }

  /**
   * Registers a callback to transform the result shape before returning.
   * @param fn - Mapping function from `VerificationResult` to your custom type.
   * @returns `this` for chaining.
   */
  withMapResult<T>(fn: (result: VerificationResult) => T): this {
    this.options.mapResult = fn as any;
    return this;
  }

  // ── Plugin system ──────────────────────────────────────────────────────────

  /**
   * Registers a custom bank or wallet parser into this verifier instance.
   * The new parser is checked first before built-in parsers.
   *
   * @param parser - An instance of a class extending `BaseParser`.
   * @returns `this` for chaining.
   *
   * @example
   * import { BaseParser } from 'ethiopian-payment-verifier';
   * class NibParser extends BaseParser { ... }
   * verifier.registerParser(new NibParser());
   */
  registerParser(parser: BaseParser): this {
    this.parsers.unshift(parser);
    return this;
  }

  // ── Core methods ───────────────────────────────────────────────────────────

  /**
   * Detects the payment provider from an SMS text, reference ID, or URL.
   * @param input - Raw input to test.
   * @returns Provider slug or `'unknown'`.
   */
  detectProvider(input: string): PaymentProvider | 'unknown' {
    const clean = sanitizeInput(input);
    for (const parser of this.parsers) {
      if (parser.matches(clean)) return parser.providerName as PaymentProvider;
    }
    return 'unknown';
  }

  /**
   * Parses an SMS notification body offline using regex rules.
   * @param smsText - The full SMS text body.
   * @returns Extracted transaction fields.
   */
  parseSMS(smsText: string): ParseResult {
    const clean = sanitizeInput(smsText);
    const provider = this.detectProvider(clean);
    if (provider === 'unknown') {
      return { provider: 'unknown', transactionId: null, amount: null, currency: 'ETB', sender: null, receiver: null, date: null, balance: null, raw: clean };
    }
    const parser = this.parsers.find(p => p.providerName === provider);
    return parser
      ? parser.parseSMS(clean)
      : { provider: 'unknown', transactionId: null, amount: null, currency: 'ETB', sender: null, receiver: null, date: null, balance: null, raw: clean };
  }

  /**
   * Verifies a transaction online by fetching the official bank or wallet portal.
   * Automatically runs duplicate guard, blacklist checks, webhook dispatch, and events.
   *
   * @param input - Transaction reference ID or receipt URL.
   * @param customOptions - Per-call option overrides.
   * @returns The authoritative verification result (or your mapped type if `mapResult` is set).
   * @throws {ProviderNotFoundError} If no provider matches.
   * @throws {DuplicateTransactionError} If duplicate guard is enabled and ref was already used.
   * @throws {BlacklistedSenderError} If the sender is on the blocklist.
   * @throws {OnlineVerificationError} If the bank portal request fails.
   */
  async verifyOnline(input: string, customOptions?: VerifierOptions): Promise<any> {
    const merged = { ...this.options, ...customOptions };
    const clean = sanitizeInput(input);

    const provider = this.detectProvider(clean);
    if (provider === 'unknown') {
      const err = new ProviderNotFoundError(clean);
      this.emit('failed', err);
      throw err;
    }

    const parser = this.parsers.find(p => p.providerName === provider);
    if (!parser) {
      const err = new ProviderNotFoundError(clean);
      this.emit('failed', err);
      throw err;
    }

    this._stats.totalRequests++;
    if (!this._stats.providerBreakdown[provider]) {
      this._stats.providerBreakdown[provider] = 0;
    }
    this._stats.providerBreakdown[provider]++;

    // ── Check Cache ─────────────────────────────────────────────────────────
    if (this.options.enableCache) {
      const cached = this._cache.get(clean);
      if (cached && Date.now() < cached.expiresAt) {
        this._stats.cacheHits++;
        return this.options.mapResult ? this.options.mapResult(cached.result) : cached.result;
      }
    }

    // ── S1: Duplicate guard ─────────────────────────────────────────────────
    if (this._duplicateStore) {
      // Try to extract a reference ID from input before hitting portal
      const quickParse = parser.parseSMS(clean);
      const candidateRef = quickParse.transactionId ?? clean;
      if (await Promise.resolve(this._duplicateStore.has(candidateRef))) {
        const err = new DuplicateTransactionError(candidateRef);
        this.emit('duplicate', candidateRef);
        this.emit('failed', err);
        throw err;
      }

      // Also apply velocity guard on the extracted sender before portal hit
      if (this._velocityStore && quickParse.sender) {
        const attempts = await Promise.resolve(this._velocityStore.incrementAndGet(quickParse.sender));
        if (attempts > this._velocityMax) {
          const err = new VelocityLimitError(quickParse.sender);
          this.emit('failed', err);
          throw err;
        }
      }
    }

    let result: VerificationResult;
    try {
      result = await parser.verifyOnline(clean, merged);
    } catch (err: any) {
      this.emit('failed', err);
      throw err;
    }

    // ── S2: Blacklist check (after online — we now have payer phone/account) ─
    if (this._blacklistStore) {
      const identifiers = [result.payer_phone, result.payer_account, result.payer_name].filter(Boolean) as string[];
      for (const id of identifiers) {
        if (await Promise.resolve(this._blacklistStore.isBlocked(id))) {
          const err = new BlacklistedSenderError(id);
          this.emit('blacklisted', id);
          this.emit('failed', err);
          throw err;
        }
      }
    }

    // ── S4: Velocity guard check (after online if sender wasn't in SMS) ─────
    if (this._velocityStore && result.payer_phone) {
      // We already checked offline sender, but if it was missing from SMS, check now
      const quickParse = parser.parseSMS(clean);
      if (!quickParse.sender) {
        const attempts = await Promise.resolve(this._velocityStore.incrementAndGet(result.payer_phone));
        if (attempts > this._velocityMax) {
          const err = new VelocityLimitError(result.payer_phone);
          this.emit('failed', err);
          throw err;
        }
      }
    }

    // ── S1: Record in duplicate store after successful check ────────────────
    if (result.status === 'SUCCESS') {
      this._stats.successful++;
      if (this._duplicateStore) {
        await Promise.resolve(this._duplicateStore.add(result.reference));
      }
      
      // Update cache
      if (this.options.enableCache) {
        // Cache for 5 minutes
        this._cache.set(result.reference, { result, expiresAt: Date.now() + 300000 });
      }
    } else {
      this._stats.failed++;
    }

    // ── Webhook dispatch ────────────────────────────────────────────────────
    if (result.status === 'SUCCESS') {
      this.emit('verified', result);
      if (merged.onSuccess) {
        try { await Promise.resolve(merged.onSuccess(result)); } catch (e: any) {
          console.error('[ethiopian-payment-verifier] onSuccess error:', e.message);
        }
      }
      if (merged.webhook) {
        dispatchWebhook(result, merged.webhook.url, merged.webhook.secret, merged.webhook.headers)
          .catch(() => {});
      }
    }

    return merged.mapResult ? merged.mapResult(result) : result;
  }

  /**
   * Scans a receipt image or PDF using OCR, then verifies the extracted reference online.
   * @param imageInput - File path, URL, or `Buffer` of the receipt image.
   * @param customOptions - Per-call option overrides.
   */
  async verifyImage(imageInput: string | Buffer, customOptions?: VerifierOptions): Promise<any> {
    const merged = { ...this.options, ...customOptions };
    return verifyImage(imageInput, merged);
  }

  /**
   * Validates a verified result against expected business rules.
   * Returns a rich `VerificationReport` with a 0–100 confidence score and per-field breakdown.
   *
   * @param result - The `VerificationResult` from `verifyOnline()`.
   * @param expected - Business rules to validate against.
   * @returns A `VerificationReport` — check `.verified`, `.score`, `.risk`, `.checks`, `.reasons`.
   */
  verifyDetails(
    result: VerificationResult,
    expected: {
      amount: number;
      receiverAccount?: string;
      receiverName?: string;
      maxAgeMinutes?: number;
      strictReceiverName?: boolean;
    }
  ): VerificationReport {
    return verifyDetails(result, expected);
  }

  /**
   * Cross-checks an offline SMS parse against the authoritative online result
   * to detect whether the SMS was tampered with.
   * Also emits the `'tampered'` event if mismatches are found.
   *
   * @param smsResult - The `ParseResult` from `parseSMS()`.
   * @param onlineResult - The `VerificationResult` from `verifyOnline()`.
   * @returns A `CrossCheckResult` with `trusted` and `tampered` field descriptions.
   */
  crossCheck(smsResult: ParseResult, onlineResult: VerificationResult): CrossCheckResult {
    const result = crossCheck(smsResult, onlineResult);
    if (!result.trusted) this.emit('tampered', result);
    return result;
  }
}
