import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { colors as c } from "../../ui/tokens";
import { Field } from "../simple/ui";
import { shiftDateKey } from "../ui-v1/contracts";
import {
  Action,
  Accordion,
  Card,
  EnergyRing,
  Feedback,
  FoodArt,
  Link,
  N,
  NutrientLine,
  Progress,
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
function MacroRow({ snapshot, date }: { snapshot: Snapshot; date: string }) {
  return (
    <View style={V.macros}>
      {(["protein", "carbohydrate", "fat"] as const).map((k) => (
        <View key={k} style={V.macro}>
          <Text style={V.macroNumber}>
            {formatTotal(total(snapshot.entries, date, k))}{" "}
            <Text style={N.tiny}>g</Text>
          </Text>
          <Text style={N.caption}>{nutrientInfo[k][0]}</Text>
        </View>
      ))}
    </View>
  );
}
function Energy({
  snapshot: s,
  date,
  onTargets,
}: {
  snapshot: Snapshot;
  date: string;
  onTargets: () => void;
}) {
  const t = total(s.entries, date, "energy");
  return (
    <View style={{ gap: 4 }}>
      <Text style={N.caption}>
        今日已记录摄入{t.missing ? " · 已知小计" : ""}
      </Text>
      <View
        style={[N.row, { flexWrap: "wrap", justifyContent: "space-between" }]}
      >
        <Text
          style={[
            V.energy,
            { flexShrink: 0, maxWidth: "100%" },
            t.range && { fontSize: 32, lineHeight: 44 },
          ]}
        >
          {formatTotal(t)} <Text style={V.energyUnit}>kcal</Text>
        </Text>
        <EnergyRing total={t} target={s.targets.energy} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="个人参考目标"
        onPress={onTargets}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={N.caption}>
          {s.targets.energy
            ? `个人参考 ${s.targets.energy} kcal`
            : "个人参考目标未设置"}{" "}
          ›
        </Text>
      </Pressable>
    </View>
  );
}
export function TodayScreen({
  snapshot: s,
  date,
  onNutrition,
  onCapture,
  onDiary,
  onTargets,
  resume,
}: {
  snapshot: Snapshot;
  date: string;
  onNutrition: () => void;
  onCapture: () => void;
  onDiary: () => void;
  onTargets: () => void;
  resume?: React.ReactNode;
}) {
  return (
    <>
      <View style={V.brandRow}>
        <View style={N.row}>
          <Image
            source={require("../../../assets/icon.png")}
            style={V.logo}
            accessibilityLabel="护康 Logo"
          />
          <Text style={V.brand}>护康</Text>
        </View>
        <Text style={N.caption}>{dateLabel(date).replace(/^\d+年/, "")}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={N.title}>
          今天，吃得刚刚好。
        </Text>
        <Text style={N.caption}>一餐一食，慢慢照顾好自己。</Text>
      </View>
      <Card>
        <Energy snapshot={s} date={date} onTargets={onTargets} />
        <MacroRow snapshot={s} date={date} />
        <View style={V.divider} />
        <Link title="查看完整营养" onPress={onNutrition} />
      </Card>
      {s.status !== "ready" && (
        <Feedback>
          {s.status === "loading"
            ? "正在读取今日记录…"
            : s.status === "error"
              ? s.message || "暂时无法读取记录，请稍后重试。"
              : "尚未记录 · 饮食存储尚未接入，食品库存不会计入摄入。"}
        </Feedback>
      )}
      <Card blue>
        <Text style={N.heading}>今日营养发现 ✦</Text>
        {findings(s.entries, date, s.targets).map((line, i) => (
          <View
            style={[N.row, { alignItems: "flex-start", gap: 8 }]}
            key={line}
          >
            <Text style={{ color: c.brand, lineHeight: 23 }}>
              {i === 0 ? "✧" : "·"}
            </Text>
            <Text style={[N.caption, { flex: 1, color: c.ink }]}>{line}</Text>
          </View>
        ))}
      </Card>
      <View style={V.sectionRow}>
        <Text style={N.heading}>餐食速览</Text>
        <Link title="查看记录" onPress={onDiary} />
      </View>
      {s.entries.filter((e) => e.date === date).length ? (
        s.entries
          .filter((e) => e.date === date)
          .slice(0, 3)
          .map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`查看${meals[e.meal]}记录`}
              onPress={onDiary}
            >
              <FoodRow entry={e} />
            </Pressable>
          ))
      ) : (
        <Text style={N.caption}>
          还没有今天的餐食。准备好了，就从这一餐开始。
        </Text>
      )}
      {resume}
      <Text style={[N.tiny, { textAlign: "center" }]}>
        认识每份食物，也留意自己的感受。
      </Text>
    </>
  );
}
export function FoodRow({ entry: e }: { entry: Entry }) {
  return (
    <View style={V.foodRow}>
      <FoodArt name={e.food.name} image={e.food.image} />
      <View style={N.grow}>
        <Text style={N.body}>{e.food.name}</Text>
        <Text style={N.caption}>
          {meals[e.meal]} · {e.amount}
          {e.unit}
        </Text>
      </View>
      <Text style={[N.caption, { maxWidth: "33%", textAlign: "right" }]}>
        {formatTotal(contribution(e, "energy"))} kcal ›
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
  onTargets,
}: {
  snapshot: Snapshot;
  date: string;
  onDate: (s: string) => void;
  onNutrition: () => void;
  onCapture: (m?: Meal) => void;
  onFood: (e: Entry) => void;
  onTargets: () => void;
}) {
  const entries = s.entries.filter((e) => e.date === date);
  const { width, fontScale } = useWindowDimensions();
  const separateMonth =
    (Math.min(width, 680) - 40) / Math.max(1, fontScale) < 270;
  const month = (
    <Text style={[N.caption, { textAlign: "center" }]}>{date.slice(0, 7)}</Text>
  );
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        饮食记录
      </Text>
      <View style={{ gap: 8 }}>
        {separateMonth && month}
        <View style={V.sectionRow}>
          <View style={separateMonth ? N.grow : undefined}>
            <Action
              title="‹ 前一天"
              secondary
              onPress={() => onDate(shiftDateKey(date, -1))}
            />
          </View>
          {!separateMonth && month}
          <View style={separateMonth ? N.grow : undefined}>
            <Action
              title="后一天 ›"
              secondary
              onPress={() => onDate(shiftDateKey(date, 1))}
            />
          </View>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9 }}
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
              <Text style={[N.heading, day === date && { color: c.onSky }]}>
                {Number(day.slice(-2))}
              </Text>
              <View
                style={[
                  V.dateDot,
                  day === date && { backgroundColor: c.brand },
                ]}
              />
            </Pressable>
          ),
        )}
      </ScrollView>
      <Card>
        <Text style={N.caption}>{dateLabel(date)}</Text>
        <Energy snapshot={s} date={date} onTargets={onTargets} />
        <View style={V.divider} />
        <Link title="今日营养摘要" onPress={onNutrition} />
        <Text style={N.caption}>
          {(["protein", "carbohydrate", "fat"] as const)
            .map(
              (k) =>
                `${nutrientInfo[k][0]} ${formatTotal(total(s.entries, date, k))}g`,
            )
            .join(" · ")}
        </Text>
      </Card>
      {!entries.length && (
        <Feedback>
          {s.status === "unavailable"
            ? "饮食存储尚未接入。这里还没有真实餐食记录。"
            : "所选日期尚未记录餐食。"}
        </Feedback>
      )}
      {(Object.entries(meals) as [Meal, string][]).map(([key, label]) => (
        <View key={key} style={{ gap: 8 }}>
          <View style={V.sectionRow}>
            <Text style={N.heading}>{label}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`添加${label}`}
              onPress={() => onCapture(key)}
              style={V.add}
            >
              <Text style={N.chevron}>＋</Text>
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
          {!entries.some((e) => e.meal === key) && (
            <Text style={N.caption}>还没记下这一餐</Text>
          )}
        </View>
      ))}
    </>
  );
}
export function NutritionScreen({
  snapshot: s,
  date,
  onTargets,
  onFiberScroll,
}: {
  snapshot: Snapshot;
  date: string;
  onTargets: () => void;
  onFiberScroll: (y: number) => void;
}) {
  const [opened, setOpened] = useState<string[]>([]),
    [fiberY, setFiberY] = useState(0);
  const t = (k: Nutrient) => total(s.entries, date, k),
    value = (k: Nutrient) => `${formatTotal(t(k))} ${nutrientInfo[k][1]}`;
  const toggle = (id: string) =>
    setOpened((a) => (a.includes(id) ? a.filter((k) => k !== id) : [...a, id]));
  const sources = (k: Nutrient) =>
    s.entries.filter(
      (e) => e.date === date && contribution(e, k).missing === 0,
    );
  const mineral: Nutrient[] = [
      "sodium",
      "potassium",
      "calcium",
      "magnesium",
      "iron",
      "zinc",
    ],
    vitamins: Nutrient[] = [
      "vitamin_a",
      "vitamin_b1",
      "vitamin_b2",
      "vitamin_b6",
      "vitamin_b12",
      "vitamin_c",
      "vitamin_d",
      "vitamin_e",
      "vitamin_k",
    ];
  const sourceLines = (k: Nutrient) =>
    sources(k).length ? (
      sources(k).map((e) => (
        <NutrientLine
          key={e.id}
          title={e.food.name}
          total={contribution(e, k)}
        />
      ))
    ) : (
      <Text style={N.caption}>暂无可靠来源数据，未录入不代表没有摄入。</Text>
    );
  return (
    <>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={N.title}>
          今日营养
        </Text>
        <Text style={N.caption}>了解今天的每一份营养</Text>
      </View>
      <Card blue>
        <Text style={N.caption}>{dateLabel(date)}</Text>
        <Energy snapshot={s} date={date} onTargets={onTargets} />
        <Text style={N.caption}>
          {s.entries.some((e) => e.date === date)
            ? "部分食品营养信息不完整，以下统计基于已记录的数据。"
            : "尚未记录 · 没有数据时，不判断是否达标。"}
        </Text>
      </Card>
      <Text style={N.heading}>核心营养成分</Text>
      <Accordion
        summary={
          <Progress total={t("carbohydrate")} range={s.targets.carbohydrate} />
        }
        title="碳水化合物"
        value={value("carbohydrate")}
        hint={reliability(t("carbohydrate"))}
        open={opened.includes("carbohydrate")}
        onToggle={() => toggle("carbohydrate")}
      >
        <Progress total={t("carbohydrate")} range={s.targets.carbohydrate} />
        <NutrientLine title="总糖" total={t("total_sugars")} />
        <NutrientLine title="添加糖" total={t("added_sugars")} />
        <Progress total={t("added_sugars")} limit={50} ideal={25} />
        <Text style={N.caption}>
          添加糖是食品生产或制作过程中额外加入的糖，与水果中天然存在的糖不同。总糖不等于添加糖；配料中含糖也不能推断克数。
        </Text>
        <Link
          title="查看膳食纤维"
          onPress={() => {
            setOpened((a) => (a.includes("fiber") ? a : [...a, "fiber"]));
            onFiberScroll(fiberY);
          }}
        />
      </Accordion>
      <Accordion
        summary={<Progress total={t("protein")} target={s.targets.protein} />}
        title="蛋白质"
        value={value("protein")}
        hint={
          s.targets.protein
            ? `个人目标 ${s.targets.protein}g`
            : "个人目标未设置"
        }
        open={opened.includes("protein")}
        onToggle={() => toggle("protein")}
      >
        <Progress total={t("protein")} target={s.targets.protein} />
        <Text style={N.caption}>目标依据体重、活动和个人目标配置。</Text>
        <Text style={N.heading}>主要食物来源</Text>
        {sourceLines("protein")}
        <Text style={N.heading}>餐次分布</Text>
        {(Object.entries(meals) as [Meal, string][]).map(([k, label]) => (
          <NutrientLine
            key={k}
            title={label}
            total={total(
              s.entries.filter((e) => e.meal === k),
              date,
              "protein",
            )}
          />
        ))}
      </Accordion>
      <Accordion
        summary={<Progress total={t("fat")} range={s.targets.fat} />}
        title="脂肪"
        value={value("fat")}
        hint={
          s.targets.fat
            ? `参考范围 ${s.targets.fat.join("–")}g`
            : "个人参考范围未设置"
        }
        open={opened.includes("fat")}
        onToggle={() => toggle("fat")}
      >
        <Progress total={t("fat")} range={s.targets.fat} />
        {(
          [
            "saturated_fat",
            "trans_fat",
            "monounsaturated_fat",
            "polyunsaturated_fat",
          ] as const
        ).map((k) => (
          <NutrientLine key={k} title={nutrientInfo[k][0]} total={t(k)} />
        ))}
        <Text style={N.caption}>
          饱和脂肪一般参考低于全天能量的 {s.targets.saturatedPercent ?? 10}
          %，可在个人目标中调整。
        </Text>
        {s.targets.energy && (
          <Progress
            total={t("saturated_fat")}
            limit={
              (s.targets.energy * (s.targets.saturatedPercent ?? 10)) / 100 / 9
            }
          />
        )}
      </Accordion>
      <View onLayout={(e) => setFiberY(e.nativeEvent.layout.y)}>
        <Accordion
          summary={
            <Progress total={t("fiber")} target={s.targets.fiber ?? 25} />
          }
          title="膳食纤维"
          value={value("fiber")}
          hint="成人常用参考 25–30g / 天"
          open={opened.includes("fiber")}
          onToggle={() => toggle("fiber")}
        >
          <Progress total={t("fiber")} target={s.targets.fiber ?? 25} />
          <Text style={N.caption}>
            此处与碳水详情引用同一份数据，不重复累计。
          </Text>
          {sourceLines("fiber")}
        </Accordion>
      </View>
      <Accordion
        title="矿物质"
        value={value("sodium")}
        hint="钠及其他矿物质"
        open={opened.includes("minerals")}
        onToggle={() => toggle("minerals")}
      >
        {mineral.map((k) => (
          <NutrientLine key={k} title={nutrientInfo[k][0]} total={t(k)} />
        ))}
        <Progress total={t("sodium")} limit={s.targets.sodium ?? 2000} />
        <Text style={N.caption}>
          一般成人钠参考上限 {s.targets.sodium ?? 2000}mg / 天。
          {t("sodium").value !== null
            ? `当前${t("sodium").missing ? "已知小计" : "记录"}约相当于 ${formatNumber((t("sodium").value! * 2.5) / 1000)}g 食盐。`
            : "钠数据不全时，食盐当量也未知。"}
          食盐当量只是换算，不再累加一次。
        </Text>
      </Accordion>
      <Accordion
        title="维生素"
        value="查看"
        hint="A · B 族 · C · D · E · K"
        open={opened.includes("vitamins")}
        onToggle={() => toggle("vitamins")}
      >
        {vitamins.map((k) => (
          <NutrientLine key={k} title={nutrientInfo[k][0]} total={t(k)} />
        ))}
        <Text style={N.caption}>
          未录入数据不等于没有摄入，也不代表缺乏。适用参考值待个人资料配置。
        </Text>
      </Accordion>
      <Accordion
        title="水分"
        value="未接入"
        hint="饮水记录"
        open={opened.includes("water")}
        onToggle={() => toggle("water")}
      >
        <Text style={N.caption}>
          饮水记录尚未接入，暂无已记录饮水量、饮料来源或个人补水目标。
        </Text>
      </Accordion>
      <Text style={N.tiny}>数值仅解释已记录的饮食，不作为营养缺乏诊断。</Text>
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
  const [amount, setAmount] = useState(String(e.amount)),
    [feedback, setFeedback] = useState("");
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        {e.food.name}
      </Text>
      <Card>
        <FoodArt name={e.food.name} image={e.food.image} />
        <Text style={N.caption}>
          {dateLabel(e.date)} · {meals[e.meal]}
        </Text>
        <Text style={N.body}>
          实际食用 {e.amount}
          {e.unit}
        </Text>
        <Text style={N.caption}>
          {e.food.source} · 资料版本 {e.food.version}
        </Text>
        {(Object.keys(nutrientInfo) as Nutrient[])
          .filter(
            (k) =>
              ["energy", "protein", "carbohydrate", "fat"].includes(k) ||
              e.food.nutrients[k],
          )
          .map((k) => (
            <NutrientLine
              key={k}
              title={nutrientInfo[k][0]}
              total={contribution(e, k)}
            />
          ))}
      </Card>
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
      <Action
        title="确认调整份量"
        onPress={() => {
          try {
            adapter.updatePortion(e.id, parsePortion(amount));
            setFeedback(
              "演示份量已更新，首页、记录与营养详情已同步；未写入真实记录。",
            );
          } catch (err) {
            setFeedback((err as Error).message);
          }
        }}
      />
      {feedback && <Feedback>{feedback}</Feedback>}
      <Action title="返回饮食记录" secondary onPress={onClose} />
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
        title="保存个人目标"
        onPress={() => {
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
            adapter.configureTargets(next);
            setMessage("演示目标已更新，仅保留在当前预览内存。");
          } catch (e) {
            setMessage((e as Error).message);
          }
        }}
      />
      {message && <Feedback>{message}</Feedback>}
    </>
  );
}
const V = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
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
    width: 46,
    minHeight: 78,
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
