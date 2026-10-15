import { requireNativeModule } from 'expo-modules-core';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { db, listStock, type CaptureDraft } from './store';
import { exportableCatalogueRecords, sharedCatalogue } from './catalogue';
import { portableExportValue } from './exportPaths';
import type { FoodScanRecord } from '../../domain/food/scan';
import type { ImageAsset, OcrEvidence } from '../../domain/ocr/types';

interface Asset { uri: string; path: string; stripMetadata: boolean; }
interface Archive { uri: string; bytes: number; sha256: string; }

/**
 * Created locally; only a user-directed system share action sends the archive.
 * The native writer owns the final ZIP and emits files.json with byte counts
 * and SHA-256 values for every photo/evidence asset.
 */
export async function exportLocal(kind: 'catalogue' | 'personal', includePhotos: boolean): Promise<Archive> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备没有可用的文件分享方式。');
  const summaries = await chinaFoodRepository.listFoods();
  const all = (await Promise.all(summaries.map(s => chinaFoodRepository.getFood(s.id)))).filter((r): r is FoodScanRecord => r !== null);
  const records = kind === 'catalogue' ? exportableCatalogueRecords(all) : all;
  const packageRows = await (await db()).getAllAsync<{ food_id: string; json: string; ocr_json: string | null }>(
    'SELECT food_id,json,ocr_json FROM simple_product_photos',
  );
  const packages = new Map(packageRows.map(row => [row.food_id, {
    image: JSON.parse(row.json) as ImageAsset,
    ocr: row.ocr_json ? JSON.parse(row.ocr_json) as OcrEvidence : null,
  }]));
  const sourceRows = kind === 'personal'
    ? await (await db()).getAllAsync<{ food_id: string; source_evidence_json: string }>('SELECT food_id,source_evidence_json FROM food_evidence')
    : [];
  const sourceEvidence = new Map(sourceRows.map(row => [row.food_id, JSON.parse(row.source_evidence_json) as OcrEvidence]));
  const pending = kind === 'personal'
    ? await (await db()).getAllAsync<{ json: string }>('SELECT json FROM simple_capture_drafts ORDER BY updated_at DESC')
      .then(rows => rows.map(r => JSON.parse(r.json) as CaptureDraft))
    : [];
  if (!records.length && !pending.length) throw new Error('还没有可导出的食品。食品资料包仅包含已确认且允许分享的记录。');

  const exportedAt = new Date().toISOString();
  const assets: Asset[] = [];
  const mappings: Record<string, string> = {};
  const temporaryFiles: File[] = [];
  const temporaryDirectory = new Directory(Paths.cache, 'hukang-export-input', `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  temporaryDirectory.create({ intermediates: true, idempotent: true });

  const add = (uri: string | undefined, path: string, stripMetadata: boolean): string | null => {
    if (!uri) return null;
    if (mappings[uri]) return mappings[uri];
    mappings[uri] = path;
    assets.push({ uri, path, stripMetadata });
    return path;
  };
  const safeId = (value: string, fallback: string): string => {
    const safe = value.replace(/[^A-Za-z0-9_-]/g, '_');
    return safe || fallback;
  };
  const portable = (value: unknown): unknown => portableExportValue(value, mappings);
  /** Add a generated JSON evidence file to the native asset pipeline. */
  const addJson = (value: unknown, path: string, aliases: readonly (string | undefined)[] = []): string => {
    const file = new File(temporaryDirectory, `${temporaryFiles.length}-${path.replace(/[^A-Za-z0-9_.-]/g, '_')}`);
    const relative = add(file.uri, path, false);
    if (!relative) throw new Error('无法建立导出证据文件映射。');
    for (const alias of aliases) if (alias && !mappings[alias]) mappings[alias] = relative;
    file.write(JSON.stringify(portable(value), null, 2));
    temporaryFiles.push(file);
    return relative;
  };
  const addEvidenceAssets = (record: FoodScanRecord, id: string): void => {
    const root = `evidence/${id}`;
    const source = sourceEvidence.get(record.id);
    if (source && includePhotos) {
      // Native OCR metadata also retains originalImageUri from the source
      // capture. Register its persisted-file alias before writing any JSON.
      for (const [original, persisted] of [
        [source.image.uri, record.evidence.image.uri], [source.image.originalUri, record.evidence.image.originalUri],
      ]) if (original && persisted && mappings[persisted] && !mappings[original]) mappings[original] = mappings[persisted];
    }
    addJson(record.evidence.ocr, `${root}/current-ocr.json`, [record.evidence.ocr.evidenceUri]);
    addJson(record.parsed, `${root}/current-parsed.json`);
    addJson(record.evidence, `${root}/current-evidence.json`);
    addJson(record.revisions, `${root}/revisions.json`);
    if (source) {
      addJson(source.ocr, `${root}/current-source-document.json`, [source.ocr.evidenceUri]);
      addJson(source, `${root}/current-source-ocr.json`);
    }
    for (const [index, history] of (record.evidenceHistory ?? []).entries()) {
      const historyRoot = `${root}/history-${index + 1}`;
      if (includePhotos) {
        const processedPath = mappings[history.evidence.image.uri];
        const originalPath = mappings[history.evidence.image.originalUri];
        if (processedPath && history.sourceEvidence.image?.uri && !mappings[history.sourceEvidence.image.uri]) mappings[history.sourceEvidence.image.uri] = processedPath;
        if (originalPath && history.sourceEvidence.image?.originalUri && !mappings[history.sourceEvidence.image.originalUri]) mappings[history.sourceEvidence.image.originalUri] = originalPath;
      }
      addJson(history.sourceEvidence.ocr, `${historyRoot}/source-document.json`, [history.sourceEvidence.ocr.evidenceUri]);
      addJson(history.sourceEvidence, `${historyRoot}/source-ocr.json`);
      addJson(history.evidence.ocr, `${historyRoot}/ocr.json`, [history.evidence.ocr.evidenceUri]);
      addJson(history.parsed, `${historyRoot}/parsed.json`);
      addJson(history.evidence, `${historyRoot}/evidence.json`);
      // folderUri is metadata used to correlate a historical version. Replace
      // it with a relative marker; never export an app-private directory.
      if (history.folderUri && !mappings[history.folderUri]) mappings[history.folderUri] = historyRoot;
    }
  };

  try {
    const images: Record<string, unknown> = {};
    const packageEvidence: Record<string, unknown> = {};
    for (const [index, food] of records.entries()) {
    const id = kind === 'catalogue' ? `product-${index + 1}` : safeId(food.id, `product-${index + 1}`);
    const cover = packages.get(food.id)?.image;
    images[id] = includePhotos ? {
      front: add(cover?.uri, `photos/${id}-front.jpg`, kind === 'catalogue'),
      nutrition: add(food.evidence.image.uri, `photos/${id}-nutrition.jpg`, kind === 'catalogue'),
    } : { front: null, nutrition: null };
    if (kind === 'personal' && includePhotos) {
      add(cover?.originalUri, `photos/${id}-front-original.source`, false);
      add(food.evidence.image.originalUri, `photos/${id}-original.source`, false);
      for (const [n, history] of (food.evidenceHistory ?? []).entries()) {
        add(history.evidence.image.uri, `photos/${id}-history-${n}.png`, false);
        add(history.evidence.image.originalUri, `photos/${id}-history-${n}.source`, false);
      }
    }
    if (kind === 'personal') {
      const savedPackage = packages.get(food.id);
      if (savedPackage) {
        packageEvidence[id] = savedPackage;
        if (savedPackage.ocr) {
          addJson(savedPackage.ocr.ocr, `evidence/${id}/package-ocr-document.json`, [savedPackage.ocr.ocr.evidenceUri]);
          addJson(savedPackage.ocr, `evidence/${id}/package-ocr.json`);
        }
      }
      addEvidenceAssets(food, id);
    }
    }

    if (kind === 'personal' && includePhotos) {
      for (const draft of pending) {
        const id = safeId(draft.id, 'draft');
        const packageImage = draft.packageImage;
        const nutritionImage = draft.nutritionImage ?? draft.nutrition?.image;
        add(packageImage?.uri, `drafts/${id}-package.png`, false);
        add(packageImage?.originalUri, `drafts/${id}-package-original.source`, false);
        add(nutritionImage?.uri, `drafts/${id}-nutrition.png`, false);
        add(nutritionImage?.originalUri, `drafts/${id}-nutrition-original.source`, false);
        // A restored draft may hold an earlier OCR snapshot alongside a new
        // prepared crop. Keep both evidence assets instead of dropping one.
        add(draft.nutrition?.image.uri, `drafts/${id}-nutrition-ocr.png`, false);
        add(draft.nutrition?.image.originalUri, `drafts/${id}-nutrition-ocr-original.source`, false);
      }
    }
    if (kind === 'personal') {
      for (const draft of pending) {
        const id = safeId(draft.id, 'draft');
        if (draft.packageOcr) {
          addJson(draft.packageOcr.ocr, `drafts/${id}-package-document.json`, [draft.packageOcr.ocr.evidenceUri]);
          addJson(draft.packageOcr, `drafts/${id}-package-ocr.json`);
        }
        if (draft.nutrition) {
          addJson(draft.nutrition.ocr, `drafts/${id}-nutrition-document.json`, [draft.nutrition.ocr.evidenceUri]);
          addJson(draft.nutrition, `drafts/${id}-nutrition-ocr.json`);
        }
        if (draft.review) addJson(draft.review, `drafts/${id}-review.json`);
      }
    }

    const content = kind === 'catalogue' ? {
      ...sharedCatalogue(records, exportedAt), images, photosIncluded: includePhotos, photoMetadataRemoved: includePhotos,
      mergePolicy: '按规范化条码匹配候选；不同标签值保留为不同版本，人工核验后合并。',
    } : {
      schemaVersion: 1, format: 'hukang-personal-export', exportedAt,
      photosIncluded: includePhotos,
      notice: '包含个人购买数量和到期日。数据导出供保管或开发者处理；本版本尚不提供 App 内导入还原。',
      products: portable(records), images, packageEvidence: portable(packageEvidence), inventory: await listStock(), pending: portable(pending),
    };
    const native = requireNativeModule<{ exportArchive(json: string, assets: Asset[]): Promise<Archive> }>('HukangBarcode');
    const archive = await native.exportArchive(JSON.stringify(content, null, 2), assets);
    await Sharing.shareAsync(archive.uri, { mimeType: 'application/zip', dialogTitle: kind === 'catalogue' ? '分享食品资料包' : '导出个人数据', UTI: 'public.zip-archive' });
    return archive;
  } finally {
    // The ZIP lives in a separate cache directory and is intentionally kept
    // for the system share sheet. Only generated JSON inputs are removed.
    try { if (temporaryDirectory.exists) temporaryDirectory.delete(); } catch { /* best-effort cache cleanup */ }
  }
}
