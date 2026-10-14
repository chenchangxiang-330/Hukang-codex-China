import type {
  BarcodeScan,
  BarcodeValidationReason,
  SupportedBarcodeFormat,
  ValidatedBarcode,
} from './types';

/** Names used by common ZXing and Camera2 adapters, reduced to our four food formats. */
export function normalizeBarcodeFormat(format: string): SupportedBarcodeFormat | null {
  if (typeof format !== 'string') return null;
  const key = format.toUpperCase().replace(/[\s_-]/g, '');
  switch (key) {
    case 'EAN13': return 'EAN_13';
    case 'EAN8': return 'EAN_8';
    case 'UPCA': return 'UPC_A';
    case 'UPCE': return 'UPC_E';
    default: return null;
  }
}

/** GS1 modulo-10 check digit. `digits` includes the check digit. */
export function hasValidCheckDigit(digits: string): boolean {
  if (!/^\d{8,14}$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const check = Number(digits[digits.length - 1]);
  let sum = 0;
  let weight = 3;
  for (let index = digits.length - 2; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

function invalid(
  scan: BarcodeScan,
  validity: ValidatedBarcode['validity'],
  reason: BarcodeValidationReason | null,
  normalizedFormat: SupportedBarcodeFormat | null = null,
): ValidatedBarcode {
  return { scan, gtin: null, lookupKey: null, normalizedFormat, validity, reason };
}

function lookupKey(gtin: string): string {
  return gtin.padStart(14, '0');
}

/**
 * Expand an explicitly identified UPC-E value to its UPC-A representation.
 *
 * UPC-E is only six compressed data digits plus number system and check digit.
 * We never infer this format from an eight-digit value: callers must supply
 * `UPC_E` as the scanner format. Number systems other than 0/1 are rejected
 * because accepting them would turn an ambiguous value into a made-up item.
 */
export function expandUpcEToUpcA(value: string): string | null {
  if (!/^\d{8}$/.test(value)) return null;
  const numberSystem = value[0];
  if (numberSystem !== '0' && numberSystem !== '1') return null;
  const x1 = value[1];
  const x2 = value[2];
  const x3 = value[3];
  const x4 = value[4];
  const x5 = value[5];
  const x6 = value[6];
  const check = value[7];
  let body: string;
  if (x6 === '0' || x6 === '1' || x6 === '2') {
    body = `${numberSystem}${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  } else if (x6 === '3') {
    body = `${numberSystem}${x1}${x2}${x3}00000${x4}${x5}`;
  } else if (x6 === '4') {
    body = `${numberSystem}${x1}${x2}${x3}${x4}00000${x5}`;
  } else {
    body = `${numberSystem}${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  }
  const upcA = `${body}${check}`;
  return hasValidCheckDigit(upcA) ? upcA : null;
}

function expectedLength(format: SupportedBarcodeFormat): number {
  switch (format) {
    case 'EAN_13': return 13;
    case 'EAN_8': return 8;
    case 'UPC_A': return 12;
    case 'UPC_E': return 8;
  }
}

/**
 * Validate a scanner result without consulting a food provider.
 *
 * Raw text and format are retained exactly in `scan`. Whitespace, punctuation
 * and other characters are rejected rather than silently stripped. This is
 * particularly important for manual input and for distinguishing an invalid
 * barcode from one that the local food database simply does not contain.
 */
export function normalizeBarcode(scan: BarcodeScan): ValidatedBarcode {
  const format = normalizeBarcodeFormat(scan.format);
  if (!format) return invalid(scan, 'not_gtin', 'unsupported_format');
  const value = scan.rawValue;
  if (!/^\d+$/.test(value)) return invalid(scan, 'invalid', 'non_digit_value', format);
  if (value.length !== expectedLength(format)) return invalid(scan, 'invalid', 'wrong_length', format);

  if (format === 'UPC_E') {
    if (value[0] !== '0' && value[0] !== '1') {
      return invalid(scan, 'ambiguous', 'unsupported_number_system', format);
    }
    const expanded = expandUpcEToUpcA(value);
    if (!expanded) return invalid(scan, 'invalid', 'invalid_check_digit', format);
    return {
      scan,
      gtin: expanded,
      lookupKey: lookupKey(expanded),
      normalizedFormat: format,
      validity: 'valid',
      reason: null,
    };
  }

  if (!hasValidCheckDigit(value)) return invalid(scan, 'invalid', 'invalid_check_digit', format);
  return {
    scan,
    gtin: value,
    lookupKey: lookupKey(value),
    normalizedFormat: format,
    validity: 'valid',
    reason: null,
  };
}

/** Descriptive alias for callers that prefer the validator terminology. */
export const validateBarcode = normalizeBarcode;

/**
 * Canonicalize an already typed GTIN for local queries. This helper validates
 * the check digit and supports GTIN-8/12/13/14 only; it does not guess UPC-E.
 */
export function canonicalGtin14(value: string): string | null {
  if (!/^\d{8,14}$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return null;
  return hasValidCheckDigit(value) ? lookupKey(value) : null;
}

