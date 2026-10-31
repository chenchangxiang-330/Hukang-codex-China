import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { BlurTargetView, BlurView } from "expo-blur";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { C, S, Button } from "./ui";
import { colors } from "../../ui/tokens";
import { useSimpleApp, type AppController, type Tab } from "./useSimpleApp";
import { HomeScreens } from "./HomeScreens";
import { ScanScreen } from "./ScanScreen";
import { CaptureScreens } from "./CaptureScreens";
import { ProductScreens } from "./ProductScreens";
import { AiSettingsScreen } from "../ui-v1/AiSettingsScreen";
import { SupportScreens } from "../ui-v1/SupportScreens";
import {
  TodayScreen,
  DiaryScreenV2,
  NutritionScreen,
  FoodDetail,
  TargetsScreen,
} from "../nutrition-v2/Screens";
import { CaptureScreen, ImpactPreview } from "../nutrition-v2/CaptureScreen";
import {
  productionNutrition,
  foodFromRecord,
  type Entry,
  type Meal,
  type NutritionAdapter,
} from "../nutrition-v2/model";
import { Action, N, useReducedMotion } from "../nutrition-v2/components";
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
type Page =
  | "nutrition-detail"
  | "capture-hub"
  | "food-detail"
  | "targets"
  | "intake"
  | "ai-settings";
/** Only development previews inject a demo adapter. The production entry always uses unavailable nutrition storage. */
export function SimpleAppView({
  controller: p,
  nutritionAdapter = productionNutrition,
}: {
  controller: AppController;
  nutritionAdapter?: NutritionAdapter;
}) {
  const adapter = nutritionAdapter;
  const insets = useSafeAreaInsets();
  const snapshot = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
  const today = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, "0")}-${String(p.date.getDate()).padStart(2, "0")}`;
  const [date, setDate] = useState(today),
    [detailDate, setDetailDate] = useState(today),
    [pages, setPages] = useState<Page[]>([]),
    [food, setFood] = useState<Entry | null>(null),
    [captureMeal, setCaptureMeal] = useState<Meal>("lunch"),
    [keyboard, setKeyboard] = useState(false);
  const page = pages.at(-1),
    activeTab = p.tab === "stock" ? "library" : p.tab;
  const offset = useRef(0),
    returnOffsets = useRef<number[]>([]),
    restore = useRef<number | null>(null),
    content = useRef<View>(null!),
    target = useRef<View>(null);
  const reduced = useReducedMotion(),
    lens = useRef(new Animated.Value(0)).current,
    [dockWidth, setDockWidth] = useState(300);
  const go = (next: Page) => {
    returnOffsets.current.push(offset.current);
    setPages((a) => [...a, next]);
  };
  const close = () => {
    if (p.busy) return true;
    if (page) {
      restore.current = returnOffsets.current.pop() ?? 0;
      setPages((a) => a.slice(0, -1));
      return true;
    }
    return p.back();
  };
  const capture = (meal: Meal = "lunch") => {
    setCaptureMeal(meal);
    setDetailDate(p.tab === "diary" ? date : today);
    go("capture-hub");
  };
  const openNutrition = () => {
    setDetailDate(p.tab === "diary" ? date : today);
    go("nutrition-detail");
  };
  const handoff = (action: () => void) => {
    setPages([]);
    returnOffsets.current = [];
    action();
  };
  const revealFocusedInput = () => {
    if (Platform.OS !== "android" || !Keyboard.isVisible()) return;
    const input = TextInput.State.currentlyFocusedInput();
    const scroll = p.scroll.current;
    if (!input || !scroll || !content.current) return;
    // Use the full input layout in content coordinates. Window measurements
    // can be clipped during IME resize; adding a stale scroll offset races
    // Android's own focus scrolling and can leave later fields obscured.
    input.measureLayout(
      content.current,
      (_x, inputTop, _width, inputHeight) => {
        scroll
          .getNativeScrollRef()
          ?.measureInWindow((_sx, top, _sw, height) => {
            if (
              !Keyboard.isVisible() ||
              TextInput.State.currentlyFocusedInput() !== input
            )
              return;
            const bottom =
              Math.min(
                top + height,
                Keyboard.metrics()?.screenY ?? top + height,
              ) - 16;
            scroll.scrollTo({
              y: Math.max(0, inputTop + inputHeight - (bottom - top)),
              animated: false,
            });
          });
      },
    );
  };
  useEffect(() => {
    p.scroll.current?.scrollTo({ y: restore.current ?? 0, animated: false });
    restore.current = null;
  }, [p.tab, p.screen, page, p.scroll]);
  useEffect(() => {
    if (!page) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", close);
    return () => sub.remove();
  }, [page, p.busy]);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => {
        setKeyboard(true);
        requestAnimationFrame(revealFocusedInput);
      }),
      b = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  useEffect(() => {
    const animation = Animated.timing(lens, {
      toValue:
        (tabs.findIndex((t) => t.key === activeTab) * (dockWidth - 12)) / 4,
      duration: reduced ? 0 : 280,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [activeTab, dockWidth, reduced, lens]);
  const title =
    page === "nutrition-detail"
      ? "营养详情"
      : page === "capture-hub"
        ? "拍一拍"
        : page === "food-detail"
          ? "食用份量"
          : page === "targets"
            ? "个人目标"
            : page === "intake"
              ? "拟食用预览"
              : p.screen === "ai-settings" || page === "ai-settings"
                ? "AI 服务设置"
                : p.screen === "profile"
                  ? "本机用户"
                  : p.screen === "about"
                    ? "关于护康"
                    : p.stepTitle;
  const detail = page === "nutrition-detail",
    showDock = p.screen === "home" && !page && !keyboard;
  const resume = p.resume ? (
    <Button
      title="继续上次未完成的录入"
      secondary
      onPress={() => {
        p.draftRef.current = p.resume;
        p.setDraft(p.resume);
        p.setReview(p.resume!.review ?? null);
        p.setConfirmed(false);
        p.navigate(p.resume!.step);
      }}
    />
  ) : undefined;
  const currentFood = food
    ? (snapshot.entries.find((e) => e.id === food.id) ?? food)
    : null;
  return (
    <SafeAreaView
      style={[S.safe, detail && { backgroundColor: colors.detailBackground }]}
      edges={["top", "bottom"]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={nav.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? insets.top : 0}
      >
        <View
          style={nav.flex}
          importantForAccessibility={p.busy ? "no-hide-descendants" : "auto"}
        >
          {(p.screen !== "home" || page) && (
            <View
              style={[
                nav.header,
                detail && { backgroundColor: colors.detailBackground },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="返回"
                onPress={close}
                disabled={!!p.busy}
                style={({ pressed }) => [
                  nav.back,
                  pressed && { opacity: 0.65 },
                ]}
              >
                <Text style={nav.backText}>‹ 返回</Text>
              </Pressable>
              <Text style={nav.headerTitle}>护康 › {title}</Text>
            </View>
          )}
          <BlurTargetView ref={target} style={nav.flex}>
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image
                source={require("../../../assets/paper-grain.png")}
                resizeMode="repeat"
                style={[
                  StyleSheet.absoluteFill,
                  { opacity: 0.35, width: "100%", height: "100%" },
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            </View>
            <ScrollView
              ref={p.scroll}
              {...(Platform.OS === "android" ? { innerViewRef: content } : {})}
              onLayout={revealFocusedInput}
              onFocus={revealFocusedInput}
              onScroll={(e) => {
                offset.current = e.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={100}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={[
                S.page,
                nav.content,
                { paddingBottom: showDock ? 190 : 32 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {adapter.kind === "demo" && (
                <View style={nav.demo}>
                  <Text style={N.tiny}>演示数据 · 仅在本次开发预览内存中</Text>
                </View>
              )}
              {p.error && (
                <View accessibilityLiveRegion="assertive" style={S.error}>
                  <Text style={nav.errorTitle}>这一步没有完成</Text>
                  <Text style={nav.errorText}>{p.error}</Text>
                </View>
              )}
              {p.notice && (
                <View accessibilityLiveRegion="polite" style={S.notice}>
                  <Text style={S.note}>{p.notice}</Text>
                </View>
              )}
              {!page && (
                <>
                  <HomeScreens {...p} startScan={async () => capture()} />
                  <ScanScreen {...p} />
                  <CaptureScreens {...p} />
                  <ProductScreens
                    {...p}
                    onIntake={() => {
                      setDetailDate(p.tab === "diary" ? date : today);
                      go("intake");
                    }}
                  />
                  {p.screen === "home" && p.tab === "today" && (
                    <TodayScreen
                      snapshot={snapshot}
                      date={today}
                      onNutrition={openNutrition}
                      onCapture={() => capture()}
                      onDiary={() => p.setTab("diary")}
                      onTargets={() => go("targets")}
                      resume={resume}
                    />
                  )}{" "}
                  {p.screen === "home" && p.tab === "diary" && (
                    <DiaryScreenV2
                      snapshot={snapshot}
                      date={date}
                      onDate={setDate}
                      onNutrition={openNutrition}
                      onCapture={capture}
                      onFood={(e) => {
                        setFood(e);
                        go("food-detail");
                      }}
                      onTargets={() => go("targets")}
                    />
                  )}{" "}
                  {p.screen === "ai-settings" && <AiSettingsScreen />}
                  {(p.screen === "profile" || p.screen === "about") && (
                    <SupportScreens screen={p.screen} />
                  )}
                </>
              )}
              {page === "ai-settings" && <AiSettingsScreen />}
              {page === "nutrition-detail" && (
                <NutritionScreen
                  snapshot={snapshot}
                  date={detailDate}
                  onTargets={() => go("targets")}
                  onFiberScroll={(y) =>
                    p.scroll.current?.scrollTo({ y, animated: !reduced })
                  }
                />
              )}
              {page === "food-detail" && currentFood && (
                <FoodDetail
                  entry={currentFood}
                  adapter={adapter}
                  onClose={close}
                />
              )}{" "}
              {page === "targets" && (
                <TargetsScreen adapter={adapter} targets={snapshot.targets} />
              )}
              {page === "intake" && p.product && (
                <ImpactPreview
                  key={p.product.id + p.product.updatedAt}
                  food={foodFromRecord(p.product, p.cover ?? undefined)}
                  snapshot={snapshot}
                  date={detailDate}
                  meal="lunch"
                  adapter={adapter}
                  onStock={() => handoff(p.showStock)}
                />
              )}
              <CaptureScreen
                visible={page === "capture-hub"}
                date={detailDate}
                meal={captureMeal}
                snapshot={snapshot}
                adapter={adapter}
                onAiSettings={() => go("ai-settings")}
                onScan={() => handoff(() => void p.startScan())}
                onLibrary={() =>
                  handoff(() => {
                    p.setTab("library");
                    p.navigate("home");
                  })
                }
              />
            </ScrollView>
          </BlurTargetView>
          {showDock && (p.tab === "today" || p.tab === "diary") && (
            <View style={nav.captureFloat}>
              <Action title="拍一拍" onPress={() => capture()} />
            </View>
          )}
          {showDock && (
            <View style={nav.dockShadow} accessibilityLabel="主导航">
              <BlurView
                blurTarget={target}
                blurMethod="dimezisBlurViewSdk31Plus"
                intensity={42}
                tint="light"
                style={nav.dock}
                onLayout={(e) => setDockWidth(e.nativeEvent.layout.width)}
              >
                <View pointerEvents="none" style={nav.glassHighlight} />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    nav.lens,
                    {
                      width: (dockWidth - 12) / 4,
                      transform: [{ translateX: lens }],
                    },
                  ]}
                />
                {tabs.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: activeTab === item.key }}
                    aria-selected={activeTab === item.key}
                    onPress={() => {
                      p.setTab(item.key);
                      p.setError(null);
                      p.setNotice(null);
                    }}
                    style={({ pressed }) => [
                      nav.tab,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <TabMark
                      kind={item.key}
                      selected={activeTab === item.key}
                    />
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
              </BlurView>
            </View>
          )}
        </View>
        {!!p.busy && (
          <View
            style={S.busy}
            accessibilityViewIsModal
            accessibilityLiveRegion="polite"
          >
            <ActivityIndicator color={C.teal} size="large" />
            <Text accessibilityRole="header" style={S.rowTitle}>
              {p.busy}
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
  captureFloat: {
    position: "absolute",
    left: 52,
    right: 52,
    bottom: 100,
    shadowColor: "#6388A3",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  demo: { backgroundColor: "#EAF4FB", padding: 8, borderRadius: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: C.bg,
  },
  headerTitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 20,
    color: C.muted,
    textAlign: "right",
  },
  back: {
    minWidth: 94,
    minHeight: 50,
    borderRadius: 16,
    paddingHorizontal: 16,
    backgroundColor: C.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  dockShadow: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 12,
    maxWidth: 640,
    alignSelf: "center",
    borderRadius: 38,
    shadowColor: "#456986",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  dock: {
    flexDirection: "row",
    padding: 6,
    minHeight: 74,
    borderRadius: 38,
    overflow: "hidden",
    backgroundColor: "rgba(255,254,250,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
  },
  glassHighlight: {
    position: "absolute",
    top: 0,
    left: 20,
    right: 20,
    height: 1,
    backgroundColor: "#FFFFFF",
  },
  lens: {
    position: "absolute",
    top: 6,
    bottom: 6,
    left: 5,
    borderRadius: 30,
    backgroundColor: "rgba(189,222,242,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
  },
  tab: {
    flex: 1,
    minHeight: 60,
    paddingVertical: 6,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 17,
    color: C.muted,
    textAlign: "center",
  },
  tabLabelActive: { color: C.teal, fontWeight: "600" },
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
