import { requireNativeModule } from 'expo-modules-core';
import * as Sharing from 'expo-sharing';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { db, getPackage, listStock } from './store';
import { sharedCatalogue } from './catalogue';
interface Asset { uri: string; path: string; stripMetadata: boolean; }
interface Archive { uri: string; bytes: number; sha256: string; }
/** Created locally; only a user-directed system share action sends the archive. */
export async function exportLocal(kind: 'catalogue' | 'personal', includePhotos: boolean): Promise<Archive> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备没有可用的文件分享方式。');
  const summaries = await chinaFoodRepository.listFoods();
  const all = (await Promise.all(summaries.map(s => chinaFoodRepository.getFood(s.id)))).filter(r => r !== null);
  const records = kind === 'catalogue' ? all.filter(r => r.status === 'confirmed') : all;
  if (!records.length) throw new Error('还没有可导出的食品。请先完成一条食品记录。');
  const exportedAt = new Date().toISOString();
  const assets: Asset[] = [];
  const mappings: Record<string, string> = {};
  const add = (uri: string | undefined, path: string, stripMetadata: boolean) => {
    if (!uri) return null;
    if (mappings[uri]) return mappings[uri];
    mappings[uri] = path; assets.push({ uri, path, stripMetadata }); return path;
  };
  const images: Record<string, unknown> = {};
  for (const [index, food] of records.entries()) {
    const id = kind === 'catalogue' ? `product-${index + 1}` : food.id;
    const cover = await getPackage(food.id);
    images[id] = includePhotos ? {
      front: add(cover?.uri, `photos/${id}-front.jpg`, kind === 'catalogue'),
      nutrition: add(food.evidence.image.uri, `photos/${id}-nutrition.jpg`, kind === 'catalogue')
    } : { front: null, nutrition: null };
    if (kind === 'personal' && includePhotos) {
      add(food.evidence.image.originalUri, `photos/${id}-original.source`, false);
      for (const [n, h] of (food.evidenceHistory ?? []).entries()) {
        add(h.evidence.image.uri, `photos/${id}-history-${n}.png`, false);
        add(h.evidence.image.originalUri, `photos/${id}-history-${n}.source`, false);
      }
    }
  }
  const portable = (value: unknown): unknown => {
    if (typeof value === 'string' && /^(file|content):\/\//.test(value)) return mappings[value] ?? null;
    if (Array.isArray(value)) return value.map(portable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, portable(v)]));
    return value;
  };
  const content = kind === 'catalogue' ? {
    ...sharedCatalogue(records, exportedAt), images, photosIncluded: includePhotos, photoMetadataRemoved: includePhotos,
    mergePolicy: '按规范化条码匹配候选；不同标签值保留为不同版本，人工核验后合并。'
  } : {
    schemaVersion: 1, format: 'hukang-personal-export', exportedAt,
    notice: '包含个人购买数量和到期日。数据导出供保管或开发者处理；本版本尚不提供 App 内导入还原。',
    products: portable(records), images, inventory: await listStock(),
    pending: portable(await (await db()).getAllAsync<{ json: string }>('SELECT json FROM simple_capture_drafts').then(rows => rows.map(r => JSON.parse(r.json))))
  };
  const native = requireNativeModule<{ exportArchive(json: string, assets: Asset[]): Promise<Archive> }>('HukangBarcode');
  const archive = await native.exportArchive(JSON.stringify(content, null, 2), assets);
  await Sharing.shareAsync(archive.uri, { mimeType: 'application/zip', dialogTitle: kind === 'catalogue' ? '分享食品资料包' : '导出个人数据', UTI: 'public.zip-archive' });
  return archive;
}
