import { useState } from 'react';
import { ParseResult, PaymentProvider } from './types.js';
import { detectProvider, parseSMS } from './index.js';

export interface UsePaymentScannerResult {
  /** The currently extracted SMS text or reference, or null. */
  input: string | null;
  /** True if the input is actively being processed or verified. */
  isScanning: boolean;
  /** The offline parsed result. */
  parsed: ParseResult | null;
  /** The detected payment provider, or 'unknown'. */
  provider: PaymentProvider | 'unknown';
  /** Any errors encountered during offline parsing. */
  error: Error | null;
  /**
   * Scan and parse a new input string (SMS text or URL/Reference).
   * Note: This only performs the fast offline parse. You should submit the `input` to your server for online verification.
   */
  scan: (text: string) => void;
  /** Clear all state. */
  reset: () => void;
}

/**
 * A React Hook for easily building custom payment receipt input components.
 * Automatically parses pasted SMS text and detects the provider offline.
 * 
 * ⚠️ Important: Never trust the `parsed` result on the client-side for fulfilling orders.
 * Always send the `input` string to your backend API to run `verifyOnline()`.
 * 
 * @example
 * import { usePaymentScanner } from 'ethiopian-payment-verifier/react';
 * 
 * export function PaymentInput() {
 *   const { scan, parsed, provider, error, isScanning } = usePaymentScanner();
 * 
 *   return (
 *     <div>
 *       <textarea onChange={(e) => scan(e.target.value)} placeholder="Paste SMS here..." />
 *       {provider !== 'unknown' && <p>Detected: {provider}</p>}
 *       {parsed && <p>Amount: {parsed.amount} ETB</p>}
 *     </div>
 *   );
 * }
 * 
 * @since 2.3.0
 */
export function usePaymentScanner(): UsePaymentScannerResult {
  const [input, setInput] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [provider, setProvider] = useState<PaymentProvider | 'unknown'>('unknown');
  const [error, setError] = useState<Error | null>(null);

  const scan = (text: string) => {
    setInput(text);
    if (!text || text.trim() === '') {
      reset();
      return;
    }

    setIsScanning(true);
    setError(null);

    try {
      // Small timeout to allow UI to render the scanning state if parsing takes a moment
      setTimeout(() => {
        try {
          const detected = detectProvider(text);
          setProvider(detected);

          if (detected !== 'unknown') {
            const result = parseSMS(text);
            setParsed(result);
          } else {
            setParsed(null);
          }
        } catch (err: any) {
          setError(err);
        } finally {
          setIsScanning(false);
        }
      }, 0);
    } catch (err: any) {
      setError(err);
      setIsScanning(false);
    }
  };

  const reset = () => {
    setInput(null);
    setIsScanning(false);
    setParsed(null);
    setProvider('unknown');
    setError(null);
  };

  return { input, isScanning, parsed, provider, error, scan, reset };
}
