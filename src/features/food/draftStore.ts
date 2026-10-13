import type { FoodScanRecord } from '../../domain/food/scan';
import type { FoodIdentity, FoodIdentitySourceKind } from '../../domain/food/identity';
import type { ProductIdentityDraft } from './identityDraftStore';
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
  const identity: FoodIdentity | undefined = productIdentity ? {
    schemaVersion: 1,
    foodId: id,
    name: productIdentity.name,
    brand: productIdentity.brand,
    specification: productIdentity.specification,
    status: productIdentity.status === 'confirmed' ? 'pending_confirmation' : 'draft',
    source: {
      sourceId: productIdentity.sourceId || 'manual',
      sourceName: productIdentity.sourceKind === 'CHINA_SERVICE' ? '国内商品身份服务' : productIdentity.sourceKind === 'LOCAL' ? '本机食品记录' : '用户填写',
      kind: ({ CHINA_SERVICE: 'mainland_service', LOCAL: 'local', MANUAL: 'user' } as Record<ProductIdentityDraft['sourceKind'], FoodIdentitySourceKind>)[productIdentity.sourceKind],
      sourceRecordId: null,
      fetchedAt: productIdentity.sourceFetchedAt,
      obtainedAt: productIdentity.sourceFetchedAt ?? now,
      policy: { license: null, commercialUse: 'unknown', cache: 'unknown', redistribute: 'unknown', cacheTtlSeconds: null, authorizationReference: null },
    },
    confirmedAt: null,
    updatedAt: now,
  } : undefined;
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
