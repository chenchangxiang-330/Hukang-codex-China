import assert from 'node:assert/strict';
import test from 'node:test';
import './register-typescript.mjs';

const { createSQLiteFoodStore } = await import('../src/infrastructure/food/sqliteFoodStore.ts');
const { parseNutritionLabel } = await import('../src/domain/food/parseNutrition.ts');
const { createFoodReview } = await import('../src/domain/food/review.ts');
const { DatabaseSync } = await import('node:sqlite');

function driverFor(database) {
  const wrap = (connection) => ({
    async exec(sql) { connection.exec(sql); },
    async run(sql, ...values) { connection.prepare(sql).run(...values); },
    async get(sql, ...values) { return connection.prepare(sql).get(...values) ?? null; },
    async all(sql, ...values) { return connection.prepare(sql).all(...values); },
    async transaction(task) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const result = await task(wrap(connection));
        connection.exec('COMMIT');
        return result;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
  });
  return wrap(database);
}

function record() {
  const hash = 'a'.repeat(64), processed = 'b'.repeat(64);
  const image = {
    uri: 'file:///processed.png', originalUri: 'file:///original.jpg', width: 100, height: 100,
    sourceImageHash: hash, processedImageHash: processed, sourceOrientation: 1,
    transform: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], operations: [], originalWidth: 100, originalHeight: 100 },
  };
  const ocr = {
    imageUri: image.uri, evidenceUri: 'file:///ocr.json', sourceImageHash: hash, processedImageHash: processed,
    rawText: '', blocks: [], width: 100, height: 100, engineVersion: 'test', modelVersion: 'test',
    modelHashes: {}, modelLoadMs: 1, ocrMs: 1, totalMs: 2,
  };
  const evidence = { schemaVersion: 1, id: 'evidence-1', recordedAt: '2026-10-09T00:00:00.000Z', image, ocr };
  const parsed = parseNutritionLabel(ocr);
  return { schemaVersion: 1, id: 'food-test', createdAt: '2026-10-09T00:00:00.000Z', updatedAt: '2026-10-09T00:00:00.000Z',
    status: 'draft', evidence, parsed, review: createFoodReview(parsed), revisions: [] };
}

test('SQLite store persists draft, immutable evidence, revisions and cascade delete', async () => {
  const database = new DatabaseSync(':memory:');
  const writes = [], removed = [];
  const files = {
    async materialize(input) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}` }; },
    async validateStored() {},
    async writeRevision(id, folder, revision) { writes.push({ id, folder, revision }); },
    async removeRevision() {},
    async removeFood(id, folder) { removed.push({ id, folder }); },
  };
  let nowValue = '2026-10-09T00:00:01.000Z';
  const store = createSQLiteFoodStore(driverFor(database), files, () => nowValue, () => 'fixed');
  const first = await store.saveFood(record());
  assert.equal(first.status, 'draft');
  assert.equal((await store.listFoods()).length, 1);
  assert.equal((await store.getFood('food-test')).evidence.ocr.rawText, '');
  assert.equal(writes.length, 1);
  const saved = await store.getFood('food-test');
  nowValue = '2026-10-09T00:00:02.000Z';
  const edited = await store.saveFood({ ...saved, review: { ...saved.review, name: '本机核对食品' } });
  assert.equal(edited.review.name, '本机核对食品');
  assert.equal(edited.revisions.length, 2);
  const persisted = await store.getFood('food-test');
  assert.equal(persisted.parsed.columns.length, 1);
  assert.equal(persisted.parsed.columns[0].basis.kind, 'unknown');
  await store.deleteFood('food-test');
  assert.equal(await store.getFood('food-test'), null);
  assert.equal((await store.listFoods()).length, 0);
  assert.deepEqual(removed, [{ id: 'food-test', folder: 'food://food-test' }]);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_revisions').get().count, 0);
  database.close();
});
