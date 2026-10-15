import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { chinaFoodRepository, CHINA_FOOD_DATABASE_NAME } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import type { FoodScanRecord, FoodReviewValues } from '../../domain/food/scan';
import type { ImageAsset, OcrEvidence } from '../../domain/ocr/types';
import type { ValidatedBarcode, BarcodeAcquisitionMethod } from '../../domain/barcode/types';
import { parseQuantity, validateExpiry } from '../../domain/inventory/rules';
import { persistCapturedFood } from './captureRecovery';
export interface CaptureDraft {
  id: string; barcode: ValidatedBarcode; acquiredBy: BarcodeAcquisitionMethod;
  step: 'package' | 'nutrition' | 'review'; name: string; brand: string; specification?: string;
  packageImage?: ImageAsset; packageOcr?: OcrEvidence; nutritionImage?: ImageAsset; nutrition?: OcrEvidence; review?: FoodReviewValues;
}
export interface StockEntry {
  id: string; food_id: string; name: string; brand: string; quantity: number; unit: string; expires_on: string | null; created_at: string;
}
let sequence = 0;
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
let connection: Promise<SQLiteDatabase> | undefined;
export async function db(): Promise<SQLiteDatabase> {
  connection ??= (async () => {
    await chinaFoodRepository.listFoods();
    const database = await openDatabaseAsync(CHINA_FOOD_DATABASE_NAME);
    await database.execAsync('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    return database;
  })().catch(error => { connection = undefined; throw error; });
  return connection;
}
let draftWrites: Promise<void> = Promise.resolve();
const completedDrafts = new Set<string>();
export function saveDraft(draft: CaptureDraft): Promise<void> {
  const json = JSON.stringify(draft);
  const write = draftWrites.then(async () => {
    if (completedDrafts.has(draft.id)) return;
    await (await db()).runAsync('INSERT INTO simple_capture_drafts(id,json,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,updated_at=excluded.updated_at', draft.id, json, new Date().toISOString());
  });
  draftWrites = write.catch(() => undefined);
  return write;
}
export async function lastDraft(): Promise<CaptureDraft | null> {
  const row = await (await db()).getFirstAsync<{ json: string }>('SELECT json FROM simple_capture_drafts ORDER BY updated_at DESC LIMIT 1');
  return row ? JSON.parse(row.json) as CaptureDraft : null;
}
export async function clearDraft(id: string): Promise<void> {
  await (await db()).runAsync('DELETE FROM simple_capture_drafts WHERE id=?', id);
}
export async function getPackage(foodId: string): Promise<ImageAsset | null> {
  const row = await (await db()).getFirstAsync<{ json: string }>('SELECT json FROM simple_product_photos WHERE food_id=?', foodId);
  return row ? JSON.parse(row.json) as ImageAsset : null;
}
/** Food and barcode commit together in the evidence repository. The persistent draft
 * remains until cover attachment succeeds; retry uses the same ID after interruption. */
export async function finishFood(record: FoodScanRecord, draft: CaptureDraft): Promise<FoodScanRecord> {
  const saved = await persistCapturedFood(chinaFoodRepository, record);
  await draftWrites;
  await (await db()).withExclusiveTransactionAsync(async transaction => {
    if (draft.packageImage) await transaction.runAsync('INSERT INTO simple_product_photos(food_id,json,ocr_json) VALUES(?,?,?) ON CONFLICT(food_id) DO UPDATE SET json=excluded.json,ocr_json=excluded.ocr_json', saved.id, JSON.stringify(draft.packageImage), draft.packageOcr ? JSON.stringify(draft.packageOcr) : null);
    await transaction.runAsync('DELETE FROM simple_capture_drafts WHERE id=?', draft.id);
    if (draft.barcode.lookupKey) await transaction.runAsync('DELETE FROM food_identity_pending WHERE lookup_key=?', draft.barcode.lookupKey);
  });
  completedDrafts.add(draft.id);
  return saved;
}
export async function listStock(): Promise<StockEntry[]> {
  return (await db()).getAllAsync<StockEntry>('SELECT i.*,f.name,f.brand FROM simple_inventory i JOIN foods f ON f.id=i.food_id ORDER BY i.created_at DESC,i.id');
}
export async function addStock(foodId: string, quantityText: string, unit: string, expiry: string, requestId: string): Promise<void> {
  const quantity = parseQuantity(quantityText), expires = validateExpiry(expiry);
  if (!['件', '瓶', '盒', '袋', '罐', '包', '个'].includes(unit)) throw new Error('请选择有效的库存单位。');
  const food = await chinaFoodRepository.getFood(foodId);
  if (!food || food.status !== 'confirmed') throw new Error('请先确认该商品的营养信息。');
  await (await db()).runAsync('INSERT INTO simple_inventory(id,food_id,quantity,unit,expires_on,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING', requestId, foodId, quantity, unit, expires, new Date().toISOString());
}
export async function reduceStock(id: string): Promise<void> {
  await (await db()).withExclusiveTransactionAsync(async transaction => {
    await transaction.runAsync('UPDATE simple_inventory SET quantity=quantity-1 WHERE id=? AND quantity>1', id);
  });
}
export async function removeStock(id: string): Promise<void> {
  await (await db()).runAsync('DELETE FROM simple_inventory WHERE id=?', id);
}
export async function deleteProduct(id: string): Promise<void> {
  const exists = await (await db()).getFirstAsync('SELECT id FROM simple_inventory WHERE food_id=? LIMIT 1', id);
  if (exists) throw new Error('该商品仍在库存中，请先移除对应库存记录。');
  await chinaFoodRepository.deleteFood(id);
}
export async function draftForBarcode(key: string): Promise<CaptureDraft | null> {
  const rows = await (await db()).getAllAsync<{ json: string }>('SELECT json FROM simple_capture_drafts ORDER BY updated_at DESC');
  return rows.map(r => JSON.parse(r.json) as CaptureDraft).find(d => d.barcode.lookupKey === key) ?? null;
}
