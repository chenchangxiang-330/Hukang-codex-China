import type { FoodConfirmationStatus, FoodReviewValues, ParsedNutritionLabel } from './scan';
import { CORE_NUTRIENTS } from './scan';
import { isCompatibleNutritionUnit, parsePrintedNumber } from './parseNutrition';

/** OCR candidates remain unconfirmed, even when every candidate was recognized cleanly. */
export function createFoodReview(parsed: ParsedNutritionLabel): FoodReviewValues {
  return {
    name: '', brand: '', ingredients: '',
    columns: parsed.columns.map(column => ({
      id: column.id, basisKind: column.basis.kind, basisRawText: column.basis.rawText,
      servingAmount: column.basis.kind === 'per_serving' && column.basis.servingAmount !== null ? String(column.basis.servingAmount) : '',
      servingUnit: column.basis.kind === 'per_serving' ? column.basis.servingUnit ?? 'unknown' : 'unknown',
      servingSizeNotDeclared: false, reviewed: false,
      rows: column.rows.map(row => ({
        nutrient: row.nutrient, label: row.label,
        amount: row.amount.numericText === null ? '' : `${row.amount.comparator === 'less_than' ? '<' : row.amount.comparator === 'less_than_or_equal' ? '<=' : ''}${row.amount.numericText}`,
        unit: row.amount.unit, nrvPercent: row.nrv.numericText ?? '', nrvNotDeclared: false, reviewed: false,
      })),
    })),
  };
}

/** Drafts may contain blanks, but never accept a malformed number as if it were valid data. */
export function validateFoodReview(review: FoodReviewValues, status: FoodConfirmationStatus): string[] {
  const errors: string[] = [], confirmed = status === 'confirmed';
  if (confirmed && !review.name.trim()) errors.push('确认保存前请填写商品名称。');
  if (confirmed && !review.columns.length) errors.push('至少需要一个已核对的营养计量基准。');
  if (new Set(review.columns.map(c => c.id)).size !== review.columns.length) errors.push('营养列标识重复，请重新核对。');
  for (const [index, column] of review.columns.entries()) {
    const prefix = `营养列 ${index + 1}`;
    if (confirmed && column.basisKind === 'unknown') errors.push(`${prefix}：请确定每100g、每100mL或每份。`);
    if (confirmed && !column.reviewed) errors.push(`${prefix}：计量基准尚未人工核对。`);
    if (column.basisKind === 'per_serving') {
      const size = column.servingAmount.trim();
      const number = size ? parsePrintedNumber(size) : null;
      if (size && (!number || number.comparator !== 'exact' || number.value <= 0)) errors.push(`${prefix}：每份大小应为明确的正数，不补写未知份量。`);
      if (column.servingSizeNotDeclared && size) errors.push(`${prefix}：每份大小与“包装未标注份量”不能同时填写。`);
      if (confirmed && !column.servingSizeNotDeclared && (!size || column.servingUnit === 'unknown')) errors.push(`${prefix}：请填写包装印有的每份大小和单位，或明确勾选包装未标注份量。`);
    }
    if (confirmed) {
      for (const nutrient of CORE_NUTRIENTS) {
        if (column.rows.filter(row => row.nutrient === nutrient).length !== 1) errors.push(`${prefix}：五项核心营养项目须各有且只有一行。`);
      }
    }
    if (new Set(column.rows.map(r => r.nutrient)).size !== column.rows.length) errors.push(`${prefix}：营养项目重复，无法确定对应关系。`);
    for (const row of column.rows) {
      const rowPrefix = `${prefix} ${row.label}`, amount = row.amount.trim(), nrv = row.nrvPercent.trim();
      if (amount && !parsePrintedNumber(amount)) errors.push(`${rowPrefix}：数值应为明确非负数字，可保留 < 或 ≤，请核对小数点。`);
      if (nrv) {
        const percentage = parsePrintedNumber(nrv);
        if (!percentage || percentage.comparator !== 'exact') errors.push(`${rowPrefix}：NRV% 请单独填写明确的非负数字，不能包含单位或比较符。`);
      }
      if (nrv && row.nrvNotDeclared) errors.push(`${rowPrefix}：NRV% 数字与“未标注”不能同时填写。`);
      if (confirmed) {
        if (!row.reviewed) errors.push(`${rowPrefix}：数值、单位和 NRV% 尚未人工核对。`);
        if (!amount) errors.push(`${rowPrefix}：缺少数值，不能将缺失默认为 0。`);
        if (!isCompatibleNutritionUnit(row.nutrient, row.unit)) errors.push(`${rowPrefix}：请核对能量单位 kJ/kcal，其他项目单位 g/mg/µg。`);
        if (!nrv && !row.nrvNotDeclared) errors.push(`${rowPrefix}：请填写印有的 NRV% 或明确勾选包装未标注。`);
      }
    }
  }
  return [...new Set(errors)];
}
