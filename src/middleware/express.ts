import type { Request, Response, NextFunction } from 'express';
import { PaymentVerifier } from '../index.js';
import { VerificationReport, VerifierOptions } from '../types.js';

/**
 * Options for the Express middleware.
 * @since 2.3.0
 */
export interface ExpressMiddlewareOptions extends VerifierOptions {
  /** The expected amount in ETB. Required. */
  amount: number;
  /**
   * The field name in `req.body` that contains the transaction reference, URL, or SMS text.
   * @default 'receipt'
   */
  field?: string;
  /**
   * If true, automatically sends a `402 Payment Required` response if verification fails.
   * If false, passes the error to `next(err)` or attaches the failed report to `req.epvResult`.
   * @default true
   */
  autoRespond?: boolean;
}

// Augment the Express Request type to include our result
declare global {
  namespace Express {
    interface Request {
      /** The verified payment report from `ethiopian-payment-verifier`. */
      epvResult?: VerificationReport;
    }
  }
}

/**
 * Express middleware that automatically extracts a payment receipt from the request body,
 * verifies it online, and validates the amount.
 * 
 * @example
 * import { epvMiddleware } from 'ethiopian-payment-verifier/express';
 * 
 * app.post('/pay', 
 *   epvMiddleware({ amount: 5000, field: 'transactionId' }),
 *   (req, res) => {
 *     console.log('Payment verified! Score:', req.epvResult.score);
 *     res.json({ success: true });
 *   }
 * );
 * 
 * @since 2.3.0
 */
export function epvMiddleware(options: ExpressMiddlewareOptions) {
  const verifier = new PaymentVerifier(options);
  const field = options.field || 'receipt';
  const autoRespond = options.autoRespond !== false;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = req.body?.[field];
      if (!input || typeof input !== 'string') {
        if (autoRespond) {
          return res.status(400).json({ error: `Missing or invalid payment field: ${field}` });
        }
        return next(new Error(`Missing or invalid payment field: ${field}`));
      }

      const result = await verifier.verifyOnline(input);
      const report = verifier.verifyDetails(result, { amount: options.amount, maxAgeMinutes: options.maxAgeMinutes });

      req.epvResult = report;

      if (!report.verified) {
        if (autoRespond) {
          return res.status(402).json({ 
            error: 'Payment verification failed.',
            reasons: report.reasons 
          });
        }
      }

      next();
    } catch (error: any) {
      if (autoRespond) {
        return res.status(402).json({ error: error.message });
      }
      next(error);
    }
  };
}
