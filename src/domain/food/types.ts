import type { ConfirmedField, DataProvenance, FieldEvidence } from '../evidence/types';
export type { ConfirmedField, DataProvenance, DataUsePolicy, PermissionDecision } from '../evidence/types';
export type FoodFieldEvidence = FieldEvidence;

export interface FoodBarcode {
  /** Retain leading zeros and exact scan text. */
  readonly rawValue: string;
  readonly format: string;
  /** Only populated after length and checksum validation. */
  readonly gtin: string | null;
}

export type NutrientId =
  | 'energy'
  | 'protein'
  | 'fat'
  | 'saturated_fat'
  | 'trans_fat'
  | 'carbohydrate'
  | 'sugars'
  | 'sodium'
  | 'dietary_fiber'
  | 'other';

export type NutritionBasis =
  | { readonly kind: 'per_100g'; readonly rawText: string }
  | { readonly kind: 'per_100ml'; readonly rawText: string }
  | {
      readonly kind: 'per_serving';
      readonly rawText: string;
      readonly servingAmount: number | null;
      readonly servingUnit: 'g' | 'mL' | null;
    }
  | { readonly kind: 'unknown'; readonly rawText: string };

/** Preserve printed amount/unit, including < signs; a missing quantity is never zero. */
export interface PrintedNutrientAmount {
  readonly rawText: string;
  readonly rawUnit: string | null;
  readonly value: number | null;
  readonly comparator: 'exact' | 'less_than' | 'less_than_or_equal' | 'unknown';
  readonly unit: 'kJ' | 'kcal' | 'g' | 'mg' | 'µg' | 'other' | null;
}

export interface NutritionEntry {
  readonly nutrient: NutrientId;
  readonly printedName: string;
  readonly amount: PrintedNutrientAmount;
  readonly nrvRawText: string | null;
  /** A blank / slash / dash stays null. NRV% is not a nutrient quantity. */
  readonly nrvPercent: number | null;
  readonly evidence: readonly FoodFieldEvidence[];
}

export interface NutritionColumn {
  readonly id: string;
  readonly basis: NutritionBasis;
  readonly entries: readonly NutritionEntry[];
}

export interface FoodNutritionLabel {
  readonly standard: 'GB_28050_2011' | 'GB_28050_2025' | 'unknown';
  readonly rawText: string;
  readonly columns: readonly NutritionColumn[];
  readonly evidence: readonly FoodFieldEvidence[];
}

export interface FoodPackageImage {
  readonly id: string;
  readonly role: 'front' | 'barcode' | 'ingredients' | 'nutrition' | 'other';
  readonly localUri: string;
  readonly sha256: string;
  readonly capturedAt: string | null;
}

/** Packaging versions stay separate: the same GTIN may have a revised recipe/label. */
export interface ChinaFoodRecord {
  readonly id: string;
  readonly packageVersionId: string;
  readonly barcodes: readonly FoodBarcode[];
  readonly chineseName: ConfirmedField<string>;
  readonly brand: ConfirmedField<string>;
  readonly category: ConfirmedField<string>;
  readonly specification: ConfirmedField<string>;
  readonly ingredients: ConfirmedField<string>;
  readonly nutritionLabels: readonly FoodNutritionLabel[];
  readonly packageImages: readonly FoodPackageImage[];
  readonly provenance: readonly DataProvenance[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
