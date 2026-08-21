import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount, normalizeName, parseDate, request } from '../utils.js';

export class BOAParser extends BaseParser {
  readonly providerName = 'boa';

  matches(input: string): boolean {
    return (
      /abyssinia/i.test(input) || 
      /\bboa\b/i.test(input) ||
      /bankofabyssinia/i.test(input)
    );
  }

  parseSMS(smsText: string): ParseResult {
    // BOA SMS Ref can be alphanumeric starting with FT or typical TXN format
    const refMatch = smsText.match(/ref\s*[:\-]?\s*([a-z0-9]+)/i) || smsText.match(/\b(FT[A-Z0-9]+)\b/i) || smsText.match(/\b(TXN[A-Z0-9]+)\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})|([\d,]+\.\d{2})\s*(?:ETB|Birr)/i);
    const amountStr = amountMatch ? (amountMatch[1] || amountMatch[2]) : null;
    const amount = cleanAmount(amountStr);

    const balanceMatch = smsText.match(/(?:balance|bal)\s*(?:is)?\s*[:\-]?\s*(?:ETB|Birr)?\s*([\d,]+\.\d{2})/i) || smsText.match(/(?:balance|bal)\s*(?:is)?\s*([\d,]+\.\d{2})\s*(?:ETB|Birr)?/i);
    const balance = balanceMatch ? cleanAmount(balanceMatch[1]) : null;

    const dateMatch = smsText.match(/\b\d{1,2}[/\-]\d{1,2}[/\-]\d{4}\b/) || smsText.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const date = dateMatch ? parseDate(dateMatch[0]) : null;

    return {
      provider: 'boa',
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
      const match = input.match(/\/receipt\/([^/?#]+)/i) || input.match(/[?&]id=([^&]+)/i) || input.match(/[?&]trx=([^&]+)/i);
      transactionId = match ? match[1] : 'URL_TXN';
    } else {
      transactionId = input.trim();
      url = `https://cs.bankofabyssinia.com/slip/?trx=${transactionId}`;
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
      const details: Record<string, string> = {};

      const trRegex = /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(html)) !== null) {
        const label = trMatch[1].trim().replace(/:$/, '');
        const val = trMatch[2].trim();
        details[label] = val;
      }

      const cleanedHtml = html.replace(/<[^>]+>/g, '\n').replace(/\s+/g, ' ');
      const keys = [
        { label: /Transaction Reference|Ref|Reference/i, key: 'reference' },
        { label: /Amount/i, key: 'amount' },
        { label: /Payer|Sender|From/i, key: 'sender' },
        { label: /Payee|Receiver|To/i, key: 'receiver' },
        { label: /Date|Time/i, key: 'date' },
        { label: /Status/i, key: 'status' }
      ];

      for (const item of keys) {
        const regex = new RegExp(`${item.label.source}\\s*[:\-]?\\s*([^\\n\\t\\r\\s][^|\\n\\t\\r\\<]*)`, 'i');
        const m = cleanedHtml.match(regex);
        if (m && !details[item.key]) {
          details[item.key] = m[1].trim();
        }
      }

      const amountVal = cleanAmount(details['Amount'] || details['amount']);
      const payerName = normalizeName(details['Sender Name'] || details['sender'] || details['Payer Name'] || details['Payer']);
      const payerAccount = details['Sender Account'] || details['payer_account'] || details['Payer Account'] || null;
      const receiverName = normalizeName(details['Receiver Name'] || details['receiver'] || details['Payee Name'] || details['Payee']);
      const receiverAccount = details['Receiver Account'] || details['receiver_account'] || details['Payee Account'] || null;
      const dateVal = parseDate(details['Transaction Date'] || details['Date'] || details['date']);
      const statusStr = details['Status'] || details['status'] || '';

      const isSuccess = (amountVal !== null && transactionId !== '') && 
                        (!statusStr || /success|complete|done|successful/i.test(statusStr));

      return {
        payer_name: payerName,
        payer_account: payerAccount,
        receiver_name: receiverName,
        receiver_account: receiverAccount,
        amount: amountVal,
        currency: 'ETB',
        date: dateVal,
        reference: details['Transaction Reference'] || details['reference'] || transactionId,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        rawDetails: details
      };
    } catch (err: any) {
      return this.createUnverifiedResult(transactionId, { error: err.message });
    }
  }
}
