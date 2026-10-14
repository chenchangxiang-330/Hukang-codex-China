import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FoodConfirmationStatus, FoodReviewValues, FoodScanRecord, NutritionReviewColumn } from '../../domain/food/scan';
import { CORE_NUTRIENTS } from '../../domain/food/scan';
import { normalizeBarcode } from '../../domain/barcode/normalize';
import type { BarcodeAcquisitionMethod, ValidatedBarcode } from '../../domain/barcode/types';
import { validateFoodReview } from '../../domain/food/review';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { getFoodDraft, removeFoodDraft } from './draftStore';
import { getIdentityDraft, removeIdentityDraft } from './identityDraftStore';
import type { FoodIdentity } from '../../domain/food/identity';
import { FoodEvidencePanel } from './FoodEvidencePanel';
import { NutritionReviewForm } from './NutritionReviewForm';
import { FoodAction, FoodChoices, FoodField, foodColors, foodError, foodStyles } from './ui';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const nutrientLabels = { energy: '能量', protein: '蛋白质', fat: '脂肪', carbohydrate: '碳水化合物', sodium: '钠' } as const;

function manualColumn(existing: readonly NutritionReviewColumn[]): NutritionReviewColumn {
  let number = 1;
  while (existing.some((column) => column.id === `manual-${number}`)) number += 1;
  return {
    id: `manual-${number}`, basisKind: 'unknown', basisRawText: '', servingAmount: '', servingUnit: 'unknown',
    servingSizeNotDeclared: false, reviewed: false,
    rows: CORE_NUTRIENTS.map((nutrient) => ({ nutrient, label: nutrientLabels[nutrient], amount: '', unit: 'unknown',
      nrvPercent: '', nrvNotDeclared: false, reviewed: false })),
  };
}

function identityForRecord(record: FoodScanRecord, status: FoodConfirmationStatus, savedAt: string): FoodIdentity | null {
  if (!record.identity) return null;
  return {
    ...record.identity,
    status: status === 'confirmed' ? 'confirmed' : record.identity.status === 'confirmed' ? 'pending_confirmation' : record.identity.status,
    confirmedAt: status === 'confirmed' ? (record.identity.confirmedAt ?? savedAt) : null,
    updatedAt: savedAt,
  };
}

export default function FoodReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    foodId?: string | string[]; draftId?: string | string[];
    barcodeRaw?: string | string[]; barcodeFormat?: string | string[]; barcodeAcquiredBy?: string | string[];
    identityDraftId?: string | string[]; identityFoodId?: string | string[]; pendingIdentityId?: string | string[];
  }>();
  const foodId = routeId(params.foodId);
  const draftId = routeId(params.draftId);
  const barcodeRaw = routeId(params.barcodeRaw);
  const barcodeFormat = routeId(params.barcodeFormat);
  const identityDraftId = routeId(params.identityDraftId);
  const identityFoodId = routeId(params.identityFoodId);
  const pendingIdentityId = routeId(params.pendingIdentityId);
  // A record that already has product identity but no nutrition table enters
  // OCR as a new evidence draft. Keep its food ID so the new capture becomes
  // an immutable evidence version instead of a duplicate barcode record.
  const evidenceUpdateFoodId = foodId ?? identityFoodId;
  const identityDraft = identityDraftId ? getIdentityDraft(identityDraftId) : null;
  const barcodeAcquiredBy: BarcodeAcquisitionMethod = params.barcodeAcquiredBy === 'camera' || params.barcodeAcquiredBy === 'image' ? params.barcodeAcquiredBy : 'manual';
  const pendingBarcode: ValidatedBarcode | null = barcodeRaw && barcodeFormat ? normalizeBarcode({ rawValue: barcodeRaw, format: barcodeFormat, decodedAt: new Date().toISOString() }) : null;
  const [record, setRecord] = useState<FoodScanRecord | null>(null);
  const [review, setReview] = useState<FoodReviewValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<readonly string[]>([]);
  const [focusedBlockIds, setFocusedBlockIds] = useState<readonly string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bindRaw, setBindRaw] = useState('');
  const [bindFormat, setBindFormat] = useState<'EAN_13' | 'EAN_8' | 'UPC_A' | 'UPC_E'>('EAN_13');
  const [binding, setBinding] = useState(false);
  const [bindingNotice, setBindingNotice] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // A persisted record carries at least its creation revision. Keeping this
  // fallback makes the destructive action available after a cold-start route
  // restore even if Expo Router temporarily omits the query parameter.
  const persistedFoodId = foodId ?? (record && record.revisions.length > 0 ? record.id : undefined);

  useEffect(() => {
    if (error) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [error]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setValidation([]);
    const load = async () => {
      const persisted = evidenceUpdateFoodId ? await chinaFoodRepository.getFood(evidenceUpdateFoodId) : null;
      const draft = draftId ? getFoodDraft(draftId) : null;
      const found = foodId ? persisted : identityFoodId && draft && persisted ? {
        ...draft, id: persisted.id, createdAt: persisted.createdAt, updatedAt: persisted.updatedAt,
        ...((draft.identity ?? persisted.identity) ? { identity: { ...(draft.identity ?? persisted.identity)!, foodId: persisted.id } } : {}),
        revisions: persisted.revisions, ...(persisted.barcodes ? { barcodes: persisted.barcodes } : {}),
        ...(persisted.evidenceHistory ? { evidenceHistory: persisted.evidenceHistory } : {}),
      } : draft;
      if (!found) throw new Error(evidenceUpdateFoodId ? '这条本地食品记录不存在或已删除。' : '未保存的识别草稿已失效。请返回 OCR Lab 重新识别。');
      if (active) {
        const loaded = found && identityDraft && !found.identity ? {
          ...found,
          review: { ...found.review, name: identityDraft.name || found.review.name, brand: identityDraft.brand || found.review.brand },
        } : found;
        setRecord(loaded);
        setReview(loaded ? JSON.parse(JSON.stringify(loaded.review)) as FoodReviewValues : null);
        setDirty(false);
      }
    };
    void load().catch((cause: unknown) => { if (active) setError(foodError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [foodId, identityFoodId, draftId]);

  const changeReview = (next: FoodReviewValues) => {
    setReview(next);
    setDirty(true);
    setValidation([]);
  };

  const save = async (status: FoodConfirmationStatus) => {
    if (!record || !review || saving) return;
    const issues = validateFoodReview(review, status);
    setValidation(issues);
    if (issues.length > 0) return;
    setSaving(true);
    setError(null);
    let persistedId: string | null = null;
    let bindingStarted = false;
    try {
      const snapshot = JSON.parse(JSON.stringify(review)) as FoodReviewValues;
      // Keep the loaded updatedAt as the optimistic concurrency token. The
      // repository assigns the new timestamp after the transaction succeeds;
      // replacing it here would make every edit look stale and be rejected.
      if (pendingBarcode) {
        if (pendingBarcode.validity !== 'valid' || !pendingBarcode.lookupKey) {
          throw new Error('条码未通过校验，食品尚未保存，也未建立条码关联。');
        }
        const existing = await chinaFoodRepository.getFoodByBarcode(pendingBarcode.lookupKey);
        if (existing && existing.record.id !== record.id) {
          throw new Error(`该条码已绑定到“${existing.record.review.name || '另一条食品记录'}”，未覆盖原关联。请打开原记录或先明确解绑。`);
        }
      }
      const identity = identityForRecord(record, status,
        foodId && record.identity ? record.identity.updatedAt : new Date().toISOString());
      // New nutrition drafts and an existing identity-only record carry the
      // confirmed identity into the same SQLite transaction as nutrition
      // evidence. A standalone food edit still uses the identity repository
      // operation below.
      const saved = evidenceUpdateFoodId && !foodId
        ? await chinaFoodRepository.saveFoodEvidence({ foodId: evidenceUpdateFoodId, evidence: record.evidence, parsed: record.parsed, review: snapshot, status, ...(identity ? { identity } : {}) })
        : await chinaFoodRepository.saveFood({
          ...record, review: snapshot, status,
          ...(identity && !foodId ? { identity } : {}),
        });
      persistedId = saved.id;
      if (!evidenceUpdateFoodId && pendingBarcode && pendingBarcode.validity === 'valid' && pendingBarcode.lookupKey) {
        bindingStarted = true;
        await chinaFoodRepository.bindBarcode(saved.id, pendingBarcode, barcodeAcquiredBy);
      }
      if (pendingIdentityId) await chinaFoodRepository.deletePendingFoodIdentity(pendingIdentityId);
      if (identity && foodId) await chinaFoodRepository.saveFoodIdentity({ ...identity, foodId: saved.id });
      if (draftId) removeFoodDraft(draftId);
      if (identityDraftId) removeIdentityDraft(identityDraftId);
      setDirty(false);
      router.replace({ pathname: '/foods', params: { saved: saved.id } });
    } catch (cause) {
      setError(persistedId
        ? `食品记录已保存，但${bindingStarted ? '条码或身份关联尚未完成' : '后续关联尚未完成'}：${foodError(cause)}。请在本地食品中打开该记录后重试。`
        : `保存失败：${foodError(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = () => {
    if (!persistedFoodId || saving) return;
    Alert.alert('删除食品记录？', '将删除本机这条食品记录及其专属图片证据，此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        setSaving(true);
        setError(null);
        void chinaFoodRepository.deleteFood(persistedFoodId).then(() => router.replace('/foods'))
          .catch((cause: unknown) => setError(`删除失败：${foodError(cause)}`)).finally(() => setSaving(false));
      } },
    ]);
  };

  const bindExistingBarcode = async () => {
    if (!record || !foodId || binding) return;
    const barcode = normalizeBarcode({ rawValue: bindRaw, format: bindFormat, decodedAt: new Date().toISOString() });
    if (barcode.validity !== 'valid' || !barcode.lookupKey) {
      setBindingNotice('条码格式或校验位无效，未建立关联。请保留前导零并重新核对。');
      return;
    }
    setBinding(true); setBindingNotice(null);
    try {
      const association = await chinaFoodRepository.bindBarcode(foodId, barcode, 'manual');
      setRecord({ ...record, barcodes: [...(record.barcodes ?? []).filter(item => item.lookupKey !== association.lookupKey), association] });
      setBindRaw(''); setBindingNotice('条码已绑定到这条食品记录。');
    } catch (cause) { setBindingNotice(`条码绑定失败：${foodError(cause)}`); }
    finally { setBinding(false); }
  };

  const openList = () => {
    if (!dirty) { router.push('/foods'); return; }
    Alert.alert('还有未保存的修改', '返回食品列表会放弃当前未保存的修改。你可以先保存待确认记录。', [
      { text: '继续核对', style: 'cancel' },
      { text: '放弃修改', style: 'destructive', onPress: () => router.replace('/foods') },
    ]);
  };

  return <SafeAreaView style={foodStyles.safe} edges={['bottom']}>
    <Stack.Screen options={{ title: '食品人工核对', headerShadowVisible: false }} />
    <ScrollView ref={scrollRef} contentContainerStyle={foodStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={foodStyles.title}>食品人工核对</Text>
      <Text style={foodStyles.note}>识别结果只是候选值。整张表的计量基准、每项数值、单位、小数点及 NRV% 都需要对照照片确认。</Text>
      <FoodAction title="本地食品" onPress={openList} disabled={saving} />
      {loading ? <ActivityIndicator color={foodColors.teal} accessibilityLabel="正在打开食品记录" /> : null}
      {error ? <View style={foodStyles.error} accessibilityLiveRegion="assertive"><Text style={foodStyles.errorText}>{error}</Text></View> : null}
      {!loading && record && review ? <>
        <Text style={foodStyles.note}>{record.status === 'confirmed' && !dirty ? '当前记录：已人工确认' : '当前记录：待确认或有未保存修改'}</Text>
        {pendingBarcode ? <View style={foodStyles.notice}><Text style={foodStyles.sectionTitle}>待绑定条码</Text><Text style={foodStyles.text}>{pendingBarcode.scan.rawValue} · {pendingBarcode.scan.format}</Text><Text style={foodStyles.note}>保存后会将原始条码、格式、校验结果和获取方式写入本机食品库。</Text></View> : null}
        {record.identity || identityDraft ? <View style={foodStyles.notice}>
          <Text style={foodStyles.sectionTitle}>商品身份（独立于营养标签）</Text>
          <Text style={foodStyles.text}>{record.identity?.name || identityDraft?.name || '待填写商品'} · {record.identity?.brand || identityDraft?.brand || '品牌待确认'}</Text>
          <Text style={foodStyles.note}>规格：{record.identity?.specification || identityDraft?.specification || '待确认'} · 来源：{record.identity?.source.sourceName || (identityDraft?.sourceKind === 'CHINA_SERVICE' ? '国内商品身份服务' : '用户填写')}</Text>
          <Text style={foodStyles.warning}>商品身份已确认不等于营养数据已确认；营养表仍需逐项对照照片。</Text>
        </View> : null}
        {foodId ? <View style={foodStyles.card}>
          <Text style={foodStyles.sectionTitle}>条码关联</Text>
          {record.barcodes?.length ? record.barcodes.map(barcode => <Text key={barcode.lookupKey} style={foodStyles.note}>已绑定：{barcode.rawValue} · {barcode.format} · {barcode.acquiredBy}</Text>) : <Text style={foodStyles.note}>这条食品记录还没有条码。</Text>}
          <FoodChoices label="条码格式" accessibilityLabel="绑定条码格式" value={bindFormat} options={[{ value: 'EAN_13', label: 'EAN-13' }, { value: 'EAN_8', label: 'EAN-8' }, { value: 'UPC_A', label: 'UPC-A' }, { value: 'UPC_E', label: 'UPC-E' }]} onChange={setBindFormat} disabled={binding} />
          <FoodField label="手动补绑条码" accessibilityLabel="补绑食品条码" value={bindRaw} onChangeText={setBindRaw} disabled={binding} numeric />
          <FoodAction title="绑定到当前食品" onPress={() => void bindExistingBarcode()} disabled={binding || !bindRaw.trim()} />
          {bindingNotice ? <Text style={bindingNotice.includes('失败') || bindingNotice.includes('无效') ? foodStyles.warning : foodStyles.note}>{bindingNotice}</Text> : null}
        </View> : null}
        <FoodEvidencePanel evidence={record.evidence} focusedBlockIds={focusedBlockIds} />
        <View style={foodStyles.card}>
          <Text style={foodStyles.sectionTitle}>食品信息</Text>
          <Text style={foodStyles.note}>请从包装上填写。商品名、品牌和配料不会由系统自动猜测。</Text>
          <FoodField label="商品名称" accessibilityLabel="食品名称" value={review.name} disabled={saving}
            onChangeText={(name) => changeReview({ ...review, name })} />
          <FoodField label="品牌" accessibilityLabel="食品品牌" value={review.brand} disabled={saving}
            onChangeText={(brand) => changeReview({ ...review, brand })} />
          <FoodField label="配料表" accessibilityLabel="食品配料" value={review.ingredients} multiline disabled={saving}
            onChangeText={(ingredients) => changeReview({ ...review, ingredients })} />
        </View>
        {record.parsed.completeCandidateTable
          ? <Text style={foodStyles.note}>已定位到完整候选表，仍需逐项人工核对后才能确认。</Text>
          : <Text style={foodStyles.warning}>尚未定位到完整且无歧义的营养表。缺失内容保持空白，可以补充核对或先保存待确认。</Text>}
        {review.columns.map((column, index) => <NutritionReviewForm key={column.id} column={column} index={index}
          candidate={record.parsed.columns.find((candidate) => candidate.id === column.id)} disabled={saving}
          onShowSource={setFocusedBlockIds}
          onChange={(next) => changeReview({ ...review, columns: review.columns.map((current) => current.id === column.id ? next : current) })} />)}
        <FoodAction title="手动补充一列营养表" disabled={saving} onPress={() => changeReview({
          ...review, columns: [...review.columns, manualColumn(review.columns)],
        })} />
        <View style={foodStyles.card}>
          <Text style={foodStyles.sectionTitle}>保存核对结果</Text>
          <Text style={foodStyles.note}>不能确认的字段请留空并保存待确认。只有所有营养列和五项营养都完成核对，才能保存为已确认食品。</Text>
          {validation.length > 0 ? <View style={foodStyles.error} accessibilityLiveRegion="assertive">
            <Text style={foodStyles.errorText}>尚不能这样保存：</Text>
            {validation.map((issue, index) => <Text key={`${index}-${issue}`} style={foodStyles.errorText}>• {issue}</Text>)}
          </View> : null}
          <FoodAction title="保存待确认记录" disabled={saving} onPress={() => void save('draft')} />
          <FoodAction title="确认并保存食品" disabled={saving} primary onPress={() => void save('confirmed')} />
          {saving ? <ActivityIndicator color={foodColors.teal} accessibilityLabel="正在保存食品记录" /> : null}
          {persistedFoodId ? <FoodAction title="删除食品记录" destructive disabled={saving} onPress={deleteRecord} /> : null}
        </View>
        <View style={foodStyles.card}>
          <FoodAction title={showHistory ? '收起识别与核对历史' : '查看识别与核对历史'} onPress={() => setShowHistory((value) => !value)} />
          {showHistory ? <>
            <Text style={foodStyles.sectionTitle}>原始 OCR（永久保留）</Text>
            <Text selectable style={foodStyles.text}>{record.evidence.ocr.rawText}</Text>
            <Text style={foodStyles.sectionTitle}>初始结构化候选（不会被人工修改覆盖）</Text>
            <Text selectable style={foodStyles.code}>{JSON.stringify(record.parsed, null, 2)}</Text>
            <Text style={foodStyles.sectionTitle}>已保存的人工核对历史</Text>
            <Text selectable style={foodStyles.code}>{JSON.stringify(record.revisions, null, 2)}</Text>
            <Text style={foodStyles.sectionTitle}>当前编辑值</Text>
            <Text selectable style={foodStyles.code}>{JSON.stringify(review, null, 2)}</Text>
          </> : null}
        </View>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}
