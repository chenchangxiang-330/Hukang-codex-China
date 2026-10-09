import { Directory, File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { LocalChinaFoodSource } from '../../application/ports/ChinaFoodRepository';
import type { FoodRevision, FoodScanRecord } from '../../domain/food/scan';
import { hukangVision } from '../ocr/HukangVision';
import {
  assertFoodId, canonicalFoodJson, createSQLiteFoodStore,
  type FoodEvidenceFiles, type FoodSqlDriver, type MaterializedFoodEvidence, type SqlValue,
} from './sqliteFoodStore';

export const CHINA_FOOD_DATABASE_NAME = 'hukang-china-food.db';

function ownedDirectory(id: string, expectedUri?: string): Directory {
  assertFoodId(id);
  const directory = new Directory(Paths.document, 'food-evidence', id);
  if (expectedUri !== undefined && directory.uri !== expectedUri) {
    throw new Error('证据目录不属于此食品记录，拒绝读取或删除其他文件。');
  }
  return directory;
}
function revisionFile(id: string, folderUri: string, revisionId: string): File {
  assertFoodId(revisionId);
  return new File(ownedDirectory(id, folderUri), 'revisions', `${revisionId}.json`);
}
function writeNewJson(file: File, value: unknown): void {
  if (file.exists) throw new Error(`证据文件已存在，拒绝覆盖：${file.name}`);
  canonicalFoodJson(value);
  file.write(JSON.stringify(value, null, 2));
}
async function verifyImage(file: File, expectedHash: string): Promise<void> {
  if (!file.exists || (await hukangVision.fileSha256(file.uri)) !== expectedHash) {
    throw new Error(`图片证据缺失或 SHA-256 校验失败：${file.name}`);
  }
}

const evidenceFiles: FoodEvidenceFiles = {
  async materialize(record: FoodScanRecord): Promise<MaterializedFoodEvidence> {
    const directory = ownedDirectory(record.id);
    if (directory.exists) throw new Error('此食品的证据目录已存在，拒绝覆盖原始资料。');
    directory.create({ intermediates: true });
    try {
      const original = new File(directory, 'original.source');
      const processed = new File(directory, 'processed.png');
      // Expo's native copy is asynchronous. Verify only after both promises
      // resolve; checking exists/hash sooner races with the native writer.
      await new File(record.evidence.image.originalUri).copy(original);
      await new File(record.evidence.image.uri).copy(processed);
      await verifyImage(original, record.evidence.image.sourceImageHash);
      await verifyImage(processed, record.evidence.image.processedImageHash);
      const ocrDocument = new File(directory, 'ocr-document.json');
      const evidence = {
        ...record.evidence,
        image: { ...record.evidence.image, originalUri: original.uri, uri: processed.uri },
        ocr: { ...record.evidence.ocr, imageUri: processed.uri, evidenceUri: ocrDocument.uri },
      };
      // raw-ocr.json retains every source field and original URI exactly. Only the
      // separate persistent view changes file paths; OCR text is never rewritten.
      writeNewJson(new File(directory, 'raw-ocr.json'), record.evidence);
      writeNewJson(new File(directory, 'parsed-nutrition.json'), record.parsed);
      writeNewJson(ocrDocument, evidence.ocr);
      writeNewJson(new File(directory, 'evidence.json'), evidence);
      new Directory(directory, 'revisions').create();
      return { sourceEvidence: record.evidence, evidence, parsed: record.parsed, folderUri: directory.uri };
    } catch (error) {
      try { if (directory.exists) directory.delete(); }
      catch (cleanupError) { throw new Error(`创建食品证据失败且清理未完成：${String(error)}；${String(cleanupError)}`); }
      throw error;
    }
  },
  async validateStored(id, stored) {
    const directory = ownedDirectory(id, stored.folderUri);
    const original = new File(directory, 'original.source');
    const processed = new File(directory, 'processed.png');
    if (stored.evidence.image.originalUri !== original.uri || stored.evidence.image.uri !== processed.uri ||
      stored.evidence.ocr.imageUri !== processed.uri || stored.evidence.ocr.evidenceUri !== new File(directory, 'ocr-document.json').uri) {
      throw new Error('食品图片路径与保存的证据目录不一致。');
    }
    await verifyImage(original, stored.evidence.image.sourceImageHash);
    await verifyImage(processed, stored.evidence.image.processedImageHash);
    for (const [filename, expected] of [
      ['raw-ocr.json', stored.sourceEvidence], ['evidence.json', stored.evidence],
      ['ocr-document.json', stored.evidence.ocr], ['parsed-nutrition.json', stored.parsed],
    ] as const) {
      const file = new File(directory, filename);
      if (!file.exists || canonicalFoodJson(JSON.parse(await file.text())) !== canonicalFoodJson(expected)) {
        throw new Error(`食品原始证据缺失或被修改：${filename}`);
      }
    }
  },
  async writeRevision(id, folderUri, revision: FoodRevision) {
    writeNewJson(revisionFile(id, folderUri, revision.id), revision);
  },
  async removeRevision(id, folderUri, revisionId) {
    const file = revisionFile(id, folderUri, revisionId);
    if (file.exists) file.delete();
  },
  async removeFood(id, folderUri) {
    const directory = ownedDirectory(id, folderUri);
    if (directory.exists) directory.delete();
  },
};

function sqlDriver(database: SQLiteDatabase): FoodSqlDriver {
  return {
    async exec(sql) { await database.execAsync(sql); },
    async run(sql, ...values: SqlValue[]) { await database.runAsync(sql, ...values); },
    async get<T>(sql: string, ...values: SqlValue[]) { return database.getFirstAsync<T>(sql, ...values); },
    async all<T>(sql: string, ...values: SqlValue[]) { return database.getAllAsync<T>(sql, ...values); },
    async transaction<T>(task: (transaction: FoodSqlDriver) => Promise<T>) {
      let result: { value: T } | undefined;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        result = { value: await task(sqlDriver(transaction)) };
      });
      if (!result) throw new Error('SQLite 事务未返回结果。');
      return result.value;
    },
  };
}

let repositoryPromise: Promise<ReturnType<typeof createSQLiteFoodStore>> | undefined;
function repository(): Promise<ReturnType<typeof createSQLiteFoodStore>> {
  repositoryPromise ??= openDatabaseAsync(CHINA_FOOD_DATABASE_NAME)
    .then((database) => createSQLiteFoodStore(sqlDriver(database), evidenceFiles))
    .catch((error: unknown) => { repositoryPromise = undefined; throw error; });
  return repositoryPromise;
}

/** Local-only adapter. No network provider, automatic sync or external database exists. */
export const chinaFoodRepository: LocalChinaFoodSource = {
  kind: 'LOCAL', sourceId: 'hukang-china-sqlite-v1',
  async getFood(id) { return (await repository()).getFood(id); },
  async listFoods(query) { return (await repository()).listFoods(query); },
  async saveFood(record) { return (await repository()).saveFood(record); },
  async deleteFood(id) { return (await repository()).deleteFood(id); },
};
