import type { SupportedBarcodeFormat } from '../../domain/barcode/types';

/**
 * Only the validated barcode identity crosses the network boundary. Images,
 * OCR text and a user's food record never belong in this request.
 */
export interface IdentityQuery {
  readonly rawValue: string;
  readonly gtin: string;
  readonly lookupKey: string;
  readonly format: SupportedBarcodeFormat;
}

export interface FoodIdentity {
  readonly name: string;
  readonly brand: string | null;
  readonly specification: string | null;
  readonly category: string | null;
  readonly manufacturer: string | null;
  /** A provider record identifier, never a URL or a user identifier. */
  readonly sourceRecordId: string | null;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly obtainedAt: string;
  readonly sourceUpdatedAt: string | null;
}

/** ProviderStatus is deliberately more detailed than HTTP status. */
export type ProviderStatus =
  | 'found'
  | 'not_found'
  | 'disabled'
  | 'not_configured'
  | 'unsupported_format'
  | 'invalid_request'
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'unauthorized'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response'
  | 'identity_conflict';

export type IdentityResult =
  | { readonly status: 'found'; readonly identity: FoodIdentity }
  | {
      readonly status: Exclude<ProviderStatus, 'found'>;
      /** Safe, user-facing explanation; never includes response bodies or secrets. */
      readonly message: string;
      readonly retryAfterSeconds?: number;
    };

export interface ChinaFoodIdentityProvider {
  readonly kind: 'CHINA_SERVICE';
  readonly sourceId: string;
  readonly sourceName: string;
  readonly enabled: boolean;
  lookup(query: IdentityQuery, options?: { readonly signal?: AbortSignal }): Promise<IdentityResult>;
}
