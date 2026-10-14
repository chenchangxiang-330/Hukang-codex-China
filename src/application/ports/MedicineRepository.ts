import type { ChinaMedicineRecord } from '../../domain/medicine/types';

/** Reserved boundary only. Phase 1 has no medicine UI, provider, parser, or seed database. */
export interface MedicineRepository {
  findByApprovalNumber(approvalNumber: string): Promise<readonly ChinaMedicineRecord[]>;
  saveConfirmed(record: ChinaMedicineRecord): Promise<void>;
}
