import { FoodEditor } from "./FoodEditor";
import { useState, useRef } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors as c } from "../../ui/tokens";
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
        已记录能量{t.missing ? " · 已知小计" : ""}
        {t.estimated ? " · 估算" : ""}
      </Text>
      <Text style={[V.energy, t.range && { fontSize: 32, lineHeight: 44 }]}>
        {formatTotal(t)} <Text style={V.energyUnit}>kcal</Text>
      </Text>
      <Link
        title={
          s.targets.energy
            ? `个人能量参考 ${s.targets.energy} kcal`
            : "设置个人目标"
        }
        onPress={onTargets}
      />
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
  const entries = s.entries.filter((e) => e.date === date);
  const recent = [...entries].sort((a, b) =>
    (b.confirmedAt ?? b.id).localeCompare(a.confirmedAt ?? a.id),
  )[0];
  const finding = entries.length
    ? findings(s.entries, date, s.targets).find((line) =>
        /接近参考上限|已超参考上限/.test(line),
      )
    : undefined;
  return (
    <>
      <View style={V.brandRow}>
        <View style={N.row}>
          <Image
            source={require("../../../assets/icon.png")}
            style={V.logo}
            accessibilityLabel="护康 Logo"
          />
          <Text style={V.brand}>护康 · 今天</Text>
        </View>
        <Text style={N.caption}>{dateLabel(date).replace(/^\d+年/, "")}</Text>
      </View>
      {entries.length ? (
        <Card>
          <Energy snapshot={s} date={date} onTargets={onTargets} />
          <TargetProgress
            title="蛋白质"
            total={total(s.entries, date, "protein")}
            target={s.targets.protein}
            onTargets={onTargets}
          />
          <View
            style={[
              N.row,
              { flexWrap: "wrap", justifyContent: "space-between" },
            ]}
          >
            {(["carbohydrate", "fat"] as const).map((k) => (
              <View key={k}>
                <Text style={N.body}>
                  {k === "fat" ? "脂肪" : "碳水"}{" "}
                  {formatTotal(total(s.entries, date, k))} g
                </Text>
                {(total(s.entries, date, k).missing > 0 ||
                  total(s.entries, date, k).estimated) && (
                  <Text style={N.caption}>
                    {targetProgress(total(s.entries, date, k)).status}
                  </Text>
                )}
              </View>
            ))}
          </View>
          <Link title="查看完整营养" onPress={onNutrition} />
        </Card>
      ) : (
        <Card>
          <Text accessibilityRole="header" style={N.heading}>
            {s.status === "loading" ? "正在读取记录…" : "今天还没有记录"}
          </Text>
          <Text style={N.caption}>记下一餐，查看摄入与蛋白质进度。</Text>
          <Link title="个人参考目标" onPress={onTargets} />
          <Link title="查看完整营养" onPress={onNutrition} />
        </Card>
      )}
      <Action title="拍一拍" onPress={onCapture} />
      {s.status === "error" && (
        <Feedback>{s.message || "读取失败，请重试。"}</Feedback>
      )}
      {finding && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="今日营养发现"
          onPress={onNutrition}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={N.caption}>✧ {finding} ›</Text>
        </Pressable>
      )}
      {recent && (
        <>
          <View style={V.sectionRow}>
            <Text style={N.heading}>最近一餐</Text>
            <Link title="查看全部记录" onPress={onDiary} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`查看食物 ${recent.food.name}`}
            onPress={() => onFood(recent)}
          >
            <FoodRow entry={recent} />
          </Pressable>
        </>
      )}
      {!recent && <Link title="查看全部记录" onPress={onDiary} />}
      {resume}
    </>
  );
}
export function FoodRow({ entry: e }: { entry: Entry }) {
  const energy = contribution(e, "energy");
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
        <Link title="‹ 前一天" onPress={() => onDate(shiftDateKey(date, -1))} />
        <Text style={N.caption}>{date.slice(0, 7)}</Text>
        <Link title="后一天 ›" onPress={() => onDate(shiftDateKey(date, 1))} />
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
        <Text style={N.caption}>{dateLabel(date)}</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Energy snapshot={s} date={date} onTargets={onTargets} />
        <Text style={N.caption}>
          {s.entries.some((e) => e.date === date)
            ? "基于已保存记录 · 点开查看来源"
            : "尚未记录"}
        </Text>
      </View>
      <Accordion
        title="碳水化合物"
        value={value("carbohydrate")}
        hint={targetProgress(t("carbohydrate")).status}
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
        title="蛋白质"
        value={value("protein")}
        hint={targetProgress(t("protein")).status}
        open={opened.includes("protein")}
        onToggle={() => toggle("protein")}
      >
        <TargetProgress
          title="蛋白质"
          total={t("protein")}
          target={s.targets.protein}
          onTargets={onTargets}
        />
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
        title="脂肪"
        value={value("fat")}
        hint={targetProgress(t("fat")).status}
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
          title="膳食纤维"
          value={value("fiber")}
          hint={targetProgress(t("fiber")).status}
          open={opened.includes("fiber")}
          onToggle={() => toggle("fiber")}
        >
          <TargetProgress
            title="膳食纤维"
            total={t("fiber")}
            target={s.targets.fiber}
            onTargets={onTargets}
          />
          <Text style={N.caption}>
            成人常用参考 25–30g / 天，可设置个人目标。
          </Text>
          <Text style={N.caption}>
            此处与碳水详情引用同一份数据，不重复累计。
          </Text>
          {sourceLines("fiber")}
        </Accordion>
      </View>
      <Accordion
        title="矿物质"
        value={value("sodium")}
        hint={`钠 · ${targetProgress(t("sodium")).status}`}
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
        value="展开"
        hint={
          vitamins.some((k) => t(k).value !== null || t(k).range)
            ? "查看已知数据"
            : "未知 · 数据缺失"
        }
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
  const [amount, setAmount] = useState(String(e.amount));
  const [food, setFood] = useState(e.food);
  const [day, setDay] = useState(e.date);
  const [meal, setMeal] = useState(e.meal);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lock = useRef(false);
  const run = async (remove: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (remove) {
        if (!adapter.deleteEntry) throw Error("当前演示不支持删除。");
        await adapter.deleteEntry(e.id);
        onClose();
      } else {
        if (adapter.updateEntry)
          await adapter.updateEntry({
            ...e,
            food,
            date: day,
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
        <Action
          title={busy ? "正在保存…" : "确认调整份量"}
          disabled={busy}
          onPress={() => void run(false)}
        />
        {feedback && <Feedback>{feedback}</Feedback>}
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
          <Choices
            options={Object.entries(meals)}
            value={meal}
            onChange={(v) => setMeal(v as Meal)}
            accessibilityPrefix="修改餐次"
          />
          <Action
            title="保存记录修改"
            disabled={busy}
            onPress={() => void run(false)}
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
            <Action title="确定删除这次食用" onPress={() => void run(true)} />
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
