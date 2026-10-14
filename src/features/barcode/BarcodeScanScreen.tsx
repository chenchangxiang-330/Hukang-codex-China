import { useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BarcodeScan, ValidatedBarcode, SupportedBarcodeFormat } from '../../domain/barcode/types';
import type { PendingFoodIdentity } from '../../domain/food/identity';
import { normalizeBarcode } from '../../domain/barcode/normalize';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { hukangBarcode } from '../../infrastructure/barcode/HukangBarcode';
import { createIdentityDraft } from '../food/identityDraftStore';

type LookupRecord = {
  id?: string;
  name?: string;
  chineseName?: string;
  brand?: string;
  status?: string;
  updatedAt?: string;
  evidence?: { image?: { uri?: string } };
  review?: { name?: string; brand?: string; columns?: readonly { basisKind?: string; basisRawText?: string; rows?: readonly { label?: string; amount?: string; unit?: string; nrvPercent?: string }[] }[] };
  barcodes?: readonly { rawValue: string; format: string; lookupKey: string; acquiredBy: string }[];
  reviewColumns?: readonly { basisKind?: string; basisRawText?: string; rows?: readonly { label?: string; amount?: string; unit?: string; nrvPercent?: string }[] }[];
  columns?: readonly { basisKind?: string; basisRawText?: string; rows?: readonly { label?: string; amount?: string; unit?: string; nrvPercent?: string }[] }[];
};
type LookupResult = { status: 'found'; records: readonly LookupRecord[] } | { status: 'pending'; pending: PendingFoodIdentity } | { status: 'not_found' } | { status: 'unavailable'; reason: string };
type BarcodeRepositoryApi = typeof chinaFoodRepository;
type NativeBarcodeResult = { rawValue?: unknown; format?: unknown; decodedAt?: unknown };

const palette = {
  background: '#f3faf8', surface: '#ffffff', ink: '#183e37', secondary: '#60736e',
  teal: '#157b67', pale: '#e6f4ed', border: '#dce9e4', amber: '#946015', red: '#a43b3b',
};
const formatOptions: readonly { value: SupportedBarcodeFormat; label: string }[] = [
  { value: 'EAN_13', label: 'EAN-13' }, { value: 'EAN_8', label: 'EAN-8' },
  { value: 'UPC_A', label: 'UPC-A' }, { value: 'UPC_E', label: 'UPC-E' },
];
const formatLabel = (value: string | null | undefined) => formatOptions.find(option => option.value === value)?.label ?? value ?? '未知格式';

function scanFromNative(value: NativeBarcodeResult): BarcodeScan | null {
  if (typeof value.rawValue !== 'string' || typeof value.format !== 'string') return null;
  return { rawValue: value.rawValue, format: value.format, decodedAt: typeof value.decodedAt === 'string' ? value.decodedAt : new Date().toISOString() };
}

function explanation(validated: ValidatedBarcode): string {
  switch (validated.reason) {
    case 'unsupported_format': return '这不是本阶段支持的食品条码格式。二维码和药品追溯码不会自动打开或查询。';
    case 'non_digit_value': return '条码含有非数字字符，请对照包装重新输入。';
    case 'wrong_length': return '条码长度与选择的格式不符，请保留所有前导零。';
    case 'invalid_check_digit': return '校验位不正确。请重新扫描，或检查是否漏读了数字。';
    case 'unsupported_number_system': return 'UPC-E 编码的 number system 不明确，未猜测展开方式。';
    default: return '条码未通过校验，尚未查询本地食品库。';
  }
}

function recordName(record: LookupRecord): string {
  return record.name ?? record.chineseName ?? record.review?.name ?? '未命名食品';
}

function hasNutrition(record: LookupRecord): boolean {
  const columns = record.reviewColumns ?? record.columns ?? record.review?.columns ?? [];
  return columns.some((column) => (column.rows ?? []).some((row) => Boolean(row.amount || row.nrvPercent)));
}

function basisText(value: string | undefined, raw: string | undefined): string {
  switch (value) {
    case 'per_100g': return '每100g';
    case 'per_100ml': return '每100mL';
    case 'per_serving': return `每份${raw ? `（${raw}）` : ''}`;
    default: return raw || '计量基准待确认';
  }
}

/** Local-first barcode entry. Camera/image decoding remains local; a miss can opt into the separate identity page for a domestic HTTPS lookup. */
export default function BarcodeScanScreen() {
  const router = useRouter();
  const [format, setFormat] = useState<SupportedBarcodeFormat>('EAN_13');
  const [rawValue, setRawValue] = useState('');
  const [validated, setValidated] = useState<ValidatedBarcode | null>(null);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [acquiredBy, setAcquiredBy] = useState<'camera' | 'image' | 'manual'>('manual');
  const requestId = useRef(0);

  const lookupLocal = async (next: ValidatedBarcode) => {
    const found = await (chinaFoodRepository as BarcodeRepositoryApi).getFoodByBarcode(next.lookupKey as string);
    if (found) return { status: 'found' as const, records: [found.record] };
    const pending = await chinaFoodRepository.getPendingFoodIdentityByBarcode(next.lookupKey as string);
    return pending ? { status: 'pending' as const, pending } : { status: 'not_found' as const };
  };

  const submitScan = async (scan: BarcodeScan, source: 'camera' | 'image' | 'manual' = 'manual') => {
    const id = ++requestId.current;
    setBusy(true); setNotice(null); setLookup(null);
    setRawValue(scan.rawValue);
    setAcquiredBy(source);
    const next = normalizeBarcode(scan);
    setValidated(next);
    if (next.validity !== 'valid') { setBusy(false); return; }
    try {
      const result = await lookupLocal(next);
      if (id === requestId.current) setLookup(result);
    } catch (cause) {
      if (id === requestId.current) setLookup({ status: 'unavailable', reason: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  const submitManual = () => {
    void submitScan({ rawValue, format, decodedAt: new Date().toISOString() }, 'manual');
  };

  const decodePickedImage = async (uri: string, source: 'camera' | 'image') => {
    setBusy(true);
    try {
      const output = await hukangBarcode.scanImage(uri);
      const first = output[0] as NativeBarcodeResult | undefined;
      const scan = first ? scanFromNative(first) : null;
      if (!scan) setNotice('没有识别到支持的食品条码，请调整取景后重试。');
      else await submitScan(scan, source);
    } catch (cause) { setNotice(`图片条码识别失败：${cause instanceof Error ? cause.message : String(cause)}`); }
    finally { setBusy(false); }
  };

  const launchCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setNotice('相机权限被拒绝，无法拍摄条码照片。'); return; }
    setNotice(null);
    const captured = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (captured.canceled) return;
    const asset = captured.assets?.[0];
    if (!asset?.uri) { setNotice('没有取得相机照片。'); return; }
    await decodePickedImage(asset.uri, 'camera');
  };

  const launchImage = async () => {
    setNotice(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setNotice('没有相册权限，无法从包装照片识别条码。'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (picked.canceled) return;
    const asset = picked.assets?.[0];
    if (!asset?.uri) { setNotice('没有取得可读取的包装图片。'); return; }
    await decodePickedImage(asset.uri, 'image');
  };

  const startDraft = () => {
    if (!validated?.gtin || !validated.lookupKey) return;
    // Keep barcode and identity in one draft. The identity page may query an
    // enabled domestic provider, but the next nutrition/OCR page never starts
    // a second product and never returns the user to the home page.
    const identityDraftId = createIdentityDraft({
      barcodeRaw: validated.scan.rawValue,
      barcodeFormat: validated.normalizedFormat ?? validated.scan.format,
      barcodeGtin: validated.gtin,
      barcodeLookupKey: validated.lookupKey,
      barcodeAcquiredBy: acquiredBy,
    });
    router.push({ pathname: '/identity-confirm', params: { identityDraftId } });
  };

  return <SafeAreaView style={styles.safe} edges={['bottom']}>
    <Stack.Screen options={{ title: '扫码查食品', headerShadowVisible: false }} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>扫码查食品</Text>
      <Text style={styles.note}>条码先定位本机食品记录。没有记录时可选择启用国内商品身份查询，也可以完全离线手动建档；照片、OCR 和营养数据始终留在本机。</Text>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>扫描入口</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="使用相机扫描食品条码" onPress={() => void launchCamera()} disabled={busy} style={[styles.primary, busy && styles.disabled]}>
          <Text style={styles.primaryText}>使用相机扫描</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="从图片识别食品条码" onPress={() => void launchImage()} disabled={busy} style={[styles.action, busy && styles.disabled]}>
          <Text style={styles.actionText}>从包装图片识别条码</Text>
        </Pressable>
        <Text style={styles.note}>支持 EAN-13、EAN-8、UPC-A、UPC-E。二维码和药品追溯码不会打开网页。</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>手动输入（辅助入口）</Text>
        <View style={styles.choices}>{formatOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`条码格式-${option.label}`} accessibilityState={{ selected: format === option.value }} onPress={() => setFormat(option.value)} style={[styles.choice, format === option.value && styles.selectedChoice]}><Text style={[styles.choiceText, format === option.value && styles.selectedChoiceText]}>{option.label}</Text></Pressable>)}</View>
        <TextInput accessibilityLabel="手动输入条码" value={rawValue} onChangeText={value => {
          // Editing the value starts a new lookup generation. A slow local
          // query for the previous value must not repopulate this form.
          requestId.current += 1;
          setBusy(false);
          setRawValue(value); setValidated(null); setLookup(null);
        }} placeholder="保留前导零，只输入数字" keyboardType="number-pad" style={styles.input} maxLength={14} />
        <Pressable accessibilityRole="button" accessibilityLabel="查询手动输入条码" onPress={submitManual} disabled={busy || !rawValue} style={[styles.action, busy && styles.disabled]}><Text style={styles.actionText}>查询本地食品</Text></Pressable>
      </View>
      {busy ? <ActivityIndicator color={palette.teal} accessibilityLabel="正在扫描或查询本地食品" /> : null}
      {notice ? <View style={styles.error}><Text style={styles.errorText}>{notice}</Text></View> : null}
      {validated ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>条码结果</Text>
        <Text style={styles.text}>原始条码：{validated.scan.rawValue}</Text>
        <Text style={styles.note}>格式：{formatLabel(validated.normalizedFormat ?? validated.scan.format)} · 读取来源：{validated.scan.decodedAt}</Text>
        {validated.validity !== 'valid' ? <Text style={styles.errorText}>{explanation(validated)}</Text> : <Text style={styles.success}>校验通过 · 本地查询键 {validated.lookupKey}</Text>}
      </View> : null}
      {lookup?.status === 'unavailable' ? <View style={styles.error}><Text style={styles.errorText}>本地食品查询不可用：{lookup.reason}</Text></View> : null}
      {lookup?.status === 'found' ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>已收录食品</Text>
        {lookup.records.map((record, index) => <Pressable key={record.id ?? `${index}`} accessibilityRole="button" accessibilityLabel={`打开食品-${recordName(record)}`} onPress={() => {
            if (!record.id) return;
            if (hasNutrition(record)) router.push({ pathname: '/food-review', params: { foodId: record.id } });
            else router.push({ pathname: '/identity-confirm', params: { existingFoodId: record.id, barcodeRaw: validated?.scan.rawValue ?? '', barcodeFormat: validated?.normalizedFormat ?? validated?.scan.format ?? '', barcodeGtin: validated?.gtin ?? '', barcodeLookupKey: validated?.lookupKey ?? '', barcodeAcquiredBy: acquiredBy } });
          }} style={styles.result}>
          <Text style={styles.text}>{recordName(record)}</Text><Text style={record.status === 'confirmed' ? styles.success : styles.warning}>{record.status === 'confirmed' ? '已人工确认' : '待确认'}</Text><Text style={styles.note}>{hasNutrition(record) ? '本地营养表已保存，可查看或更新。' : '商品身份已保存，营养表尚未录入。'}</Text>
          {record.brand || record.review?.brand ? <Text style={styles.note}>{record.brand ?? record.review?.brand}</Text> : null}
          {record.evidence?.image?.uri ? <Image accessibilityLabel="食品包装图片" source={{ uri: record.evidence.image.uri }} resizeMode="contain" style={styles.packageImage} /> : null}
          {record.barcodes?.map(barcode => <Text key={barcode.lookupKey} style={styles.note}>条码：{barcode.rawValue} · {barcode.format} · {barcode.acquiredBy}</Text>)}
          {(record.reviewColumns ?? record.columns ?? record.review?.columns)?.map((column, columnIndex) => <View key={`${column.basisKind ?? 'unknown'}-${columnIndex}`} style={styles.nutritionSummary}>
            <Text style={styles.note}>{basisText(column.basisKind, column.basisRawText)}</Text>
            {column.rows?.filter(row => row.amount || row.nrvPercent).map((row, rowIndex) => <Text key={`${row.label ?? 'row'}-${rowIndex}`} style={styles.note}>{row.label ?? '营养项目'}：{row.amount || '待确认'} {row.unit && row.unit !== 'unknown' ? row.unit : ''}{row.nrvPercent ? ` · NRV ${row.nrvPercent}%` : ''}</Text>)}
          </View>)}
        </Pressable>)}
      </View> : null}
      {lookup?.status === 'pending' ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>待补营养表的本地商品</Text>
        <Text style={styles.text}>{lookup.pending.identity.name || '商品名称待填写'}</Text>
        <Text style={styles.note}>{lookup.pending.identity.brand || '品牌待确认'} · {lookup.pending.identity.specification || '规格待确认'}</Text>
        <Text style={styles.note}>条码：{lookup.pending.barcode.rawValue} · 商品身份已保存在本机，营养表尚未录入。</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="继续补拍营养成分表" onPress={() => router.push({ pathname: '/identity-confirm', params: {
          pendingIdentityId: lookup.pending.id, barcodeRaw: lookup.pending.barcode.rawValue, barcodeFormat: lookup.pending.barcode.format,
          barcodeGtin: normalizeBarcode({ rawValue: lookup.pending.barcode.rawValue, format: lookup.pending.barcode.format, decodedAt: lookup.pending.barcode.scannedAt }).gtin ?? '',
          barcodeLookupKey: lookup.pending.barcode.lookupKey, barcodeAcquiredBy: lookup.pending.barcode.acquiredBy,
        } })} style={styles.primary}><Text style={styles.primaryText}>继续拍摄营养成分表</Text></Pressable>
      </View> : null}
      {lookup?.status === 'not_found' ? <View style={styles.card}>
        <Text style={styles.sectionTitle}>本地食品库尚未收录</Text>
        <Text style={styles.note}>没有查到这个条码的本地记录。你可以选择国内商品身份查询，或拍摄包装手动补充；查询失败不等于商品不存在，也不是食品安全结论。</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="补录带条码的食品" onPress={startDraft} style={styles.primary}><Text style={styles.primaryText}>补录这个食品</Text></Pressable>
      </View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="重新扫描" onPress={() => { requestId.current += 1; setBusy(false); setValidated(null); setLookup(null); setRawValue(''); setNotice(null); }} style={styles.action}><Text style={styles.actionText}>重新扫描</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="返回 OCR Lab" onPress={() => router.replace('/')} style={styles.action}><Text style={styles.actionText}>返回 OCR Lab</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 16, paddingBottom: 36 },
  title: { fontSize: 23, fontWeight: '700', color: palette.ink },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: palette.ink },
  card: { backgroundColor: palette.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: palette.border, gap: 12 },
  note: { fontSize: 12, lineHeight: 20, color: palette.secondary },
  text: { fontSize: 14, lineHeight: 22, color: palette.ink },
  success: { color: palette.teal, fontSize: 13, lineHeight: 20 },
  warning: { color: palette.amber, fontSize: 12, lineHeight: 20 },
  error: { backgroundColor: '#fff1ee', padding: 12, borderRadius: 10, gap: 5 },
  errorText: { color: palette.red, fontSize: 13, lineHeight: 21 },
  primary: { minHeight: 46, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.teal, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.pale, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  actionText: { color: palette.teal, fontWeight: '600', fontSize: 14 },
  disabled: { opacity: 0.4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 1, borderColor: palette.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  selectedChoice: { backgroundColor: palette.teal, borderColor: palette.teal },
  choiceText: { color: palette.secondary, fontSize: 12 },
  selectedChoiceText: { color: '#fff', fontWeight: '600' },
  input: { backgroundColor: palette.background, borderWidth: 1, borderColor: palette.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 10, color: palette.ink, fontSize: 16, minHeight: 46 },
  result: { borderWidth: 1, borderColor: palette.border, borderRadius: 10, padding: 12, gap: 4 },
  nutritionSummary: { backgroundColor: palette.background, borderRadius: 8, padding: 8, marginTop: 4, gap: 2 },
  packageImage: { width: '100%', height: 150, borderRadius: 8, backgroundColor: palette.background },
});
