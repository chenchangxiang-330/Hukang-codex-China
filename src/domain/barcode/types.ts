/**
 * The values emitted by ZXing/Camera2 adapters are deliberately kept as
 * strings.  A scanner adapter must not turn a barcode into a JavaScript
 * number: that would lose leading zeroes before the domain can validate it.
 */
export interface BarcodeScan {
  readonly rawValue: string;
  readonly format: string;
  readonly decodedAt: string;
}

export type BarcodeAcquisitionMethod = 'camera' | 'image' | 'manual';

/** A durable local association; the raw encoding is never replaced by lookup normalization. */
export interface FoodBarcodeAssociation {
  readonly id: string;
  readonly foodId: string;
  readonly rawValue: string;
  readonly format: SupportedBarcodeFormat;
  readonly lookupKey: string;
  /** Invalid scans never enter this association table; this makes that invariant explicit. */
  readonly validationStatus: 'valid';
  readonly acquiredBy: BarcodeAcquisitionMethod;
  readonly scannedAt: string;
}

export type SupportedBarcodeFormat = 'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E';

export type BarcodeValidationReason =
  | 'unsupported_format'
  | 'non_digit_value'
  | 'wrong_length'
  | 'invalid_check_digit'
  | 'unsupported_number_system';

export interface ValidatedBarcode {
  readonly scan: BarcodeScan;
  /**
   * The validated GTIN representation. EAN/UPC-A retain their encoded
   * length; UPC-E is expanded to its UPC-A representation. This field is
   * never populated for an invalid or unsupported scan.
   */
  readonly gtin: string | null;
  /**
   * A stable 14-digit query key. EAN-13, EAN-8 and UPC-A that describe the
   * same item therefore resolve to the same local-food key. It is separate
   * from `gtin` so the original encoding remains visible to the user.
   */
  readonly lookupKey: string | null;
  readonly normalizedFormat: SupportedBarcodeFormat | null;
  readonly validity: 'valid' | 'invalid' | 'not_gtin' | 'ambiguous';
  readonly reason: BarcodeValidationReason | null;
}
