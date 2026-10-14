import { ActivityIndicator, Pressable, Text, View, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { C, S } from './ui';
import { useSimpleApp } from './useSimpleApp';
import { HomeScreens } from './HomeScreens';
import { ScanScreen } from './ScanScreen';
import { CaptureScreens } from './CaptureScreens';
import { ProductScreens } from './ProductScreens';
export default function SimpleApp() {
  const p = useSimpleApp();
  const { tab, setTab, screen, busy, error, setError, notice, setNotice, scroll, back, stepTitle } = p;
  return <SafeAreaView style={S.safe} edges={['top', 'bottom']}>
    <Stack.Screen options={{ headerShown: false }} /><StatusBar style="dark" />
    {screen !== 'home' && <View style={S.header}><Pressable accessibilityLabel="返回首页" onPress={back} disabled={!!busy} style={S.back}><Text style={{ fontSize: 30, color: C.ink }}>‹</Text></Pressable><Text style={S.headerTitle}>{stepTitle}</Text><View style={{ width: 44 }} /></View>}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={S.page}>
      {error && <View accessibilityLiveRegion="assertive" style={S.error}><Text style={{ color: C.red, lineHeight: 23 }}>{error}</Text></View>}
      {notice && <View accessibilityLiveRegion="polite" style={S.notice}><Text style={S.note}>{notice}</Text></View>}
      <HomeScreens {...p} /><ScanScreen {...p} /><CaptureScreens {...p} /><ProductScreens {...p} />
    </ScrollView>
    {screen === 'home' && <View style={S.dock}>{([['today', '今日'], ['stock', '库存'], ['mine', '我的']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => { setTab(key); setError(null); setNotice(null); }} style={S.dockItem}><Text style={[S.dockText, tab === key && { color: C.teal, fontWeight: '800' }]}>{label}</Text>{tab === key && <View style={S.dot} />}</Pressable>)}</View>}
    {!!busy && <View style={S.busy} accessibilityLiveRegion="polite"><ActivityIndicator color={C.teal} /><Text style={S.rowTitle}>{busy}</Text><Text style={S.note}>请稍候，不需要网络</Text></View>}
  </SafeAreaView>;
}
