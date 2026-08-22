import { createHmac } from 'crypto';
import { VerificationResult } from './types.js';

/**
 * Signs a webhook payload string using HMAC-SHA256.
 *
 * @param body - The JSON string of the webhook payload.
 * @param secret - The developer's webhook secret key.
 * @returns The HMAC-SHA256 hex digest signature.
 * @since 2.0.0
 */
function signPayload(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Verifies an incoming webhook signature from a receiver server.
 * Use this in your own server to confirm the webhook came from the verifier.
 *
 * @param body - The raw JSON string of the received webhook body.
 * @param signature - The value of the `X-EPV-Signature` header (e.g. `sha256=abc123`).
 * @param secret - Your webhook secret key.
 * @returns `true` if the signature is valid, `false` if the payload was tampered.
 *
 * @example
 * // In your Express webhook handler:
 * import { verifyWebhookSignature } from 'ethiopian-payment-verifier';
 *
 * app.post('/payment', (req, res) => {
 *   const isValid = verifyWebhookSignature(
 *     JSON.stringify(req.body),
 *     req.headers['x-epv-signature'] as string,
 *     process.env.WEBHOOK_SECRET!
 *   );
 *   if (!isValid) return res.status(401).json({ error: 'Invalid signature' });
 *   // Process payment...
 * });
 *
 * @since 2.0.0
 */
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expected = `sha256=${signPayload(body, secret)}`;
  // Constant-time comparison to prevent timing attacks
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Dispatches a verified payment result to a developer-configured webhook URL.
 * Signs the payload with HMAC-SHA256 if a secret is provided.
 *
 * @param result - The verified `VerificationResult` to send.
 * @param url - The webhook endpoint URL.
 * @param secret - Optional secret for HMAC-SHA256 signing.
 * @param extraHeaders - Optional additional HTTP headers to include.
 *
 * @since 2.0.0
 */
export async function dispatchWebhook(
  result: VerificationResult,
  url: string,
  secret?: string,
  extraHeaders?: Record<string, string>
): Promise<void> {
  const body = JSON.stringify({
    event: 'payment.verified',
    timestamp: new Date().toISOString(),
    data: result,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'ethiopian-payment-verifier/2.0.0',
    ...extraHeaders,
  };

  if (secret) {
    headers['X-EPV-Signature'] = `sha256=${signPayload(body, secret)}`;
  }

  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
      console.warn(`[ethiopian-payment-verifier] Webhook to ${url} responded with status ${res.status}`);
    }
  } catch (err: any) {
    console.warn(`[ethiopian-payment-verifier] Webhook dispatch to ${url} failed: ${err.message}`);
  }
}
