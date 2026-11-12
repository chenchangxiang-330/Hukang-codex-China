import { policyFor } from "../../services/nutrition/profile";
import { NutrientProgress, policyLabel } from "./NutrientProgress";
import { FoodEditor } from "./FoodEditor";
import { useState, useRef, useEffect } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { colors as c } from "../../ui/tokens";
import { Surface } from "../../ui/components";
import { Field, Choices } from "../simple/ui";
import { shiftDateKey } from "../ui-v1/contracts";
import {
  Action,
  Accordion,
  Card,
  Feedback,
  FoodArt,
  Link,
  N,
  NutrientLine,
  Progress,
  TargetProgress,
} from "./components";
import {
  contribution,
  findings,
  formatNumber,
  formatTotal,
  meals,
  nutrientInfo,
  parsePortion,
  reliability,
  total,
  targetProgress,
  type Entry,
  type Meal,
  type Nutrient,
  type NutritionAdapter,
  type Snapshot,
  type Targets,
} from "./model";
export function dateLabel(date: string) {
  const [y, m, d] = date.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}
export function TodayScreen({
  snapshot: s,
  date,
  onNutrition,
  onCapture,
  onDiary,
  onFood,
  resume,
}: {
  snapshot: Snapshot;
  date: string;
  onNutrition: () => void;
  onCapture: () => void;
  onDiary: () => void;
  onTargets: () => void;
  onFood: (e: Entry) => void;
  resume?: React.ReactNode;
}) {
  const entries = s.entries
    .filter((e) => e.date === date)
    .sort(
      (a, b) =>
        (a.consumedTime ?? "").localeCompare(b.consumedTime ?? "") ||
        (a.confirmedAt ?? a.id).localeCompare(b.confirmedAt ?? b.id),
    );
  const groups = [
    ["上午", entries.filter((e) => e.consumedTime && e.consumedTime < "12:00")],
    [
      "下午",
      entries.filter((e) => e.consumedTime && e.consumedTime >= "12:00"),
    ],
    ["时间未记录", entries.filter((e) => !e.consumedTime)],
  ] as const;
  const { width, fontScale } = useWindowDimensions();
  const metrics = ["protein", "carbohydrate", "fat", "fiber"] as const;
  const metricColors = {
    protein: c.protein,
    carbohydrate: c.carbohydrate,
    fat: c.fat,
    fiber: c.fiber,
  };
  const largeText = fontScale > 1.25;
  return (
    <>
      <View style={{ gap: 12 }}>
        <View style={V.brandRow}>
          <Text style={V.brand}>护康</Text>
          <Text style={N.caption}>{dateLabel(date).replace(/^\d+年/, "")}</Text>
        </View>
        <View style={V.greeting}>
          <Text accessibilityRole="header" style={V.greetingTitle}>
            好好吃饭。
          </Text>
          <Text style={N.caption}>慢慢生活。</Text>
        </View>
        <Surface style={V.tableCard}>
          <View
            testID="daily-table-photo"
            style={[
              V.tablePhoto,
              { width: largeText || width < 360 ? "29%" : "36%" },
            ]}
          >
            <Image
              source={require("../../../assets/warm-table-breakfast.png")}
              style={[
                StyleSheet.absoluteFill,
                { width: "100%", height: "100%" },
              ]}
              resizeMode="cover"
              accessible={false}
            />
            <View style={V.photoCaption} pointerEvents="none">
              <Text style={V.photoCaptionTitle}>日常食光</Text>
              <Text style={V.photoCaptionText}>生活配图</Text>
            </View>
          </View>
          <View testID="daily-table-nutrition" style={V.tableNutrition}>
            <NutrientProgress
              compact
              energyHero
              title="今日卡路里"
              color={c.energy}
              total={total(s.entries, date, "energy")}
              policy={policyFor(s.targets, "energy")}
            />
            <View style={V.divider} />
            {metrics.map((k) => (
              <NutrientProgress
                compact
                key={k}
                title={nutrientInfo[k][0]}
                color={metricColors[k]}
                total={total(s.entries, date, k)}
                policy={policyFor(s.targets, k)}
                showTargetHint={false}
              />
            ))}
          </View>
        </Surface>
        <View style={V.summaryFooter}>
          <Text style={[N.caption, { flex: 1 }]}>把每一餐，过得有滋味。</Text>
          <Link title="查看完整营养" onPress={onNutrition} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="拍一拍"
          onPress={onCapture}
          style={({ pressed }) => [
            V.captureAction,
            pressed && { opacity: 0.8 },
          ]}
        >
          <View style={V.captureIcon}>
            <Text style={V.captureIconText}>＋</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={V.captureTitle}>记录这一餐</Text>
            <Text style={V.captureHint}>拍餐食 · 营养表 · 扫码</Text>
          </View>
          <Text style={V.captureArrow}>→</Text>
        </Pressable>
      </View>
      {s.status === "error" && (
        <Feedback>{s.message || "读取失败，请重试。"}</Feedback>
      )}
      <View style={V.sectionRow}>
        <Text style={N.heading}>饮食日记</Text>
        <Link title="查看全部记录" onPress={onDiary} />
      </View>
      {!entries.length && (
        <Text style={N.caption}>今天还没有记录，确认食用后会出现在这里。</Text>
      )}
      {groups
        .filter(([, items]) => items.length)
        .map(([label, items]) => (
          <View key={label} style={{ gap: 8 }}>
            <Text style={N.caption}>{label}</Text>
            {items.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={`查看食物 ${e.food.name}`}
                onPress={() => onFood(e)}
              >
                <FoodRow entry={e} cover={s.covers?.[e.food.id]?.cover} />
              </Pressable>
            ))}
          </View>
        ))}
      {resume}
    </>
  );
}
export function FoodRow({
  entry: e,
  cover,
}: {
  entry: Entry;
  cover?: string | undefined;
}) {
  const energy = contribution(e, "energy");
  return (
    <View style={V.foodRow}>
      <FoodArt name={e.food.name} image={cover || e.food.image} />
      <View style={N.grow}>
        <Text style={N.body}>{e.food.name}</Text>
        <Text style={N.caption}>
          {e.consumedTime ? `${e.consumedTime} · ` : ""}
          {meals[e.meal]} · {e.amount}
          {e.unit}
        </Text>
      </View>
      <Text style={[N.caption, { maxWidth: "38%", textAlign: "right" }]}>
        {energy.estimated ? "约 " : ""}
        {formatTotal(energy)} kcal{energy.missing ? " · 未知" : ""} ›
      </Text>
    </View>
  );
}
export function DiaryScreenV2({
  snapshot: s,
  date,
  onDate,
  onNutrition,
  onCapture,
  onFood,
}: {
  snapshot: Snapshot;
  date: string;
  onDate: (s: string) => void;
  onNutrition: () => void;
  onCapture: (m?: Meal) => void;
  onFood: (e: Entry) => void;
  onTargets: () => void;
}) {
  const entries = s.entries.filter((e) => e.date === date),
    energy = total(s.entries, date, "energy");
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        饮食记录
      </Text>
      <View style={[V.sectionRow, { flexWrap: "wrap" }]}>
        <Link
          title="‹ 前一天"
          chevron={false}
          onPress={() => onDate(shiftDateKey(date, -1))}
        />
        <Text style={N.caption}>{date.slice(0, 7)}</Text>
        <Link
          title="后一天 ›"
          chevron={false}
          onPress={() => onDate(shiftDateKey(date, 1))}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        accessibilityLabel="横向日期选择"
        accessibilityRole="radiogroup"
      >
        {Array.from({ length: 7 }, (_, i) => shiftDateKey(date, i - 3)).map(
          (day) => (
            <Pressable
              key={day}
              accessibilityRole="radio"
              accessibilityLabel={day}
              accessibilityState={{ checked: day === date }}
              aria-checked={day === date}
              onPress={() => onDate(day)}
              style={[V.dateCell, day === date && V.dateActive]}
            >
              <Text style={[N.caption, day === date && { color: c.onSky }]}>
                {
                  ["日", "一", "二", "三", "四", "五", "六"][
                    new Date(day + "T12:00:00").getDay()
                  ]
                }
              </Text>
              <Text style={N.heading}>{Number(day.slice(-2))}</Text>
            </Pressable>
          ),
        )}
      </ScrollView>
      <Text style={N.caption}>{dateLabel(date)}</Text>
      <View style={[V.sectionRow, { flexWrap: "wrap" }]}>
        <Text style={N.heading}>
          {energy.estimated ? "约 " : ""}
          {formatTotal(energy)} kcal{energy.missing ? " · 已知小计" : ""}
        </Text>
        <Link title="今日营养摘要" onPress={onNutrition} />
      </View>
      <Action title="拍一拍" onPress={() => onCapture()} />
      {!entries.length && <Text style={N.caption}>所选日期尚未记录餐食。</Text>}
      {(Object.entries(meals) as [Meal, string][]).map(([key, label]) => (
        <View key={key} style={{ gap: 4 }}>
          <View style={V.sectionRow}>
            <Text style={N.heading}>{label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`添加${label}`}
              onPress={() => onCapture(key)}
              style={[V.add, { minWidth: 72, width: undefined }]}
            >
              <Text style={N.linkText}>＋ 添加</Text>
            </Pressable>
          </View>
          {entries
            .filter((e) => e.meal === key)
            .map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={`查看食物 ${e.food.name}`}
                onPress={() => onFood(e)}
              >
                <FoodRow entry={e} />
              </Pressable>
            ))}
        </View>
      ))}
    </>
  );
}
export function NutritionScreen({
  snapshot: s,
  date,
  expanded,
  onToggleMetric,
}: {
  snapshot: Snapshot;
  date: string;
  expanded?: string[];
  onToggleMetric?: (key: string) => void;
  onTargets: () => void;
  onFiberScroll: (y: number) => void;
}) {
  const [localOpened, setOpened] = useState<string[]>([]);
  const opened = expanded ?? localOpened;
  const toggle =
    onToggleMetric ??
    ((k: string) =>
      setOpened((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k])));
  const metric = (k: Nutrient) => {
    const t = total(s.entries, date, k),
      p = policyFor(s.targets, k);
    return (
      <Accordion
        key={k}
        title={nutrientInfo[k][0]}
        value={
          t.count && (t.value !== null || t.range)
            ? `${t.estimated ? "约 " : ""}${formatTotal(t)} ${t.unit}${t.missing ? " · 小计" : ""}`
            : "—"
        }
        open={opened.includes(k)}
        onToggle={() => toggle(k)}
        summary={
          <NutrientProgress
            title={nutrientInfo[k][0]}
            total={t}
            policy={p}
            compact
            barOnly
          />
        }
      >
        {s.entries
          .filter((e) => e.date === date)
          .map((e) => (
            <NutrientLine
              key={e.id}
              title={`${e.food.name} · ${meals[e.meal]}`}
              total={contribution(e, k)}
            />
          ))}
      </Accordion>
    );
  };
  const minerals: Nutrient[] = [
    "sodium",
    "potassium",
    "calcium",
    "magnesium",
    "iron",
    "zinc",
  ];
  const vitamins = (Object.keys(nutrientInfo) as Nutrient[]).filter((k) =>
    k.startsWith("vitamin_"),
  );
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        营养详情
      </Text>
      <Text style={N.caption}>{dateLabel(date)}</Text>
      {(
        ["energy", "protein", "carbohydrate", "fat", "fiber"] as Nutrient[]
      ).map(metric)}
      <Accordion
        title="糖与脂肪成分"
        value="展开"
        open={opened.includes("components")}
        onToggle={() => toggle("components")}
      >
        {(
          [
            "total_sugars",
            "added_sugars",
            "saturated_fat",
            "trans_fat",
            "monounsaturated_fat",
            "polyunsaturated_fat",
          ] as Nutrient[]
        ).map(metric)}
      </Accordion>
      <Accordion
        title="矿物质"
        value="展开"
        open={opened.includes("minerals")}
        onToggle={() => toggle("minerals")}
      >
        {minerals.map(metric)}
      </Accordion>
      <Accordion
        title="维生素"
        value="展开"
        open={opened.includes("vitamins")}
        onToggle={() => toggle("vitamins")}
      >
        {vitamins.map(metric)}
      </Accordion>
    </>
  );
}
export function FoodDetail({
  entry: e,
  adapter,
  onClose,
}: {
  entry: Entry;
  adapter: NutritionAdapter;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(e.amount));
  const [food, setFood] = useState(e.food);
  const [day, setDay] = useState(e.date);
  const [time, setTime] = useState(e.consumedTime ?? "");
  const [meal, setMeal] = useState(e.meal);
  const [feedback, setFeedback] = useState("");
  const [feedbackAt, setFeedbackAt] = useState<
    "portion" | "details" | "delete"
  >("portion");
  useEffect(() => setFeedback(""), [amount, food, day, meal]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lock = useRef(false);
  const run = async (remove: boolean, at: typeof feedbackAt = "portion") => {
    if (lock.current) return;
    lock.current = true;
    setFeedback("");
    setFeedbackAt(at);
    setBusy(true);
    try {
      const {
        consumedTime: _oldTime,
        timezone: _oldTimezone,
        ...entryWithoutTime
      } = e;
      if (remove) {
        if (!adapter.deleteEntry) throw Error("当前演示不支持删除。");
        await adapter.deleteEntry(e.id);
        onClose();
      } else {
        if (adapter.updateEntry)
          await adapter.updateEntry({
            ...entryWithoutTime,
            food,
            date: day,
            ...(time
              ? {
                  consumedTime: time,
                  timezone:
                    e.timezone ??
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                }
              : {}),
            meal,
            amount: parsePortion(amount),
          });
        else await adapter.updatePortion(e.id, parsePortion(amount));
        setFeedback(
          adapter.kind === "production"
            ? "饮食记录已更新。"
            : "演示份量已更新，首页、记录与营养详情已同步；未写入真实记录。",
        );
      }
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const [details, setDetails] = useState(false),
    [editing, setEditing] = useState(false);
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        {e.food.name}
      </Text>
      <Text style={N.caption}>
        {dateLabel(e.date)} · {meals[e.meal]} ·{" "}
        {e.food.provenance?.kind === "ai" ? "AI 估算" : "已保存"}
      </Text>
      <View pointerEvents={busy ? "none" : "auto"} style={{ gap: 14 }}>
        <Field
          label={`修改实际食用份量（${e.unit}）`}
          value={amount}
          onChange={setAmount}
          numeric
        />
        <View style={N.wrap}>
          {[0.5, 1, 1.5].map((n) => (
            <Action
              key={n}
              title={`${n} 倍份量`}
              secondary
              onPress={() => setAmount(formatNumber(e.amount * n, 3))}
            />
          ))}
        </View>
        {feedback && feedbackAt === "portion" && (
          <Feedback>{feedback}</Feedback>
        )}
        <Action
          title={busy ? "正在保存…" : "确认调整份量"}
          disabled={busy}
          onPress={() => void run(false)}
        />
        <Accordion
          title="修改名称、营养与日期"
          value="编辑"
          open={editing}
          onToggle={() => setEditing(!editing)}
        >
          <FoodEditor food={food} onChange={setFood} />
          <Field
            label="修改记录日期（YYYY-MM-DD）"
            value={day}
            onChange={setDay}
          />
          <Field
            label="修改食用时间（HH:mm）"
            value={time}
            onChange={setTime}
          />
          <Choices
            options={Object.entries(meals)}
            value={meal}
            onChange={(v) => setMeal(v as Meal)}
            accessibilityPrefix="修改餐次"
          />
          {feedback && feedbackAt === "details" && (
            <Feedback>{feedback}</Feedback>
          )}
          <Action
            title="保存记录修改"
            disabled={busy}
            onPress={() => void run(false, "details")}
          />
        </Accordion>
        <Accordion
          title="营养与来源"
          value={`${formatTotal(contribution(e, "energy"))} kcal`}
          open={details}
          onToggle={() => setDetails(!details)}
        >
          <Text style={N.caption}>
            {e.food.source} · 每 {e.food.basis.amount}
            {e.food.basis.unit}
          </Text>
          <Text style={N.caption}>
            以下为本次实际食用的快照；确认保存不代表营养已验证。
          </Text>
          {e.food.provenance?.uncertainties?.map((u, i) => (
            <Text key={i} style={N.caption}>
              {u}
            </Text>
          ))}
          {(Object.keys(nutrientInfo) as Nutrient[])
            .filter(
              (k) =>
                ["energy", "protein", "carbohydrate", "fat"].includes(k) ||
                e.food.nutrients[k],
            )
            .map((k) => (
              <View key={k}>
                <NutrientLine
                  title={nutrientInfo[k][0]}
                  total={contribution(e, k)}
                />
                <Text style={N.caption}>
                  {e.food.nutrients[k]?.source ?? "未知"}
                </Text>
              </View>
            ))}
        </Accordion>
        {adapter.deleteEntry && (
          <Link title="删除这条饮食记录" onPress={() => setDeleting(true)} />
        )}
        {deleting && (
          <Card>
            <Text style={N.body}>
              删除「{e.food.name}」这一次食用？营养汇总会更新，库存不变。
            </Text>
            {feedback && feedbackAt === "delete" && (
              <Feedback>{feedback}</Feedback>
            )}
            <Action
              title="确定删除这次食用"
              onPress={() => void run(true, "delete")}
            />
            <Action
              title="保留记录"
              secondary
              onPress={() => setDeleting(false)}
            />
          </Card>
        )}
      </View>
      <Link
        title="返回饮食记录"
        onPress={() => {
          if (!busy) onClose();
        }}
      />
    </>
  );
}
export function TargetsScreen({
  adapter,
  targets,
}: {
  adapter: NutritionAdapter;
  targets: Targets;
}) {
  const config = [
    ["energy", "每日能量参考（kcal）"],
    ["protein", "个人蛋白质目标（g）"],
    ["fiber", "膳食纤维目标（g）"],
    ["sodium", "钠参考上限（mg）"],
    ["saturatedPercent", "饱和脂肪能量比例上限（%）"],
  ] as const;
  const [fields, setFields] = useState<Record<string, string>>(
      Object.fromEntries(
        config.map(([k]) => [k, targets[k]?.toString() ?? ""]),
      ),
    ),
    [ranges, setRanges] = useState({
      carbohydrateMin: targets.carbohydrate?.[0]?.toString() ?? "",
      carbohydrateMax: targets.carbohydrate?.[1]?.toString() ?? "",
      fatMin: targets.fat?.[0]?.toString() ?? "",
      fatMax: targets.fat?.[1]?.toString() ?? "",
    }),
    [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  return (
    <>
      <Text style={N.title}>个人参考目标</Text>
      <Text style={N.caption}>
        按个人体重、活动习惯和目标配置。留空表示未设置，不使用通用 2000 kcal
        作为默认值。
      </Text>
      {config.map(([k, label]) => (
        <Field
          key={k}
          label={label}
          numeric
          value={fields[k]!}
          onChange={(v) => setFields({ ...fields, [k]: v })}
        />
      ))}
      {(Object.keys(ranges) as (keyof typeof ranges)[]).map((k) => (
        <Field
          key={k}
          label={`${k.startsWith("fat") ? "脂肪" : "碳水"}参考${k.endsWith("Min") ? "下限" : "上限"}（g）`}
          numeric
          value={ranges[k]}
          onChange={(v) => setRanges({ ...ranges, [k]: v })}
        />
      ))}
      <Action
        title={saving ? "正在保存目标…" : "保存个人目标"}
        disabled={saving}
        onPress={async () => {
          if (lock.current) return;
          lock.current = true;
          setSaving(true);
          try {
            const next: Targets = {};
            for (const [k] of config)
              if (fields[k]?.trim()) next[k] = parsePortion(fields[k]!);
            if (next.saturatedPercent && next.saturatedPercent > 100)
              throw Error("能量比例不能超过 100%。");
            for (const k of ["fat", "carbohydrate"] as const) {
              const low = ranges[`${k}Min`],
                high = ranges[`${k}Max`];
              if (low || high) {
                const l = parsePortion(low),
                  h = parsePortion(high);
                if (l > h) throw Error("参考下限不能高于上限。");
                next[k] = [l, h];
              }
            }
            await adapter.configureTargets(next);
            setMessage(
              adapter.kind === "production"
                ? "个人目标已保存在本机，首页与营养详情已同步。"
                : "演示目标已更新，仅保留在当前预览内存。",
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            lock.current = false;
            setSaving(false);
          }
        }}
      />
      {message && <Feedback>{message}</Feedback>}
    </>
  );
}
const V = StyleSheet.create({
  greeting: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 2,
  },
  greetingTitle: {
    fontSize: 28,
    lineHeight: 38,
    color: c.ink,
    fontWeight: "400",
    fontFamily: Platform.select({
      ios: "Songti SC",
      android: "serif",
      default: "serif",
    }),
  },
  tableCard: {
    flexDirection: "row",
    padding: 0,
    gap: 0,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#F1E7D8",
  },
  tablePhoto: {
    alignSelf: "stretch",
    minHeight: 300,
    overflow: "hidden",
    backgroundColor: "#E4D7C1",
  },
  photoCaption: {
    position: "absolute",
    left: 12,
    right: 8,
    bottom: 16,
    gap: 4,
  },
  photoCaptionTitle: {
    fontSize: 17,
    color: "#FFFFFF",
    fontWeight: "500",
    textShadowColor: "#594532",
    textShadowRadius: 5,
  },
  photoCaptionText: {
    fontSize: 11,
    color: "#FFFFFF",
    textShadowColor: "#594532",
    textShadowRadius: 4,
  },
  tableNutrition: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 17,
    gap: 11,
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: -8,
  },
  captureAction: {
    minHeight: 70,
    borderRadius: 25,
    borderCurve: "continuous",
    backgroundColor: c.oliveStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  captureIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "#FFFFFF55",
    alignItems: "center",
    justifyContent: "center",
  },
  captureIconText: { color: "#FFFFFF", fontSize: 28, fontWeight: "300" },
  captureTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  captureHint: { color: "#FFFFFF", fontSize: 12, lineHeight: 18 },
  captureArrow: { color: "#FFFFFF", fontSize: 22 },
  brandRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  logo: { width: 30, height: 30, borderRadius: 10 },
  brand: { fontSize: 20, fontWeight: "600", color: c.brand },
  energy: {
    fontSize: 46,
    lineHeight: 60,
    fontWeight: "500",
    letterSpacing: -1.5,
    color: c.ink,
    fontVariant: ["tabular-nums"],
  },
  energyUnit: { fontSize: 13, letterSpacing: 0, color: c.muted },
  macros: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  macro: { flex: 1, gap: 4 },
  macroNumber: {
    fontSize: 19,
    lineHeight: 29,
    fontWeight: "500",
    color: c.ink,
    fontVariant: ["tabular-nums"],
  },
  divider: { height: 1, backgroundColor: c.line },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  foodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  dateCell: {
    minWidth: 48,
    paddingHorizontal: 10,
    minHeight: 64,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: c.brandSoft,
  },
  dateActive: { backgroundColor: c.sky },
  dateDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  add: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: c.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
