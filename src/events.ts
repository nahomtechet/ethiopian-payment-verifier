import { EventEmitter } from 'events';
import { VerificationResult, CrossCheckResult } from './types.js';

/**
 * Map of all events emitted by `PaymentVerifier` with their payload types.
 *
 * | Event | Payload | When fired |
 * |---|---|---|
 * | `verified` | `VerificationResult` | Online check returned SUCCESS |
 * | `failed` | `Error` | Any verification error |
 * | `tampered` | `CrossCheckResult` | `crossCheck()` detects mismatches |
 * | `duplicate` | `string` | Duplicate guard blocks a reference ID |
 * | `blacklisted` | `string` | Blacklist blocks a sender identifier |
 * | `expired` | `VerificationResult` | Receipt older than `maxAgeMinutes` |
 *
 * @since 2.0.0
 */
export interface VerifierEvents {
  /**
   * Fired when an online verification returns a SUCCESS status.
   * @param result - The full verified payment result.
   */
  verified: [result: VerificationResult];

  /**
   * Fired when any verification attempt throws an error.
   * @param error - The error that occurred.
   */
  failed: [error: Error];

  /**
   * Fired when `crossCheck()` finds fields in the SMS that contradict the online result.
   * @param check - The cross-check result including tampered field descriptions.
   */
  tampered: [check: CrossCheckResult];

  /**
   * Fired when the duplicate guard blocks a reference ID that was already verified.
   * @param reference - The blocked transaction reference ID.
   */
  duplicate: [reference: string];

  /**
   * Fired when the blacklist blocks a sender or account identifier.
   * @param identifier - The blocked phone number or account.
   */
  blacklisted: [identifier: string];

  /**
   * Fired when a verified receipt is older than the configured `maxAgeMinutes`.
   * @param result - The verification result that triggered the expiry check.
   */
  expired: [result: VerificationResult];
}

/**
 * Typed event emitter base class for `PaymentVerifier`.
 * Provides full TypeScript autocomplete for event names and payload types.
 * @since 2.0.0
 */
export class TypedEventEmitter extends EventEmitter {
  /**
   * Registers a listener for the specified event.
   * @param event - The event name to listen for.
   * @param listener - The callback to invoke when the event fires.
   *
   * @example
   * verifier.on('verified', (result) => saveToDb(result));
   * verifier.on('duplicate', (ref) => flagAccount(ref));
   * verifier.on('failed', (err) => logError(err));
   */
  on<K extends keyof VerifierEvents>(event: K, listener: (...args: VerifierEvents[K]) => void): this {
    return super.on(event, listener as any);
  }

  /**
   * Registers a one-time listener that fires only on the next occurrence of the event.
   * @param event - The event name to listen for once.
   * @param listener - The callback to invoke when the event fires.
   */
  once<K extends keyof VerifierEvents>(event: K, listener: (...args: VerifierEvents[K]) => void): this {
    return super.once(event, listener as any);
  }

  /**
   * Removes a registered listener from an event.
   * @param event - The event name.
   * @param listener - The listener to remove.
   */
  off<K extends keyof VerifierEvents>(event: K, listener: (...args: VerifierEvents[K]) => void): this {
    return super.off(event, listener as any);
  }

  /** @internal */
  emit<K extends keyof VerifierEvents>(event: K, ...args: VerifierEvents[K]): boolean {
    return super.emit(event, ...args);
  }
}
