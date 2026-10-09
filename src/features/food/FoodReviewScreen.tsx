import { useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FoodConfirmationStatus, FoodReviewValues, FoodScanRecord, NutritionReviewColumn } from '../../domain/food/scan';
import { CORE_NUTRIENTS } from '../../domain/food/scan';
import { validateFoodReview } from '../../domain/food/review';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { getFoodDraft, removeFoodDraft } from './draftStore';
import { FoodEvidencePanel } from './FoodEvidencePanel';
import { NutritionReviewForm } from './NutritionReviewForm';
import { FoodAction, FoodField, foodColors, foodError, foodStyles } from './ui';

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

export default function FoodReviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ foodId?: string | string[]; draftId?: string | string[] }>();
  const foodId = routeId(params.foodId);
  const draftId = routeId(params.draftId);
  const [record, setRecord] = useState<FoodScanRecord | null>(null);
  const [review, setReview] = useState<FoodReviewValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<readonly string[]>([]);
  const [focusedBlockIds, setFocusedBlockIds] = useState<readonly string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setValidation([]);
    const load = async () => {
      const found = foodId ? await chinaFoodRepository.getFood(foodId) : draftId ? getFoodDraft(draftId) : null;
      if (!found) throw new Error(foodId ? '这条本地食品记录不存在或已删除。' : '未保存的识别草稿已失效。请返回 OCR Lab 重新识别。');
      if (active) {
        setRecord(found);
        setReview(JSON.parse(JSON.stringify(found.review)) as FoodReviewValues);
        setDirty(false);
      }
    };
    void load().catch((cause: unknown) => { if (active) setError(foodError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [foodId, draftId]);

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
    try {
      const snapshot = JSON.parse(JSON.stringify(review)) as FoodReviewValues;
      // Keep the loaded updatedAt as the optimistic concurrency token. The
      // repository assigns the new timestamp after the transaction succeeds;
      // replacing it here would make every edit look stale and be rejected.
      const saved = await chinaFoodRepository.saveFood({ ...record, review: snapshot, status });
      if (draftId) removeFoodDraft(draftId);
      setDirty(false);
      router.replace({ pathname: '/foods', params: { saved: saved.id } });
    } catch (cause) {
      setError(`保存失败：${foodError(cause)}`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = () => {
    if (!foodId || saving) return;
    Alert.alert('删除食品记录？', '将删除本机这条食品记录及其专属图片证据，此操作无法撤销。', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        setSaving(true);
        setError(null);
        void chinaFoodRepository.deleteFood(foodId).then(() => router.replace('/foods'))
          .catch((cause: unknown) => setError(`删除失败：${foodError(cause)}`)).finally(() => setSaving(false));
      } },
    ]);
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
    <ScrollView contentContainerStyle={foodStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={foodStyles.title}>食品人工核对</Text>
      <Text style={foodStyles.note}>识别结果只是候选值。整张表的计量基准、每项数值、单位、小数点及 NRV% 都需要对照照片确认。</Text>
      <FoodAction title="本地食品" onPress={openList} disabled={saving} />
      {loading ? <ActivityIndicator color={foodColors.teal} accessibilityLabel="正在打开食品记录" /> : null}
      {error ? <View style={foodStyles.error} accessibilityLiveRegion="assertive"><Text style={foodStyles.errorText}>{error}</Text></View> : null}
      {!loading && record && review ? <>
        <Text style={foodStyles.note}>{record.status === 'confirmed' && !dirty ? '当前记录：已人工确认' : '当前记录：待确认或有未保存修改'}</Text>
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
          {foodId ? <FoodAction title="删除食品记录" destructive disabled={saving} onPress={deleteRecord} /> : null}
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
