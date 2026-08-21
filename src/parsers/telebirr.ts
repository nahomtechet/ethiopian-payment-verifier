import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount, normalizeName, parseDate, request } from '../utils.js';

export class TelebirrParser extends BaseParser {
  readonly providerName = 'telebirr';

  matches(input: string): boolean {
    if (/transactioninfo\.ethiotelecom/i.test(input)) return true;
    if (/telebirr/i.test(input) || /ethiotelecom/i.test(input)) return true;

    // Check if it contains a 10-char alphanumeric reference that doesn't start with ZEM or FT
    const idMatch = input.match(/\b(?![0-9]{10}\b)([A-Z0-9]{10})\b/i);
    if (idMatch) {
      const id = idMatch[1];
      return !/^ZEM/i.test(id) && !/^FT/i.test(id);
    }

    return false;
  }

  parseSMS(smsText: string): ParseResult {
    // Alphanumeric code of exactly 10 uppercase characters is standard for Telebirr Transaction ID
    const idMatch = smsText.match(/Transaction ID:\s*([A-Z0-9]{10})/i) || smsText.match(/\b(?![0-9]{10}\b)([A-Z0-9]{10})\b/i);
    const transactionId = idMatch ? idMatch[1] : null;

    // Amount extraction: e.g. "sent 100.00 ETB" or "received 150.00 ETB" or "Payment of 100.00 ETB"
    const amountMatch = smsText.match(/([\d,]+\.\d{2})\s*(?:ETB|Birr)/i) || smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})/i);
    const amount = amountMatch ? cleanAmount(amountMatch[1]) : null;

    // Balance extraction
    const balanceMatch = smsText.match(/(?:balance|bal)\s*(?:is)?\s*[:\-]?\s*(?:ETB|Birr)?\s*([\d,]+\.\d{2})/i) || smsText.match(/(?:balance|bal)\s*(?:is)?\s*([\d,]+\.\d{2})\s*(?:ETB|Birr)?/i);
    const balance = balanceMatch ? cleanAmount(balanceMatch[1]) : null;

    // Date extraction: YYYY-MM-DD HH:MM
    const dateMatch = smsText.match(/\b\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\b/);
    const date = dateMatch ? parseDate(dateMatch[0]) : null;

    return {
      provider: 'telebirr',
      transactionId,
      amount,
      currency: 'ETB',
      sender: null,
      receiver: null,
      date,
      balance,
      raw: smsText
    };
  }

  async verifyOnline(input: string, options: VerifierOptions = {}): Promise<VerificationResult> {
    let url = '';
    let transactionId = '';

    if (input.startsWith('http://') || input.startsWith('https://')) {
      url = input;
      const match = input.match(/\/receipt\/([^/]+)/i) || input.match(/[?&]receiptNo=([^&]+)/i);
      transactionId = match ? match[1] : 'URL_TXN';
    } else {
      transactionId = input.trim();
      url = `https://transactioninfo.ethiotelecom.et/receipt/${transactionId}`;
    }

    try {
      const res = await request(url, {
        proxy: options.proxy,
        timeout: options.timeout,
        headers: {
          'user-agent': options.userAgent || ''
        }
      });

      if (res.status !== 200) {
        return this.createUnverifiedResult(transactionId, { error: `Server returned status code ${res.status}` });
      }

      const html = res.body;

      // Split HTML by tags into clean, trimmed text lines to bypass broken HTML tags
      const lines = html
        .replace(/<[^>]+>/g, '\n')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      let payerName = '';
      let payerPhone = '';
      let receiverName = '';
      let receiverAccount = '';
      let transactionIdText = '';
      let paymentDateText = '';
      let amountText = '';
      let statusText = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/Payer Name/i.test(line) && i + 1 < lines.length) {
          payerName = lines[i + 1];
        } else if (/Payer telebirr no/i.test(line) && i + 1 < lines.length) {
          payerPhone = lines[i + 1];
        } else if (/Credited Party name/i.test(line) && i + 1 < lines.length) {
          receiverName = lines[i + 1];
        } else if (/Credited party account no/i.test(line) && i + 1 < lines.length) {
          receiverAccount = lines[i + 1];
        } else if (/transaction status/i.test(line) && i + 1 < lines.length) {
          statusText = lines[i + 1];
        } else if (/Payment date/i.test(line) && i + 3 < lines.length) {
          paymentDateText = lines[i + 3];
        } else if (/Settled Amount/i.test(line) && i + 3 < lines.length) {
          amountText = lines[i + 3];
        } else if (/Invoice No/i.test(line) && i + 3 < lines.length) {
          transactionIdText = lines[i + 3];
        }
      }

      // Fallback matching logic on lines if index offsets shifted
      if (!payerName || !amountText || !receiverName) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/Payer Name|Sender Name|From Name/i.test(line) && i + 1 < lines.length) {
            payerName = payerName || lines[i + 1];
          }
          if (/Receiver Name|To Name|Payee Name|Merchant Name|Credited Party name/i.test(line) && i + 1 < lines.length) {
            receiverName = receiverName || lines[i + 1];
          }
          if (/Receiver Account|Payee Account|Credited party account no/i.test(line) && i + 1 < lines.length) {
            receiverAccount = receiverAccount || lines[i + 1];
          }
          if (/Settled Amount|Total Paid Amount|Amount/i.test(line) && i + 1 < lines.length) {
            const cleanAmt = cleanAmount(lines[i + 1]);
            if (cleanAmt) amountText = amountText || lines[i + 1];
          }
        }
      }

      const amountVal = cleanAmount(amountText);
      const receiverNameVal = normalizeName(receiverName);
      const dateVal = parseDate(paymentDateText);

      const isSuccess = (amountVal !== null && transactionId !== '') && 
                        (!statusText || /success|complete|completed|done|successful/i.test(statusText));

      const details: Record<string, string> = {
        payerName,
        payerPhone,
        receiverName,
        receiverAccount,
        transactionIdText,
        paymentDateText,
        amountText,
        statusText
      };

      return {
        payer_phone: payerPhone || null,
        receiver_name: receiverNameVal,
        receiver_account: receiverAccount || null,
        amount: amountVal,
        currency: 'ETB',
        date: dateVal,
        reference: transactionIdText || transactionId,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        rawDetails: details
      };
    } catch (err: any) {
      return this.createUnverifiedResult(transactionId, { error: err.message });
    }
  }
}
