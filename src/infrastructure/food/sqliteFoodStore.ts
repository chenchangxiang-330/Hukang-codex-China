import type { ChinaFoodRepository } from '../../application/ports/ChinaFoodRepository';
import type { OcrEvidence } from '../../domain/ocr/types';
import type { FoodRevision, FoodScanRecord, FoodSummary, ParsedNutritionLabel } from '../../domain/food/scan';
import { validateFoodReview } from '../../domain/food/review';

export type SqlValue = string | number | null;
/** This adapter is exercised with real SQLite on the host and Expo SQLite on Android. */
export interface FoodSqlDriver {
  exec(sql: string): Promise<void>;
  run(sql: string, ...values: SqlValue[]): Promise<void>;
  get<T>(sql: string, ...values: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, ...values: SqlValue[]): Promise<T[]>;
  transaction<T>(task: (transaction: FoodSqlDriver) => Promise<T>): Promise<T>;
}
export interface MaterializedFoodEvidence {
  readonly sourceEvidence: OcrEvidence;
  readonly evidence: OcrEvidence;
  readonly parsed: ParsedNutritionLabel;
  readonly folderUri: string;
}
export interface FoodEvidenceFiles {
  /** Creates a new owned folder, verifies both copied image hashes and saves immutable JSON. */
  materialize(record: FoodScanRecord): Promise<MaterializedFoodEvidence>;
  validateStored(id: string, stored: MaterializedFoodEvidence): Promise<void>;
  writeRevision(id: string, folderUri: string, revision: FoodRevision): Promise<void>;
  removeRevision(id: string, folderUri: string, revisionId: string): Promise<void>;
  /** Must reject folders outside the application-owned food-evidence/{id} directory. */
  removeFood(id: string, folderUri: string): Promise<void>;
}

const MIGRATION_V1 = `
CREATE TABLE foods (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','confirmed')),
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  review_json TEXT NOT NULL
);
CREATE TABLE food_evidence (
  food_id TEXT PRIMARY KEY NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  source_evidence_json TEXT NOT NULL,
  persisted_evidence_json TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  folder_uri TEXT NOT NULL
);
CREATE TABLE food_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('created','edited')),
  status TEXT NOT NULL CHECK(status IN ('draft','confirmed')),
  review_json TEXT NOT NULL
);
CREATE INDEX food_revisions_by_food ON food_revisions(food_id, recorded_at, id);
CREATE INDEX foods_updated ON foods(updated_at DESC);
CREATE TABLE food_file_cleanup (
  food_id TEXT PRIMARY KEY NOT NULL,
  folder_uri TEXT NOT NULL
);
PRAGMA user_version = 1;
`;

interface StoredRow {
  id: string; created_at: string; updated_at: string; status: FoodScanRecord['status'];
  review_json: string; source_evidence_json: string; persisted_evidence_json: string;
  parsed_json: string; folder_uri: string;
}
interface RevisionRow {
  id: string; recorded_at: string; kind: FoodRevision['kind'];
  status: FoodRevision['status']; review_json: string;
}
const RECORD_SQL = `SELECT f.id,f.created_at,f.updated_at,f.status,f.review_json,
  e.source_evidence_json,e.persisted_evidence_json,e.parsed_json,e.folder_uri
  FROM foods f JOIN food_evidence e ON e.food_id=f.id WHERE f.id=?`;

export function assertFoodId(id: string): void {
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id)) {
    throw new Error('食品记录 ID 无效。');
  }
}
function assertDate(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('食品记录时间无效。');
  }
}

/** Stable object-key order detects changes without treating harmless JSON key order as edits. */
export function canonicalFoodJson(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(canonical);
    if (typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) {
      return Object.fromEntries(Object.keys(item).sort().map((key) => [key, canonical((item as Record<string, unknown>)[key])]));
    }
    throw new Error('食品证据必须是有效 JSON，不接受空缺属性、非有限数字或自定义对象。');
  }
  return JSON.stringify(canonical(value));
}

function validateRecord(record: FoodScanRecord): void {
  assertFoodId(record.id);
  assertDate(record.createdAt);
  assertDate(record.updatedAt);
  if (record.schemaVersion !== 1 || !['draft', 'confirmed'].includes(record.status)) throw new Error('食品记录版本或确认状态无效。');
  if (![record.review.name, record.review.brand, record.review.ingredients].every((field) => typeof field === 'string' && field.length <= 10000)) {
    throw new Error('商品名、品牌或配料内容无效。');
  }
  const errors = validateFoodReview(record.review, record.status);
  if (errors.length) throw new Error(errors.join('\n'));
  if (record.parsed.ocrSourceImageHash !== record.evidence.image.sourceImageHash ||
    record.parsed.ocrProcessedImageHash !== record.evidence.image.processedImageHash ||
    record.evidence.ocr.sourceImageHash !== record.evidence.image.sourceImageHash ||
    record.evidence.ocr.processedImageHash !== record.evidence.image.processedImageHash ||
    record.evidence.ocr.imageUri !== record.evidence.image.uri ||
    ![record.evidence.image.sourceImageHash, record.evidence.image.processedImageHash].every((hash) => /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('图片、OCR 与解析记录的证据关联不一致。');
  }
  if (record.evidence.ocr.blocks.map((block) => block.text).join('\n') !== record.evidence.ocr.rawText) {
    throw new Error('OCR 原文已被修改或与文字块不一致。');
  }
  canonicalFoodJson(record);
}
function parseRow(row: StoredRow, revisions: RevisionRow[]): FoodScanRecord {
  const record: FoodScanRecord = {
    schemaVersion: 1, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
    status: row.status, evidence: JSON.parse(row.persisted_evidence_json), parsed: JSON.parse(row.parsed_json),
    review: JSON.parse(row.review_json),
    revisions: revisions.map((revision) => ({
      id: revision.id, recordedAt: revision.recorded_at, kind: revision.kind,
      status: revision.status, review: JSON.parse(revision.review_json),
    })),
  };
  validateRecord(record);
  return record;
}

export function createSQLiteFoodStore(
  driver: FoodSqlDriver,
  files: FoodEvidenceFiles,
  now: () => string = () => new Date().toISOString(),
  nonce: () => string = () => Math.random().toString(36).slice(2, 12),
): ChinaFoodRepository {
  let initialization: Promise<void> | undefined;
  // Serialize application writes so stale editors cannot overwrite a newer review.
  let writing: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = writing.then(task, task);
    writing = result.then(() => undefined, () => undefined);
    return result;
  }
  async function cleanupFiles(): Promise<void> {
    for (const row of await driver.all<{ food_id: string; folder_uri: string }>('SELECT food_id,folder_uri FROM food_file_cleanup')) {
      await files.removeFood(row.food_id, row.folder_uri);
      await driver.run('DELETE FROM food_file_cleanup WHERE food_id=?', row.food_id);
    }
  }
  async function initialize(): Promise<void> {
    await driver.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = (await driver.get<{ user_version: number }>('PRAGMA user_version'))?.user_version;
    if (version === 0) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V1); });
    else if (version !== 1) throw new Error(`食品数据库版本 ${String(version)} 不受当前应用支持，未修改数据库。`);
    await cleanupFiles();
  }
  async function ready(): Promise<void> {
    initialization ??= initialize().catch((error: unknown) => { initialization = undefined; throw error; });
    await initialization;
  }
  async function read(id: string, connection: FoodSqlDriver = driver): Promise<FoodScanRecord | null> {
    const row = await connection.get<StoredRow>(RECORD_SQL, id);
    if (!row) return null;
    const revisions = await connection.all<RevisionRow>(
      'SELECT id,recorded_at,kind,status,review_json FROM food_revisions WHERE food_id=? ORDER BY recorded_at,rowid', id,
    );
    return parseRow(row, revisions);
  }
  async function verifyTransaction(transaction: FoodSqlDriver): Promise<void> {
    // Expo exclusive transactions create another connection. Native build enables
    // SQLITE_DEFAULT_FOREIGN_KEYS=1; enabling PRAGMA after BEGIN would do nothing.
    if ((await transaction.get<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys !== 1) {
      throw new Error('SQLite 事务连接未启用外键约束，已停止保存。');
    }
  }
  return {
    async getFood(id) {
      assertFoodId(id);
      await ready();
      return read(id);
    },
    async listFoods(query = '') {
      if (typeof query !== 'string' || query.length > 1000) throw new Error('查询文字过长或无效。');
      await ready();
      const escaped = query.trim().replace(/[\\%_]/g, '\\$&');
      const rows = await driver.all<{ id: string; name: string; brand: string; status: FoodSummary['status']; updated_at: string }>(
        "SELECT id,name,brand,status,updated_at FROM foods WHERE name LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\' ORDER BY updated_at DESC,id",
        `%${escaped}%`, `%${escaped}%`,
      );
      return rows.map((row) => ({ id: row.id, name: row.name, brand: row.brand, status: row.status, updatedAt: row.updated_at }));
    },
    saveFood(input) {
      // Snapshot before waiting for another writer; caller mutations cannot alter a pending save.
      validateRecord(input);
      const record: FoodScanRecord = JSON.parse(JSON.stringify(input));
      return serialize(async () => {
        await ready();
        const previous = await read(record.id);
        const existing = await driver.get<StoredRow>(RECORD_SQL, record.id);
        if (previous && (record.createdAt !== previous.createdAt || record.updatedAt !== previous.updatedAt ||
          canonicalFoodJson(record.revisions) !== canonicalFoodJson(previous.revisions))) {
          throw new Error('该食品已更新，请重新打开记录后编辑；原始证据和历史版本不能修改。');
        }
        if (previous && (canonicalFoodJson(record.evidence) !== canonicalFoodJson(previous.evidence) ||
          canonicalFoodJson(record.parsed) !== canonicalFoodJson(previous.parsed))) {
          throw new Error('禁止覆盖已保存的 OCR 原文、图片证据或初始解析结果。');
        }
        if (!previous && record.revisions.length !== 0) throw new Error('新食品记录不能携带伪造的历史版本。');
        const materialized: MaterializedFoodEvidence = existing
          ? { sourceEvidence: JSON.parse(existing.source_evidence_json), evidence: JSON.parse(existing.persisted_evidence_json),
            parsed: JSON.parse(existing.parsed_json), folderUri: existing.folder_uri }
          : await files.materialize(record);
        const recordedAt = now();
        assertDate(recordedAt);
        const revision: FoodRevision = {
          id: `${record.id}-${Date.parse(recordedAt).toString(36)}-${nonce()}`,
          recordedAt, kind: previous ? 'edited' : 'created', status: record.status, review: record.review,
        };
        assertFoodId(revision.id);
        try {
          await files.validateStored(record.id, materialized);
          await files.writeRevision(record.id, materialized.folderUri, revision);
          await driver.transaction(async (transaction) => {
            await verifyTransaction(transaction);
            if (!previous) {
              await transaction.run('INSERT INTO foods(id,created_at,updated_at,status,name,brand,review_json) VALUES(?,?,?,?,?,?,?)',
                record.id, record.createdAt, recordedAt, record.status, record.review.name, record.review.brand, JSON.stringify(record.review));
              await transaction.run('INSERT INTO food_evidence(food_id,source_evidence_json,persisted_evidence_json,parsed_json,folder_uri) VALUES(?,?,?,?,?)',
                record.id, JSON.stringify(materialized.sourceEvidence), JSON.stringify(materialized.evidence), JSON.stringify(record.parsed), materialized.folderUri);
            } else {
              await transaction.run('UPDATE foods SET updated_at=?,status=?,name=?,brand=?,review_json=? WHERE id=?',
                recordedAt, record.status, record.review.name, record.review.brand, JSON.stringify(record.review), record.id);
            }
            await transaction.run('INSERT INTO food_revisions(id,food_id,recorded_at,kind,status,review_json) VALUES(?,?,?,?,?,?)',
              revision.id, record.id, recordedAt, revision.kind, revision.status, JSON.stringify(revision.review));
          });
        } catch (error) {
          try {
            if (previous) await files.removeRevision(record.id, materialized.folderUri, revision.id);
            else await files.removeFood(record.id, materialized.folderUri);
          } catch (cleanupError) {
            throw new Error(`保存未成功，证据文件清理也失败：${String(error)}；${String(cleanupError)}`);
          }
          throw error;
        }
        return {
          ...record, updatedAt: recordedAt, evidence: materialized.evidence,
          revisions: [...(previous?.revisions ?? []), revision],
        };
      });
    },
    deleteFood(id) {
      assertFoodId(id);
      return serialize(async () => {
        await ready();
        const existing = await driver.get<StoredRow>(RECORD_SQL, id);
        if (!existing) return;
        await driver.transaction(async (transaction) => {
          await verifyTransaction(transaction);
          await transaction.run('INSERT OR REPLACE INTO food_file_cleanup(food_id,folder_uri) VALUES(?,?)', id, existing.folder_uri);
          // Foreign-key cascade removes evidence and revisions in the same commit.
          await transaction.run('DELETE FROM foods WHERE id=?', id);
        });
        // SQLite is authoritative. If storage cleanup fails, keep a durable retry
        // row and expose the error; the next database open retries cleanup.
        try { await cleanupFiles(); }
        catch (error) { throw new Error(`食品记录已删除，但本地证据文件清理失败，重启后将重试：${String(error)}`); }
      });
    },
  };
}
