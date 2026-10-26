import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { hukangBarcode } from '../../infrastructure/barcode/HukangBarcode';
import { hukangVision } from '../../infrastructure/ocr/HukangVision';
import { recognizeAndCapture } from '../../application/usecases/OcrLabUseCases';
import { normalizeBarcode } from '../../domain/barcode/normalize';
import type { BarcodeAcquisitionMethod } from '../../domain/barcode/types';
import type { FoodScanRecord, FoodSummary, FoodReviewValues, NutritionReviewColumn } from '../../domain/food/scan';
import { parseNutritionLabel } from '../../domain/food/parseNutrition';
import { createFoodReview, validateFoodReview } from '../../domain/food/review';
import { draftForBarcode, finishFood, getPackage, lastDraft, listStock, newId, saveDraft, type CaptureDraft, type StockEntry } from './store';
import { exportLocal } from './Export';
import type { BoundingBox, ImageAsset } from '../../domain/ocr/types';
export type Tab = 'today' | 'diary' | 'library' | 'stock' | 'mine';
export type Screen = 'home' | 'scan' | 'package' | 'nutrition' | 'review' | 'product' | 'add-stock' | 'library' | 'ai-settings' | 'profile' | 'about';
export const labels = ['能量', '蛋白质', '脂肪', '碳水化合物', '钠'];
export const nutrientIds = ['energy', 'protein', 'fat', 'carbohydrate', 'sodium'] as const;
export const basis = (c: NutritionReviewColumn) => c.basisKind === 'per_100g' ? '每100g' : c.basisKind === 'per_100ml' ? '每100mL' : c.basisKind === 'per_serving' ? `每份${c.servingAmount ? `（${c.servingAmount}${c.servingUnit}）` : ''}` : '计量基准待确认';
export const problem = (e: unknown) => e instanceof Error ? e.message : String(e);
export const blankColumn = (): NutritionReviewColumn => ({
  id: newId('column'), basisKind: 'unknown', basisRawText: '', servingAmount: '', servingUnit: 'unknown', servingSizeNotDeclared: false, reviewed: false,
  rows: nutrientIds.map((nutrient, i) => ({ nutrient, label: labels[i]!, amount: '', unit: 'unknown', nrvPercent: '', nrvNotDeclared: false, reviewed: false }))
});
export function useSimpleApp() {
  const [tab, setTab] = useState<Tab>('today'), [screen, setScreen] = useState<Screen>('home');
  const [foods, setFoods] = useState<readonly FoodSummary[]>([]), [stock, setStock] = useState<StockEntry[]>([]);
  const [resume, setResume] = useState<CaptureDraft | null>(null), [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [editing, setEditing] = useState<FoodScanRecord | null>(null);
  const [product, setProduct] = useState<FoodScanRecord | null>(null), [cover, setCover] = useState<string | null>(null);
  const [stockCovers, setStockCovers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(''), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [permission, setPermission] = useState(false), [foreground, setForeground] = useState(true), [torch, setTorch] = useState(false);
  const [scanToken, setScanToken] = useState(0), [manual, setManual] = useState(''), [manualFormat, setManualFormat] = useState('EAN_13');
  const [review, setReview] = useState<FoodReviewValues | null>(null), [confirmed, setConfirmed] = useState(false), [originalText, setOriginalText] = useState(false);
  const [quantity, setQuantity] = useState('1'), [unit, setUnit] = useState('件'), [expiry, setExpiry] = useState(''), [request, setRequest] = useState(newId('stock'));
  const [search, setSearch] = useState(''), [photos, setPhotos] = useState(false);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [screen, error]);
  const running = useRef(false), generation = useRef(0), mounted = useRef(true), draftRef = useRef<CaptureDraft | null>(null);
  const refresh = useCallback(async () => {
    const [f, s, d] = await Promise.all([chinaFoodRepository.listFoods(), listStock(), lastDraft()]);
    const covers = await Promise.all([...new Set(s.map(item => item.food_id))].map(async id => [id, (await getPackage(id))?.uri] as const));
    if (mounted.current) { setFoods(f); setStock(s); setResume(d); setStockCovers(Object.fromEntries(covers.filter((entry): entry is readonly [string, string] => !!entry[1]))); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh().catch(e => setError(problem(e)));
    const sub = AppState.addEventListener('change', s => setForeground(s === 'active'));
    return () => { mounted.current = false; generation.current++; sub.remove(); };
  }, [refresh]);
  const patchDraft = (patch: Partial<CaptureDraft>) => {
    if (!draftRef.current) return;
    const next = { ...draftRef.current, ...patch }; draftRef.current = next; setDraft(next);
  };
  const retainDraft = async (next: CaptureDraft) => { await saveDraft(next); draftRef.current = next; setDraft(next); setResume(next); };
  async function task(message: string, action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(message); setError(null);
    try { await action(); }
    catch (e) { if (mounted.current) setError(problem(e)); }
    finally { running.current = false; if (mounted.current) setBusy(''); }
  }
  const navigate = (next: Screen) => { generation.current++; setError(null); setNotice(null); setTorch(false); setScreen(next); };
  const back = useCallback(() => {
    if (running.current) return true;
    if (!editing && ['package', 'nutrition', 'review'].includes(screen) && draftRef.current) {
      const next = { ...draftRef.current, ...(review ? { review } : {}) };
      void saveDraft(next).then(() => setResume(next)).catch(e => setError(problem(e)));
    }
    generation.current++; setTorch(false); setScreen('home'); setError(null);
    if (editing) { setEditing(null); draftRef.current = null; setDraft(null); }
    return screen !== 'home';
  }, [screen, review, editing]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', back); return () => sub.remove(); }, [back]);
  async function openProduct(id: string) {
    await task('正在打开商品', async () => {
      const f = await chinaFoodRepository.getFood(id);
      if (!f) throw new Error('商品不存在或已经删除。');
      setProduct(f); setCover((await getPackage(id))?.uri ?? null); navigate('product');
    });
  }
  const lookup = async (rawValue: string, format: string, source: BarcodeAcquisitionMethod) => {
    if (running.current) return;
    const token = ++generation.current;
    await task('正在查询本地食品库', async () => {
      const validated = normalizeBarcode({ rawValue, format, decodedAt: new Date().toISOString() });
      if (validated.validity !== 'valid' || !validated.lookupKey) throw new Error('条码未通过校验，请重新对准条码或核对数字与格式。');
      const found = await chinaFoodRepository.getFoodByBarcode(validated.lookupKey);
      if (token !== generation.current) return;
      const savedDraft = await draftForBarcode(validated.lookupKey);
      if (token !== generation.current) return;
      // A failed cover attachment can leave a food row plus its recovery draft.
      // Resume that exact draft instead of silently abandoning the cover/review.
      if (savedDraft && (!found || found.record.id === savedDraft.id)) {
        draftRef.current = savedDraft; setDraft(savedDraft); setReview(savedDraft.review ?? null); setConfirmed(false); navigate(savedDraft.step); return;
      }
      if (found) {
        const image = await getPackage(found.record.id);
        if (token !== generation.current) return;
        setProduct(found.record); setCover(image?.uri ?? null); navigate('product'); return;
      }
      const next: CaptureDraft = { id: newId('food'), barcode: validated, acquiredBy: source, step: 'package', name: '', brand: '', specification: '' };
      await retainDraft(next); setReview(null); setConfirmed(false); navigate('package');
    });
  };
  async function startScan() {
    if (resume) {
      Alert.alert('有一条尚未完成的食品', '可以继续补录，也可以保留草稿并扫描其他商品。', [
        { text: '继续补录', onPress: () => { draftRef.current = resume; setDraft(resume); setReview(resume.review ?? null); setConfirmed(false); navigate(resume.step); } },
        { text: '扫描其他商品', onPress: () => void beginScan() }, { text: '取消', style: 'cancel' }
      ]); return;
    }
    await beginScan();
  }
  async function beginScan() {
    setEditing(null); navigate('scan'); setScanToken(n => n + 1);
    try {
      const p = await ImagePicker.requestCameraPermissionsAsync(); setPermission(p.granted);
      if (!p.granted) setError('未获得相机权限。可以从相册识别，或手动输入条码。');
    } catch (e) { setError(problem(e)); }
  }
  async function pickBarcode() {
    await task('正在读取条码图片', async () => {
      const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, legacy: true });
      if (p.canceled || !p.assets[0]) return;
      const results = await hukangBarcode.scanImage(p.assets[0].uri);
      if (!results.length) throw new Error('没有找到食品条码，请拍清楚完整条码后重试。');
      if (results.length > 1) throw new Error('发现多个条码，请裁取单个商品条码后重试。');
      const r = results[0]!; running.current = false; await lookup(r.rawValue, r.format, 'image');
    });
  }
  async function capture(which: 'package' | 'nutrition', fromLibrary = false) {
    await task(which === 'package' ? '正在处理包装照片' : '正在离线识别营养表', async () => {
      if (!draftRef.current) throw new Error('请先扫描条码。');
      if (!fromLibrary) { const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) throw new Error('未获得相机权限，请使用相册导入。'); }
      const p = fromLibrary ? await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1, legacy: true }) : await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      if (p.canceled || !p.assets[0]) return;
      const image = await hukangVision.prepareImage(p.assets[0].uri);
      if (which === 'package') { const next = { ...draftRef.current, packageImage: image }; delete next.packageOcr; await retainDraft(next); return; }
      // Persist prepared pixels before inference: an OCR failure must not lose
      // the photo, and users can rotate/crop it before retrying.
      await retainDraft({ ...draftRef.current, nutritionImage: image, step: 'nutrition' });
      await recognizeNutritionImage(image);
    });
  }
  async function recognizeNutritionImage(image: ImageAsset) {
    const current = draftRef.current;
    if (!current) throw new Error('食品草稿已关闭，请重新打开。');
    const evidence = await recognizeAndCapture(image);
    if (!evidence.ocr.rawText.trim() || !evidence.ocr.blocks.some(block => block.text.trim())) {
      throw new Error('这张照片没有识别到文字。照片已保留，请检查裁剪范围、方向与清晰度后重试，或重新拍摄。');
    }
    const parsed = parseNutritionLabel(evidence.ocr), values = createFoodReview(parsed);
    if (draftRef.current?.id !== current.id) return;
    if (!values.columns.length) values.columns = [blankColumn()];
    values.name = current.name; values.brand = current.brand; values.specification = current.specification ?? '';
    await retainDraft({ ...current, nutritionImage: image, nutrition: evidence, review: values, step: 'review' });
    setReview(values); setConfirmed(false); navigate('review');
  }
  async function transformNutrition(rotation: number, crop: BoundingBox | null) {
    await task('正在调整营养表照片', async () => {
      const current = draftRef.current, image = current?.nutritionImage ?? current?.nutrition?.image;
      if (!current || !image) throw new Error('请先选择营养表照片。');
      const transformed = await hukangVision.transformImage(image, rotation, crop);
      await retainDraft({ ...current, nutritionImage: transformed, step: 'nutrition' });
      setConfirmed(false);
    });
  }
  async function retryNutrition() {
    await task('正在离线识别营养表', async () => {
      const image = draftRef.current?.nutritionImage ?? draftRef.current?.nutrition?.image;
      if (!image) throw new Error('请先选择营养表照片。');
      await recognizeNutritionImage(image);
    });
  }
  async function saveCaptureDraft() {
    await task('正在保存草稿', async () => {
      if (!draftRef.current || editing) return;
      await retainDraft({ ...draftRef.current, step: screen as CaptureDraft['step'], ...(review ? { review } : {}) });
      navigate('home'); setNotice('草稿已保存在本机，可在首页继续录入。尚未确认成食品资料。');
    });
  }
  async function readPackage() {
    await task('正在读取包装文字', async () => { const current = draftRef.current; if (!current?.packageImage) return; const e = await recognizeAndCapture(current.packageImage); await retainDraft({ ...current, packageOcr: e }); });
  }
  useEffect(() => {
    if (editing || !draft || busy || !['package', 'nutrition', 'review'].includes(screen)) return;
    const timer = setTimeout(() => { void saveDraft(draft).catch(e => setError(problem(e))); }, 450);
    return () => clearTimeout(timer);
  }, [draft, busy, screen, editing]);
  const updateReview = (next: FoodReviewValues) => {
    setReview(next);
    // Keep the package-step draft in sync so going back and re-capturing the
    // nutrition label does not restore a stale specification.
    patchDraft({ review: next, name: next.name, brand: next.brand, specification: next.specification ?? '' });
    setConfirmed(false);
  };
  const updateColumn = (id: string, patch: Partial<NutritionReviewColumn>) => {
    if (review) updateReview({ ...review, columns: review.columns.map(c => c.id === id ? { ...c, ...patch } : c) });
  };
  async function saveFood() {
    await task('正在保存食品资料', async () => {
      const current = draftRef.current;
      if (!current?.nutrition || !review) throw new Error('请先拍摄并识别营养表。');
      if (!confirmed) throw new Error('请先核对照片，并勾选确认。');
      const checked = { ...review, columns: review.columns.map(c => ({ ...c, reviewed: true, rows: c.rows.map(r => ({ ...r, reviewed: true })) })) };
      const issues = validateFoodReview(checked, 'confirmed');
      if (issues.length) throw new Error(issues.join('\n'));
      if (editing) {
        const saved = await chinaFoodRepository.saveFood({ ...editing, review: checked, status: 'confirmed' });
        setProduct(saved); setEditing(null); draftRef.current = null; setDraft(null); setReview(null); await refresh(); navigate('product'); setNotice('修改已保存，原始识别和历史修订仍保留。'); return;
      }
      const now = new Date().toISOString(), b = current.barcode;
      if (!b.lookupKey) throw new Error('条码无效。');
      const conflicting = await chinaFoodRepository.getFoodByBarcode(b.lookupKey);
      if (conflicting && conflicting.record.id !== current.id) throw new Error('该条码已有商品，请返回并打开已有资料，避免重复建档。');
      const record: FoodScanRecord = {
        schemaVersion: 1, id: current.id, createdAt: now, updatedAt: now, status: 'confirmed', evidence: current.nutrition,
        parsed: parseNutritionLabel(current.nutrition.ocr), review: checked, revisions: [],
        barcodes: [{ id: `${current.id}-barcode`, foodId: current.id, rawValue: b.scan.rawValue, format: b.normalizedFormat as 'EAN_13', lookupKey: b.lookupKey, validationStatus: 'valid', acquiredBy: current.acquiredBy, scannedAt: now }]
      };
      await retainDraft({ ...current, review: checked });
      const saved = await finishFood(record, current);
      setProduct(saved); setCover(current.packageImage?.uri ?? saved.evidence.image.uri); setDraft(null); draftRef.current = null; setReview(null); await refresh(); navigate('product'); setNotice('食品资料已保存。下次扫描同一条码会直接找到它。');
    });
  }
  function showStock() { setQuantity('1'); setUnit('件'); setExpiry(''); setRequest(newId('stock')); navigate('add-stock'); }
  function exportData(kind: 'catalogue' | 'personal') {
    Alert.alert(kind === 'catalogue' ? '导出食品资料包' : '导出个人数据', kind === 'catalogue' ? `仅导出已确认商品的名称、条码和营养资料，不含个人库存和购买时间。${photos ? '包含包装和营养表照片；分享前请确认照片没有人物或私人信息。' : '本次不包含照片。'}` : `包含食品、库存数量、到期日、草稿、OCR 原文、初始解析和修订记录。${photos ? '附带原始照片，可能包含定位等私人信息。' : '本次不包含照片。'}仅分享给你信任的人。当前可导出，尚不支持 App 内一键恢复。`, [
      { text: '取消', style: 'cancel' }, { text: '生成文件', onPress: () => void task('正在生成本地导出文件', async () => { const file = await exportLocal(kind, photos); setNotice(`已生成 ZIP（${(file.bytes / 1048576).toFixed(1)} MB），可通过系统分享保存或发送。`); }) }
    ]);
  }
  const stepTitle = screen === 'package' ? '拍商品包装' : screen === 'nutrition' ? '拍营养成分表' : screen === 'review' ? '核对营养信息' : screen === 'scan' ? '拍一拍' : screen === 'product' ? '商品详情' : screen === 'add-stock' ? '加入我的库存' : screen === 'library' ? '我的食品' : '护康';
  const date = new Date();
  return { tab, setTab, screen, foods, stock, stockCovers, resume, draft, product, cover, busy, error, setError, notice, setNotice, permission, foreground, torch, setTorch, scanToken, setScanToken, manual, setManual, manualFormat, setManualFormat, review, confirmed, setConfirmed, originalText, setOriginalText, quantity, setQuantity, unit, setUnit, expiry, setExpiry, request, search, setSearch, photos, setPhotos, scroll, generation, draftRef, refresh, patchDraft, retainDraft, task, navigate, back, openProduct, lookup, startScan, beginScan, pickBarcode, capture, readPackage, transformNutrition, retryNutrition, saveCaptureDraft, updateReview, updateColumn, saveFood, showStock, exportData, stepTitle, date, setDraft, setReview, setProduct, setEditing, editing };
}
export type AppController = ReturnType<typeof useSimpleApp>;
