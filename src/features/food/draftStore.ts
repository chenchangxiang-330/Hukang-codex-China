import type { FoodScanRecord } from '../../domain/food/scan';
import type { FoodIdentity } from '../../domain/food/identity';
import { toFoodIdentity, type ProductIdentityDraft } from './identityDraftStore';
import type { OcrEvidence } from '../../domain/ocr/types';
import { parseNutritionLabel } from '../../domain/food/parseNutrition';
import { createFoodReview } from '../../domain/food/review';

const drafts = new Map<string, FoodScanRecord>();
let sequence = 0;

/** Temporary navigation state only. Durable drafts are explicitly saved through SQLite. */
export function setFoodDraft(evidence: OcrEvidence, productIdentity?: ProductIdentityDraft): string {
  const snapshot: OcrEvidence = JSON.parse(JSON.stringify(evidence)) as OcrEvidence;
  const parsed = parseNutritionLabel(snapshot.ocr);
  const id = `food-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const now = new Date().toISOString();
  const identity: FoodIdentity | undefined = productIdentity ? toFoodIdentity(productIdentity, id, now) : undefined;
  drafts.set(id, {
    schemaVersion: 1, id, createdAt: now, updatedAt: now, status: 'draft',
    evidence: snapshot, parsed, review: {
      ...createFoodReview(parsed),
      ...(productIdentity ? { name: productIdentity.name, brand: productIdentity.brand } : {}),
    }, ...(identity ? { identity } : {}), revisions: [],
  });
  return id;
}

export function getFoodDraft(id: string): FoodScanRecord | null {
  return drafts.get(id) ?? null;
}

export function removeFoodDraft(id: string): void {
  drafts.delete(id);
}
