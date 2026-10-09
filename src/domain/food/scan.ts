import type { OcrEvidence } from '../ocr/types';
import type { NutrientId, NutritionBasis } from './types';

export const CORE_NUTRIENTS = ['energy', 'protein', 'fat', 'carbohydrate', 'sodium'] as const;
export type NutritionUnit = 'kJ' | 'kcal' | 'g' | 'mg' | 'µg' | 'unknown';
export type ParseStatus = 'candidate' | 'needs_confirmation' | 'missing';

/** Candidates are never confirmed facts. OCR text and source block IDs stay intact. */
export interface ParsedNutritionCell {
  readonly rawText: string | null;
  readonly numericText: string | null;
  readonly value: number | null;
  readonly unit: NutritionUnit;
  readonly comparator: 'exact' | 'less_than' | 'less_than_or_equal' | 'unknown';
  readonly status: ParseStatus;
  readonly blockIds: readonly string[];
  readonly issues: readonly string[];
}
export interface ParsedNutritionRow {
  readonly nutrient: NutrientId;
  readonly label: string;
  readonly labelBlockIds: readonly string[];
  readonly amount: ParsedNutritionCell;
  readonly nrv: ParsedNutritionCell;
  readonly issues: readonly string[];
}
export interface ParsedNutritionColumn {
  readonly id: string;
  readonly basis: NutritionBasis;
  readonly basisBlockIds: readonly string[];
  readonly rows: readonly ParsedNutritionRow[];
  readonly issues: readonly string[];
}
export interface ParsedNutritionLabel {
  readonly parserVersion: string;
  readonly ocrSourceImageHash: string;
  readonly ocrProcessedImageHash: string;
  readonly columns: readonly ParsedNutritionColumn[];
  readonly unassignedBlockIds: readonly string[];
  readonly issues: readonly string[];
  /** True only when every required row/column has unambiguous candidates; still requires human review. */
  readonly completeCandidateTable: boolean;
}

export interface NutritionReviewRow {
  nutrient: NutrientId;
  label: string;
  /** Printed decimal/comparator remains editable text; blank is not zero. */
  amount: string;
  unit: NutritionUnit;
  nrvPercent: string;
  nrvNotDeclared: boolean;
  reviewed: boolean;
}
export interface NutritionReviewColumn {
  id: string;
  basisKind: NutritionBasis['kind'];
  basisRawText: string;
  servingAmount: string;
  servingUnit: 'g' | 'mL' | 'unknown';
  servingSizeNotDeclared: boolean;
  reviewed: boolean;
  rows: NutritionReviewRow[];
}
export interface FoodReviewValues {
  name: string;
  brand: string;
  ingredients: string;
  columns: NutritionReviewColumn[];
}
export type FoodConfirmationStatus = 'draft' | 'confirmed';
export interface FoodRevision {
  readonly id: string;
  readonly recordedAt: string;
  readonly kind: 'created' | 'edited';
  readonly status: FoodConfirmationStatus;
  readonly review: FoodReviewValues;
}
export interface FoodScanRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: FoodConfirmationStatus;
  readonly evidence: OcrEvidence;
  readonly parsed: ParsedNutritionLabel;
  readonly review: FoodReviewValues;
  readonly revisions: readonly FoodRevision[];
}
export interface FoodSummary {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly status: FoodConfirmationStatus;
  readonly updatedAt: string;
}
