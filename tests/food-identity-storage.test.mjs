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
      try { const result = await task(wrap(connection)); connection.exec('COMMIT'); return result; }
      catch (error) { connection.exec('ROLLBACK'); throw error; }
    },
  });
  return wrap(database);
}

function files() {
  return {
    async materialize(input) { return { sourceEvidence: input.evidence, evidence: input.evidence, parsed: input.parsed, folderUri: `food://${input.id}` }; },
    async validateStored() {}, async writeRevision() {}, async removeRevision() {}, async removeFood() {},
  };
}
function record(id = 'identity-food') {
  const sourceImageHash = 'a'.repeat(64), processedImageHash = 'b'.repeat(64);
  const image = { uri: 'file:///processed.png', originalUri: 'file:///original.jpg', width: 100, height: 100,
    sourceImageHash, processedImageHash, sourceOrientation: 1,
    transform: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], operations: [], originalWidth: 100, originalHeight: 100 } };
  const ocr = { imageUri: image.uri, evidenceUri: 'file:///ocr.json', sourceImageHash, processedImageHash,
    rawText: '', blocks: [], width: 100, height: 100, engineVersion: 'test', modelVersion: 'test', modelHashes: {}, modelLoadMs: 1, ocrMs: 1, totalMs: 2 };
  const evidence = { schemaVersion: 1, id: `evidence-${id}`, recordedAt: '2026-10-13T00:00:00.000Z', image, ocr };
  const parsed = parseNutritionLabel(ocr);
  return { schemaVersion: 1, id, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z',
    status: 'draft', evidence, parsed, review: createFoodReview(parsed), revisions: [] };
}
function source(kind = 'mainland_service', sourceId = 'hukang-test-provider') {
  return { sourceId, sourceName: '测试国内商品服务', kind, sourceRecordId: 'record-001', fetchedAt: '2026-10-13T00:00:00.000Z',
    obtainedAt: '2026-10-13T00:00:00.000Z',
    policy: { license: null, commercialUse: 'unknown', cache: 'unknown', redistribute: 'unknown', cacheTtlSeconds: null, authorizationReference: null } };
}
function identity(foodId, status = 'pending_confirmation', kind = 'mainland_service') {
  return { schemaVersion: 1, foodId, name: '纯牛奶', brand: '测试品牌', specification: '250 mL', status,
    source: source(kind), confirmedAt: status === 'confirmed' ? '2026-10-13T00:00:02.000Z' : null,
    updatedAt: '2026-10-13T00:00:01.000Z' };
}
function store(database, now = () => '2026-10-13T00:00:03.000Z') {
  let nonce = 0;
  return createSQLiteFoodStore(driverFor(database), files(), now, () => `n${++nonce}`);
}

test('product identity is stored separately, with provider source and confirmation revisions', async () => {
  const database = new DatabaseSync(':memory:');
  let tick = 2;
  const local = store(database, () => `2026-10-13T00:00:0${++tick}.000Z`);
  await local.saveFood(record());
  const pending = await local.saveFoodIdentity(identity('identity-food'));
  assert.equal(pending.status, 'pending_confirmation');
  assert.equal((await local.getFood('identity-food')).identity.source.kind, 'mainland_service');
  assert.equal((await local.getFoodIdentityRevisions('identity-food')).length, 1);
  const confirmed = await local.saveFoodIdentity({ ...pending, status: 'confirmed', confirmedAt: '2026-10-13T00:00:04.000Z' });
  assert.equal(confirmed.status, 'confirmed');
  assert.equal((await local.getFoodIdentityRevisions('identity-food')).length, 2);
  assert.equal((await local.getFood('identity-food')).status, 'draft', 'identity confirmation must not imply nutrition confirmation');
  await assert.rejects(() => local.saveFoodIdentity({ ...pending, name: '过期编辑' }), /已被更新/);
  database.close();
});

test('new nutrition record may atomically carry a pending product identity', async () => {
  const database = new DatabaseSync(':memory:');
  const local = store(database);
  const saved = await local.saveFood({ ...record('atomic-food'), identity: identity('atomic-food') });
  assert.equal(saved.identity.name, '纯牛奶');
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_identity').get().count, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_identity_revisions').get().count, 1);
  database.close();
});

test('v2 to v3 migration preserves foods and creates empty identity tables', async () => {
  const database = new DatabaseSync(':memory:');
  const first = store(database);
  await first.saveFood(record('legacy-identity-food'));
  database.exec('DROP TABLE food_identity_revisions; DROP TABLE food_identity; PRAGMA user_version=2;');
  const upgraded = store(database);
  const legacy = await upgraded.getFood('legacy-identity-food');
  assert.equal(legacy.id, 'legacy-identity-food');
  assert.equal(legacy.identity, undefined);
  assert.equal(database.prepare('PRAGMA user_version').get().user_version, 3);
  assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='food_identity'").get().name, 'food_identity');
  database.close();
});

test('deleting food cascades identity and identity revision rows', async () => {
  const database = new DatabaseSync(':memory:');
  const local = store(database);
  await local.saveFood(record('delete-identity-food'));
  await local.saveFoodIdentity(identity('delete-identity-food'));
  await local.deleteFood('delete-identity-food');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_identity').get().count, 0);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM food_identity_revisions').get().count, 0);
  database.close();
});
