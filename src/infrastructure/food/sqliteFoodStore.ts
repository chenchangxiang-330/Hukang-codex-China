import type { ChinaFoodRepository } from '../../application/ports/ChinaFoodRepository';
import type { OcrEvidence } from '../../domain/ocr/types';
import type { FoodEvidenceRevision, FoodRevision, FoodScanRecord, FoodSummary, ParsedNutritionLabel } from '../../domain/food/scan';
import type { FoodIdentity, FoodIdentityRevision, FoodIdentityRevisionKind, FoodIdentitySourceKind, FoodIdentityStatus, PendingFoodIdentity } from '../../domain/food/identity';
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
  /** Materialize a new immutable evidence folder under the existing food. */
  materializeRevision?(record: FoodScanRecord, revisionId: string): Promise<MaterializedFoodEvidence>;
  validateStored(id: string, stored: MaterializedFoodEvidence): Promise<void>;
  writeRevision(id: string, folderUri: string, revision: FoodRevision): Promise<void>;
  removeRevision(id: string, folderUri: string, revisionId: string): Promise<void>;
  /** Removes a newly materialized evidence version after a failed transaction. */
  removeEvidenceRevision?(id: string, folderUri: string): Promise<void>;
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

/** v3 separates provider/user product identity from OCR and nutrition evidence. */
const MIGRATION_V3 = `
CREATE TABLE IF NOT EXISTS food_identity (
  food_id TEXT PRIMARY KEY NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  specification TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','pending_confirmation','confirmed')),
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('local','mainland_service','user','package_ocr')),
  source_record_id TEXT,
  source_fetched_at TEXT,
  source_obtained_at TEXT NOT NULL,
  source_policy_json TEXT NOT NULL,
  confirmed_at TEXT,
  updated_at TEXT NOT NULL,
  identity_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS food_identity_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('created','provider_result','edited','confirmed')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending_confirmation','confirmed')),
  identity_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS food_identity_revisions_by_food ON food_identity_revisions(food_id, recorded_at, id);
CREATE INDEX IF NOT EXISTS food_identity_by_source ON food_identity(source_id, source_record_id);
PRAGMA user_version = 3;
`;

/** v4 gives each package/OCR capture an immutable evidence snapshot. */
const MIGRATION_V4 = `
CREATE TABLE IF NOT EXISTS food_evidence_versions (
  id TEXT PRIMARY KEY NOT NULL,
  food_id TEXT NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  recorded_at TEXT NOT NULL,
  source_evidence_json TEXT NOT NULL,
  persisted_evidence_json TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  folder_uri TEXT NOT NULL,
  is_current INTEGER NOT NULL CHECK(is_current IN (0,1))
);
CREATE UNIQUE INDEX IF NOT EXISTS food_evidence_current ON food_evidence_versions(food_id) WHERE is_current=1;
CREATE INDEX IF NOT EXISTS food_evidence_versions_by_food ON food_evidence_versions(food_id,recorded_at,id);
INSERT OR IGNORE INTO food_evidence_versions(id,food_id,recorded_at,source_evidence_json,persisted_evidence_json,parsed_json,folder_uri,is_current)
  SELECT f.id || '-evidence-initial', f.id, f.created_at, e.source_evidence_json, e.persisted_evidence_json, e.parsed_json, e.folder_uri, 1
  FROM foods f JOIN food_evidence e ON e.food_id=f.id;
PRAGMA user_version = 4;
`;

/** v5 stores a confirmed identity while its first nutrition label is still pending. */
const MIGRATION_V5 = `
CREATE TABLE IF NOT EXISTS food_identity_pending (
  id TEXT PRIMARY KEY NOT NULL,
  identity_json TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  format TEXT NOT NULL CHECK(format IN ('EAN_13','EAN_8','UPC_A','UPC_E')),
  lookup_key TEXT NOT NULL UNIQUE,
  acquired_by TEXT NOT NULL CHECK(acquired_by IN ('camera','image','manual')),
  scanned_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS food_identity_pending_by_updated ON food_identity_pending(updated_at DESC,id);
PRAGMA user_version = 5;
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
interface IdentityRow {
  food_id: string; name: string; brand: string; specification: string;
  status: FoodIdentityStatus; source_id: string; source_name: string; source_kind: FoodIdentitySourceKind;
  source_record_id: string | null; source_fetched_at: string | null; source_obtained_at: string;
  source_policy_json: string; confirmed_at: string | null; updated_at: string; identity_json: string;
}
interface IdentityRevisionRow {
  id: string; food_id: string; recorded_at: string; kind: FoodIdentityRevisionKind;
  status: FoodIdentityStatus; identity_json: string;
}
interface EvidenceVersionRow {
  id: string; food_id: string; recorded_at: string; source_evidence_json: string;
  persisted_evidence_json: string; parsed_json: string; folder_uri: string; is_current: number;
}
interface PendingIdentityRow {
  id: string; identity_json: string; raw_value: string; format: FoodBarcodeAssociation['format'];
  lookup_key: string; acquired_by: BarcodeAcquisitionMethod; scanned_at: string;
  created_at: string; updated_at: string;
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
function assertNullableDate(value: string | null, label: string): void {
  if (value !== null) assertDate(value);
  if (value !== null && typeof value !== 'string') throw new Error(`${label}无效。`);
}

function validateIdentity(identity: FoodIdentity): void {
  assertFoodId(identity.foodId);
  if (identity.schemaVersion !== 1) throw new Error('商品身份版本无效。');
  for (const [label, value] of [['商品名称', identity.name], ['品牌', identity.brand], ['规格', identity.specification]] as const) {
    if (typeof value !== 'string' || value.length > 10000) throw new Error(`${label}无效或过长。`);
  }
  if (!['draft', 'pending_confirmation', 'confirmed'].includes(identity.status)) throw new Error('商品身份确认状态无效。');
  const source = identity.source;
  if (!source || typeof source !== 'object') throw new Error('商品身份来源缺失。');
  for (const [label, value, max] of [['来源标识', source.sourceId, 300], ['来源名称', source.sourceName, 1000]] as const) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new Error(`${label}无效。`);
  }
  if (!['local', 'mainland_service', 'user', 'package_ocr'].includes(source.kind)) throw new Error('商品身份来源类型无效。');
  if (source.sourceRecordId !== null && (typeof source.sourceRecordId !== 'string' || source.sourceRecordId.length > 1000)) throw new Error('商品身份来源记录标识无效。');
  assertDate(source.obtainedAt);
  assertNullableDate(source.fetchedAt, '商品身份来源获取时间');
  assertNullableDate(identity.confirmedAt, '商品身份确认时间');
  assertDate(identity.updatedAt);
  if (identity.status === 'confirmed' && identity.confirmedAt === null) throw new Error('已确认商品身份必须保留确认时间。');
  if (identity.status !== 'confirmed' && identity.confirmedAt !== null) throw new Error('未确认商品身份不能携带确认时间。');
  const policy = source.policy;
  if (!policy || typeof policy !== 'object') throw new Error('商品身份数据使用政策缺失。');
  for (const key of ['commercialUse', 'cache', 'redistribute'] as const) {
    if (!['allowed', 'denied', 'unknown'].includes(policy[key])) throw new Error(`商品身份政策 ${key} 无效。`);
  }
  if (policy.license !== null && typeof policy.license !== 'string') throw new Error('商品身份许可字段无效。');
  if (policy.authorizationReference !== null && typeof policy.authorizationReference !== 'string') throw new Error('商品身份授权引用无效。');
  if (policy.cacheTtlSeconds !== null && (!Number.isInteger(policy.cacheTtlSeconds) || policy.cacheTtlSeconds < 0)) throw new Error('商品身份缓存期限无效。');
  canonicalFoodJson(identity);
}

function assertIdentityCachePolicy(identity: FoodIdentity): void {
  if (identity.source.kind === 'mainland_service' && identity.source.policy.cache !== 'allowed') {
    throw new Error('国内服务商品身份的本地缓存授权尚未确认，未写入长期食品库；请手动核对后以本地用户来源保存。');
  }
}

function identityFromRow(row: IdentityRow): FoodIdentity {
  const identity = JSON.parse(row.identity_json) as FoodIdentity;
  validateIdentity(identity);
  const source = identity.source;
  if (identity.foodId !== row.food_id || identity.name !== row.name || identity.brand !== row.brand ||
    identity.specification !== row.specification || identity.status !== row.status || identity.updatedAt !== row.updated_at ||
    source.sourceId !== row.source_id || source.sourceName !== row.source_name || source.kind !== row.source_kind ||
    source.sourceRecordId !== row.source_record_id || source.fetchedAt !== row.source_fetched_at ||
    source.obtainedAt !== row.source_obtained_at || identity.confirmedAt !== row.confirmed_at ||
    canonicalFoodJson(source.policy) !== canonicalFoodJson(JSON.parse(row.source_policy_json))) {
    throw new Error('商品身份索引列与身份记录不一致。');
  }
  return identity;
}

function identityRevisionFromRow(row: IdentityRevisionRow): FoodIdentityRevision {
  const identity = JSON.parse(row.identity_json) as FoodIdentity;
  validateIdentity(identity);
  if (identity.foodId !== row.food_id || identity.status !== row.status) throw new Error('商品身份历史记录不一致。');
  assertFoodId(row.id); assertDate(row.recorded_at);
  return { id: row.id, foodId: row.food_id, recordedAt: row.recorded_at, kind: row.kind, status: row.status, identity };
}

function parseEvidenceVersion(row: EvidenceVersionRow): FoodEvidenceRevision {
  assertFoodId(row.id); assertFoodId(row.food_id); assertDate(row.recorded_at);
  const sourceEvidence = JSON.parse(row.source_evidence_json) as OcrEvidence;
  const evidence = JSON.parse(row.persisted_evidence_json) as OcrEvidence;
  const parsed = JSON.parse(row.parsed_json) as ParsedNutritionLabel;
  return { id: row.id, foodId: row.food_id, recordedAt: row.recorded_at, sourceEvidence, evidence, parsed, folderUri: row.folder_uri };
}

function parsePendingIdentity(row: PendingIdentityRow): PendingFoodIdentity {
  assertFoodId(row.id); assertDate(row.created_at); assertDate(row.updated_at);
  const identity = JSON.parse(row.identity_json) as FoodIdentity;
  validateIdentity(identity);
  if (identity.foodId !== row.id) throw new Error('待补商品身份与记录 ID 不一致。');
  const barcode: FoodBarcodeAssociation = {
    id: `${row.id}-barcode`, foodId: row.id, rawValue: row.raw_value, format: row.format,
    lookupKey: row.lookup_key, validationStatus: 'valid', acquiredBy: row.acquired_by, scannedAt: row.scanned_at,
  };
  if (!/^\d{14}$/.test(barcode.lookupKey) || !/^\d+$/.test(barcode.rawValue) || barcode.rawValue.length > 14 ||
    !['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'].includes(barcode.format) || !['camera', 'image', 'manual'].includes(barcode.acquiredBy)) {
    throw new Error('待补商品的条码记录无效。');
  }
  const checked = normalizeBarcode({ rawValue: barcode.rawValue, format: barcode.format, decodedAt: barcode.scannedAt });
  if (checked.validity !== 'valid' || checked.lookupKey !== barcode.lookupKey) throw new Error('待补商品的条码校验失败。');
  return { id: row.id, identity, barcode, createdAt: row.created_at, updatedAt: row.updated_at };
}

function parseRow(row: StoredRow, revisions: RevisionRow[], barcodes: BarcodeRow[] = [], identity?: FoodIdentity, evidenceHistory: readonly FoodEvidenceRevision[] = []): FoodScanRecord {
  const record: FoodScanRecord = {
    schemaVersion: 1, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
    status: row.status, evidence: JSON.parse(row.persisted_evidence_json), parsed: JSON.parse(row.parsed_json),
    ...(evidenceHistory.length > 0 ? { evidenceHistory } : {}),
    review: JSON.parse(row.review_json),
    ...(identity ? { identity } : {}),
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
  function identityExpired(identity: FoodIdentity, at: string): boolean {
    const ttl = identity.source.policy.cacheTtlSeconds;
    return identity.source.kind === 'mainland_service' && ttl !== null &&
      Date.parse(at) >= Date.parse(identity.source.obtainedAt) + ttl * 1000;
  }
  async function cleanupExpiredIdentities(): Promise<void> {
    const rows = await driver.all<IdentityRow>(
      'SELECT food_id,name,brand,specification,status,source_id,source_name,source_kind,source_record_id,source_fetched_at,source_obtained_at,source_policy_json,confirmed_at,updated_at,identity_json FROM food_identity',
    );
    const at = now();
    assertDate(at);
    for (const row of rows) {
      const identity = identityFromRow(row);
      const revisions = await driver.all<IdentityRevisionRow>(
        'SELECT id,food_id,recorded_at,kind,status,identity_json FROM food_identity_revisions WHERE food_id=?', row.food_id,
      );
      const expiredRevisionIds = revisions.filter((revision) => identityExpired(identityRevisionFromRow(revision).identity, at)).map((revision) => revision.id);
      const removeCurrent = identityExpired(identity, at);
      if (!removeCurrent && expiredRevisionIds.length === 0) continue;
      await driver.transaction(async (transaction) => {
        await verifyTransaction(transaction);
        for (const id of expiredRevisionIds) await transaction.run('DELETE FROM food_identity_revisions WHERE id=? AND food_id=?', id, row.food_id);
        if (removeCurrent) await transaction.run('DELETE FROM food_identity WHERE food_id=?', row.food_id);
      });
    }
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
    if (version === 0) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V1); await transaction.exec(MIGRATION_V2); await transaction.exec(MIGRATION_V3); await transaction.exec(MIGRATION_V4); await transaction.exec(MIGRATION_V5); });
    else if (version === 1) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V2); await transaction.exec(MIGRATION_V3); await transaction.exec(MIGRATION_V4); await transaction.exec(MIGRATION_V5); });
    else if (version === 2) {
      // A short-lived Phase 3 development build used the same version before
      // validation_status was made explicit. Repair that additive column and
      // then create the v3 identity tables in one serialized migration.
      const columns = await driver.all<{ name: string }>('PRAGMA table_info(food_barcodes)');
      await driver.transaction(async (transaction) => {
        if (columns.length > 0 && !columns.some((column) => column.name === 'validation_status')) {
          await transaction.exec("ALTER TABLE food_barcodes ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'valid' CHECK(validation_status = 'valid')");
        }
        await transaction.exec(MIGRATION_V3);
        await transaction.exec(MIGRATION_V4);
        await transaction.exec(MIGRATION_V5);
      });
    } else if (version === 3) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V4); await transaction.exec(MIGRATION_V5); });
    else if (version === 4) await driver.transaction(async (transaction) => { await transaction.exec(MIGRATION_V5); });
    else if (version !== 5) throw new Error(`食品数据库版本 ${String(version)} 不受当前应用支持，未修改数据库。`);
    await cleanupExpiredIdentities();
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
    const identityRow = await connection.get<IdentityRow>(
      'SELECT food_id,name,brand,specification,status,source_id,source_name,source_kind,source_record_id,source_fetched_at,source_obtained_at,source_policy_json,confirmed_at,updated_at,identity_json FROM food_identity WHERE food_id=?', id,
    );
    const evidenceRows = await connection.all<EvidenceVersionRow>(
      'SELECT id,food_id,recorded_at,source_evidence_json,persisted_evidence_json,parsed_json,folder_uri,is_current FROM food_evidence_versions WHERE food_id=? ORDER BY recorded_at,rowid', id,
    );
    const evidenceHistory = evidenceRows.filter((item) => item.is_current !== 1).map(parseEvidenceVersion);
    return parseRow(row, revisions, barcodes, identityRow ? identityFromRow(identityRow) : undefined, evidenceHistory);
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
  async function readIdentity(foodId: string, connection: FoodSqlDriver = driver): Promise<FoodIdentity | null> {
    const row = await connection.get<IdentityRow>(
      'SELECT food_id,name,brand,specification,status,source_id,source_name,source_kind,source_record_id,source_fetched_at,source_obtained_at,source_policy_json,confirmed_at,updated_at,identity_json FROM food_identity WHERE food_id=?', foodId,
    );
    return row ? identityFromRow(row) : null;
  }
  async function listIdentityRevisions(foodId: string, connection: FoodSqlDriver = driver): Promise<readonly FoodIdentityRevision[]> {
    const rows = await connection.all<IdentityRevisionRow>(
      'SELECT id,food_id,recorded_at,kind,status,identity_json FROM food_identity_revisions WHERE food_id=? ORDER BY recorded_at,rowid', foodId,
    );
    return rows.map(identityRevisionFromRow);
  }
  async function persistIdentity(transaction: FoodSqlDriver, identity: FoodIdentity): Promise<void> {
    const source = identity.source;
    await transaction.run(
      `INSERT INTO food_identity(food_id,name,brand,specification,status,source_id,source_name,source_kind,source_record_id,source_fetched_at,source_obtained_at,source_policy_json,confirmed_at,updated_at,identity_json)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(food_id) DO UPDATE SET name=excluded.name,brand=excluded.brand,specification=excluded.specification,status=excluded.status,
       source_id=excluded.source_id,source_name=excluded.source_name,source_kind=excluded.source_kind,source_record_id=excluded.source_record_id,
       source_fetched_at=excluded.source_fetched_at,source_obtained_at=excluded.source_obtained_at,source_policy_json=excluded.source_policy_json,
       confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at,identity_json=excluded.identity_json`,
      identity.foodId, identity.name, identity.brand, identity.specification, identity.status,
      source.sourceId, source.sourceName, source.kind, source.sourceRecordId, source.fetchedAt, source.obtainedAt,
      JSON.stringify(source.policy), identity.confirmedAt, identity.updatedAt, JSON.stringify(identity),
    );
  }
  async function persistIdentityRevision(transaction: FoodSqlDriver, identity: FoodIdentity, kind: FoodIdentityRevisionKind, recordedAt: string, revisionId: string): Promise<void> {
    await transaction.run(
      'INSERT INTO food_identity_revisions(id,food_id,recorded_at,kind,status,identity_json) VALUES(?,?,?,?,?,?)',
      revisionId, identity.foodId, recordedAt, kind, identity.status, JSON.stringify(identity),
    );
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
    async getFoodIdentity(foodId) {
      assertFoodId(foodId);
      await ready();
      return readIdentity(foodId);
    },
    async saveFoodIdentity(input) {
      validateIdentity(input);
      assertIdentityCachePolicy(input);
      const snapshot = JSON.parse(JSON.stringify(input)) as FoodIdentity;
      return serialize(async () => {
        await ready();
        const food = await read(snapshot.foodId);
        if (!food) throw new Error('要保存商品身份的食品记录不存在。请先建立食品营养草稿。');
        const previous = await readIdentity(snapshot.foodId);
        if (previous && snapshot.updatedAt !== previous.updatedAt) {
          throw new Error('商品身份已被更新，请重新打开后再编辑；旧身份记录仍保留。');
        }
        const recordedAt = now();
        assertDate(recordedAt);
        const saved: FoodIdentity = { ...snapshot, updatedAt: recordedAt };
        validateIdentity(saved);
        const kind: FoodIdentityRevisionKind = previous
          ? (previous.status !== 'confirmed' && saved.status === 'confirmed' ? 'confirmed' : saved.source.kind === 'mainland_service' && previous.source.sourceId !== saved.source.sourceId ? 'provider_result' : 'edited')
          : (saved.source.kind === 'mainland_service' ? 'provider_result' : 'created');
        const revisionId = `${saved.foodId}-identity-${Date.parse(recordedAt).toString(36)}-${nonce()}`;
        assertFoodId(revisionId);
        await driver.transaction(async (transaction) => {
          await verifyTransaction(transaction);
          await persistIdentity(transaction, saved);
          await persistIdentityRevision(transaction, saved, kind, recordedAt, revisionId);
        });
        return saved;
      });
    },
    async getFoodIdentityRevisions(foodId) {
      assertFoodId(foodId);
      await ready();
      return listIdentityRevisions(foodId);
    },
    savePendingFoodIdentity(input) {
      assertFoodId(input.id);
      const snapshot = JSON.parse(JSON.stringify(input)) as typeof input;
      return serialize(async () => {
        await ready();
        if (snapshot.identity.foodId !== snapshot.id) throw new Error('待补商品身份必须属于待补记录。');
        validateIdentity(snapshot.identity);
        assertIdentityCachePolicy(snapshot.identity);
        const recordedAt = now();
        assertDate(recordedAt);
        const barcode = createBarcodeAssociation(snapshot.barcode, snapshot.id, snapshot.acquiredBy,
          `${snapshot.id}-barcode-${Date.parse(recordedAt).toString(36)}-${nonce()}`, recordedAt);
        const existing = await driver.get<PendingIdentityRow>(
          'SELECT id,identity_json,raw_value,format,lookup_key,acquired_by,scanned_at,created_at,updated_at FROM food_identity_pending WHERE id=?', snapshot.id,
        );
        const byKey = await driver.get<{ id: string }>('SELECT id FROM food_identity_pending WHERE lookup_key=?', barcode.lookupKey);
        if (byKey && byKey.id !== snapshot.id) throw new Error('该条码已有待补商品身份，未覆盖原草稿。');
        const savedIdentity: FoodIdentity = { ...snapshot.identity, updatedAt: recordedAt };
        validateIdentity(savedIdentity);
        const createdAt = existing?.created_at ?? recordedAt;
        await driver.transaction(async (transaction) => {
          await verifyTransaction(transaction);
          await transaction.run(
            `INSERT INTO food_identity_pending(id,identity_json,raw_value,format,lookup_key,acquired_by,scanned_at,created_at,updated_at)
             VALUES(?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET identity_json=excluded.identity_json,raw_value=excluded.raw_value,format=excluded.format,
             lookup_key=excluded.lookup_key,acquired_by=excluded.acquired_by,scanned_at=excluded.scanned_at,updated_at=excluded.updated_at`,
            snapshot.id, JSON.stringify(savedIdentity), barcode.rawValue, barcode.format, barcode.lookupKey, barcode.acquiredBy,
            barcode.scannedAt, createdAt, recordedAt,
          );
        });
        return { id: snapshot.id, identity: savedIdentity, barcode, createdAt, updatedAt: recordedAt };
      });
    },
    async getPendingFoodIdentity(id) {
      assertFoodId(id);
      await ready();
      const row = await driver.get<PendingIdentityRow>(
        'SELECT id,identity_json,raw_value,format,lookup_key,acquired_by,scanned_at,created_at,updated_at FROM food_identity_pending WHERE id=?', id,
      );
      return row ? parsePendingIdentity(row) : null;
    },
    async getPendingFoodIdentityByBarcode(lookupKey) {
      if (!/^\d{14}$/.test(lookupKey)) throw new Error('条码查询键必须是 14 位数字字符串。');
      await ready();
      const row = await driver.get<PendingIdentityRow>(
        'SELECT id,identity_json,raw_value,format,lookup_key,acquired_by,scanned_at,created_at,updated_at FROM food_identity_pending WHERE lookup_key=?', lookupKey,
      );
      return row ? parsePendingIdentity(row) : null;
    },
    async deletePendingFoodIdentity(id) {
      assertFoodId(id);
      await serialize(async () => {
        await ready();
        await driver.transaction(async (transaction) => {
          await verifyTransaction(transaction);
          await transaction.run('DELETE FROM food_identity_pending WHERE id=?', id);
        });
      });
    },
    saveFoodEvidence(input) {
      assertFoodId(input.foodId);
      const snapshot = JSON.parse(JSON.stringify(input)) as typeof input;
      return serialize(async () => {
        await ready();
        const previous = await read(snapshot.foodId);
        if (!previous) throw new Error('要补充营养表的食品记录不存在或已删除。');
        const requestedIdentity = snapshot.identity;
        if (requestedIdentity) {
          validateIdentity(requestedIdentity);
          assertIdentityCachePolicy(requestedIdentity);
          if (requestedIdentity.foodId !== previous.id) throw new Error('商品身份必须属于当前食品记录。');
          if (previous.identity && requestedIdentity.updatedAt !== previous.identity.updatedAt) {
            throw new Error('商品身份已被更新，请重新打开后再编辑；旧身份记录仍保留。');
          }
        }
        const currentVersion = await driver.get<EvidenceVersionRow>(
          'SELECT id,food_id,recorded_at,source_evidence_json,persisted_evidence_json,parsed_json,folder_uri,is_current FROM food_evidence_versions WHERE food_id=? AND is_current=1', snapshot.foodId,
        );
        if (!currentVersion) throw new Error('食品原始证据版本索引缺失，已停止覆盖保存。');
        const candidate: FoodScanRecord = {
          ...previous,
          status: snapshot.status,
          evidence: snapshot.evidence,
          parsed: snapshot.parsed,
          review: snapshot.review,
          ...(requestedIdentity ? { identity: requestedIdentity } : previous.identity ? { identity: previous.identity } : {}),
          updatedAt: previous.updatedAt,
        };
        validateRecord(candidate);
        const recordedAt = now();
        assertDate(recordedAt);
        const revision: FoodRevision = {
          id: `${candidate.id}-${Date.parse(recordedAt).toString(36)}-${nonce()}`,
          recordedAt, kind: 'edited', status: candidate.status, review: candidate.review,
        };
        assertFoodId(revision.id);
        const evidenceRevisionId = `${candidate.id}-evidence-${Date.parse(recordedAt).toString(36)}-${nonce()}`;
        assertFoodId(evidenceRevisionId);
        const persistedIdentity = requestedIdentity ? { ...requestedIdentity, updatedAt: recordedAt } : previous.identity;
        if (persistedIdentity) validateIdentity(persistedIdentity);
        if (!files.materializeRevision) throw new Error('当前证据存储不支持追加营养表版本，请升级后重试；旧证据未修改。');
        const materialized = await files.materializeRevision(candidate, evidenceRevisionId);
        try {
          await files.validateStored(candidate.id, materialized);
          await files.writeRevision(candidate.id, materialized.folderUri, revision);
          await driver.transaction(async (transaction) => {
            await verifyTransaction(transaction);
            await transaction.run('UPDATE food_evidence_versions SET is_current=0 WHERE food_id=? AND is_current=1', candidate.id);
            await transaction.run('INSERT INTO food_evidence_versions(id,food_id,recorded_at,source_evidence_json,persisted_evidence_json,parsed_json,folder_uri,is_current) VALUES(?,?,?,?,?,?,?,1)',
              evidenceRevisionId, candidate.id, recordedAt, JSON.stringify(materialized.sourceEvidence), JSON.stringify(materialized.evidence), JSON.stringify(candidate.parsed), materialized.folderUri);
            await transaction.run('UPDATE food_evidence SET source_evidence_json=?,persisted_evidence_json=?,parsed_json=?,folder_uri=? WHERE food_id=?',
              JSON.stringify(materialized.sourceEvidence), JSON.stringify(materialized.evidence), JSON.stringify(candidate.parsed), materialized.folderUri, candidate.id);
            await transaction.run('UPDATE foods SET updated_at=?,status=?,name=?,brand=?,review_json=? WHERE id=?',
              recordedAt, candidate.status, candidate.review.name, candidate.review.brand, JSON.stringify(candidate.review), candidate.id);
            await transaction.run('INSERT INTO food_revisions(id,food_id,recorded_at,kind,status,review_json) VALUES(?,?,?,?,?,?)',
              revision.id, candidate.id, recordedAt, revision.kind, revision.status, JSON.stringify(revision.review));
            if (requestedIdentity) {
              const identityToPersist = persistedIdentity;
              if (!identityToPersist) throw new Error('商品身份快照缺失，已停止保存。');
              await persistIdentity(transaction, identityToPersist);
              const previousIdentity = previous.identity;
              const identityKind: FoodIdentityRevisionKind = previousIdentity
                ? (previousIdentity.status !== 'confirmed' && identityToPersist.status === 'confirmed' ? 'confirmed' : 'edited')
                : (identityToPersist.source.kind === 'mainland_service' ? 'provider_result' : 'created');
              await persistIdentityRevision(transaction, identityToPersist, identityKind, recordedAt,
                `${candidate.id}-identity-${Date.parse(recordedAt).toString(36)}-${nonce()}`);
            }
          });
        } catch (error) {
          try { if (files.removeEvidenceRevision) await files.removeEvidenceRevision(candidate.id, materialized.folderUri); }
          catch (cleanupError) { throw new Error(`营养表版本保存失败且新证据清理未完成：${String(error)}；${String(cleanupError)}`); }
          throw error;
        }
        const priorEvidence: FoodEvidenceRevision = {
          id: currentVersion.id, foodId: candidate.id, recordedAt: currentVersion.recorded_at,
          sourceEvidence: JSON.parse(currentVersion.source_evidence_json),
          evidence: JSON.parse(currentVersion.persisted_evidence_json), parsed: JSON.parse(currentVersion.parsed_json),
          folderUri: currentVersion.folder_uri,
        };
        return {
          ...candidate,
          updatedAt: recordedAt,
          evidence: materialized.evidence,
          parsed: materialized.parsed,
          ...(persistedIdentity ? { identity: persistedIdentity } : {}),
          revisions: [...previous.revisions, revision],
          evidenceHistory: [...(previous.evidenceHistory ?? []), priorEvidence],
        };
      });
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
        const requestedIdentity = record.identity;
        if (requestedIdentity) {
          validateIdentity(requestedIdentity);
          assertIdentityCachePolicy(requestedIdentity);
          if (requestedIdentity.foodId !== record.id) throw new Error('商品身份必须属于当前食品记录。');
        }
        if (previous?.identity && requestedIdentity && canonicalFoodJson(previous.identity) !== canonicalFoodJson(requestedIdentity)) {
          throw new Error('商品身份必须通过独立身份保存操作修改，食品营养编辑不能静默覆盖身份。');
        }
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
        let persistedIdentity = previous?.identity;
        // A new food (or a legacy food without an identity row) may atomically
        // attach the identity that travelled with its nutrition draft. Existing
        // identities are immutable here and must use saveFoodIdentity().
        if (requestedIdentity && !previous?.identity) {
          persistedIdentity = { ...requestedIdentity, updatedAt: recordedAt };
          validateIdentity(persistedIdentity);
        }
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
              await transaction.run('INSERT INTO food_evidence_versions(id,food_id,recorded_at,source_evidence_json,persisted_evidence_json,parsed_json,folder_uri,is_current) VALUES(?,?,?,?,?,?,?,1)',
                `${record.id}-evidence-initial`, record.id, recordedAt, JSON.stringify(materialized.sourceEvidence), JSON.stringify(materialized.evidence), JSON.stringify(record.parsed), materialized.folderUri);
              for (const barcode of requestedBarcodes) {
                await transaction.run('INSERT INTO food_barcodes(id,food_id,raw_value,format,lookup_key,validation_status,acquired_by,scanned_at) VALUES(?,?,?,?,?,?,?,?)',
                  barcode.id, barcode.foodId, barcode.rawValue, barcode.format, barcode.lookupKey, barcode.validationStatus, barcode.acquiredBy, barcode.scannedAt);
              }
              if (persistedIdentity) {
                await persistIdentity(transaction, persistedIdentity);
                const identityKind: FoodIdentityRevisionKind = persistedIdentity.source.kind === 'mainland_service' ? 'provider_result' : 'created';
                await persistIdentityRevision(transaction, persistedIdentity, identityKind, recordedAt,
                  `${record.id}-identity-${Date.parse(recordedAt).toString(36)}-${nonce()}`);
              }
            } else {
              await transaction.run('UPDATE foods SET updated_at=?,status=?,name=?,brand=?,review_json=? WHERE id=?',
                recordedAt, record.status, record.review.name, record.review.brand, JSON.stringify(record.review), record.id);
              if (persistedIdentity && !previous?.identity) {
                await persistIdentity(transaction, persistedIdentity);
                const identityKind: FoodIdentityRevisionKind = persistedIdentity.source.kind === 'mainland_service' ? 'provider_result' : 'created';
                await persistIdentityRevision(transaction, persistedIdentity, identityKind, recordedAt,
                  `${record.id}-identity-${Date.parse(recordedAt).toString(36)}-${nonce()}`);
              }
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
          ...(persistedIdentity ? { identity: persistedIdentity } : {}),
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
