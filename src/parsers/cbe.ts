import { BaseParser } from './base.js';
import { ParseResult, VerificationResult, VerifierOptions } from '../types.js';
import { cleanAmount, normalizeName, parseDate, request } from '../utils.js';

export class CBEParser extends BaseParser {
  readonly providerName = 'cbe';

  matches(input: string): boolean {
    return (
      /FT[A-Z0-9]{10,}/i.test(input) || 
      /cbe\.com\.et/i.test(input) || 
      /Commercial\s+Bank\s+of\s+Ethiopia/i.test(input) ||
      (/CBE/i.test(input) && /Birr/i.test(input))
    );
  }

  parseSMS(smsText: string): ParseResult {
    const refMatch = smsText.match(/\b(FT[A-Z0-9]+)\b/i);
    const transactionId = refMatch ? refMatch[1].toUpperCase() : null;

    const amountMatch = smsText.match(/(?:ETB|Birr)\s*([\d,]+\.\d{2})|([\d,]+\.\d{2})\s*(?:ETB|Birr)/i);
    const amountStr = amountMatch ? (amountMatch[1] || amountMatch[2]) : null;
    const amount = cleanAmount(amountStr);

    const balanceMatch = smsText.match(/Balance\s*(?:is)?\s*(?:ETB|Birr)?\s*([\d,]+\.\d{2})/i);
    const balanceStr = balanceMatch ? balanceMatch[1] : null;
    const balance = cleanAmount(balanceStr);

    const dateMatch = smsText.match(/\b\d{1,2}[/\-]\d{1,2}[/\-]\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*:\d{2})?)?\b/);
    const date = dateMatch ? parseDate(dateMatch[0]) : null;

    return {
      provider: 'cbe',
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
    let receiptToken = '';

    if (input.startsWith('http://') || input.startsWith('https://')) {
      url = input;
      const match = input.match(/[?&]id=([^&]+)/i) || 
                    input.match(/\/receipt\/([^?&#]+)/i) || 
                    input.match(/\/([^\/?#]+)(?:[?#]|$)/);
      transactionId = match ? match[1] : 'URL_TXN';
      receiptToken = transactionId;
    } else {
      transactionId = input.trim();
      // Traditional CBE verification link format
      url = `https://apps.cbe.com.et:100/?id=${transactionId}`;
    }

    // If we have a v2 receipt token, fetch the official backend API directly
    if (receiptToken && receiptToken.startsWith('v2-')) {
      try {
        const apiUrl = `https://Mb.cbe.com.et/api/v1/transactions/public/transaction-detail/${receiptToken}`;
        const res = await request(apiUrl, {
          proxy: options.proxy,
          timeout: options.timeout,
          headers: {
            'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
            'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
            'user-agent': options.userAgent || ''
          }
        });

        if (res.status === 200) {
          const data = JSON.parse(res.body);
          if (data && data.id) {
            return {
              payer_name: normalizeName(data.debitAccountHolder),
              payer_account: data.debitAccountNo || null,
              receiver_name: normalizeName(data.creditAccountHolder),
              receiver_account: data.creditAccountNo || null,
              amount: cleanAmount(data.amountCredited || data.debitAmount),
              currency: 'ETB',
              date: parseDate(data.dateTimes ? data.dateTimes[0] : null),
              reference: data.id,
              status: data.status === 'COMPLETED' ? 'SUCCESS' : 'FAILED',
              rawDetails: data
            };
          }
        }
      } catch (err: any) {
        // Fall back to scraping on API failures
      }
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

      // Scrape typical HTML layout (table rows <td>Label</td><td>Value</td>)
      const trRegex = /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(html)) !== null) {
        if (trMatch[1] && trMatch[2]) {
          const label = trMatch[1].trim().replace(/:$/, '');
          const val = trMatch[2].trim();
          details[label] = val;
        }
      }

      // If no standard tables matched, try label-value classes
      if (Object.keys(details).length === 0) {
        const spanRegex = /<span[^>]*class="[^"]*label[^"]*"[^>]*>([^<]+)<\/span>\s*<span[^>]*class="[^"]*value[^"]*"[^>]*>([^<]+)<\/span>/gi;
        let spanMatch;
        while ((spanMatch = spanRegex.exec(html)) !== null) {
          if (spanMatch[1] && spanMatch[2]) {
            const label = spanMatch[1].trim().replace(/:$/, '');
            const val = spanMatch[2].trim();
            details[label] = val;
          }
        }
      }

      // Fallback text parser (line-by-line scanner using keywords)
      const cleanedHtml = html.replace(/<[^>]+>/g, '\n').replace(/\s+/g, ' ');
      const keys = [
        { label: /(?:Transaction Reference|Ref|Reference)/i, key: 'reference' },
        { label: /(?:Amount|Value)/i, key: 'amount' },
        { label: /(?:Payer|Sender|From)/i, key: 'sender' },
        { label: /(?:Payee|Receiver|To)/i, key: 'receiver' },
        { label: /(?:Date|Time)/i, key: 'date' },
        { label: /(?:Status)/i, key: 'status' }
      ];

      for (const item of keys) {
        const regex = new RegExp(`(?:${item.label.source})\\s*[:\-]?\\s*([^\\n\\t\\r\\s][^|\\n\\t\\r\\<]*)`, 'i');
        const m = cleanedHtml.match(regex);
        if (m && m[1] && !details[item.key]) {
          details[item.key] = m[1].trim();
        }
      }

      const amountVal = cleanAmount(details['Amount'] || details['amount'] || details['Value']);
      const payerName = normalizeName(details['Payer Name'] || details['Payer'] || details['sender'] || details['From Name']);
      const payerAccount = details['Payer Account'] || details['payer_account'] || details['Sender Account'] || null;
      const receiverName = normalizeName(details['Payee Name'] || details['Payee'] || details['receiver'] || details['To Name']);
      const receiverAccount = details['Payee Account'] || details['receiver_account'] || details['Receiver Account'] || null;
      const dateVal = parseDate(details['Transaction Date'] || details['Date'] || details['date']);
      const statusStr = details['Status'] || details['status'] || '';

      const isSuccess = (amountVal !== null && transactionId !== '') && 
                        (!statusStr || /success|complete|done|paid|successful/i.test(statusStr));

      return {
        payer_name: payerName,
        payer_account: payerAccount,
        receiver_name: receiverName,
        receiver_account: receiverAccount,
        amount: amountVal,
        currency: 'ETB',
        date: dateVal,
        reference: details['Transaction Reference No'] || details['reference'] || transactionId,
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        rawDetails: details
      };
    } catch (err: any) {
      return this.createUnverifiedResult(transactionId, { error: err.message });
    }
  }
}

