import { PaymentVerifier } from '../index.js';
import { VerificationReport, VerifierOptions } from '../types.js';

/**
 * Options for the Next.js Server Action wrapper.
 * @since 2.3.0
 */
export interface NextActionOptions extends VerifierOptions {
  /** The expected amount in ETB. Required. */
  amount: number;
}

/**
 * Wraps a Next.js Server Action with automatic payment verification.
 * 
 * The wrapped action expects the first argument to be the transaction reference or SMS text.
 * The original action will be called with the extracted data and the `VerificationReport`.
 * 
 * @example
 * // app/actions.ts
 * 'use server'
 * import { withPaymentVerification } from 'ethiopian-payment-verifier/nextjs';
 * 
 * export const submitOrder = withPaymentVerification(
 *   async (data: { items: any[] }, report) => {
 *     // Only runs if the payment is valid
 *     await db.createOrder(data, report);
 *     return { success: true };
 *   },
 *   { amount: 5000 }
 * );
 * 
 * // Client component usage:
 * // submitOrder("CHQ0FJ403O", { items: [...] })
 * 
 * @since 2.3.0
 */
export function withPaymentVerification<TArgs extends any[], TReturn>(
  action: (data: TArgs[0], report: VerificationReport) => Promise<TReturn>,
  options: NextActionOptions
) {
  const verifier = new PaymentVerifier(options);

  return async (paymentInput: string, data: TArgs[0]): Promise<TReturn> => {
    if (!paymentInput || typeof paymentInput !== 'string') {
      throw new Error('Payment reference or SMS text is required as the first argument.');
    }

    const result = await verifier.verifyOnline(paymentInput);
    const report = verifier.verifyDetails(result, { amount: options.amount, maxAgeMinutes: options.maxAgeMinutes });

    if (!report.verified) {
      throw new Error(`Payment verification failed: ${report.reasons.join(' ')}`);
    }

    return action(data, report);
  };
}
