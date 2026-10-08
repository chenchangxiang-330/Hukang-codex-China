import type { ChinaFoodRecord, DataUsePolicy } from '../../domain/food/types';

export type FoodLookupResult =
  | { readonly status: 'found'; readonly records: readonly ChinaFoodRecord[]; readonly sourceId: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable'; readonly sourceId: string; readonly reason: string };

/** Lookup absence is not OCR failure. UI may start a package-photo draft after not_found. */
export interface ChinaFoodRepository {
  findByGtin(gtin: string): Promise<FoodLookupResult>;
  saveConfirmed(record: ChinaFoodRecord): Promise<void>;
}

export interface LocalChinaFoodSource {
  readonly kind: 'LOCAL';
  readonly sourceId: string;
  findByGtin(gtin: string): Promise<FoodLookupResult>;
  saveConfirmed(record: ChinaFoodRecord): Promise<void>;
}

/** Future Hukang-controlled mainland service boundary. No implementation exists in Phase 1. */
export interface HukangChinaFoodService {
  readonly kind: 'CHINA_SERVICE';
  readonly sourceId: string;
  readonly policy: DataUsePolicy;
  findByGtin(gtin: string): Promise<FoodLookupResult>;
}

/** Future composition stays local-first; external sources default to an empty list. */
export interface ChinaFoodSources {
  readonly local: LocalChinaFoodSource;
  readonly authorizedMainlandServices: readonly HukangChinaFoodService[];
}
