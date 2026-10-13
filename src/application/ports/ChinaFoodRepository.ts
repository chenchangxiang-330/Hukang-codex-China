import type { ChinaFoodRecord, DataUsePolicy } from '../../domain/food/types';
import type { FoodScanRecord, FoodSummary } from '../../domain/food/scan';
import type { FoodIdentity } from '../../domain/food/identity';
import type { FoodBarcodeAssociation, ValidatedBarcode, BarcodeAcquisitionMethod } from '../../domain/barcode/types';

export type FoodLookupResult =
  | { readonly status: 'found'; readonly records: readonly ChinaFoodRecord[]; readonly sourceId: string }
  | { readonly status: 'not_found' }
  | { readonly status: 'unavailable'; readonly sourceId: string; readonly reason: string };

/** Lookup absence is not OCR failure. UI may start a package-photo draft after not_found. */
export interface ChinaFoodRepository {
  getFood(id: string): Promise<FoodScanRecord | null>;
  listFoods(query?: string): Promise<readonly FoodSummary[]>;
  /** Returns persistent image paths and the newly appended review revision. */
  saveFood(record: FoodScanRecord): Promise<FoodScanRecord>;
  deleteFood(id: string): Promise<void>;
  /** Product identity is persisted independently from OCR/nutrition evidence. */
  getFoodIdentity(foodId: string): Promise<FoodIdentity | null>;
  saveFoodIdentity(identity: FoodIdentity): Promise<FoodIdentity>;
  getFoodIdentityRevisions(foodId: string): Promise<readonly import('../../domain/food/identity').FoodIdentityRevision[]>;
  /** Looks up only the normalized local key; no network fallback exists. */
  getFoodByBarcode(lookupKey: string): Promise<{ record: FoodScanRecord; barcode: FoodBarcodeAssociation } | null>;
  listFoodBarcodes(foodId: string): Promise<readonly FoodBarcodeAssociation[]>;
  /** Add a barcode to an existing record. The unique lookup key is never silently reassigned. */
  bindBarcode(foodId: string, barcode: ValidatedBarcode, acquiredBy: BarcodeAcquisitionMethod): Promise<FoodBarcodeAssociation>;
  unbindBarcode(foodId: string, lookupKey: string): Promise<void>;
}

export interface LocalChinaFoodSource extends ChinaFoodRepository {
  readonly kind: 'LOCAL';
  readonly sourceId: string;
}

/** Future Hukang-controlled mainland service boundary; never used by Phase 2. */
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
