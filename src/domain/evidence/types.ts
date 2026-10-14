export type PermissionDecision = 'allowed' | 'denied' | 'unknown';

/** Publicly readable data is not automatically licensed for reuse. Unknown is not approval. */
export interface DataUsePolicy {
  readonly license: string | null;
  readonly commercialUse: PermissionDecision;
  readonly cache: PermissionDecision;
  readonly redistribute: PermissionDecision;
  readonly cacheTtlSeconds: number | null;
  readonly authorizationReference: string | null;
}

export interface DataProvenance {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly kind: 'user_package' | 'team_package' | 'manufacturer' | 'authorized_provider';
  readonly sourceRecordId: string | null;
  readonly sourceUpdatedAt: string | null;
  readonly obtainedAt: string;
  readonly confirmedAt: string | null;
  readonly policy: DataUsePolicy;
}

export interface FieldEvidence {
  readonly imageId: string | null;
  readonly ocrDocumentId: string | null;
  readonly ocrBlockIds: readonly string[];
  readonly rawText: string | null;
  readonly provenance: DataProvenance;
}

/** Shared evidence wrapper, not a shared food/drug Product model. */
export interface ConfirmedField<T> {
  readonly value: T | null;
  readonly confirmedBy: 'user' | 'team' | 'authorized_source' | null;
  readonly evidence: readonly FieldEvidence[];
}
