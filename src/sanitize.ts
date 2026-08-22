import { InputValidationError } from './errors.js';

/** Maximum allowed input length in characters. */
const MAX_INPUT_LENGTH = 50_000;

/**
 * Invisible/harmful unicode characters to strip from input.
 * Includes zero-width spaces, soft hyphens, and other invisible control characters
 * commonly used in receipt text manipulation attacks.
 */
const HARMFUL_UNICODE_REGEX = /[\u0000\u00AD\u200B\u200C\u200D\u200E\u200F\u2028\u2029\uFEFF]/g;

/**
 * Sanitizes and validates a raw input string before any parsing or online verification.
 *
 * Rules enforced:
 * - Must be a string (throws if null, undefined, number, etc.)
 * - Must not be empty after trimming
 * - Must not exceed 50,000 characters
 * - Strips null bytes and invisible unicode manipulation characters
 * - Trims leading/trailing whitespace
 *
 * @param input - The raw input to sanitize.
 * @returns The sanitized string, safe to pass to parsers and scrapers.
 * @throws {InputValidationError} If the input fails any validation rule.
 *
 * @example
 * const clean = sanitizeInput("  FT260821ABCD\u200B  ");
 * // Returns "FT260821ABCD"
 *
 * @since 2.0.0
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') {
    throw new InputValidationError(
      `Expected a string but received ${input === null ? 'null' : typeof input}.`
    );
  }

  // Strip harmful invisible unicode characters first
  let cleaned = input.replace(HARMFUL_UNICODE_REGEX, '');

  // Trim whitespace
  cleaned = cleaned.trim();

  if (cleaned.length === 0) {
    throw new InputValidationError('Input must not be empty.');
  }

  if (cleaned.length > MAX_INPUT_LENGTH) {
    throw new InputValidationError(
      `Input is too long (${cleaned.length} characters). Maximum allowed is ${MAX_INPUT_LENGTH}.`
    );
  }

  return cleaned;
}
