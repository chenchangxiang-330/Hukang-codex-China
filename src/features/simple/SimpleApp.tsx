import { useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { C, S } from "./ui";
import { useSimpleApp, type AppController, type Tab } from "./useSimpleApp";
import { HomeScreens } from "./HomeScreens";
import { ScanScreen } from "./ScanScreen";
import { CaptureScreens } from "./CaptureScreens";
import { ProductScreens } from "./ProductScreens";
import { DiaryScreen } from "../ui-v1/DiaryScreen";
import { AiSettingsScreen } from "../ui-v1/AiSettingsScreen";
import { SupportScreens } from "../ui-v1/SupportScreens";

const tabs = [
  { key: "today", label: "今日" },
  { key: "diary", label: "记录" },
  { key: "library", label: "食品库" },
  { key: "mine", label: "我的" },
] as const;

/** Native shapes avoid adding a font or network-backed icon dependency. */
function TabMark({ kind, selected }: { kind: Tab; selected: boolean }) {
  const color = selected ? C.teal : C.muted;
  if (kind === "mine")
    return (
      <View accessible={false} style={nav.glyph}>
        <View style={[nav.head, { borderColor: color }]} />
        <View style={[nav.shoulders, { borderColor: color }]} />
      </View>
    );
  if (kind === "library")
    return (
      <View accessible={false} style={[nav.glyph, nav.grid]}>
        {[0, 1, 2, 3].map((n) => (
          <View key={n} style={[nav.square, { borderColor: color }]} />
        ))}
      </View>
    );
  if (kind === "diary")
    return (
      <View accessible={false} style={[nav.book, { borderColor: color }]}>
        <View style={[nav.rule, { backgroundColor: color }]} />
        <View style={[nav.rule, { backgroundColor: color }]} />
      </View>
    );
  return (
    <View accessible={false} style={[nav.today, { borderColor: color }]}>
      <View style={[nav.todayDot, { backgroundColor: color }]} />
    </View>
  );
}

export default function SimpleApp() {
  return <SimpleAppView controller={useSimpleApp()} />;
}

/** The production view is also exercised by the isolated, labelled UI preview. */
export function SimpleAppView({
  controller: p,
}: {
  controller: AppController;
}) {
  const {
    tab,
    setTab,
    screen,
    busy,
    error,
    setError,
    notice,
    setNotice,
    scroll,
    back,
    stepTitle,
  } = p;
  const activeTab = tab === "stock" ? "library" : tab;
  const title =
    screen === "ai-settings"
      ? "AI 服务设置"
      : screen === "about"
        ? "关于护康"
        : screen === "profile"
          ? "本机用户"
          : stepTitle;
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [tab, screen, scroll]);

  return (
    <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={nav.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={nav.flex}
          importantForAccessibility={busy ? "no-hide-descendants" : "auto"}
        >
          {screen !== "home" && (
            <View style={nav.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="返回首页"
                onPress={back}
                disabled={!!busy}
                style={({ pressed }) => [nav.back, pressed && nav.pressed]}
              >
                <Text style={nav.backText}>‹</Text>
              </Pressable>
              <Text accessibilityRole="header" style={nav.headerTitle}>
                {title}
              </Text>
              <View style={nav.headerBalance} />
            </View>
          )}
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={[S.page, nav.content]}
            showsVerticalScrollIndicator={false}
          >
            {error && (
              <View accessibilityLiveRegion="assertive" style={S.error}>
                <Text style={nav.errorTitle}>这一步没有完成</Text>
                <Text style={nav.errorText}>{error}</Text>
                <Text style={nav.errorText}>
                  可以检查后重试，或返回继续其他操作。
                </Text>
              </View>
            )}
            {notice && (
              <View accessibilityLiveRegion="polite" style={S.notice}>
                <Text style={S.note}>{notice}</Text>
              </View>
            )}
            <HomeScreens {...p} />
            <ScanScreen {...p} />
            <CaptureScreens {...p} />
            <ProductScreens {...p} />
            {screen === "home" && tab === "diary" && (
              <DiaryScreen onOpenAi={() => p.navigate("ai-settings")} />
            )}
            {screen === "ai-settings" && <AiSettingsScreen />}
            {(screen === "profile" || screen === "about") && (
              <SupportScreens screen={screen} />
            )}
          </ScrollView>
          {screen === "home" && (
            <View style={nav.dock} accessibilityLabel="主导航">
              {tabs.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: activeTab === item.key }}
                  onPress={() => {
                    setTab(item.key);
                    setError(null);
                    setNotice(null);
                  }}
                  style={({ pressed }) => [nav.tab, pressed && nav.pressed]}
                >
                  <View
                    style={[
                      nav.tabMark,
                      activeTab === item.key && nav.tabMarkActive,
                    ]}
                  >
                    <TabMark
                      kind={item.key}
                      selected={activeTab === item.key}
                    />
                  </View>
                  <Text
                    style={[
                      nav.tabLabel,
                      activeTab === item.key && nav.tabLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        {!!busy && (
          <View
            style={S.busy}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={C.teal} size="large" />
            <Text accessibilityRole="header" style={S.rowTitle}>
              {busy}
            </Text>
            <Text style={S.note}>正在本机处理，请稍候</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const nav = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: C.bg,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: C.ink,
    textAlign: "center",
    paddingVertical: 8,
  },
  headerBalance: { width: 48 },
  back: {
    width: 48,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 32, lineHeight: 38, color: C.ink },
  pressed: { backgroundColor: C.pale },
  dock: {
    flexDirection: "row",
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.white,
  },
  tab: {
    flex: 1,
    minHeight: 64,
    borderRadius: 14,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabMark: {
    width: 52,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  tabMarkActive: { backgroundColor: C.pale },
  tabLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: C.muted,
    textAlign: "center",
  },
  tabLabelActive: { color: C.teal, fontWeight: "700" },
  glyph: { width: 21, height: 21, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 3 },
  square: { width: 9, height: 9, borderRadius: 2, borderWidth: 1.6 },
  head: { width: 9, height: 9, borderWidth: 1.7, borderRadius: 5 },
  shoulders: {
    width: 19,
    height: 9,
    marginTop: 3,
    borderWidth: 1.7,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  book: {
    width: 18,
    height: 21,
    borderWidth: 1.6,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingTop: 5,
    gap: 4,
  },
  rule: { height: 1.6, borderRadius: 1 },
  today: {
    width: 21,
    height: 21,
    borderWidth: 1.6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  todayDot: { width: 7, height: 7, borderRadius: 4 },
  errorTitle: { fontSize: 16, fontWeight: "600", color: C.red, lineHeight: 24 },
  errorText: { color: C.red, fontSize: 14, lineHeight: 22 },
});
