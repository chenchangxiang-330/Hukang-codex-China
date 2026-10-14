import { requireNativeModule } from 'expo-modules-core';

export type NativeBarcodeFormat = 'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E';

export interface NativeBarcodeResult {
  readonly rawValue: string;
  readonly format: NativeBarcodeFormat;
  readonly source: 'image';
  readonly decodedAt: string;
  readonly boundingBox: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  } | null;
  readonly imageWidth: number;
  readonly imageHeight: number;
}

interface HukangBarcodeModule {
  scanImage(uri: string): Promise<NativeBarcodeResult[]>;
}

let nativeModule: HukangBarcodeModule | undefined;

function barcodeModule(): HukangBarcodeModule {
  nativeModule ??= requireNativeModule<HukangBarcodeModule>('HukangBarcode');
  return nativeModule;
}

/**
 * Offline image decoder boundary. The native implementation accepts only
 * file:// and content:// URIs, so a URL can never trigger hidden network I/O.
 */
export const hukangBarcode = {
  scanImage(uri: string): Promise<NativeBarcodeResult[]> {
    return barcodeModule().scanImage(uri);
  },
};
