import type { ChinaFoodRepository } from '../../application/ports/ChinaFoodRepository';
import type { FoodScanRecord } from '../../domain/food/scan';

/** A cover-write failure leaves the draft intact. Retry the same food identity,
 * retaining any subsequent correction and never replacing immutable evidence. */
export async function persistCapturedFood(
  repository: Pick<ChinaFoodRepository, 'getFood' | 'saveFood' | 'saveFoodEvidence'>,
  requested: FoodScanRecord,
): Promise<FoodScanRecord> {
  const existing = await repository.getFood(requested.id);
  if (!existing) return repository.saveFood(requested);
  const existingKeys = new Set((existing.barcodes ?? []).map(barcode => barcode.lookupKey));
  if ((requested.barcodes ?? []).some(barcode => !existingKeys.has(barcode.lookupKey))) {
    throw new Error('草稿条码与已保存商品不一致，已保留草稿，请重新打开商品核对。');
  }
  if (existing.evidence.id !== requested.evidence.id || existing.evidence.image.processedImageHash !== requested.evidence.image.processedImageHash) {
    return repository.saveFoodEvidence({ foodId: existing.id, evidence: requested.evidence, parsed: requested.parsed, review: requested.review, status: requested.status });
  }
  if (existing.status !== requested.status || JSON.stringify(existing.review) !== JSON.stringify(requested.review)) {
    return repository.saveFood({ ...existing, review: requested.review, status: requested.status });
  }
  return existing;
}
