import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const { createSQLiteFoodStore } = await import('../src/infrastructure/food/sqliteFoodStore.ts');
const { parseNutritionLabel } = await import('../src/domain/food/parseNutrition.ts');
const { createFoodReview } = await import('../src/domain/food/review.ts');
const { normalizeBarcode } = await import('../src/domain/barcode/normalize.ts');
const { DatabaseSync } = await import('node:sqlite');

function driverFor(database) {
  const wrap = (connection) => ({
    async exec(sql) { connection.exec(sql); },
    async run(sql, ...values) { connection.prepare(sql).run(...values); },
    async get(sql, ...values) { return connection.prepare(sql).get(...values) ?? null; },
    async all(sql, ...values) { return connection.prepare(sql).all(...values); },
    async transaction(task) {
      connection.exec('BEGIN IMMEDIATE');
      try { const result = await task(wrap(connection)); connection.exec('COMMIT'); return result; }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
  });
  return wrap(database);
}

function record(id) {
  const source = 'a'.repeat(64), processed = 'b'.repeat(64);
  const image = {
    uri: 'file:///processed.png', originalUri: 'file:///original.jpg', width: 100, height: 100,
    sourceImageHash: source, processedImageHash: processed, sourceOrientation: 1,
    transform: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], operations: [], originalWidth: 100, originalHeight: 100 },
  };
  const ocr = {
    imageUri: image.uri, evidenceUri: 'file:///ocr.json', sourceImageHash: source,
    processedImageHash: processed, rawText: '', blocks: [], width: 100, height: 100,
    engineVersion: 'test', modelVersion: 'test', modelHashes: {}, modelLoadMs: 1, ocrMs: 1, totalMs: 2,
  };
  const evidence = { schemaVersion: 1, id: `evidence-${id}`, recordedAt: '2026-10-13T00:00:00.000Z', image, ocr };
  const parsed = parseNutritionLabel(ocr);
  return {
    schemaVersion: 1, id, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
    status: 'draft', evidence, parsed, review: createFoodReview(parsed), revisions: [], barcodes: [],
  };
}

function files() {
  return {
    async materialize(input) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}` }; },
    async validateStored() {}, async writeRevision() {}, async removeRevision() {}, async removeFood() {},
  };
}

function testNonce() {
  let value = 0;
  return () => String(++value);
}

test('barcode association closes miss → save → repeat local hit without OCR', async () => {
  const database = new DatabaseSync(':memory:');
  const store = createSQLiteFoodStore(driverFor(database), files(), () => '2026-10-13T00:00:01.000Z', testNonce());
  await store.saveFood(record('food-one'));
  const scanned = normalizeBarcode({ rawValue: '6900000000014', format: 'EAN_13', decodedAt: '2026-10-13T00:00:02.000Z' });
  assert.equal(await store.getFoodByBarcode('06900000000014'), null);
  const association = await store.bindBarcode('food-one', scanned, 'image');
  assert.equal(association.rawValue, '6900000000014');
  assert.equal(association.lookupKey, '06900000000014');
  const found = await store.getFoodByBarcode(association.lookupKey);
  assert.equal(found?.record.id, 'food-one');
  assert.equal(found?.barcode.acquiredBy, 'image');
  assert.deepEqual(await store.bindBarcode('food-one', scanned, 'image'), association);
  const edited = await store.getFood('food-one');
  assert.equal(edited?.barcodes?.length, 1);
  assert.deepEqual(edited?.barcodes?.[0], association);
  assert.ok(edited);
  await store.saveFood({ ...edited, review: { ...edited.review, name: '编辑后的食品' } });
  const afterEdit = await store.getFoodByBarcode(association.lookupKey);
  assert.equal(afterEdit?.record.review.name, '编辑后的食品');
  assert.deepEqual(afterEdit?.record.barcodes?.[0], association);
  database.close();
});

test('duplicate lookup key cannot silently move to another food and deletion removes index', async () => {
  const database = new DatabaseSync(':memory:');
  const store = createSQLiteFoodStore(driverFor(database), files(), () => '2026-10-13T00:00:01.000Z', testNonce());
  await store.saveFood(record('food-one'));
  await store.saveFood(record('food-two'));
  const scanned = normalizeBarcode({ rawValue: '6900000000014', format: 'EAN_13', decodedAt: '2026-10-13T00:00:02.000Z' });
  await store.bindBarcode('food-one', scanned, 'manual');
  await assert.rejects(() => store.bindBarcode('food-two', scanned, 'manual'), /另一条食品记录/);
  assert.equal((await store.getFoodByBarcode('06900000000014')).record.id, 'food-one');
  await store.deleteFood('food-one');
  assert.equal(await store.getFoodByBarcode('06900000000014'), null);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_barcodes').get().count, 0);
  database.close();
});

test('schema v1 upgrade creates barcode index while retaining food rows and evidence', async () => {
  const database = new DatabaseSync(':memory:');
  const first = createSQLiteFoodStore(driverFor(database), files(), () => '2026-10-13T00:00:01.000Z', testNonce());
  await first.saveFood(record('legacy-food'));
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 5);
  database.exec('DROP TABLE food_barcodes; PRAGMA user_version=1;');
  const upgraded = createSQLiteFoodStore(driverFor(database), files(), () => '2026-10-13T00:00:03.000Z', testNonce());
  const legacy = await upgraded.getFood('legacy-food');
  assert.equal(legacy?.id, 'legacy-food');
  assert.equal(legacy?.evidence.ocr.engineVersion, 'test');
  assert.deepEqual(legacy?.barcodes, []);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 5);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='food_barcodes'").get().name, 'food_barcodes');
  database.close();
});

