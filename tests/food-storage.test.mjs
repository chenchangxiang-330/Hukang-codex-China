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
    async materializeRevision(input, revisionId) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}/versions/${revisionId}` }; },
    async validateStored() {},
    async writeRevision(id, folder, revision) { writes.push({ id, folder, revision }); },
    async removeRevision() {},
    async removeEvidenceRevision() {},
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

test('new package OCR appends an evidence version without replacing history', async () => {
  const database = new DatabaseSync(':memory:');
  const files = {
    async materialize(input) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}` }; },
    async materializeRevision(input, revisionId) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}/versions/${revisionId}` }; },
    async validateStored() {}, async writeRevision() {}, async removeRevision() {}, async removeEvidenceRevision() {}, async removeFood() {},
  };
  let nowValue = '2026-10-09T00:00:01.000Z';
  const store = createSQLiteFoodStore(driverFor(database), files, () => nowValue, () => 'version');
  await store.saveFood(record());
  const second = record();
  second.evidence = { ...second.evidence, id: 'evidence-2', recordedAt: '2026-10-09T00:00:02.000Z' };
  nowValue = '2026-10-09T00:00:03.000Z';
  const saved = await store.saveFoodEvidence({ foodId: 'food-test', evidence: second.evidence, parsed: second.parsed, review: second.review, status: 'draft' });
  assert.equal(saved.evidence.id, 'evidence-2');
  assert.equal(saved.evidenceHistory?.length, 1);
  assert.equal(saved.evidenceHistory?.[0].evidence.id, 'evidence-1');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_evidence_versions').get().count, 2);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_evidence_versions WHERE is_current=1').get().count, 1);
  database.close();
});

test('nutrition evidence and edited identity commit together', async () => {
  const database = new DatabaseSync(':memory:');
  const files = {
    async materialize(input) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}` }; },
    async materializeRevision(input, revisionId) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}/versions/${revisionId}` }; },
    async validateStored() {}, async writeRevision() {}, async removeRevision() {}, async removeEvidenceRevision() {}, async removeFood() {},
  };
  let nowValue = '2026-10-09T00:00:01.000Z';
  const store = createSQLiteFoodStore(driverFor(database), files, () => nowValue, () => 'atomic');
  const first = record();
  first.identity = {
    schemaVersion: 1, foodId: first.id, name: '旧名称', brand: '旧品牌', specification: '',
    status: 'pending_confirmation',
    source: { sourceId: 'local', sourceName: '本机食品记录', kind: 'user', sourceRecordId: null, fetchedAt: null, obtainedAt: nowValue,
      policy: { license: null, commercialUse: 'unknown', cache: 'unknown', redistribute: 'unknown', cacheTtlSeconds: null, authorizationReference: null } },
    confirmedAt: null, updatedAt: nowValue,
  };
  await store.saveFood(first);
  const second = record();
  second.evidence = { ...second.evidence, id: 'evidence-atomic', recordedAt: '2026-10-09T00:00:02.000Z' };
  nowValue = '2026-10-09T00:00:03.000Z';
  const saved = await store.saveFoodEvidence({ foodId: first.id, evidence: second.evidence, parsed: second.parsed, review: second.review, status: 'draft', identity: { ...first.identity, name: '新名称' } });
  assert.equal(saved.identity?.name, '新名称');
  assert.equal((await store.getFoodIdentityRevisions(first.id)).length, 2);
  assert.equal((await store.getFood(first.id)).evidence.id, 'evidence-atomic');
  database.close();
});

test('synthetic v5 database migrates to v6 without changing food, OCR or revision snapshots', async () => {
  const database = new DatabaseSync(':memory:');
  const files = {
    async materialize(input) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}` }; },
    async validateStored() {}, async writeRevision() {}, async removeRevision() {}, async removeFood() {},
  };
  let clock = '2026-10-15T00:00:01.000Z';
  const driver = driverFor(database);
  const original = createSQLiteFoodStore(driver, files, () => clock, () => 'migration');
  const saved = await original.saveFood(record());
  clock = '2026-10-15T00:00:02.000Z';
  await original.saveFood({ ...saved, review: { ...saved.review, name: '旧版食品及人工修订' } });
  // Synthetic schema fixture only; never described as an installed historical APK.
  database.exec('DROP TABLE simple_inventory; DROP TABLE simple_product_photos; DROP TABLE simple_capture_drafts; PRAGMA user_version=5;');
  const tables = ['foods','food_evidence','food_evidence_versions','food_revisions'];
  const before = tables.map(name => database.prepare(`SELECT * FROM ${name}`).all());
  const upgraded = createSQLiteFoodStore(driver, files, () => clock, () => 'after-migration');
  assert.equal((await upgraded.getFood(saved.id)).review.name, '旧版食品及人工修订');
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 6);
  assert.deepEqual(tables.map(name => database.prepare(`SELECT * FROM ${name}`).all()), before);
  clock = '2026-10-15T00:00:03.000Z';
  const edited = await upgraded.saveFood({ ...(await upgraded.getFood(saved.id)), review: { ...saved.review, name: '迁移后仍可编辑' } });
  assert.equal(edited.review.name, '迁移后仍可编辑');
  assert.equal(edited.revisions.length, 3);
  assert.deepEqual(database.prepare('SELECT * FROM food_evidence').all(), before[1]);
  database.close();
});
