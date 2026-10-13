import type { ChinaFoodRepository } from '../../application/ports/ChinaFoodRepository';
import type { OcrEvidence } from '../../domain/ocr/types';
import type { FoodRevision, FoodScanRecord, FoodSummary, ParsedNutritionLabel } from '../../domain/food/scan';
import type { BarcodeAcquisitionMethod, FoodBarcodeAssociation, ValidatedBarcode } from '../../domain/barcode/types';
import { normalizeBarcode } from '../../domain/barcode/normalize';
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

const MIGRATION_V2 = `
CREATE TABLE IF NOT EXISTS food_barcodes (
  id TEXT PRIMARY KEY NOT NULL,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  raw_value TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('EAN_13','EAN_8','UPC_A','UPC_E')),
  lookup_key TEXT NOT NULL UNIQUE,
  validation_status TEXT NOT NULL CHECK(validation_status = 'valid'),
  acquired_by TEXT NOT NULL CHECK(acquired_by IN ('camera','image','manual')),
  scanned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS food_barcodes_by_food ON food_barcodes(food_id, scanned_at, id);
CREATE INDEX IF NOT EXISTS food_barcodes_by_lookup ON food_barcodes(lookup_key);
PRAGMA user_version = 2;
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
interface BarcodeRow {
  id: string; food_id: string; raw_value: string; format: FoodBarcodeAssociation['format'];
  lookup_key: string; validation_status: 'valid'; acquired_by: BarcodeAcquisitionMethod; scanned_at: string;
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
function parseRow(row: StoredRow, revisions: RevisionRow[], barcodes: BarcodeRow[] = []): FoodScanRecord {
  const record: FoodScanRecord = {
    schemaVersion: 1, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
    status: row.status, evidence: JSON.parse(row.persisted_evidence_json), parsed: JSON.parse(row.parsed_json),
    review: JSON.parse(row.review_json),
    revisions: revisions.map((revision) => ({
      id: revision.id, recordedAt: revision.recorded_at, kind: revision.kind,
      status: revision.status, review: JSON.parse(revision.review_json),
    })),
    barcodes: barcodes.map((barcode) => ({
      id: barcode.id, foodId: barcode.food_id, rawValue: barcode.raw_value, format: barcode.format,
      lookupKey: barcode.lookup_key, validationStatus: barcode.validation_status, acquiredBy: barcode.acquired_by, scannedAt: barcode.scanned_at,
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
    if (version === 0) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V1); await transaction.exec(MIGRATION_V2); });
    else if (version === 1) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V2); });
    else if (version === 2) {
      // A short-lived Phase 3 development build used the same version before
      // validation_status was made explicit. Repair that additive column
      // without touching foods, evidence or revisions.
      const columns = await driver.all<{ name: string }>('PRAGMA table_info(food_barcodes)');
      if (columns.length > 0 && !columns.some((column) => column.name === 'validation_status')) {
        await driver.transaction(async (transaction) => {
          await transaction.exec("ALTER TABLE food_barcodes ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'valid' CHECK(validation_status = 'valid')");
        });
      }
    } else if (version !== 2) throw new Error(`食品数据库版本 ${String(version)} 不受当前应用支持，未修改数据库。`);
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
    const barcodes = await connection.all<BarcodeRow>(
      'SELECT id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at FROM food_barcodes WHERE food_id=? ORDER BY scanned_at,id', id,
    );
    return parseRow(row, revisions, barcodes);
  }
  function validateBarcodeAssociation(barcode: FoodBarcodeAssociation): void {
    assertFoodId(barcode.id);
    assertFoodId(barcode.foodId);
    if (!/^\d{14}$/.test(barcode.lookupKey) || !/^\d+$/.test(barcode.rawValue) || barcode.rawValue.length > 14) {
      throw new Error('食品条码内容无效，必须保留数字字符串和 14 位规范化查询键。');
    }
    if (!['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'].includes(barcode.format)) throw new Error('不支持的食品条码格式。');
    if (!['camera', 'image', 'manual'].includes(barcode.acquiredBy)) throw new Error('条码获取方式无效。');
    if (barcode.validationStatus !== 'valid') throw new Error('只有通过校验的条码才能建立食品关联。');
    assertDate(barcode.scannedAt);
    const checked = normalizeBarcode({ rawValue: barcode.rawValue, format: barcode.format, decodedAt: barcode.scannedAt });
    if (checked.validity !== 'valid' || checked.lookupKey !== barcode.lookupKey) throw new Error('条码格式或校验位无效，拒绝写入本地食品库。');
  }
  function createBarcodeAssociation(input: ValidatedBarcode, foodId: string, acquiredBy: BarcodeAcquisitionMethod, id: string, fallbackTime: string): FoodBarcodeAssociation {
    if (input.validity !== 'valid' || !input.lookupKey || !input.normalizedFormat || !input.gtin) throw new Error('只能保存已通过格式和校验位验证的食品条码。');
    const association: FoodBarcodeAssociation = {
      id, foodId, rawValue: input.scan.rawValue, format: input.normalizedFormat,
      lookupKey: input.lookupKey, validationStatus: 'valid', acquiredBy, scannedAt: input.scan.decodedAt || fallbackTime,
    };
    validateBarcodeAssociation(association);
    return association;
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
    async getFoodByBarcode(lookupKey) {
      if (!/^\d{14}$/.test(lookupKey)) throw new Error('条码查询键必须是 14 位数字字符串。');
      await ready();
      const barcode = await driver.get<BarcodeRow>(
        'SELECT id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at FROM food_barcodes WHERE lookup_key=?', lookupKey,
      );
      if (!barcode) return null;
      const record = await read(barcode.food_id);
      if (!record) throw new Error('条码索引指向不存在的食品记录。');
      const associated = record.barcodes?.find((item) => item.lookupKey === lookupKey);
      if (!associated) throw new Error('条码关联记录不完整。');
      return { record, barcode: associated };
    },
    async listFoodBarcodes(foodId) {
      assertFoodId(foodId);
      await ready();
      const rows = await driver.all<BarcodeRow>(
        'SELECT id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at FROM food_barcodes WHERE food_id=? ORDER BY scanned_at,id', foodId,
      );
      return rows.map((row) => ({ id: row.id, foodId: row.food_id, rawValue: row.raw_value, format: row.format,
        lookupKey: row.lookup_key, validationStatus: row.validation_status, acquiredBy: row.acquired_by, scannedAt: row.scanned_at }));
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
        const requestedBarcodes = [...(record.barcodes ?? [])];
        requestedBarcodes.forEach(validateBarcodeAssociation);
        if (previous && canonicalFoodJson(requestedBarcodes) !== canonicalFoodJson(previous.barcodes ?? [])) {
          throw new Error('条码关联必须通过独立的绑定操作修改，保存食品编辑不能静默覆盖条码。');
        }
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
              for (const barcode of requestedBarcodes) {
                await transaction.run('INSERT INTO food_barcodes(id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at) VALUES(?,?,?,?,?,?,?,?)',
                  barcode.id, barcode.foodId, barcode.rawValue, barcode.format, barcode.lookupKey, barcode.validationStatus, barcode.acquiredBy, barcode.scannedAt);
              }
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
          revisions: [...(previous?.revisions ?? []), revision], barcodes: previous?.barcodes ?? requestedBarcodes,
        };
      });
    },
    bindBarcode(foodId, input, acquiredBy) {
      assertFoodId(foodId);
      return serialize(async () => {
        await ready();
        const existingFood = await read(foodId);
        if (!existingFood) throw new Error('要绑定条码的食品记录不存在。');
        const nowValue = now();
        assertDate(nowValue);
        const association = createBarcodeAssociation(input, foodId, acquiredBy,
          `${foodId}-barcode-${Date.parse(nowValue).toString(36)}-${nonce()}`, nowValue);
        const already = await driver.get<BarcodeRow>(
          'SELECT id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at FROM food_barcodes WHERE lookup_key=?', association.lookupKey,
        );
        if (already) {
          if (already.food_id !== foodId) throw new Error('该条码已经绑定到另一条食品记录，未覆盖原关联。');
          return { id: already.id, foodId: already.food_id, rawValue: already.raw_value, format: already.format,
            lookupKey: already.lookup_key, validationStatus: already.validation_status, acquiredBy: already.acquired_by, scannedAt: already.scanned_at };
        }
        await driver.transaction(async (transaction) => {
          await verifyTransaction(transaction);
          await transaction.run('INSERT INTO food_barcodes(id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at) VALUES(?,?,?,?,?,?,?,?)',
            association.id, association.foodId, association.rawValue, association.format, association.lookupKey, association.validationStatus, association.acquiredBy, association.scannedAt);
        });
        return association;
      });
    },
    async unbindBarcode(foodId, lookupKey) {
      assertFoodId(foodId);
      if (!/^\d{14}$/.test(lookupKey)) throw new Error('条码查询键必须是 14 位数字字符串。');
      return serialize(async () => {
        await ready();
        await driver.transaction(async (transaction) => {
          await verifyTransaction(transaction);
          await transaction.run('DELETE FROM food_barcodes WHERE food_id=? AND lookup_key=?', foodId, lookupKey);
        });
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
