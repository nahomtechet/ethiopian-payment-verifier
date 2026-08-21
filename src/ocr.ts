import { createWorker } from 'tesseract.js';

/**
 * Extracts raw text from a receipt screenshot using Tesseract OCR.
 * Supports image file paths (Node.js) or Buffer streams.
 */
export async function extractTextFromImage(
  imageInput: string | Buffer,
  options: { lang?: string; logger?: (arg: any) => void } = {}
): Promise<string> {
  const lang = options.lang || 'eng';
  
  // Create Tesseract worker
  const worker = await createWorker();
  
  try {
    const ret = await worker.recognize(imageInput);
    // Collapse spacing and normalize whitespace
    const text = ret.data.text
      .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ')
      .trim();
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Scrapes a raw text block for known transaction links or reference numbers.
 */
export function extractReferenceFromText(text: string): { reference: string | null; url: string | null } {
  // Check for CBE/Telebirr receipt URLs
  const urlMatch = text.match(/https?:\/\/[^\s'"`()]+/gi);
  if (urlMatch) {
    for (const url of urlMatch) {
      if (/mbreciept\.cbe\.com\.et/i.test(url) || /transactioninfo\.ethiotelecom\.et/i.test(url)) {
        return { reference: null, url: url };
      }
    }
  }

  // Check for standard CBE transaction references (e.g. FT26233XL4SS)
  const ftMatch = text.match(/\b(FT[A-Z0-9]+)\b/i);
  if (ftMatch) {
    return { reference: ftMatch[1].toUpperCase(), url: null };
  }

  // Telebirr transaction ID (usually 10 digits/characters or letters)
  const teleMatch = text.match(/\b([A-Z0-9]{10,12})\b/i);
  if (teleMatch) {
    // Basic filter to ensure it's not a generic word
    const code = teleMatch[1].toUpperCase();
    if (/[A-Z]/.test(code) && /[0-9]/.test(code)) {
      return { reference: code, url: null };
    }
  }

  return { reference: null, url: null };
}
