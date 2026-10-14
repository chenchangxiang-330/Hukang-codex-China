import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FoodSummary } from '../../domain/food/scan';
import { chinaFoodRepository } from '../../infrastructure/food/SQLiteChinaFoodRepository';
import { FoodAction, FoodField, foodColors, foodError, foodStyles } from './ui';

export default function FoodListScreen() {
  const router = useRouter();
  const { saved } = useLocalSearchParams<{ saved?: string }>();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly FoodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void chinaFoodRepository.listFoods(query).then((records) => {
      if (active) setItems(records);
    }).catch((cause: unknown) => {
      if (active) setError(foodError(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [query, reload]));

  return <SafeAreaView style={foodStyles.safe} edges={['bottom']}>
    <Stack.Screen options={{ title: '本地食品', headerShadowVisible: false }} />
    <ScrollView contentContainerStyle={foodStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={foodStyles.title}>本地食品</Text>
      <Text style={foodStyles.note}>食品记录和包装照片保存在本机。待确认记录也会保留，重新打开 App 后可继续核对。</Text>
      {saved ? <View style={foodStyles.notice}><Text style={foodStyles.text}>食品记录已保存到本机。</Text></View> : null}
      <View style={foodStyles.card}>
        <FoodField label="按商品名或品牌查询" accessibilityLabel="搜索本地食品" value={query} onChangeText={setQuery} />
        <View style={foodStyles.row}>
          <FoodAction title="返回 OCR Lab" onPress={() => router.replace('/')} />
          <FoodAction title="刷新本地食品" onPress={() => setReload((value) => value + 1)} disabled={loading} />
        </View>
      </View>
      {error ? <View style={foodStyles.error}><Text style={foodStyles.errorText}>读取本地食品失败：{error}</Text></View> : null}
      {loading ? <ActivityIndicator color={foodColors.teal} accessibilityLabel="正在查询本地食品" /> : null}
      {!loading && !error && items.length === 0 ? <View style={foodStyles.card}>
        <Text style={foodStyles.text}>{query.trim() ? '没有匹配的本地食品。' : '还没有保存食品记录。'}</Text>
        <Text style={foodStyles.note}>在 OCR Lab 识别食品营养标签后进入人工核对，再保存到这里。</Text>
      </View> : null}
      {items.map((item) => <Pressable key={item.id} accessibilityRole="button"
        accessibilityLabel={`食品记录-${item.id}`}
        onPress={() => router.push({ pathname: '/food-review', params: { foodId: item.id } })}
        style={({ pressed }) => [foodStyles.card, pressed && foodStyles.pressed]}>
        <Text style={foodStyles.sectionTitle}>{item.name || '未命名食品'}</Text>
        {item.brand ? <Text style={foodStyles.text}>{item.brand}</Text> : null}
        <Text style={item.status === 'confirmed' ? foodStyles.note : foodStyles.warning}>
          {item.status === 'confirmed' ? '已人工确认' : '待确认'} · {new Date(item.updatedAt).toLocaleString('zh-CN')}
        </Text>
        <Text style={foodStyles.note}>点按查看原图、继续核对或编辑记录</Text>
      </Pressable>)}
    </ScrollView>
  </SafeAreaView>;
}
