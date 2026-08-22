/**
 * Base error class for all ethiopian-payment-verifier errors.
 * All custom errors extend this — use `instanceof VerifierError` to catch any verifier error.
 * @since 2.0.0
 */
export class VerifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when the input text, URL, or transaction ID does not match any known Ethiopian payment provider.
 * @example
 * try {
 *   await verifier.verifyOnline("hello world");
 * } catch (err) {
 *   if (err instanceof ProviderNotFoundError) {
 *     console.log("Unknown provider:", err.input);
 *   }
 * }
 * @since 2.0.0
 */
export class ProviderNotFoundError extends VerifierError {
  /** The raw input that could not be matched to any provider. */
  readonly input: string;

  constructor(input: string) {
    super(`Could not identify a payment provider from the input: "${input.substring(0, 80)}"`);
    this.input = input;
  }
}

/**
 * Thrown when the input fails basic validation checks (empty, too long, invalid type, contains harmful characters).
 * @example
 * try {
 *   await verifier.verifyOnline("");
 * } catch (err) {
 *   if (err instanceof InputValidationError) {
 *     console.log("Bad input:", err.reason);
 *   }
 * }
 * @since 2.0.0
 */
export class InputValidationError extends VerifierError {
  /** A human-readable description of why the input is invalid. */
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid input: ${reason}`);
    this.reason = reason;
  }
}

/**
 * Thrown when the online bank/wallet portal scrape fails due to a network error, timeout, or unexpected response.
 * @example
 * try {
 *   await verifier.verifyOnline("FT260821ABCD");
 * } catch (err) {
 *   if (err instanceof OnlineVerificationError) {
 *     console.log("Portal failed:", err.provider, err.statusCode);
 *   }
 * }
 * @since 2.0.0
 */
export class OnlineVerificationError extends VerifierError {
  /** The provider that failed (e.g. 'cbe', 'telebirr'). */
  readonly provider: string;
  /** HTTP status code if available, otherwise null. */
  readonly statusCode: number | null;

  constructor(provider: string, message: string, statusCode: number | null = null) {
    super(`Online verification failed for provider "${provider}": ${message}`);
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when a duplicate transaction guard is enabled and the same reference ID has already been verified.
 * Prevents double-spend / double-credit fraud.
 * @example
 * try {
 *   await verifier.verifyOnline("CHQ0FJ403O");
 * } catch (err) {
 *   if (err instanceof DuplicateTransactionError) {
 *     return res.status(409).json({ error: "Receipt already used" });
 *   }
 * }
 * @since 2.0.0
 */
export class DuplicateTransactionError extends VerifierError {
  /** The reference ID that was already verified. */
  readonly reference: string;

  constructor(reference: string) {
    super(`Transaction "${reference}" has already been verified. Duplicate receipts are not allowed.`);
    this.reference = reference;
  }
}

/**
 * Thrown when a sender phone number or account is on the developer-configured blocklist.
 * @example
 * try {
 *   await verifier.verifyOnline(smsText);
 * } catch (err) {
 *   if (err instanceof BlacklistedSenderError) {
 *     return res.status(403).json({ error: "Sender is blocked" });
 *   }
 * }
 * @since 2.0.0
 */
export class BlacklistedSenderError extends VerifierError {
  /** The phone number or account identifier that was blocked. */
  readonly identifier: string;

  constructor(identifier: string) {
    super(`Sender "${identifier}" is on the blocklist and cannot be processed.`);
    this.identifier = identifier;
  }
}

/**
 * Thrown when a receipt is older than the configured `maxAgeMinutes` threshold.
 * @example
 * try {
 *   await verifier.verifyOnline(smsText, { maxAgeMinutes: 60 });
 * } catch (err) {
 *   if (err instanceof ExpiredReceiptError) {
 *     console.log(`Receipt is ${err.ageMinutes} minutes old`);
 *   }
 * }
 * @since 2.0.0
 */
export class ExpiredReceiptError extends VerifierError {
  /** How old the receipt is in minutes. */
  readonly ageMinutes: number;
  /** The configured maximum allowed age in minutes. */
  readonly maxAgeMinutes: number;

  constructor(ageMinutes: number, maxAgeMinutes: number) {
    super(`Receipt is ${Math.round(ageMinutes)} minutes old (maximum allowed is ${maxAgeMinutes} minutes).`);
    this.ageMinutes = ageMinutes;
    this.maxAgeMinutes = maxAgeMinutes;
  }
}
