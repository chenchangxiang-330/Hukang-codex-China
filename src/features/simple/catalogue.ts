import type { FoodScanRecord } from '../../domain/food/scan';
/** Explicit allowlist: no purchase history, device paths, installation IDs, raw OCR or notes. */
export function sharedCatalogue(records: readonly FoodScanRecord[], exportedAt: string) {
  return {
    schemaVersion: 1,
    format: 'hukang-food-catalogue',
    exportedAt,
    notice: '用户核对的食品包装资料，不是官方营养数据库；不自动授予图片再分发许可。',
    products: records.filter(r => r.status === 'confirmed').map((record, index) => ({
      id: `product-${index + 1}`,
      // A portable product/evidence version. It deliberately omits the
      // private SQLite ID and all app-private file paths.
      productVersion: {
        // Keep the allowlist resilient when reading legacy/minimal records;
        // malformed evidence must not make the rest of a confirmed catalogue
        // entry impossible to export.
        currentEvidenceRecordedAt: record.evidence?.recordedAt ?? null,
        currentProcessedImageHash: record.evidence?.image?.processedImageHash ?? null,
        evidenceVersionCount: (record.evidenceHistory?.length ?? 0) + 1,
      },
      source: {
        kind: 'user_package',
        confirmedBy: 'user',
        identity: record.identity ? {
          kind: record.identity.source.kind,
          sourceId: record.identity.source.sourceId,
          sourceName: record.identity.source.sourceName,
          sourceRecordId: record.identity.source.sourceRecordId,
          obtainedAt: record.identity.source.obtainedAt,
          fetchedAt: record.identity.source.fetchedAt,
        } : null,
      },
      name: record.review.name,
      brand: record.review.brand,
      specification: record.review.specification ?? '',
      ingredients: record.review.ingredients,
      confirmation: 'user_confirmed',
      confirmationStatus: record.status,
      barcodes: (record.barcodes ?? []).map(b => ({ rawValue: b.rawValue, format: b.format, lookupKey: b.lookupKey })),
      nutrition: record.review.columns.map(c => ({
        basis: c.basisKind, printedBasis: c.basisRawText, servingAmount: c.servingAmount || null, servingUnit: c.servingUnit,
        nutrients: c.rows.map(r => ({ nutrient: r.nutrient, label: r.label, printedAmount: r.amount || null, unit: r.unit, nrvPercent: r.nrvPercent || null, nrvNotDeclared: r.nrvNotDeclared }))
      }))
    }))
  };
}
