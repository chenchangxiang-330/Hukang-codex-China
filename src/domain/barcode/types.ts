/** Scanner does not know or call a food provider. */
export interface BarcodeScan {
  readonly rawValue: string;
  readonly format: string;
  readonly decodedAt: string;
}

export interface ValidatedBarcode {
  readonly scan: BarcodeScan;
  readonly gtin: string | null;
  readonly validity: 'valid' | 'invalid' | 'not_gtin' | 'ambiguous';
}
