import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Choices, Field, C, S } from "../simple/ui";
import { PageIntro, StatusPill, Surface } from "../../ui/components";
import {
  localDateKey,
  mealTypes,
  parseDemoAmount,
  shiftDateKey,
  summarizeDiary,
  validDateKey,
  type DiaryEntry,
  type MealType,
} from "./contracts";

type Editor = {
  id: string | null;
  meal: MealType;
  name: string;
  energyKcal: string;
  proteinG: string;
  fatG: string;
  carbohydrateG: string;
};
const nutrientFields = [
  ["energyKcal", "能量（kcal）"],
  ["proteinG", "蛋白质（g）"],
  ["fatG", "脂肪（g）"],
  ["carbohydrateG", "碳水化合物（g）"],
] as const;
const display = (value: number | null) =>
  value === null ? "—" : String(value);

export function DiaryScreen({ onOpenAi }: { onOpenAi: () => void }) {
  const [day, setDay] = useState(localDateKey());
  const [demo, setDemo] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editError, setEditError] = useState("");
  const [dateInput, setDateInput] = useState<string | null>(null);
  const [dateError, setDateError] = useState("");
  const current = entries.filter((entry) => entry.day === day);
  const totals = summarizeDiary(current);
  const date = new Date(`${day}T12:00:00Z`);
  const heading = `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
  const today = day === localDateKey();

  function beginDemo() {
    setDemo(true);
    // Deliberately labelled UI sample, never a product or inventory record.
    setEntries([
      {
        id: "ui-sample-breakfast",
        day,
        meal: "breakfast",
        name: "示例早餐",
        source: "ui_demo",
        energyKcal: 300,
        proteinG: 12,
        fatG: 8,
        carbohydrateG: 45,
      },
    ]);
  }
  function edit(entry: DiaryEntry | MealType) {
    setEditError("");
    setEditor(
      typeof entry === "string"
        ? {
            id: null,
            meal: entry,
            name: "",
            energyKcal: "",
            proteinG: "",
            fatG: "",
            carbohydrateG: "",
          }
        : {
            id: entry.id,
            meal: entry.meal,
            name: entry.name,
            energyKcal: entry.energyKcal?.toString() ?? "",
            proteinG: entry.proteinG?.toString() ?? "",
            fatG: entry.fatG?.toString() ?? "",
            carbohydrateG: entry.carbohydrateG?.toString() ?? "",
          },
    );
  }
  function saveDemo() {
    if (!editor) return;
    if (!editor.name.trim()) {
      setEditError("请填写演示记录名称。");
      return;
    }
    try {
      const entry: DiaryEntry = {
        id:
          editor.id ??
          `ui-demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        day,
        meal: editor.meal,
        name: editor.name.trim(),
        source: "ui_demo",
        energyKcal: parseDemoAmount(editor.energyKcal),
        proteinG: parseDemoAmount(editor.proteinG),
        fatG: parseDemoAmount(editor.fatG),
        carbohydrateG: parseDemoAmount(editor.carbohydrateG),
      };
      setEntries((previous) => [
        ...previous.filter((value) => value.id !== entry.id),
        entry,
      ]);
      setEditor(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "请检查输入。");
    }
  }
  return (
    <>
      <PageIntro
        eyebrow="每一餐 · 慢慢记录"
        title="饮食记录"
        description="看见日常的小选择，让照顾自己更有条理。"
      />
      <Surface style={styles.dateCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前一天"
          onPress={() => setDay(shiftDateKey(day, -1))}
          style={styles.dateArrow}
        >
          <Text style={styles.arrow}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="选择记录日期"
          onPress={() => {
            setDateInput(day);
            setDateError("");
          }}
          style={styles.dateCenter}
        >
          <Text style={S.section}>
            {heading}
            <Text style={S.note}> 周{"日一二三四五六"[date.getUTCDay()]}</Text>
          </Text>
          <Text style={S.small}>{today ? "今天" : day} · 点击选择日期</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="后一天"
          onPress={() => setDay(shiftDateKey(day, 1))}
          style={styles.dateArrow}
        >
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </Surface>
      {!today && (
        <Button
          title="回到今天"
          secondary
          onPress={() => setDay(localDateKey())}
        />
      )}
      {demo ? (
        <View style={styles.demoBanner}>
          <StatusPill label="演示模式 · 非真实饮食" tone="warning" />
          <Text style={S.note}>
            以下是本页面内的示例与手动演示输入，不会保存到食品库或库存。离开页面即清除。
          </Text>
          <Button
            title="结束演示并清除"
            secondary
            onPress={() => {
              setEntries([]);
              setDemo(false);
              setEditor(null);
            }}
          />
        </View>
      ) : (
        <Surface>
          <StatusPill label="饮食存储尚未接入" tone="neutral" />
          <Text style={S.note}>
            食品库与库存可以正常使用。饮食记录目前只提供交互演示，不会将购买数量算成摄入。
          </Text>
          <Button title="体验记录演示" secondary onPress={beginDemo} />
        </Surface>
      )}
      <Surface>
        <View style={S.sectionRow}>
          <Text style={S.rowTitle}>
            {demo ? "演示营养汇总" : "当日营养摘要"}
          </Text>
          <Text style={S.small}>
            {current.length ? `${current.length} 条演示` : "尚未记录"}
          </Text>
        </View>
        <View style={styles.energyRow}>
          <Text style={styles.energy}>{display(totals.energyKcal)}</Text>
          <Text style={S.note}>kcal</Text>
        </View>
        <View style={styles.macros}>
          {(
            [
              ["蛋白质", totals.proteinG],
              ["脂肪", totals.fatG],
              ["碳水", totals.carbohydrateG],
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={styles.macro}>
              <Text style={styles.macroValue}>
                {display(value)}
                <Text style={S.small}> g</Text>
              </Text>
              <Text style={S.note}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={S.small}>
          —
          表示尚无记录或数据不完整，不代表摄入为零。这里不设置未经确认的个人营养目标。
        </Text>
      </Surface>
      {mealTypes.map(([meal, label], index) => {
        const items = current.filter((entry) => entry.meal === meal);
        return (
          <Surface key={meal}>
            <View style={S.sectionRow}>
              <View style={styles.mealHeading}>
                <View style={styles.mealMark}>
                  <Text style={styles.mealNumber}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                </View>
                <View>
                  <Text style={S.section}>{label}</Text>
                  <Text style={S.small}>
                    {items.length ? `${items.length} 条演示记录` : "还没有记录"}
                  </Text>
                </View>
              </View>
              {demo && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`添加${label}演示记录`}
                  onPress={() => edit(meal)}
                  style={styles.add}
                >
                  <Text style={styles.addText}>＋</Text>
                </Pressable>
              )}
            </View>
            {!items.length && (
              <Text style={S.note}>
                {demo
                  ? "记录一份演示餐食，体验核对与编辑。"
                  : "开启上方演示后可体验添加和修改。"}
              </Text>
            )}
            {items.map((entry) => (
              <View style={styles.entry} key={entry.id}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={S.rowTitle}>{entry.name}</Text>
                  <Text style={S.small}>
                    演示数据 · {display(entry.energyKcal)} kcal
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`编辑${entry.name}`}
                  onPress={() => edit(entry)}
                  style={styles.edit}
                >
                  <Text style={styles.link}>编辑</Text>
                </Pressable>
              </View>
            ))}
          </Surface>
        );
      })}
      <Surface style={styles.aiCard}>
        <StatusPill label="AI 分析 · 尚未接入" tone="neutral" />
        <Text style={S.section}>更多理解，留给未来</Text>
        <Text style={S.note}>
          当前没有生成任何饮食分析。你可以先查看 AI 设置，了解未来的连接方式。
        </Text>
        <Button title="查看 AI 设置" secondary onPress={onOpenAi} />
      </Surface>

      <Modal
        visible={editor !== null}
        animationType="slide"
        onRequestClose={() => setEditor(null)}
      >
        <SafeAreaView style={S.safe} edges={["top", "bottom"]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={S.page}
            >
              <PageIntro
                title={editor?.id ? "编辑演示记录" : "添加演示记录"}
                description="只用于体验界面。以下输入不进入真实食品库、库存或导出文件。"
              />
              {editor && (
                <>
                  <Choices
                    value={editor.meal}
                    options={mealTypes.map(([value, label]) => [value, label])}
                    onChange={(value) =>
                      setEditor({ ...editor, meal: value as MealType })
                    }
                  />
                  <Field
                    label="演示餐食名称"
                    value={editor.name}
                    onChange={(name) => setEditor({ ...editor, name })}
                    placeholder="例如：我的演示早餐"
                  />
                  {nutrientFields.map(([key, label]) => (
                    <Field
                      key={key}
                      label={label}
                      value={editor[key]}
                      numeric
                      onChange={(value) =>
                        setEditor({ ...editor, [key]: value })
                      }
                      placeholder="未知可留空"
                    />
                  ))}
                  {!!editError && (
                    <Text accessibilityLiveRegion="polite" style={styles.error}>
                      {editError}
                    </Text>
                  )}
                  <Button title="保留本次演示记录" onPress={saveDemo} />
                  {editor.id && (
                    <Button
                      title="删除这条演示记录"
                      secondary
                      onPress={() => {
                        setEntries((previous) =>
                          previous.filter((entry) => entry.id !== editor.id),
                        );
                        setEditor(null);
                      }}
                    />
                  )}
                </>
              )}
              <Button
                title="取消，返回记录"
                secondary
                onPress={() => setEditor(null)}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={dateInput !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDateInput(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.dateBackdrop}
        >
          <View accessibilityViewIsModal style={styles.dateDialog}>
            <Text style={S.section}>选择记录日期</Text>
            <Field
              label="记录日期"
              value={dateInput ?? ""}
              onChange={setDateInput}
              placeholder="YYYY-MM-DD"
            />
            {!!dateError && (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {dateError}
              </Text>
            )}
            <Button
              title="查看这一天"
              onPress={() => {
                if (dateInput && validDateKey(dateInput)) {
                  setDay(dateInput);
                  setDateInput(null);
                } else setDateError("请填写有效日期，例如 2026-10-26。");
              }}
            />
            <Button
              title="取消日期选择"
              secondary
              onPress={() => setDateInput(null)}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  dateCard: { flexDirection: "row", alignItems: "center", gap: 2, padding: 8 },
  dateCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    gap: 4,
  },
  dateArrow: {
    width: 48,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: { fontSize: 30, color: C.teal },
  demoBanner: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#F8EFDF",
    gap: 12,
  },
  energyRow: { flexDirection: "row", gap: 8, alignItems: "baseline" },
  energy: { fontSize: 44, color: C.teal, fontWeight: "700", letterSpacing: -1 },
  macros: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 16,
  },
  macro: { flex: 1, minWidth: 72, gap: 4 },
  macroValue: { fontSize: 22, color: C.ink, fontWeight: "600" },
  mealHeading: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  mealMark: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  mealNumber: { fontSize: 13, color: C.teal, fontWeight: "700" },
  add: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: C.pale,
  },
  addText: { fontSize: 26, color: C.teal },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 14,
  },
  edit: {
    minHeight: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  link: { fontSize: 14, fontWeight: "600", color: C.teal },
  error: { fontSize: 14, lineHeight: 22, color: C.red },
  aiCard: { backgroundColor: "#F0F4EF" },
  dateBackdrop: {
    flex: 1,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172A2466",
  },
  dateDialog: {
    width: "100%",
    maxWidth: 420,
    padding: 22,
    backgroundColor: C.white,
    borderRadius: 24,
    gap: 18,
  },
});
