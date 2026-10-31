import { useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { colors as c } from "../../ui/tokens";
import { Check, Choices, Field } from "../simple/ui";
import { Action, Card, Feedback, N, NutrientLine } from "./components";
import {
  contribution,
  findings,
  formatTotal,
  meals,
  nutrientInfo,
  parsePortion,
  total,
  validateEntry,
  type Entry,
  type Food,
  type Meal,
  type MealEstimate,
  type NutritionAdapter,
  type PortionUnit,
  type Snapshot,
} from "./model";
import { dateLabel } from "./Screens";

export function ImpactPreview({
  food,
  snapshot,
  date,
  meal,
  adapter,
  onStock,
}: {
  food: Food;
  snapshot: Snapshot;
  date: string;
  meal: Meal;
  adapter: NutritionAdapter;
  onStock?: () => void;
}) {
  const [day, setDay] = useState(date),
    [selectedMeal, setMeal] = useState<Meal>(meal),
    [amount, setAmount] = useState(String(food.basis.amount || 1)),
    [unit, setUnit] = useState<PortionUnit>(food.basis.unit),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false);
  const operation = useRef(
      `intake-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
    submitted = useRef(false);
  let entry: Entry | null = null,
    validation = "";
  try {
    entry = {
      id: operation.current,
      date: day,
      meal: selectedMeal,
      food,
      amount: parsePortion(amount),
      unit,
    };
    validateEntry(entry);
  } catch (e) {
    validation = (e as Error).message;
  }
  const projected = entry
    ? snapshot.entries.some((e) => e.id === entry.id)
      ? snapshot.entries
      : [...snapshot.entries, entry]
    : snapshot.entries;
  const units: PortionUnit[] = [
    food.basis.unit,
    ...(food.serving
      ? food.basis.unit === "份"
        ? [food.serving.unit]
        : ["份" as const]
      : []),
  ];
  return (
    <>
      <Card>
        <Text style={N.heading}>{food.name}</Text>
        {food.image && (
          <Image
            source={{ uri: food.image }}
            style={K.resultImage}
            resizeMode="contain"
            accessibilityLabel="保留的原图"
          />
        )}
        <Text style={N.caption}>{food.source}</Text>
        <Text style={N.caption}>
          {food.packageSize ? `整包净含量 ${food.packageSize} · ` : ""}
          营养基准：每 {food.basis.amount}
          {food.basis.unit}
          {food.serving
            ? `（每份 ${food.serving.amount}${food.serving.unit}）`
            : ""}
        </Text>
        {food.rawEnergy && (
          <Text style={N.caption}>
            标签原值 {food.rawEnergy.value} {food.rawEnergy.unit} ·
            换算后的能量单独展示
          </Text>
        )}
        <Text style={N.tiny}>
          {food.image
            ? "自动抠图尚未接入，保留原图作为封面。"
            : "尚无包装原图；自动抠图也未接入。"}
        </Text>
        {food.image && (
          <Action
            title="查看原图"
            secondary
            onPress={() =>
              setMessage(
                "当前显示的就是未经抠图的原始照片；营养表和 OCR 证据仍由原食品流程独立保留。",
              )
            }
          />
        )}
      </Card>
      <Card>
        <Text style={N.heading}>如果吃完这份</Text>
        <Field
          label="拟食用日期"
          value={day}
          onChange={(v) => {
            setDay(v);
            setConfirmed(false);
          }}
          placeholder="YYYY-MM-DD"
          editable={!saved}
        />
        <Text style={N.body}>餐次</Text>
        <Choices
          value={selectedMeal}
          options={Object.entries(meals)}
          onChange={(v) => {
            if (!saved) {
              setMeal(v as Meal);
              setConfirmed(false);
            }
          }}
          accessibilityPrefix="拟食用餐次"
        />
        <Field
          label={`实际食用份量（${unit}）`}
          value={amount}
          onChange={(v) => {
            setAmount(v);
            setConfirmed(false);
          }}
          numeric
          editable={!saved}
        />
        <Choices
          value={unit}
          options={units.map((u) => [u, u])}
          onChange={(v) => {
            if (!saved) {
              setUnit(v as PortionUnit);
              setConfirmed(false);
            }
          }}
          accessibilityPrefix="份量单位"
        />
        <View style={N.wrap}>
          {[0.5, 1, 2].map((n) => (
            <Action
              key={n}
              title={`${n} × 基准份量`}
              secondary
              disabled={saved}
              onPress={() => {
                setUnit(food.basis.unit);
                setAmount(String(food.basis.amount * n));
                setConfirmed(false);
              }}
            />
          ))}
        </View>
        {validation ? (
          <Feedback>{validation}</Feedback>
        ) : (
          <>
            <Text style={N.caption}>
              {dateLabel(day)} · 当前记录 → 拟食用后
            </Text>
            {(["energy", "protein", "carbohydrate", "fat"] as const).map(
              (k) => (
                <View key={k} style={N.metricRow}>
                  <Text style={[N.body, { flex: 1 }]}>
                    {nutrientInfo[k][0]}
                  </Text>
                  <Text style={N.caption}>
                    {formatTotal(total(snapshot.entries, day, k))} →{" "}
                    {formatTotal(total(projected, day, k))} {nutrientInfo[k][1]}
                  </Text>
                </View>
              ),
            )}
            <Text style={N.tiny}>
              {adapter.kind === "production"
                ? "真实饮食记录尚未接入；右侧仅为这一份的已知营养，不能视为完整全天预测。"
                : "演示数据 · 预览不会提前写入记录。"}
            </Text>
            {entry &&
              (
                [
                  "energy",
                  "protein",
                  "carbohydrate",
                  "fat",
                  "added_sugars",
                  "sodium",
                ] as const
              ).map((k) => (
                <NutrientLine
                  key={k}
                  title={`这份${nutrientInfo[k][0]}`}
                  total={contribution(entry!, k)}
                />
              ))}
            {findings(projected, day, snapshot.targets).map((line) => (
              <Text key={line} style={N.caption}>
                · {line}
              </Text>
            ))}
          </>
        )}
        <Check
          label="我已确认日期、餐次和实际食用份量"
          value={confirmed}
          onChange={(v) => {
            if (!saved) setConfirmed(v);
          }}
        />
        <Action
          title={saved ? "已记入演示，勿重复提交" : "已食用 · 确认记录"}
          disabled={!confirmed || !!validation || saved}
          onPress={() => {
            if (!entry || submitted.current) return;
            submitted.current = true;
            try {
              adapter.record(entry, operation.current);
              setSaved(true);
              setMessage(
                "已记入本次演示，三处营养汇总已同步；未保存真实饮食。",
              );
            } catch (e) {
              submitted.current = false;
              setMessage((e as Error).message);
            }
          }}
        />
        {onStock && (
          <Action title="加入库存 · 不计摄入" secondary onPress={onStock} />
        )}
      </Card>
      {message && <Feedback>{message}</Feedback>}
    </>
  );
}
export function CaptureScreen({
  visible,
  date,
  meal,
  snapshot,
  adapter,
  onScan,
  onLibrary,
}: {
  visible: boolean;
  date: string;
  meal: Meal;
  snapshot: Snapshot;
  adapter: NutritionAdapter;
  onScan: () => void;
  onLibrary: () => void;
}) {
  const [mode, setMode] = useState<"meal" | "package">("meal"),
    [photos, setPhotos] = useState({ meal: "", package: "" }),
    [description, setDescription] = useState(""),
    [estimate, setEstimate] = useState<MealEstimate | null>(null),
    [pack, setPack] = useState<Food | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [choosing, setChoosing] = useState(false),
    [stockPreview, setStockPreview] = useState(false),
    [stockCount, setStockCount] = useState("1");
  const generation = useRef(0),
    picking = useRef(false),
    live = useRef(true),
    stockOnce = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!visible) {
      generation.current++;
      setLoading(false);
    }
  }, [visible]);
  const invalidate = () => {
    generation.current++;
    setEstimate(null);
    setMessage("");
    setLoading(false);
  };
  const choose = async (camera: boolean) => {
    if (picking.current) return;
    picking.current = true;
    setChoosing(true);
    setLoading(false);
    const ticket = ++generation.current;
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw Error("未获得相机权限，可以改用相册。");
      }
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
            allowsEditing: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
            allowsEditing: false,
          });
      if (
        !live.current ||
        ticket !== generation.current ||
        result.canceled ||
        !result.assets[0]
      )
        return;
      setPhotos((p) => ({ ...p, [mode]: result.assets[0]!.uri }));
      setEstimate(null);
      setPack(null);
      setMessage("照片仅保留在当前页面，没有上传。");
    } catch (e) {
      if (live.current && ticket === generation.current)
        setMessage((e as Error).message);
    } finally {
      picking.current = false;
      if (live.current) setChoosing(false);
    }
  };
  const runEstimate = async () => {
    if (!photos.meal) {
      setMessage("请先拍照或从相册选择餐食照片。");
      return;
    }
    if (loading) return;
    const ticket = ++generation.current;
    setLoading(true);
    setMessage("");
    const request = Object.freeze({ imageUri: photos.meal, description });
    try {
      const result = await adapter.estimateMeal(request);
      if (live.current && ticket === generation.current) setEstimate(result);
    } catch (e) {
      if (live.current && ticket === generation.current)
        setMessage((e as Error).message);
    } finally {
      if (live.current && ticket === generation.current) setLoading(false);
    }
  };
  if (!visible) return null;
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        拍一拍
      </Text>
      <Text style={N.caption}>一餐的营养，从认识食物开始。</Text>
      <View style={K.modes}>
        {(
          [
            ["meal", "餐食估算", "家常菜 · 一餐食物"],
            ["package", "包装食品", "扫码 · 营养表核对"],
          ] as const
        ).map(([key, label, detail]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: mode === key }}
            aria-selected={mode === key}
            onPress={() => {
              generation.current++;
              setLoading(false);
              setMode(key);
              setMessage("");
            }}
            style={[K.mode, mode === key && K.activeMode]}
          >
            <Text style={N.heading}>{label}</Text>
            <Text style={N.tiny}>{detail}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <View style={K.photo}>
          {photos[mode] ? (
            <Image
              source={{ uri: photos[mode] }}
              style={K.photoImage}
              resizeMode="contain"
              accessibilityLabel={
                mode === "meal" ? "餐食照片预览" : "包装正面原图预览"
              }
            />
          ) : (
            <>
              <View style={K.camera}>
                <View style={K.lens} />
              </View>
              <Text style={N.caption}>
                {mode === "meal" ? "把这餐拍清楚" : "拍下完整的包装正面"}
              </Text>
              <Text style={N.tiny}>照片会保留在当前页面</Text>
            </>
          )}
        </View>
        <View style={K.buttons}>
          <View style={N.grow}>
            <Action
              title="拍照"
              disabled={choosing}
              onPress={() => void choose(true)}
            />
          </View>
          <View style={N.grow}>
            <Action
              title="从相册选择"
              disabled={choosing}
              secondary
              onPress={() => void choose(false)}
            />
          </View>
        </View>
      </Card>
      {mode === "meal" ? (
        <>
          <Text style={N.heading}>再告诉我一点（选填）</Text>
          <TextInput
            accessibilityLabel="餐食补充描述"
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              invalidate();
            }}
            placeholder="牛肉鸡蛋香菜面，1 个鸡蛋，面条吃了一半，没有喝汤"
            multiline
            textAlignVertical="top"
            placeholderTextColor={c.muted}
            style={K.description}
          />
          <Text style={N.caption}>
            食材、吃了多少、是否喝汤，都可以写下来。
          </Text>
          <Action
            title={loading ? "正在生成演示估算…" : "估算这餐营养"}
            disabled={loading}
            onPress={() => void runEstimate()}
          />
          {adapter.kind === "production" && (
            <Feedback>
              餐食 AI
              尚未接入。可以先选择照片、填写描述；不会把固定示例当作识别结果。
            </Feedback>
          )}
          {estimate && (
            <>
              <Card blue>
                <Text style={N.heading}>餐食估算 · 演示结果</Text>
                <Text style={N.caption}>
                  照片与描述来自同一次请求；以下为固定演示样例，并非真实识别。
                </Text>
                <Text style={N.body}>{estimate.ingredients.join(" · ")}</Text>
                {estimate.uncertainties.map((u) => (
                  <Text key={u} style={N.caption}>
                    · {u}
                  </Text>
                ))}
                <Action
                  title="补充描述后重新估算"
                  secondary
                  onPress={() => setEstimate(null)}
                />
              </Card>
              <ImpactPreview
                key={estimate.food.version}
                food={estimate.food}
                snapshot={snapshot}
                date={date}
                meal={meal}
                adapter={adapter}
              />
            </>
          )}
        </>
      ) : (
        <>
          <Card blue>
            <Text style={N.heading}>先确认这是哪一件食品</Text>
            <Text style={N.caption}>
              包装外观 AI
              匹配尚未接入，目前还不能凭照片确定身份；这不表示食品库没有同款。
            </Text>
            <Text style={N.caption}>
              现有流程：扫描或输入条码 → 查本机食品库 → 未命中时拍营养表 → 离线
              OCR → 人工核对。
            </Text>
            <Action title="扫描 / 输入条码" onPress={onScan} />
            <Action title="在食品库手动查找" secondary onPress={onLibrary} />
            {photos.package && (
              <Text style={N.tiny}>
                这张正面照片当前仅供预览。扫码建立身份后，请在原有食品资料流程保存包装原图。
              </Text>
            )}
          </Card>
          {adapter.kind === "demo" && adapter.demoPackage && (
            <Action
              title="体验包装结果（演示数据）"
              secondary
              onPress={() => {
                setPack(adapter.demoPackage!());
                setStockPreview(false);
                stockOnce.current = false;
              }}
            />
          )}
          {pack && (
            <>
              <Feedback>
                开发演示：整包 250g，每份 25g。添加糖未知；未执行食品库匹配或
                OCR。
              </Feedback>
              <ImpactPreview
                key={pack.version}
                food={pack}
                snapshot={snapshot}
                date={date}
                meal={meal}
                adapter={adapter}
                onStock={() => setStockPreview(true)}
              />
              {stockPreview && (
                <Card>
                  <Text style={N.heading}>库存操作演示</Text>
                  <Field
                    label="购入包装数量"
                    numeric
                    value={stockCount}
                    onChange={setStockCount}
                  />
                  <Action
                    title="确认模拟入库"
                    onPress={() => {
                      if (stockOnce.current) {
                        setMessage("这笔模拟入库已确认，没有重复提交。");
                        return;
                      }
                      if (!/^[1-9]\d{0,3}$/.test(stockCount)) {
                        setMessage("请输入 1–9999 的整数包装数量。");
                        return;
                      }
                      stockOnce.current = true;
                      setMessage(
                        `已演示 ${stockCount} 包的入库反馈，未调用真实库存，也未计入摄入。`,
                      );
                    }}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}
      {message && <Feedback>{message}</Feedback>}
    </>
  );
}
const K = StyleSheet.create({
  modes: { flexDirection: "row", gap: 10 },
  mode: {
    flex: 1,
    minHeight: 82,
    padding: 13,
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
  },
  activeMode: { backgroundColor: c.brandSoft, borderColor: "#99BFD9" },
  photo: {
    height: 185,
    borderRadius: 17,
    backgroundColor: "#EFF5F8",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  photoImage: { width: "100%", height: "100%" },
  resultImage: { width: "100%", height: 180, borderRadius: 16 },
  camera: {
    width: 48,
    height: 34,
    borderWidth: 1.6,
    borderColor: "#789DB7",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  lens: {
    width: 17,
    height: 17,
    borderWidth: 1.6,
    borderColor: "#789DB7",
    borderRadius: 9,
  },
  buttons: { flexDirection: "row", gap: 10 },
  description: {
    minHeight: 112,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 18,
    backgroundColor: c.surface,
    padding: 16,
    color: c.ink,
    fontSize: 15,
    lineHeight: 24,
  },
});
