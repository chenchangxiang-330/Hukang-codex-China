import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';
const { portableExportValue } = await import('../src/features/simple/exportPaths.ts');
const { exportableCatalogueRecords, sharedCatalogue } = await import('../src/features/simple/catalogue.ts');

test('personal export remaps image paths without changing source evidence or OCR text', () => {
  const image = Object.freeze({ uri: 'file:///private/processed.png', originalUri: 'file:///private/original.jpg', processedImageHash: 'hash' });
  const evidence = Object.freeze({ image, ocr: Object.freeze({
    imageUri: image.uri, evidenceUri: 'file:///private/ocr.json',
    // Native metadata includes this property even though the TS interface does not.
    originalImageUri: image.originalUri,
    rawText: 'file:///a-printed-path', blocks: Object.freeze([{ text: '蛋白质 3.60 g', confidence: 0.91 }]),
  }) });
  const exported = portableExportValue(evidence, {
    [image.uri]: 'photos/food-nutrition.png',
    'file:///private/ocr.json': 'evidence/food/current-ocr.json',
  });
  assert.equal(exported.image.uri, 'photos/food-nutrition.png');
  assert.equal(exported.image.originalUri, null, 'omitted photos must not become broken app-private paths');
  assert.equal(exported.ocr.imageUri, exported.image.uri);
  assert.equal(exported.ocr.originalImageUri, null);
  assert.equal(exported.ocr.evidenceUri, 'evidence/food/current-ocr.json');
  assert.equal(exported.ocr.rawText, evidence.ocr.rawText);
  assert.deepEqual(exported.ocr.blocks, evidence.ocr.blocks);
  assert.equal(evidence.image.uri, 'file:///private/processed.png');
  assert.equal(evidence.ocr.evidenceUri, 'file:///private/ocr.json');
  const withOriginal = portableExportValue(evidence, { [image.originalUri]: 'photos/food-original.source' });
  assert.equal(withOriginal.image.originalUri, 'photos/food-original.source');
  assert.equal(withOriginal.ocr.originalImageUri, withOriginal.image.originalUri);
  assert.equal(withOriginal.ocr.rawText, evidence.ocr.rawText);
  assert.equal(evidence.ocr.originalImageUri, 'file:///private/original.jpg');
});

const record = (id, redistribute) => ({
  id, status: 'confirmed', evidence: { recordedAt: '2026-10-15', image: { processedImageHash: 'image-hash' } },
  review: { name: '牛奶', brand: '品牌', specification: '250 mL', ingredients: '生牛乳', columns: [] },
  identity: redistribute === null ? undefined : { source: { kind: 'mainland_service', policy: { redistribute } } },
  inventory: [{ quantity: 100, expires_on: 'private-date' }],
});
test('catalogue sharing excludes unlicensed legacy provider data without altering local foods', () => {
  const foods = [record('local', null), record('unknown', 'unknown'), record('denied', 'denied'), record('allowed', 'allowed')];
  assert.deepEqual(exportableCatalogueRecords(foods).map(food => food.id), ['local', 'allowed']);
  const result = sharedCatalogue(foods, '2026-10-15');
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].specification, '250 mL');
  assert.equal(result.products[0].productVersion.currentProcessedImageHash, 'image-hash');
  assert.equal(JSON.stringify(result).includes('private-date'), false);
  assert.equal(JSON.stringify(result).includes('inventory'), false);
  assert.equal(foods.length, 4);
  assert.equal(foods[1].identity.source.policy.redistribute, 'unknown');
});
