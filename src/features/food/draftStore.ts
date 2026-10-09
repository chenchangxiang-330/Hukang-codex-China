import type { FoodScanRecord } from '../../domain/food/scan';
import type { OcrEvidence } from '../../domain/ocr/types';
import { parseNutritionLabel } from '../../domain/food/parseNutrition';
import { createFoodReview } from '../../domain/food/review';

const drafts = new Map<string, FoodScanRecord>();
let sequence = 0;

/** Temporary navigation state only. Durable drafts are explicitly saved through SQLite. */
export function setFoodDraft(evidence: OcrEvidence): string {
  const snapshot: OcrEvidence = JSON.parse(JSON.stringify(evidence)) as OcrEvidence;
  const parsed = parseNutritionLabel(snapshot.ocr);
  const id = `food-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const now = new Date().toISOString();
  drafts.set(id, {
    schemaVersion: 1, id, createdAt: now, updatedAt: now, status: 'draft',
    evidence: snapshot, parsed, review: createFoodReview(parsed), revisions: [],
  });
  return id;
}

export function getFoodDraft(id: string): FoodScanRecord | null {
  return drafts.get(id) ?? null;
}

export function removeFoodDraft(id: string): void {
  drafts.delete(id);
}
