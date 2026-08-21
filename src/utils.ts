import * as http from 'http';
import * as https from 'https';
import * as tls from 'tls';
import { URL } from 'url';

/**
 * Robust native HTTP/HTTPS request helper with proxy tunneling, timeout, and redirect support.
 * Zero external dependencies.
 */
export function request(urlStr: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  proxy?: string;
  timeout?: number;
} = {}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(urlStr);
    const timeoutMs = options.timeout ?? 10000;
    const method = options.method ?? 'GET';
    const headers = { ...options.headers };

    if (!headers['user-agent']) {
      headers['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
    if (options.body && !headers['content-length']) {
      headers['content-length'] = Buffer.byteLength(options.body).toString();
    }

    let timeoutTimer: NodeJS.Timeout | null = null;
    let activeReq: http.ClientRequest | null = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    };

    const handleResponse = (res: http.IncomingMessage) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: any) => { data += chunk; });
      res.on('end', () => {
        cleanup();
        resolve({
          status: res.statusCode ?? 500,
          headers: res.headers,
          body: data
        });
      });
    };

    const handleError = (err: Error) => {
      cleanup();
      reject(err);
    };

    // If proxy option is specified
    if (options.proxy) {
      const proxyUrl = new URL(options.proxy);
      const isTargetHttps = targetUrl.protocol === 'https:';

      if (isTargetHttps) {
        // Create tunneling via CONNECT
        const proxyHeaders: Record<string, string> = {};
        if (proxyUrl.username) {
          proxyHeaders['Proxy-Authorization'] = 'Basic ' + Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString('base64');
        }

        const connectReq = http.request({
          host: proxyUrl.hostname,
          port: proxyUrl.port || 80,
          method: 'CONNECT',
          path: `${targetUrl.hostname}:${targetUrl.port || 443}`,
          headers: proxyHeaders
        });

        activeReq = connectReq;

        connectReq.on('connect', (res: http.IncomingMessage, socket: any) => {
          if (res.statusCode !== 200) {
            connectReq.destroy();
            handleError(new Error(`Proxy CONNECT failed with status ${res.statusCode}`));
            return;
          }

          // Establish TLS connection over the tunnel socket
          const tlsSocket = tls.connect({
            socket: socket,
            servername: targetUrl.hostname,
            rejectUnauthorized: false // Often required for local/dev environments and bank cert issues
          }, () => {
            const httpsReq = https.request({
              method: method,
              path: targetUrl.pathname + targetUrl.search,
              headers: headers,
              createConnection: () => tlsSocket
            }, handleResponse);

            activeReq = httpsReq;
            httpsReq.on('error', handleError);
            if (options.body) {
              httpsReq.write(options.body);
            }
            httpsReq.end();
          });

          tlsSocket.on('error', handleError);
        });

        connectReq.on('error', handleError);
        connectReq.end();
      } else {
        // Direct routing via HTTP proxy
        const proxyHeaders: Record<string, string> = { ...headers };
        if (proxyUrl.username) {
          proxyHeaders['Proxy-Authorization'] = 'Basic ' + Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString('base64');
        }

        activeReq = http.request({
          host: proxyUrl.hostname,
          port: proxyUrl.port || 80,
          method: method,
          path: urlStr,
          headers: proxyHeaders
        }, handleResponse);

        activeReq.on('error', handleError);
        if (options.body) {
          activeReq.write(options.body);
        }
        activeReq.end();
      }
    } else {
      // Direct (No proxy) request
      const reqLib = targetUrl.protocol === 'https:' ? https : http;
      activeReq = reqLib.request({
        host: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        method: method,
        path: targetUrl.pathname + targetUrl.search,
        headers: headers,
        rejectUnauthorized: false // Tolerate minor bank SSL handshake config deviations
      }, handleResponse);

      activeReq.on('error', handleError);
      if (options.body) {
        activeReq.write(options.body);
      }
      activeReq.end();
    }

    timeoutTimer = setTimeout(() => {
      if (activeReq) {
        activeReq.destroy();
      }
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

/**
 * Cleans monetary amount string and parses it to a float.
 * E.g., "ETB 1,250.00" -> 1250, "500 Birr" -> 500
 */
export function cleanAmount(amountStr: string | null | undefined): number | null {
  if (!amountStr) return null;
  // Remove currency names, commas, spaces
  const cleaned = amountStr
    .replace(/[^\d.]/g, '') // Keep only digits and dots
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Normalizes name strings (removes excess whitespace, normalizes casing/UTF-8 variants).
 */
export function normalizeName(nameStr: string | null | undefined): string | null {
  if (!nameStr) return null;
  return nameStr
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ') // Collapse multiple spaces and invisible UTF-8 spaces
    .trim();
}

/**
 * Normalizes dates to ISO standard where possible, or returns standard representation.
 */
export function parseDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  
  // Try JS parsing
  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // Fall back to original cleaned string
  }

  // Format DD/MM/YYYY hh:mm:ss if matched
  const dmyMatch = cleaned.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/);
  if (dmyMatch) {
    const [, day, month, year, hour = '00', min = '00', sec = '00'] = dmyMatch;
    const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min.padStart(2, '0')}:${sec.padStart(2, '0')}.000Z`;
    return isoStr;
  }

  return cleaned;
}
