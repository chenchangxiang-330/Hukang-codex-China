import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const { setFoodDraft, getFoodDraft, removeFoodDraft } = await import('../src/features/food/draftStore.ts');

function evidence() {
  const sourceImageHash = 'a'.repeat(64);
  const processedImageHash = 'b'.repeat(64);
  const image = {
    uri: 'file:///food/processed.jpg', originalUri: 'file:///food/original.jpg', width: 300, height: 200,
    sourceImageHash, processedImageHash, sourceOrientation: 1,
    transform: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], operations: [], originalWidth: 300, originalHeight: 200 },
  };
  return {
    schemaVersion: 1, id: 'evidence-identity', recordedAt: '2026-10-13T00:00:00.000Z', image,
    ocr: { imageUri: image.uri, evidenceUri: 'file:///food/ocr.json', sourceImageHash, processedImageHash,
      rawText: '营养成分表\n蛋白质 3.2g', blocks: [], width: 300, height: 200,
      engineVersion: 'test', modelVersion: 'PP-OCRv5_mobile', modelHashes: {}, modelLoadMs: 1, ocrMs: 2, totalMs: 3 },
  };
}

test('identity draft travels into the nutrition draft without marking nutrition confirmed', () => {
  const id = setFoodDraft(evidence(), {
    id: 'identity-1', barcodeRaw: '6900000000014', barcodeFormat: 'EAN_13', barcodeGtin: '6900000000014', barcodeLookupKey: '06900000000014',
    barcodeAcquiredBy: 'image', name: '示例纯牛奶', brand: '示例品牌', specification: '250mL', category: '乳制品', manufacturer: '示例厂',
    sourceId: 'hukang-test-provider', sourceKind: 'CHINA_SERVICE', sourceFetchedAt: '2026-10-13T00:00:00.000Z', status: 'confirmed', allowDomesticLookup: true,
  });
  const saved = getFoodDraft(id);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.identity.status, 'pending_confirmation');
  assert.equal(saved.identity.name, '示例纯牛奶');
  assert.equal(saved.identity.source.kind, 'mainland_service');
  assert.equal(saved.review.name, '示例纯牛奶');
  assert.equal(saved.review.brand, '示例品牌');
  assert.equal(saved.evidence.ocr.rawText, '营养成分表\n蛋白质 3.2g');
  removeFoodDraft(id);
  assert.equal(getFoodDraft(id), null);
});
