import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const { parseNutritionLabel, parsePrintedNumber } = await import('../src/domain/food/parseNutrition.ts');
const { createFoodReview, validateFoodReview } = await import('../src/domain/food/review.ts');

function block(id, text, x, y, width = 44, height = 20, confidence = 0.99) {
  const polygon = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  return { id, text, page: 0, confidence, polygon, boundingBox: { left: x, top: y, right: x + width, bottom: y + height } };
}

function tableOcr(blocks) {
  return {
    imageUri: 'file:///processed.png', evidenceUri: 'file:///run.json',
    sourceImageHash: 'a'.repeat(64), processedImageHash: 'b'.repeat(64),
    rawText: blocks.map((item) => item.text).join('\n'), blocks, width: 500, height: 300,
    engineVersion: 'test', modelVersion: 'test', modelHashes: {}, modelLoadMs: 1, ocrMs: 2, totalMs: 3,
  };
}

function nutritionTable() {
  const rows = [
    ['energy', '能量', '309kJ', '4%'], ['protein', '蛋白质', '3.6g', '6%'],
    ['fat', '脂肪', '4.4g', '7%'], ['carbohydrate', '碳水化合物', '5.0g', '2%'], ['sodium', '钠', '58mg', '3%'],
  ];
  const result = [block('title', '营养成分表', 5, 0), block('basis', '每100mL', 150, 0), block('nrv', 'NRV%', 300, 0)];
  rows.forEach(([id, label, amount, nrv], index) => {
    const y = 40 + index * 30;
    result.push(block(id, label, 5, y), block(`${id}-amount`, amount, 150, y), block(`${id}-nrv`, nrv, 300, y));
  });
  return result;
}

function nutritionTableForBasis(basis, amounts = ['309kJ', '3.6g', '4.4g', '5.0g', '58mg']) {
  const labels = ['能量', '蛋白质', '脂肪', '碳水化合物', '钠'];
  const nrvs = ['4%', '6%', '7%', '2%', '3%'];
  const result = [block('title', '营养成分表', 5, 0), block('basis', basis, 150, 0), block('nrv', 'NRV%', 300, 0)];
  labels.forEach((label, index) => {
    const y = 40 + index * 30;
    result.push(block(`label-${index}`, label, 5, y), block(`amount-${index}`, amounts[index], 150, y), block(`nrv-${index}`, nrvs[index], 300, y));
  });
  return result;
}

test('geometry parser associates shuffled Chinese nutrition cells by row and column', () => {
  const blocks = nutritionTable().reverse();
  const parsed = parseNutritionLabel(tableOcr(blocks));
  assert.equal(parsed.completeCandidateTable, true);
  assert.equal(parsed.columns.length, 1);
  assert.equal(parsed.columns[0].basis.kind, 'per_100ml');
  assert.deepEqual(parsed.columns[0].rows.map((row) => [row.nutrient, row.amount.numericText, row.amount.unit, row.nrv.numericText]), [
    ['energy', '309', 'kJ', '4'], ['protein', '3.6', 'g', '6'], ['fat', '4.4', 'g', '7'],
    ['carbohydrate', '5.0', 'g', '2'], ['sodium', '58', 'mg', '3'],
  ]);
  assert.deepEqual(parsed.columns[0].rows[0].amount.blockIds, ['energy-amount']);
});

test('ambiguous OCR is retained as a confirmation candidate instead of being repaired', () => {
  const blocks = nutritionTable().map((item) => item.id === 'protein-amount' ? { ...item, text: '3 6g' } : item);
  const parsed = parseNutritionLabel(tableOcr(blocks));
  const row = parsed.columns[0].rows.find((item) => item.nutrient === 'protein');
  assert.equal(row.amount.numericText, null);
  assert.equal(row.amount.status, 'needs_confirmation');
  assert.match(row.amount.issues.join(' '), /无法确定|不拼接/);
  assert.equal(parsePrintedNumber('3 6'), null);
});

test('draft review keeps blanks and confirmed validation requires every core row', () => {
  const parsed = parseNutritionLabel(tableOcr(nutritionTable()));
  const draft = createFoodReview(parsed);
  assert.equal(draft.name, '');
  assert.deepEqual(validateFoodReview(draft, 'draft'), []);
  const incomplete = { ...draft, name: '牛奶', columns: draft.columns.map((column) => ({
    ...column, basisKind: 'per_100ml', reviewed: true,
    rows: column.rows.map((row) => ({ ...row, amount: row.amount || '1', unit: row.unit === 'unknown' ? 'g' : row.unit, nrvPercent: '1', reviewed: true })),
  })) };
  const errors = validateFoodReview({ ...incomplete, columns: incomplete.columns.map((column) => ({
    ...column, rows: column.rows.map((row, index) => index === 4 ? { ...row, reviewed: false } : row),
  })) }, 'confirmed');
  assert.ok(errors.length > 0, 'a candidate table must not become confirmed without explicit user values');
});

test('per-100g keeps five core nutrients, units, decimals and NRV geometry', () => {
  const parsed = parseNutritionLabel(tableOcr(nutritionTableForBasis('每100g')));
  assert.equal(parsed.completeCandidateTable, true);
  assert.equal(parsed.columns[0].basis.kind, 'per_100g');
  assert.deepEqual(parsed.columns[0].rows.map((row) => [row.amount.numericText, row.amount.unit, row.nrv.numericText]), [
    ['309', 'kJ', '4'], ['3.6', 'g', '6'], ['4.4', 'g', '7'], ['5.0', 'g', '2'], ['58', 'mg', '3'],
  ]);
});

test('per-serving size is preserved and split digits remain confirmation-only', () => {
  const parsed = parseNutritionLabel(tableOcr(nutritionTableForBasis('每份(30g)')));
  assert.equal(parsed.columns[0].basis.kind, 'per_serving');
  assert.equal(parsed.columns[0].basis.servingAmount, 30);
  assert.equal(parsed.columns[0].basis.servingUnit, 'g');
  const split = parseNutritionLabel(tableOcr(nutritionTableForBasis('每份３ ０g')));
  assert.equal(split.columns[0].basis.servingAmount, null);
  assert.match(split.columns[0].issues.join(' '), /人工核对/);
  const decimalSplit = parseNutritionLabel(tableOcr(nutritionTableForBasis('每份 3 . 0 g')));
  assert.equal(decimalSplit.columns[0].basis.servingAmount, null);
});

test('wrong units and missing NRV cannot become confirmed without explicit correction', () => {
  const blocks = nutritionTableForBasis('每100g', ['309g', '3.6kJ', '4.4g', '5.0g', '58mg'])
    .filter((item) => item.id !== 'nrv-2');
  const parsed = parseNutritionLabel(tableOcr(blocks));
  assert.equal(parsed.columns[0].rows[0].amount.status, 'needs_confirmation');
  assert.equal(parsed.columns[0].rows[1].amount.status, 'needs_confirmation');
  const review = createFoodReview(parsed);
  const corrected = {
    ...review, name: '测试食品', columns: review.columns.map((column) => ({
      ...column, basisKind: 'per_100g', reviewed: true,
      rows: column.rows.map((row) => ({ ...row, amount: row.amount || '1', unit: row.nutrient === 'energy' ? 'kJ' : row.nutrient === 'sodium' ? 'mg' : 'g', nrvPercent: row.nrvPercent || '', nrvNotDeclared: row.nutrient === 'fat', reviewed: true })),
    })),
  };
  assert.ok(validateFoodReview(corrected, 'confirmed').every((issue) => !/单位/.test(issue)));
  assert.deepEqual(parsed.columns[0].rows[0].amount.rawText, '309g');
  assert.deepEqual(parsed.columns[0].rows[0].amount.value, 309);
});
