import type { BarcodeScan } from '../../domain/barcode/types';

/** Only a local decoding boundary; implementation belongs to a later phase. */
export interface BarcodeScanner {
  scan(): Promise<BarcodeScan | null>;
}
