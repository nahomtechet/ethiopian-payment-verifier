/**
 * Advanced security utilities for detecting fraud, anomalies, and tampered receipts.
 * @module
 * @since 2.2.0
 */

/**
 * Result of scanning an uploaded receipt image for metadata tampering.
 */
export interface ImageScanResult {
  /** True if known photo editing software was detected in the EXIF/metadata. */
  edited: boolean;
  /** List of software tags found (e.g. `['Adobe Photoshop 2024', 'GIMP']`). */
  softwareTags: string[];
  /** Overall risk assessment for this image. */
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Scans an image buffer for EXIF metadata that indicates it was edited in software
 * like Photoshop, GIMP, or Illustrator. 
 * Note: This is a heuristic and can be stripped by attackers, so use as a defense-in-depth layer.
 * 
 * @param imageBuffer - The binary buffer of a JPEG or PNG file.
 * @returns An `ImageScanResult` with detected software tags and a risk level.
 * @since 2.2.0
 */
export async function scanImageMetadata(imageBuffer: Buffer): Promise<ImageScanResult> {
  const softwareTags: string[] = [];
  
  // Convert buffer to string for a quick loose regex scan of EXIF/text chunks.
  // In a real-world scenario, you might use a proper EXIF parser library.
  // For lightweight defense, we scan the raw binary for known signatures.
  const dataString = imageBuffer.toString('binary', 0, Math.min(imageBuffer.length, 65536));

  const knownEditors = [
    /Adobe\sPhotoshop/i,
    /GIMP/i,
    /Illustrator/i,
    /CorelDRAW/i,
    /Affinity\sPhoto/i,
    /Pixelmator/i,
    /Snapseed/i
  ];

  for (const regex of knownEditors) {
    const match = dataString.match(regex);
    if (match) {
      softwareTags.push(match[0]);
    }
  }

  const edited = softwareTags.length > 0;
  
  return {
    edited,
    softwareTags,
    risk: edited ? 'HIGH' : 'LOW'
  };
}

/**
 * Options for detecting amount anomalies.
 */
export interface AnomalyOptions {
  /** The typical expected range for transactions in this application. */
  typical: { min: number; max: number };
  /** Maximum allowed amount before it's flagged as suspiciously large. Defaults to `typical.max * 10`. */
  absoluteMax?: number;
}

/**
 * Result of an amount anomaly check.
 */
export interface AnomalyResult {
  /** True if the amount looks suspicious. */
  suspicious: boolean;
  /** Reasons why the amount was flagged. */
  reasons: string[];
}

/**
 * Flags suspicious amounts that are unusually large, perfectly round, 
 * or fall far outside the expected business range.
 * 
 * @param amount - The transaction amount in ETB.
 * @param options - Configuration for typical ranges.
 * @returns An `AnomalyResult` detailing if and why it was flagged.
 * @since 2.2.0
 */
export function detectAmountAnomaly(amount: number, options: AnomalyOptions): AnomalyResult {
  const reasons: string[] = [];
  const maxAllowed = options.absoluteMax ?? (options.typical.max * 10);

  if (amount > maxAllowed) {
    reasons.push(`Amount ${amount} ETB exceeds absolute maximum limit of ${maxAllowed} ETB.`);
  } else if (amount > options.typical.max) {
    reasons.push(`Amount ${amount} ETB is unusually high (typical max is ${options.typical.max} ETB).`);
  } else if (amount < options.typical.min) {
    reasons.push(`Amount ${amount} ETB is unusually low (typical min is ${options.typical.min} ETB).`);
  }

  // Check for suspicious "perfectly round" large numbers (e.g., exactly 100,000.00)
  if (amount >= 50000 && amount % 10000 === 0) {
    reasons.push(`Amount ${amount} ETB is suspiciously round for a large transaction.`);
  }

  return {
    suspicious: reasons.length > 0,
    reasons
  };
}

/**
 * Result of an image cross-check.
 */
export interface ImageCrossCheckResult {
  /** Confidence score from 0 to 100. */
  tamperScore: number;
  /** Warnings and reasons for deductions. */
  flags: string[];
}

/**
 * Checks an uploaded receipt image for tampering by combining metadata scanning
 * with visual OCR mismatch detection (stubbed for future expansion).
 * 
 * @param imageBuffer - The binary buffer of the receipt image.
 * @param expected - Expected values to check against.
 * @returns An `ImageCrossCheckResult`.
 * @since 2.2.0
 */
export async function crossCheckImage(
  imageBuffer: Buffer, 
  expected: { expectedAmount?: number }
): Promise<ImageCrossCheckResult> {
  const flags: string[] = [];
  let score = 100;

  // 1. Check EXIF metadata
  const meta = await scanImageMetadata(imageBuffer);
  if (meta.edited) {
    score -= 40;
    flags.push(`Image metadata indicates it was edited with: ${meta.softwareTags.join(', ')}`);
  }

  // 2. Future: Check compression artifacts (ELA - Error Level Analysis)
  // 3. Future: Compare OCR text bounds against standard template bounds
  
  if (score < 0) score = 0;

  return {
    tamperScore: score,
    flags
  };
}
