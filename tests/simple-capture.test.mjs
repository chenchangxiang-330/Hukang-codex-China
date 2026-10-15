import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';
const { previewCrop } = await import('../src/features/simple/imageSelection.ts');
const { persistCapturedFood } = await import('../src/features/simple/captureRecovery.ts');

test('crop touch selection handles contain letterboxing, reverse drag and bounds', () => {
  const image = { width: 1000, height: 500 }, viewport = { width: 300, height: 300 };
  assert.equal(previewCrop({ x: 20, y: 20 }, { x: 200, y: 200 }, image, viewport), null);
  assert.deepEqual(previewCrop({ x: 270, y: 210 }, { x: 30, y: 90 }, image, viewport), { left: 100, top: 50, right: 900, bottom: 450 });
  assert.deepEqual(previewCrop({ x: 0, y: 75 }, { x: 400, y: 400 }, image, viewport), { left: 0, top: 0, right: 1000, bottom: 500 });
  assert.equal(previewCrop({ x: 10, y: 100 }, { x: 10, y: 101 }, image, viewport), null);
  assert.equal(previewCrop({ x: NaN, y: 100 }, { x: 10, y: 101 }, image, viewport), null);
});

const record = () => ({ id: 'food-one', createdAt: 'before', updatedAt: 'after', status: 'confirmed', revisions: [{ id: 'old-revision' }],
  evidence: { id: 'original-ocr', image: { processedImageHash: 'original-pixels' } }, parsed: { raw: 'original' },
  review: { name: '原商品', columns: [] }, barcodes: [{ lookupKey: '06901234567892' }] });
function repository(existing) {
  const writes = [];
  return { writes, async getFood() { return existing; }, async saveFood(food) { writes.push({ kind: 'food', food }); return food; },
    async saveFoodEvidence(input) { writes.push({ kind: 'evidence', input }); return { ...existing, evidence: input.evidence, review: input.review }; } };
}
test('capture retry after cover failure keeps same food and does not create redundant revisions', async () => {
  const old = record(), repo = repository(old);
  assert.equal(await persistCapturedFood(repo, structuredClone(old)), old);
  assert.equal(repo.writes.length, 0);
});
test('capture retry preserves corrections made after the first save failed', async () => {
  const old = record(), repo = repository(old), requested = { ...structuredClone(old), createdAt: 'new-draft-time', review: { name: '用户已更正', columns: [] } };
  const saved = await persistCapturedFood(repo, requested);
  assert.equal(saved.review.name, '用户已更正');
  assert.equal(saved.createdAt, 'before');
  assert.equal(saved.evidence, old.evidence);
  assert.deepEqual(saved.revisions, old.revisions);
  assert.equal(repo.writes.length, 1);
});
test('rephotographed recovery draft creates an evidence revision, not an overwrite', async () => {
  const old = record(), repo = repository(old), requested = { ...structuredClone(old), evidence: { id: 'new-ocr', image: { processedImageHash: 'new-pixels' } } };
  await persistCapturedFood(repo, requested);
  assert.equal(repo.writes[0].kind, 'evidence');
  assert.equal(repo.writes[0].input.foodId, old.id);
  assert.equal(old.evidence.id, 'original-ocr');
});
test('recovery refuses a different barcode instead of silently binding it', async () => {
  const repo = repository(record());
  await assert.rejects(persistCapturedFood(repo, { ...record(), barcodes: [{ lookupKey: '06901234567809' }] }), /条码与已保存商品不一致/);
  assert.equal(repo.writes.length, 0);
});
