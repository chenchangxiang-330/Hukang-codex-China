import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { IdentityResult } from '../../application/ports/ChinaFoodIdentityProvider';
import { createConfiguredChinaFoodProvider } from '../../infrastructure/food/providers/ConfiguredChinaFoodProvider';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { confirmIdentityDraft, createIdentityDraft, getIdentityDraft, updateIdentityDraft, type ProductIdentityDraft } from './identityDraftStore';
import { FoodAction, FoodField, foodColors, foodError, foodStyles } from './ui';

function param(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const provider = createConfiguredChinaFoodProvider({
  // Endpoint is deployment configuration only. No URL or key is bundled in the
  // app; an absent endpoint fails closed and leaves local/manual flow usable.
  baseUrl: typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_HUKANG_FOOD_SERVICE_URL : undefined,
  enabled: true,
});

function statusText(result: IdentityResult | null): string {
  if (!result) return '';
  if (result.status === 'found') return '国内服务返回了候选商品，请对照手中包装确认。';
  switch (result.status) {
    case 'disabled': return '国内联网查询已关闭。你仍可以手动填写商品信息。';
    case 'not_configured': return '国内商品服务尚未配置。你仍可以手动填写商品信息。';
    case 'offline': case 'timeout': return '暂时无法连接国内商品服务。条码已保留，可以继续手动建档。';
    case 'not_found': return '国内商品服务没有收录此条码，不代表商品不存在。请手动核对包装信息。';
    case 'unsupported_format': return '当前国内服务不支持此条码格式，请手动填写商品信息。';
    default: return result.message;
  }
}

export default function ProductIdentityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    identityDraftId?: string | string[]; existingFoodId?: string | string[];
    barcodeRaw?: string | string[]; barcodeFormat?: string | string[]; barcodeGtin?: string | string[]; barcodeLookupKey?: string | string[]; barcodeAcquiredBy?: string | string[];
  }>();
  const existingFoodId = param(params.existingFoodId);
  const [draft, setDraft] = useState<ProductIdentityDraft | null>(() => {
    const id = param(params.identityDraftId);
    if (id) return getIdentityDraft(id);
    const raw = param(params.barcodeRaw); const gtin = param(params.barcodeGtin); const key = param(params.barcodeLookupKey);
    if (!raw || !gtin || !key) return null;
    const id2 = createIdentityDraft({ barcodeRaw: raw, barcodeFormat: param(params.barcodeFormat) ?? 'EAN_13', barcodeGtin: gtin, barcodeLookupKey: key, barcodeAcquiredBy: (param(params.barcodeAcquiredBy) === 'camera' || param(params.barcodeAcquiredBy) === 'image') ? param(params.barcodeAcquiredBy) as 'camera' | 'image' : 'manual' });
    return getIdentityDraft(id2);
  });
  const [allowNetwork, setAllowNetwork] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<IdentityResult | null>(null);
  const [queryAttempted, setQueryAttempted] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    if (!draft || !existingFoodId) return () => { active = false; };
    void Promise.all([
      chinaFoodRepository.getFoodIdentity(existingFoodId),
      chinaFoodRepository.getFood(existingFoodId),
    ]).then(([identity, food]) => {
      if (!active) return;
      if (identity) {
        const next = updateIdentityDraft(draft.id, {
          name: identity.name, brand: identity.brand, specification: identity.specification,
          sourceId: identity.source.sourceId, sourceKind: identity.source.kind === 'mainland_service' ? 'CHINA_SERVICE' : identity.source.kind === 'local' ? 'LOCAL' : 'MANUAL', sourceFetchedAt: identity.source.fetchedAt,
        });
        setDraft(next);
      } else if (food) {
        // Legacy/local records may predate the separate identity row. Their
        // reviewed name and brand remain the only local identity evidence.
        const next = updateIdentityDraft(draft.id, {
          name: food.review.name, brand: food.review.brand, sourceId: 'local-food-record', sourceKind: 'LOCAL', sourceFetchedAt: null,
        });
        setDraft(next);
      }
    }).catch(() => { /* Existing food can still be edited manually. */ });
    return () => { active = false; };
  }, [draft?.id, existingFoodId]);

  const patch = (value: Partial<Omit<ProductIdentityDraft, 'id'>>) => {
    if (draft) setDraft(updateIdentityDraft(draft.id, value));
  };

  const query = async () => {
    if (!draft || querying || queryAttempted || existingFoodId) return;
    if (!allowNetwork) { setResult({ status: 'disabled', message: '国内联网查询已关闭。' }); return; }
    const id = ++requestId.current;
    setQueryAttempted(true);
    setQuerying(true); setResult(null);
    try {
      const next = await provider.lookup({ rawValue: draft.barcodeRaw, gtin: draft.barcodeGtin, lookupKey: draft.barcodeLookupKey, format: draft.barcodeFormat as any });
      if (id !== requestId.current) return;
      setResult(next);
      if (next.status === 'found') {
        const identity = next.identity;
        setDraft(updateIdentityDraft(draft.id, { name: identity.name, brand: identity.brand ?? '', specification: identity.specification ?? '', category: identity.category ?? '', manufacturer: identity.manufacturer ?? '', sourceId: identity.sourceId, sourceKind: 'CHINA_SERVICE', sourceFetchedAt: identity.obtainedAt }));
      }
    } catch (cause) { if (id === requestId.current) setResult({ status: 'offline', message: foodError(cause) }); }
    finally { if (id === requestId.current) setQuerying(false); }
  };

  const openNutrition = () => {
    if (!draft) return;
    const confirmed = confirmIdentityDraft(draft.id);
    setDraft(confirmed);
    router.push({ pathname: '/nutrition-capture', params: {
      identityDraftId: confirmed.id,
      ...(existingFoodId ? { identityFoodId: existingFoodId } : {}),
      barcodeRaw: confirmed.barcodeRaw, barcodeFormat: confirmed.barcodeFormat, barcodeGtin: confirmed.barcodeGtin,
      barcodeLookupKey: confirmed.barcodeLookupKey, barcodeAcquiredBy: confirmed.barcodeAcquiredBy,
    } });
  };

  if (!draft) return <SafeAreaView style={foodStyles.safe}><Stack.Screen options={{ title: '商品身份' }} /><View style={foodStyles.content}><View style={foodStyles.error}><Text style={foodStyles.errorText}>商品身份草稿已失效，请返回扫码页重新开始。</Text></View><FoodAction title="返回扫码查食品" primary onPress={() => router.replace('/barcode')} /></View></SafeAreaView>;

  return <SafeAreaView style={foodStyles.safe} edges={['bottom']}>
    <Stack.Screen options={{ title: '确认商品身份', headerShadowVisible: false }} />
    <ScrollView contentContainerStyle={foodStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={foodStyles.title}>确认商品身份</Text>
      <Text style={foodStyles.note}>先确认条码对应的商品，再拍摄你手中包装上的营养成分表。身份查询不会上传照片、OCR 文字或本地食品记录。</Text>
      <View style={foodStyles.notice}>
        <Text style={foodStyles.sectionTitle}>当前条码</Text>
        <Text style={foodStyles.text}>{draft.barcodeRaw} · {draft.barcodeFormat}</Text>
        <Text style={foodStyles.note}>查询键：{draft.barcodeLookupKey} · 来源：{draft.barcodeAcquiredBy === 'manual' ? '手动输入' : draft.barcodeAcquiredBy === 'camera' ? '相机拍摄' : '图片识别'}</Text>
      </View>
      <View style={foodStyles.card}>
        <Text style={foodStyles.sectionTitle}>国内商品身份查询（可选）</Text>
        <Text style={foodStyles.note}>仅在你主动启用后发送已校验条码、格式和 GTIN 到 Hukang 配置的国内 HTTPS 服务。没有服务地址、断网或查询失败时，仍可手动填写。</Text>
        <FoodAction title={allowNetwork ? '已允许本次联网查询' : '启用本次联网查询'} onPress={() => { setAllowNetwork((value) => !value); setResult(null); }} />
        <FoodAction title={querying ? '查询中…' : queryAttempted ? '本次条码已查询（如需重试请重新扫描）' : '查询商品名称、品牌和规格'} primary onPress={() => void query()} disabled={querying || queryAttempted || !allowNetwork || Boolean(existingFoodId)} />
        {querying ? <ActivityIndicator color={foodColors.teal} accessibilityLabel="正在查询国内商品身份" /> : null}
        {result ? <Text style={result.status === 'found' ? foodStyles.notice : foodStyles.warning}>{statusText(result)}</Text> : null}
      </View>
      <View style={foodStyles.card}>
        <Text style={foodStyles.sectionTitle}>商品信息（请对照包装修改）</Text>
        <FoodField label="商品名称" accessibilityLabel="待确认商品名称" value={draft.name} onChangeText={(name) => patch({ name, sourceKind: 'MANUAL', sourceId: 'user-manual', sourceFetchedAt: null })} />
        <FoodField label="品牌" accessibilityLabel="待确认商品品牌" value={draft.brand} onChangeText={(brand) => patch({ brand, sourceKind: 'MANUAL', sourceId: 'user-manual', sourceFetchedAt: null })} />
        <FoodField label="规格" accessibilityLabel="待确认商品规格" value={draft.specification} onChangeText={(specification) => patch({ specification, sourceKind: 'MANUAL', sourceId: 'user-manual', sourceFetchedAt: null })} />
        <FoodField label="类别（可选）" accessibilityLabel="待确认商品类别" value={draft.category} onChangeText={(category) => patch({ category, sourceKind: 'MANUAL', sourceId: 'user-manual', sourceFetchedAt: null })} />
        <FoodField label="生产厂家（可选）" accessibilityLabel="待确认生产厂家" value={draft.manufacturer} onChangeText={(manufacturer) => patch({ manufacturer, sourceKind: 'MANUAL', sourceId: 'user-manual', sourceFetchedAt: null })} />
      </View>
      <View style={foodStyles.card}>
        <Text style={foodStyles.sectionTitle}>下一步</Text>
        <Text style={foodStyles.note}>商品身份和营养标签分开确认。现在确认只锁定商品草稿，营养数值仍必须拍照、OCR 并人工核对。</Text>
        <FoodAction title="确认商品，拍摄营养成分表" primary onPress={openNutrition} disabled={!draft.name.trim()} />
        <FoodAction title="暂存本次身份，返回扫码" onPress={() => { Alert.alert('身份草稿已保留', '本次商品身份只保留在当前 App 会话中；正式保存需要继续完成营养表核对。', [{ text: '返回扫码', onPress: () => router.replace('/barcode') }]); }} />
      </View>
      <FoodAction title="取消并返回扫码" onPress={() => { requestId.current += 1; router.replace('/barcode'); }} />
    </ScrollView>
  </SafeAreaView>;
}
