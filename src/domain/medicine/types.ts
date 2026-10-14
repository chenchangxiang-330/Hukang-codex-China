import type { ConfirmedField, DataProvenance } from '../evidence/types';

/** Drug identity is separate from food and from commercial product barcode identity. */
export interface ChinaMedicineRecord {
  readonly id: string;
  readonly genericName: ConfirmedField<string>;
  readonly tradeName: ConfirmedField<string>;
  readonly manufacturer: ConfirmedField<string>;
  readonly marketingAuthorizationHolder: ConfirmedField<string>;
  readonly approvalNumberRaw: string | null;
  readonly approvalNumberCandidate: string | null;
  readonly approvalVerification: 'unverified' | 'officially_matched' | 'mismatch';
  readonly specification: ConfirmedField<string>;
  readonly dosageForm: ConfirmedField<string>;
  readonly packaging: ConfirmedField<string>;
  readonly leafletVersion: string | null;
  readonly provenance: readonly DataProvenance[];
  readonly updatedAt: string;
}
