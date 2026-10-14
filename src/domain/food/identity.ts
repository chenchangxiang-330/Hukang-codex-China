import type { DataUsePolicy } from '../evidence/types';

/** Product identity is deliberately separate from a nutrition label. */
export type FoodIdentityStatus = 'draft' | 'pending_confirmation' | 'confirmed';
export type FoodIdentitySourceKind = 'local' | 'mainland_service' | 'user' | 'package_ocr';

export interface FoodIdentitySource {
  /** Stable provider identifier, never an API key or URL supplied by the client. */
  readonly sourceId: string;
  readonly sourceName: string;
  readonly kind: FoodIdentitySourceKind;
  readonly sourceRecordId: string | null;
  /** Provider response time when available; null means not supplied. */
  readonly fetchedAt: string | null;
  readonly obtainedAt: string;
  readonly policy: DataUsePolicy;
}

/** Values shown to a user before the nutrition label has been photographed. */
export interface FoodIdentity {
  readonly schemaVersion: 1;
  readonly foodId: string;
  readonly name: string;
  readonly brand: string;
  readonly specification: string;
  readonly status: FoodIdentityStatus;
  readonly source: FoodIdentitySource;
  readonly confirmedAt: string | null;
  readonly updatedAt: string;
}

export type FoodIdentityRevisionKind = 'created' | 'provider_result' | 'edited' | 'confirmed';
export interface FoodIdentityRevision {
  readonly id: string;
  readonly foodId: string;
  readonly recordedAt: string;
  readonly kind: FoodIdentityRevisionKind;
  readonly status: FoodIdentityStatus;
  readonly identity: FoodIdentity;
}

/** A local, durable product identity waiting for its first package nutrition capture. */
export interface PendingFoodIdentity {
  readonly id: string;
  readonly identity: FoodIdentity;
  readonly barcode: import('../barcode/types').FoodBarcodeAssociation;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function identityDisplayName(identity: Pick<FoodIdentity, 'name' | 'brand' | 'specification'>): string {
  const name = identity.name.trim();
  const brand = identity.brand.trim();
  const specification = identity.specification.trim();
  return [brand, name, specification].filter(Boolean).join(' · ') || '商品身份待填写';
}
