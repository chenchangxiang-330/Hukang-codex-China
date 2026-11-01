import {
  prepareUpload,
  removeUpload,
  removePickerCopy,
  type UploadImage,
} from "../../services/ai/images";
import { PackageAssistant } from "./PackageAssistant";
import { FoodEditor } from "./FoodEditor";
import { snapshotEntry } from "../../services/nutrition/validation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { aiService } from "../../services/ai/runtime";
import { aiErrorMessage } from "../../services/ai/errors";

export function ImpactPreview({
  food: initialFood,
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
  const [food, setFood] = useState(initialFood);
  const [saving, setSaving] = useState(false);
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
    if (adapter.kind === "production")
      snapshotEntry({ ...entry, food: { ...entry.food, image: undefined } });
    else validateEntry(entry);
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
      <View pointerEvents={saving || saved ? "none" : "auto"}>
        <Card>
          <Text style={N.heading}>{food.name}</Text>
          <FoodEditor
            food={food}
            onChange={(f) => {
              setFood(f);
              setConfirmed(false);
            }}
          />
          {food.image && (
            <Image
              source={{ uri: food.image }}
              style={K.resultImage}
              resizeMode="contain"
              accessibilityLabel="本机照片预览"
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
              ? "未做自动抠图，保存时将保留当前本机照片副本。"
              : "尚无包装原图；自动抠图也未接入。"}
          </Text>
          {food.image && (
            <Action
              title="查看照片说明"
              secondary
              onPress={() =>
                setMessage(
                  "这里显示本机照片副本，未做自动抠图。相册原图未改动；营养表和 OCR 证据由原食品流程独立保留。",
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
                      {formatTotal(total(projected, day, k))}{" "}
                      {nutrientInfo[k][1]}
                    </Text>
                  </View>
                ),
              )}
              <Text style={N.tiny}>
                {adapter.kind === "production"
                  ? "右侧为已记录食物与本次拟食用的已知小计，缺失值不会按 0 计算。确认前不会写入。"
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
            title={
              saving
                ? "正在保存，请稍候…"
                : saved
                  ? "已保存这次食用，请勿重复提交"
                  : "已食用 · 确认记录"
            }
            disabled={
              !confirmed ||
              !!validation ||
              saved ||
              saving ||
              snapshot.status !== "ready"
            }
            onPress={async () => {
              if (!entry || submitted.current) return;
              submitted.current = true;
              setSaving(true);
              try {
                await adapter.record(entry, operation.current);
                setSaved(true);
                setMessage(
                  adapter.kind === "production"
                    ? "已保存饮食记录，今天、记录与营养详情已同步。库存没有变化。"
                    : "已记入本次演示，三处营养汇总已同步；未保存真实饮食。",
                );
              } catch (e) {
                submitted.current = false;
                setMessage((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          />
          {onStock && (
            <Action title="加入库存 · 不计摄入" secondary onPress={onStock} />
          )}
        </Card>
      </View>
      {saving && (
        <Feedback>
          正在保存到本机，请等待；提交完成后返回不会撤销记录。
        </Feedback>
      )}
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
  onAiSettings,
}: {
  visible: boolean;
  date: string;
  meal: Meal;
  snapshot: Snapshot;
  adapter: NutritionAdapter;
  onScan: () => void;
  onLibrary: (name?: string) => void;
  onAiSettings: () => void;
}) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  const [processed, setProcessed] = useState<
    Partial<Record<"meal" | "package", UploadImage>>
  >({});
  const copies = useRef<Partial<Record<"meal" | "package", UploadImage>>>({});
  const processing = useRef<AbortController | null>(null);
  const [includeImage, setIncludeImage] = useState(false);
  const requestAbort = useRef<AbortController | null>(null);
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
      requestAbort.current?.abort();
      processing.current?.abort();
      Object.values(copies.current).forEach((v) => void removeUpload(v.uri));
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (!visible) {
      processing.current?.abort();
      requestAbort.current?.abort();
      generation.current++;
      setLoading(false);
    }
  }, [visible]);
  const invalidate = () => {
    requestAbort.current?.abort();
    requestAbort.current = null;
    generation.current++;
    setEstimate(null);
    setMessage("");
    setLoading(false);
  };
  useEffect(() => {
    if (adapter.kind === "production") {
      invalidate();
      setIncludeImage(false);
    }
  }, [ai.revision]);
  const choose = async (camera: boolean) => {
    if (picking.current) return;
    picking.current = true;
    invalidate();
    setChoosing(true);
    setLoading(false);
    const ticket = ++generation.current;
    let pickerCopy = "";
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
      pickerCopy = result.assets?.[0]?.uri ?? "";
      if (
        !live.current ||
        ticket !== generation.current ||
        result.canceled ||
        !result.assets[0]
      )
        return;
      const controller = new AbortController();
      processing.current = controller;
      setMessage("正在本机检查方向、缩小尺寸并生成上传副本…");
      const copy = await prepareUpload(
        result.assets[0]!.uri,
        controller.signal,
      );
      if (!live.current || ticket !== generation.current) {
        void removeUpload(copy.uri);
        return;
      }
      if (copies.current[mode]) void removeUpload(copies.current[mode]!.uri);
      copies.current = { ...copies.current, [mode]: copy };
      setProcessed(copies.current);
      setPhotos((p) => ({ ...p, [mode]: copy.uri }));
      setEstimate(null);
      setPack(null);
      setMessage(
        "上传副本已在本机准备，尚未上传；请检查清晰度后确认发送。相册原图没有改变。",
      );
    } catch (e) {
      if (live.current && ticket === generation.current)
        setMessage((e as Error).message);
    } finally {
      if (pickerCopy) void removePickerCopy(pickerCopy);
      picking.current = false;
      processing.current = null;
      if (live.current) setChoosing(false);
    }
  };
  const runEstimate = async () => {
    if (requestAbort.current || loading) return;
    if (
      !description.trim() &&
      !(includeImage && photos.meal) &&
      adapter.kind === "production"
    ) {
      setMessage("请填写这一餐的文字描述，或在支持图片时勾选发送照片。");
      return;
    }
    if (adapter.kind === "demo" && !photos.meal) {
      setMessage("请先拍照或从相册选择餐食照片。");
      return;
    }
    const ticket = ++generation.current;
    const controller = new AbortController();
    requestAbort.current = controller;
    setLoading(true);
    setMessage("");
    setEstimate(null);
    const request = Object.freeze({
      imageUri: photos.meal,
      description,
      includeImage,
    });
    try {
      const result =
        adapter.kind === "demo" && adapter.demoEstimateMeal
          ? await adapter.demoEstimateMeal(request)
          : await aiService.estimateMeal(request, controller.signal);
      if (live.current && ticket === generation.current) setEstimate(result);
    } catch (error) {
      if (live.current && ticket === generation.current)
        setMessage(
          adapter.kind === "production"
            ? aiErrorMessage(error)
            : (error as Error).message,
        );
    } finally {
      if (requestAbort.current === controller) requestAbort.current = null;
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
              processing.current?.abort();
              requestAbort.current?.abort();
              requestAbort.current = null;
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
                mode === "meal" ? "餐食照片预览" : "包装正面照片预览"
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
        {!!photos[mode] && (
          <Action
            title="清除这张照片"
            secondary
            disabled={choosing || loading}
            onPress={() => {
              invalidate();
              const copy = copies.current[mode];
              if (copy) void removeUpload(copy.uri);
              delete copies.current[mode];
              setProcessed({ ...copies.current });
              setPhotos((p) => ({ ...p, [mode]: "" }));
              setMessage(
                "已清除页面临时照片；已保存的饮食照片和相册原图不会删除。",
              );
            }}
          />
        )}
      </Card>
      {choosing && (
        <Action
          title="取消图片处理"
          secondary
          onPress={() => processing.current?.abort()}
        />
      )}
      {processed[mode] && (
        <Text style={N.tiny}>
          本机副本 {processed[mode]!.width} × {processed[mode]!.height} ·{" "}
          {processed[mode]!.bytes} 字节；原图 {processed[mode]!.originalWidth} ×{" "}
          {processed[mode]!.originalHeight} · {processed[mode]!.originalBytes}{" "}
          字节 · 已去除定位等元数据
        </Text>
      )}
      {mode === "meal" ? (
        <>
          <Text style={N.heading}>告诉我这一餐吃了什么</Text>
          <TextInput
            accessibilityLabel="餐食补充描述"
            value={description}
            onChangeText={(v) => {
              setDescription(v);
              invalidate();
            }}
            placeholder="牛肉鸡蛋香菜面，1 个鸡蛋，面条吃了一半，没有喝汤"
            multiline
            maxLength={4000}
            textAlignVertical="top"
            placeholderTextColor={c.muted}
            style={K.description}
          />
          <Text style={N.caption}>
            食材、吃了多少、是否喝汤，都可以写下来。
          </Text>
          {adapter.kind === "production" && (
            <Card blue>
              <Text style={N.heading}>本次 AI 请求</Text>
              <Text selectable style={N.caption}>
                服务地址：{ai.endpoint || "尚未配置"}
              </Text>
              <Text style={N.caption}>模型：{ai.model || "尚未配置"}</Text>
              <Text style={N.caption}>
                {ai.supportsImage
                  ? "可发送文字；照片需单独勾选，本机处理为 JPEG，最大 4,000,000 字节。"
                  : "当前配置仅开放文字估算，照片不会发送，也不会声称已识别照片。"}
              </Text>
              {!!photos.meal && ai.supportsImage && (
                <Check
                  label="同时发送这张餐食照片"
                  value={includeImage}
                  onChange={(value) => {
                    invalidate();
                    setIncludeImage(value);
                  }}
                />
              )}
              <Text style={N.caption}>
                将发送：餐食描述
                {includeImage ? "和当前餐食照片" : "（不含照片）"}
                。请求可能产生服务商费用；不发送食品库、库存或历史记录。
              </Text>
              <Check
                label="我了解发送内容、服务地址及可能产生的费用"
                value={ai.consent}
                onChange={aiService.consent}
              />
              <Action title="配置 AI 服务" secondary onPress={onAiSettings} />
            </Card>
          )}
          <Action
            title={
              loading
                ? adapter.kind === "demo"
                  ? "正在生成演示估算…"
                  : "正在请求 AI 估算…"
                : "估算这餐营养"
            }
            disabled={
              loading ||
              choosing ||
              (adapter.kind === "production" && ai.operation !== null)
            }
            onPress={() => void runEstimate()}
          />
          {loading && (
            <Action
              title="取消本次估算"
              secondary
              onPress={() => requestAbort.current?.abort()}
            />
          )}
          <Action
            title="手动记录这一餐"
            secondary
            disabled={choosing || loading}
            onPress={() => {
              const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              setEstimate({
                food: {
                  id,
                  version: id,
                  name: description.trim().slice(0, 80) || "手动餐食",
                  basis: { amount: 1, unit: "份" },
                  source: "用户手动录入 · 营养未经独立验证",
                  provenance: { kind: "manual" },
                  nutrients: {},
                  ...(photos.meal ? { image: photos.meal } : {}),
                },
                ingredients: [],
                uncertainties: ["未填写的营养保持未知，不会当成零。"],
              });
            }}
          />
          {estimate && (
            <>
              <Card blue>
                <Text style={N.heading}>
                  {estimate.ai
                    ? "餐食估算 · AI 估算"
                    : estimate.food.provenance?.kind === "manual"
                      ? "手动记录 · 待确认"
                      : "餐食估算 · 演示结果"}
                </Text>
                <Text style={N.caption}>
                  {estimate.ai
                    ? `${estimate.ai.imageSent ? "基于本次描述与照片" : "仅基于文字描述，未识别照片"} · ${estimate.ai.responseModel}。仅在当前页面预览，未保存饮食记录。`
                    : estimate.food.provenance?.kind === "manual"
                      ? "手动填写的食物，未识别照片。请核对名称、营养基准与实际食用份量后保存。"
                      : "照片与描述来自同一次请求；以下为固定演示样例，并非真实识别。"}
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
              正面照片可辅助提取名称候选；扫码命中食品库时优先复用已有资料。
            </Text>
            <Text style={N.caption}>
              现有流程：扫描或输入条码 → 查本机食品库 → 未命中时拍营养表 → 离线
              OCR → 人工核对。
            </Text>
            <Action title="扫描 / 输入条码" onPress={onScan} />
            <Action
              title="在食品库手动查找"
              secondary
              onPress={() => onLibrary()}
            />
            {photos.package && (
              <Text style={N.tiny}>
                这张正面照片当前仅供预览。扫码建立身份后，请在原有食品资料流程保存包装原图。
              </Text>
            )}
          </Card>
          {adapter.kind === "production" && (
            <PackageAssistant
              image={processed.package}
              onSettings={onAiSettings}
              onCandidate={(c) => onLibrary(c.name)}
              useLabel="核对后在食品库查找候选"
            />
          )}
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
