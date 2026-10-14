/**
 * Keeps one product identity and its barcode attached while the user moves from
 * barcode lookup to package photography and nutrition review. This is navigation
 * state only; confirmed identity is persisted through the SQLite repository.
 */
export type IdentityDraftStatus = 'pending' | 'confirmed';
export type IdentitySourceKind = 'LOCAL' | 'CHINA_SERVICE' | 'MANUAL';

export interface ProductIdentityDraft {
  readonly id: string;
  readonly barcodeRaw: string;
  readonly barcodeFormat: string;
  readonly barcodeGtin: string;
  readonly barcodeLookupKey: string;
  readonly barcodeAcquiredBy: 'camera' | 'image' | 'manual';
  name: string;
  brand: string;
  specification: string;
  category: string;
  manufacturer: string;
  sourceId: string;
  sourceKind: IdentitySourceKind;
  sourceFetchedAt: string | null;
  status: IdentityDraftStatus;
  /** Only affects the optional domestic identity query; OCR remains local. */
  allowDomesticLookup: boolean;
}

export function toFoodIdentity(draft: ProductIdentityDraft, foodId: string, now = new Date().toISOString()): import('../../domain/food/identity').FoodIdentity {
  const kind = ({ CHINA_SERVICE: 'mainland_service', LOCAL: 'local', MANUAL: 'user' } as const)[draft.sourceKind];
  return {
    schemaVersion: 1, foodId, name: draft.name, brand: draft.brand, specification: draft.specification,
    status: draft.status === 'confirmed' ? 'pending_confirmation' : 'draft',
    source: {
      sourceId: draft.sourceId || 'manual',
      sourceName: draft.sourceKind === 'CHINA_SERVICE' ? '国内商品身份服务' : draft.sourceKind === 'LOCAL' ? '本机食品记录' : '用户填写',
      kind, sourceRecordId: null, fetchedAt: draft.sourceFetchedAt, obtainedAt: draft.sourceFetchedAt ?? now,
      policy: { license: null, commercialUse: 'unknown', cache: 'unknown', redistribute: 'unknown', cacheTtlSeconds: null, authorizationReference: null },
    },
    confirmedAt: null, updatedAt: now,
  };
}

const drafts = new Map<string, ProductIdentityDraft>();
let sequence = 0;

function clone(draft: ProductIdentityDraft): ProductIdentityDraft {
  return { ...draft };
}

export function createIdentityDraft(input: Pick<ProductIdentityDraft, 'barcodeRaw' | 'barcodeFormat' | 'barcodeGtin' | 'barcodeLookupKey' | 'barcodeAcquiredBy'> & Partial<Pick<ProductIdentityDraft, 'name' | 'brand' | 'specification' | 'category' | 'manufacturer' | 'sourceId' | 'sourceKind' | 'sourceFetchedAt' | 'allowDomesticLookup'>>): string {
  const id = `identity-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const draft: ProductIdentityDraft = {
    id,
    barcodeRaw: input.barcodeRaw,
    barcodeFormat: input.barcodeFormat,
    barcodeGtin: input.barcodeGtin,
    barcodeLookupKey: input.barcodeLookupKey,
    barcodeAcquiredBy: input.barcodeAcquiredBy,
    name: input.name ?? '',
    brand: input.brand ?? '',
    specification: input.specification ?? '',
    category: input.category ?? '',
    manufacturer: input.manufacturer ?? '',
    sourceId: input.sourceId ?? 'manual',
    sourceKind: input.sourceKind ?? 'MANUAL',
    sourceFetchedAt: input.sourceFetchedAt ?? null,
    status: 'pending',
    allowDomesticLookup: input.allowDomesticLookup ?? false,
  };
  drafts.set(id, draft);
  return id;
}

export function getIdentityDraft(id: string): ProductIdentityDraft | null {
  const draft = drafts.get(id);
  return draft ? clone(draft) : null;
}

export function updateIdentityDraft(id: string, patch: Partial<Omit<ProductIdentityDraft, 'id'>>): ProductIdentityDraft {
  const current = drafts.get(id);
  if (!current) throw new Error('商品身份草稿已失效，请从条码重新开始。');
  const next = { ...current, ...patch };
  drafts.set(id, next);
  return clone(next);
}

export function confirmIdentityDraft(id: string): ProductIdentityDraft {
  const current = drafts.get(id);
  if (!current) throw new Error('商品身份草稿已失效，请从条码重新开始。');
  // A provider candidate is not a licensed long-term cache. Once the user
  // explicitly confirms the fields, the persisted record is a user-owned
  // correction; the transient provider response is discarded.
  if (current.sourceKind === 'CHINA_SERVICE') {
    return updateIdentityDraft(id, {
      status: 'confirmed', sourceKind: 'MANUAL', sourceId: 'user-confirmed', sourceFetchedAt: null,
    });
  }
  return updateIdentityDraft(id, { status: 'confirmed' });
}

export function removeIdentityDraft(id: string): void {
  drafts.delete(id);
}
