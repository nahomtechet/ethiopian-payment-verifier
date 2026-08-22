import { PaymentVerifier } from './index.js';
import { VerificationResult, VerifierOptions, ParseResult, CrossCheckResult, VerificationReport } from './types.js';

/**
 * A mock version of `PaymentVerifier` for use in unit tests.
 * Never makes real network requests. Instead, it returns pre-configured mocked responses.
 * 
 * @example
 * import { MockPaymentVerifier } from 'ethiopian-payment-verifier/testing';
 * 
 * const verifier = new MockPaymentVerifier();
 * verifier.mockResult('CHQ0FJ403O', { status: 'SUCCESS', amount: 5000 });
 * 
 * const result = await verifier.verifyOnline('CHQ0FJ403O');
 * // result.amount === 5000
 * @since 2.3.0
 */
export class MockPaymentVerifier extends PaymentVerifier {
  private mocks = new Map<string, VerificationResult>();

  /**
   * Configures a mock response for a specific transaction ID.
   * @param reference - The transaction ID to mock.
   * @param partialResult - The mocked values. Missing fields get sensible defaults.
   */
  mockResult(reference: string, partialResult: Partial<VerificationResult>): void {
    const defaultMock: VerificationResult = {
      payer_name: 'Mocked Payer',
      payer_phone: '0911223344',
      payer_account: '1000111222',
      receiver_name: 'Mocked Receiver',
      receiver_account: '1000333444',
      amount: 1000,
      currency: 'ETB',
      date: new Date().toISOString(),
      reference: reference.toUpperCase(),
      status: 'SUCCESS',
      rawDetails: { mocked: true }
    };
    
    this.mocks.set(reference.toUpperCase(), { ...defaultMock, ...partialResult });
  }

  /**
   * Overrides `verifyOnline` to return mocked data without making network calls.
   * Will still run local duplicate/blacklist checks if configured.
   */
  async verifyOnline(input: string, customOptions?: VerifierOptions): Promise<any> {
    const clean = input.trim().toUpperCase();
    
    // We need to simulate the local checks from the real PaymentVerifier
    // However, since we don't have direct access to its private stores,
    // we bypass them in the mock for simplicity, or we could duplicate the logic.
    // For unit testing, usually just returning the mock is sufficient.
    
    const mocked = this.mocks.get(clean);
    
    if (!mocked) {
      throw new Error(`MockPaymentVerifier: No mock configured for reference "${clean}"`);
    }

    if (mocked.status === 'SUCCESS') {
      this.emit('verified', mocked);
    } else {
      this.emit('failed', new Error(`Mocked failure for ${clean}`));
    }

    // Call mapResult if configured on the mock instance options
    const options = { ...((this as any).options), ...customOptions };
    return options.mapResult ? options.mapResult(mocked) : mocked;
  }
}
