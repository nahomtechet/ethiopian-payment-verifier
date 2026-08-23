/**
 * Verifier - the orchestrator. Pure business logic, no direct I/O.
 *
 * Flow:
 *   1. Validate input (bank exists, reference present, account if required)
 *   2. Get parser from registry
 *   3. Fetch receipt data from bank endpoint (via parser's fetchReceipt)
 *   4. Parse the response into a ParsedReceipt
 *   5. Return a Receipt entity
 *
 * For CBE PDF: extract text first, then parse
 * For geo-blocked banks: the parser handles fallback URLs
 */
import type { Result, Receipt, VerifyRequest, ChekiError } from "./types.js";
import { ok, err } from "./types.js";
import "../parsers/index.js";
import { getParser } from "../parsers/registry.js";
import { getBank, suggestBank } from "../manifest/loader.js";
import { detectBankFromUrl, isUrl } from "../adapters/url-detector.js";
import { CBEParser } from "../parsers/cbe.js";
import { DashenParser } from "../parsers/dashen.js";
import { BOAParser } from "../parsers/boa.js";
import { ZemenParser } from "../parsers/zemen.js";
import type { ParsedReceipt } from "./types.js";

function detectContentType(input: string, parserType: string): string {
  const trimmed = input.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "application/json";
  }

  if (/<html|<body|<div|<table|<span|<p[\s>]/i.test(trimmed)) {
    return "text/html";
  }

  if (parserType === "json") {
    try {
      JSON.parse(trimmed);
      return "application/json";
    } catch {
      return "text/plain";
    }
  }

  return "text/html";
}

function wrapPlainText(text: string, bankCode: string): string {
  const bankMarker =
    bankCode === "telebirr" ? "telebirr receipt" :
    bankCode === "mpesa" ? "mpesa receipt" : "";
  return `<html><head><title>${bankMarker}</title></head><body><pre>${text}</pre></body></html>`;
}

export class Verifier {
  /**
   * Offline parsing: parse raw HTML, JSON, or plain text data natively
   * without calling any bank endpoints. Useful for mobile copy-paste flows.
   */
  async parseOffline(request: { bank?: string; data: string; url?: string }): Promise<Result<Receipt, ChekiError>> {
    const startTime = Date.now();
    let bankCode = request.bank;
    let url = request.url;
    let rawData = request.data;

    if (rawData && isUrl(rawData)) {
      const detected = detectBankFromUrl(rawData);
      if (detected) {
        return ok({
          verified: true,
          bank: getBank(detected.bank)?.name || detected.bank,
          bankCode: detected.bank,
          reference: detected.reference,
          currency: "ETB",
          sourceUrl: rawData,
          durationMs: Date.now() - startTime,
        });
      }
      return err({ kind: "MISSING_INPUT", field: "data", message: "Could not auto-detect bank from URL." });
    }

    if (!bankCode && url) {
      if (url.includes("ethiotelecom.et")) bankCode = "telebirr";
      else if (url.includes("safaricom.et") || url.includes("m-pesa")) bankCode = "mpesa";
    }

    if (!bankCode) {
      return err({ kind: "MISSING_INPUT", field: "bank", message: "Bank code is required." });
    }

    if (!rawData || !rawData.trim()) {
      return err({ kind: "MISSING_INPUT", field: "data", message: "Receipt content is required." });
    }

    const parser = getParser(bankCode);
    if (!parser) {
      return err({ kind: "BANK_NOT_SUPPORTED", bank: bankCode, message: `Bank "${bankCode}" is not supported.` });
    }

    const contentType = detectContentType(rawData, parser.responseType);
    let parseData = rawData;
    
    if (contentType === "text/html" && !/<html|<body|<div|<table|<span|<p[\s>]/i.test(rawData.trim())) {
      parseData = wrapPlainText(rawData, bankCode);
    }

    const parsed: ParsedReceipt = parser.parse(parseData, contentType);

    if (!parsed.verified) {
      const isPlainText = contentType === "text/plain";
      const errorMsg = isPlainText
        ? `Could not parse the receipt from the pasted text.`
        : `Could not parse receipt from the provided content.`;
      
      return err({ kind: "EXTRACTION_ERROR", bank: parser.bankName, message: errorMsg });
    }

    return ok({
      verified: true,
      bank: parser.bankName,
      bankCode: bankCode,
      reference: parsed.reference || "unknown",
      senderName: parsed.senderName,
      senderAccount: parsed.senderAccount,
      receiverName: parsed.receiverName,
      receiverAccount: parsed.receiverAccount,
      amount: parsed.amount,
      currency: parsed.currency || "ETB",
      date: parsed.date,
      sourceUrl: url || "(via offline parse)",
      durationMs: Date.now() - startTime,
      invoiceNumber: parsed.invoiceNumber,
      transactionStatus: parsed.transactionStatus,
      settledAmount: parsed.settledAmount,
      stampDuty: parsed.stampDuty,
      discountAmount: parsed.discountAmount,
      serviceFee: parsed.serviceFee,
      serviceFeeVat: parsed.serviceFeeVat,
      totalPaid: parsed.totalPaid,
      amountInWords: parsed.amountInWords,
      paymentMode: parsed.paymentMode,
      paymentChannel: parsed.paymentChannel,
      bankAccountNumber: parsed.bankAccountNumber,
      bankAccountName: parsed.bankAccountName,
      reason: parsed.reason,
    });
  }

  /**
   * Verify a single receipt online.
   */
  async verify(request: VerifyRequest): Promise<Result<Receipt, ChekiError>> {
    const startTime = Date.now();
    let { bank, reference, accountNumber } = request;
    const { phoneNumber, qrData } = request;

    // Validate reference (or QR data for BOA)
    if (!reference && !qrData) {
      return err({
        kind: "MISSING_INPUT",
        field: "reference",
        message: "Reference number, receipt URL, or QR data is required.",
      });
    }

    // Auto-detect bank from URL
    const trimmedRef = (reference || "").trim();
    if (trimmedRef && isUrl(trimmedRef)) {
      const detected = detectBankFromUrl(trimmedRef);
      if (detected) {
        bank = detected.bank;
        reference = detected.reference;
        if (detected.accountNumber && !accountNumber) {
          accountNumber = detected.accountNumber;
        }
      } else {
        return err({
          kind: "MISSING_INPUT",
          field: "reference",
          message: "Could not detect bank from URL. Please paste the reference number manually.",
        });
      }
    }

    // Validate bank
    if (!bank) {
      return err({
        kind: "MISSING_INPUT",
        field: "bank",
        message: "Bank is required.",
      });
    }

    // Auto-switch to CBE New if a v2- reference is passed directly to the legacy CBE bank
    if (bank === "cbe" && reference && reference.startsWith("v2-")) {
      bank = "cbe-new";
    }

    const manifestEntry = getBank(bank);
    if (!manifestEntry) {
      const suggestion = suggestBank(bank);
      return err({
        kind: "BANK_NOT_SUPPORTED",
        bank,
        suggestion: suggestion && suggestion !== bank ? suggestion : undefined,
      });
    }

    // Check if bank is in development
    if (manifestEntry.status === "in-development") {
      return err({
        kind: "BANK_NOT_SUPPORTED",
        bank: bank,
        message: `${manifestEntry.name} is in development and not yet supported.`,
      } as ChekiError);
    }

    // Validate account number if required (skip for QR-based verification)
    if (manifestEntry.requiresAccount && !accountNumber && !qrData) {
      return err({
        kind: "MISSING_INPUT",
        field: "accountNumber",
        message: "The transaction number or link is not valid. Please enter the correct one.",
      });
    }

    // Get parser
    const parser = getParser(bank.toLowerCase());
    if (!parser) {
      return err({
        kind: "BANK_NOT_SUPPORTED",
        bank,
        message: `No parser registered for ${manifestEntry.name}.`,
      } as ChekiError);
    }

    // QR-based verification
    if (qrData) {
      // Non-BOA banks: QR content is usually a URL or plain reference.
      // Treat it as reference input and let the normal flow handle it.
      if (parser.bankId !== "boa") {
        // If qrData looks like a URL, detect bank + extract reference
        if (isUrl(qrData)) {
          const detected = detectBankFromUrl(qrData);
          if (detected) {
            bank = detected.bank;
            reference = detected.reference;
            if (detected.accountNumber && !accountNumber) {
              accountNumber = detected.accountNumber;
            }
            // Re-validate bank after QR detection
            const qrManifest = getBank(bank);
            if (!qrManifest) {
              return err({
                kind: "BANK_NOT_SUPPORTED",
                bank,
                message: `QR detected as ${bank}, but that bank is not supported.`,
              });
            }
            const qrParser = getParser(bank);
            if (!qrParser) {
              return err({
                kind: "BANK_NOT_SUPPORTED",
                bank,
                message: `No parser registered for ${qrManifest.name}.`,
              });
            }
            // Fall through to normal fetch with extracted reference
            const ref = reference;
            const fallbackUrl = qrParser.buildUrl(ref, accountNumber, phoneNumber);
            const fetchResult = await qrParser.fetchReceipt(ref, accountNumber, phoneNumber, { fallbackUrl });
            if (!fetchResult.ok) return fetchResult;
            const { data, contentType } = fetchResult.value;
            const durationMs = Date.now() - startTime;

            // CBE PDF handling
            if (bank.toLowerCase() === "cbe") {
              const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
              if (!buf.toString("ascii", 0, 4).includes("%PDF")) {
                return err({
                  kind: "EXTRACTION_ERROR",
                  bank: qrManifest.name,
                  message: "The bank did not return a valid receipt PDF.",
                });
              }
              const text = await CBEParser.extractPdfText(buf);
              const parsed = CBEParser.parsePdfText(text);
              if (!parsed.verified) {
                return err({
                  kind: "EXTRACTION_ERROR",
                  bank: qrManifest.name,
                  message: "Could not parse the receipt PDF.",
                });
              }
              return ok({
                ...parsed,
                bank: qrManifest.name,
                bankCode: qrManifest.id,
                reference: ref,
                sourceUrl: fallbackUrl,
                durationMs,
              });
            }

            // All other banks: parse directly
            const parsed = qrParser.parse(data, contentType);
            if (!parsed.verified) {
              return err({
                kind: "EXTRACTION_ERROR",
                bank: qrManifest.name,
                message: "Receipt not found or invalid.",
              });
            }
            return ok({
              ...parsed,
              bank: qrManifest.name,
              bankCode: qrManifest.id,
              reference: parsed.reference || ref,
              sourceUrl: fallbackUrl,
              durationMs,
            });
          }
        }

        // Not a URL — treat qrData as a plain reference for this bank
        reference = qrData;
        // Fall through to normal verification below
      } else {
        // BOA: encrypted QR payload → decrypt
        const boaParser = parser as BOAParser;
        const parsed = boaParser.decryptQr(qrData);
        const durationMs = Date.now() - startTime;
        if (!parsed.verified || !parsed.reference) {
          return err({
            kind: "EXTRACTION_ERROR",
            bank: manifestEntry.name,
            message: "Could not decrypt the QR code. It may be malformed or not a BOA receipt.",
          });
        }
        return ok({
          ...parsed,
          bank: manifestEntry.name,
          bankCode: manifestEntry.id,
          reference: parsed.reference,
          sourceUrl: "qr://boa",
          durationMs,
        });
      }
    }

    // Fetch receipt data (reference is guaranteed here because qrData path is handled above)
    if (!reference) {
      return err({
        kind: "MISSING_INPUT",
        field: "reference",
        message: "Reference number or receipt URL is required.",
      });
    }
    const ref = reference;
    const fallbackUrl = parser.buildUrl(ref, accountNumber, phoneNumber);
    const fetchResult = await parser.fetchReceipt(ref, accountNumber, phoneNumber, { fallbackUrl });

    if (!fetchResult.ok) {
      return fetchResult;
    }

    const { data, contentType } = fetchResult.value;
    const durationMs = Date.now() - startTime;

    // CBE PDF: special handling (extract text first)
    if (bank.toLowerCase() === "cbe") {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (!buf.toString("ascii", 0, 4).includes("%PDF")) {
        return err({
          kind: "EXTRACTION_ERROR",
          bank: manifestEntry.name,
          message: "The bank did not return a valid receipt PDF. The reference or account may be incorrect.",
        });
      }
      const text = await CBEParser.extractPdfText(buf);
      const parsed = CBEParser.parsePdfText(text);
      if (!parsed.verified) {
        return err({
          kind: "EXTRACTION_ERROR",
          bank: manifestEntry.name,
          message: "Could not parse the receipt PDF. The reference or account may be incorrect.",
        });
      }
      return ok({
        ...parsed,
        bank: manifestEntry.name,
        bankCode: manifestEntry.id,
        reference: ref,
        sourceUrl: fallbackUrl,
        durationMs,
      });
    }

    // Dashen PDF: special handling (extract text first)
    if (bank.toLowerCase() === "dashen") {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (!buf.toString("ascii", 0, 4).includes("%PDF")) {
        return err({
          kind: "EXTRACTION_ERROR",
          bank: manifestEntry.name,
          message: "The bank did not return a valid receipt PDF. Check the reference number.",
        });
      }
      const text = await DashenParser.extractPdfText(buf);
      const parsed = DashenParser.parsePdfText(text);
      if (!parsed.verified) {
        return err({
          kind: "EXTRACTION_ERROR",
          bank: manifestEntry.name,
          message: "Could not parse the Dashen receipt PDF. Check the reference number.",
        });
      }
      return ok({
        ...parsed,
        bank: manifestEntry.name,
        bankCode: manifestEntry.id,
        reference: parsed.reference || ref,
        sourceUrl: fallbackUrl,
        durationMs,
      });
    }

    // Zemen PDF: special handling (extract text first)
    if (bank.toLowerCase() === "zemen") {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (!buf.toString("ascii", 0, 4).includes("%PDF")) {
        return err({
          kind: "EXTRACTION_ERROR",
          bank: manifestEntry.name,
          message: "The bank did not return a valid receipt PDF. Check the reference number.",
        });
      }
      const text = await ZemenParser.extractPdfText(buf);
      const parsed = ZemenParser.parsePdfText(text);
      if (!parsed.verified) {
        return err({
          kind: "EXTRACTION_ERROR",
          bank: manifestEntry.name,
          message: "Could not parse the Zemen receipt PDF. Check the reference number.",
        });
      }
      return ok({
        ...parsed,
        bank: manifestEntry.name,
        bankCode: manifestEntry.id,
        reference: parsed.reference || ref,
        sourceUrl: fallbackUrl,
        durationMs,
      });
    }

    // All other banks: parse directly
    const parsed = parser.parse(data, contentType);
    if (!parsed.verified) {
      return err({
        kind: "EXTRACTION_ERROR",
        bank: manifestEntry.name,
        message: "Receipt not found or invalid.",
      });
    }

    return ok({
      ...parsed,
      bank: manifestEntry.name,
      bankCode: manifestEntry.id,
      reference: parsed.reference || ref,
      sourceUrl: fallbackUrl,
      durationMs,
    });
  }

  /**
   * Verify multiple receipts in parallel (batch).
   */
  async verifyBatch(requests: VerifyRequest[]): Promise<Result<Receipt, ChekiError>[]> {
    return Promise.all(requests.map((r) => this.verify(r)));
  }
}
