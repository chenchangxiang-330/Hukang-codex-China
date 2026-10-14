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
      name: record.review.name,
      brand: record.review.brand,
      ingredients: record.review.ingredients,
      confirmation: 'user_confirmed',
      barcodes: (record.barcodes ?? []).map(b => ({ rawValue: b.rawValue, format: b.format, lookupKey: b.lookupKey })),
      nutrition: record.review.columns.map(c => ({
        basis: c.basisKind, printedBasis: c.basisRawText, servingAmount: c.servingAmount || null, servingUnit: c.servingUnit,
        nutrients: c.rows.map(r => ({ nutrient: r.nutrient, label: r.label, printedAmount: r.amount || null, unit: r.unit, nrvPercent: r.nrvPercent || null, nrvNotDeclared: r.nrvNotDeclared }))
      }))
    }))
  };
}
