import {
  prepareUpload,
  removeUpload,
  removePickerCopy,
  type UploadImage,
} from "../../services/ai/images";
import { AiDisclosure } from "./AiDisclosure";
import { aiDisclosure } from "../../services/ai/disclosure";
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
import {
  Accordion,
  Action,
  Card,
  Feedback,
  N,
  NutrientLine,
  Link,
} from "./components";
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
  onSaved,
}: {
  food: Food;
  snapshot: Snapshot;
  date: string;
  meal: Meal;
  adapter: NutritionAdapter;
  onStock?: () => void;
  onSaved?: () => void;
}) {
  const [food, setFood] = useState(initialFood);
  const [details, setDetails] = useState(false);
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
              {entry && (
                <NutrientLine
                  title="这份能量"
                  total={contribution(entry, "energy")}
                />
              )}
              <Accordion
                title="营养与来源"
                value="查看详情"
                open={details}
                onToggle={() => setDetails(!details)}
              >
                <Text style={N.caption}>{food.source}</Text>
                {food.packageSize && (
                  <Text style={N.caption}>
                    整包净含量 {food.packageSize} · 每份 {food.serving?.amount}
                    {food.serving?.unit}
                  </Text>
                )}
                {food.rawEnergy && (
                  <Text style={N.caption}>
                    标签原值 {food.rawEnergy.value} {food.rawEnergy.unit}
                  </Text>
                )}
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
              </Accordion>
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
                onSaved?.();
                setMessage(
                  adapter.kind === "production"
                    ? "已保存饮食记录。"
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
  registerBack,
  onStepChange,
}: {
  registerBack: (back: (() => boolean) | null) => void;
  onStepChange: () => void;
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
  const [stage, setStage] = useState<"choose" | "photo" | "text" | "package">(
    "choose",
  );
  const [packagePhoto, setPackagePhoto] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
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
      setMessage("照片已准备好，请检查后确认发送。");
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
    if (
      adapter.kind === "production" &&
      Object.keys(aiService.issues()).length
    ) {
      setMessage("请先在 AI 服务设置中填写有效地址、密钥和模型。");
      return;
    }
    if (
      adapter.kind === "production" &&
      !aiDisclosure.allows(
        aiService.getSnapshot(),
        includeImage ? "meal-image" : "meal-text",
      )
    ) {
      setMessage("请先确认本次发送内容与服务地址。");
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
  const manual = () => {
    invalidate();
    setMode("meal");
    setStage("text");
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
      uncertainties: ["未填写的营养保持未知。"],
    });
  };
  useEffect(() => {
    registerBack(() => {
      if (loading || choosing) return true;
      if (hasSaved) return false;
      if (estimate) {
        setEstimate(null);
        return true;
      }
      if (stage !== "choose") {
        setStage("choose");
        return true;
      }
      return false;
    });
    return () => registerBack(null);
  }, [stage, estimate, loading, choosing, hasSaved]);
  useEffect(() => {
    if (visible) onStepChange();
  }, [stage, !!estimate]);
  if (!visible) return null;
  const select = (next: "photo" | "text" | "package") => {
    invalidate();
    setHasSaved(false);
    setMode(next === "package" ? "package" : "meal");
    setStage(next);
    setPackagePhoto(false);
  };
  if (stage === "choose")
    return (
      <>
        <Text accessibilityRole="header" style={N.title}>
          记录一餐
        </Text>
        <Text style={N.caption}>选择记录方式</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="餐食估算"
          onPress={() => select("photo")}
          style={K.mode}
        >
          <Text style={N.heading}>餐食</Text>
          <Text style={N.caption}>拍摄餐食，AI 估算 ›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="包装食品"
          onPress={() => select("package")}
          style={K.mode}
        >
          <Text style={N.heading}>包装食品</Text>
          <Text style={N.caption}>扫码或识别营养标签 ›</Text>
        </Pressable>
        <Link title="文字描述" onPress={() => select("text")} />
        <Link title="手动填写" onPress={manual} />
      </>
    );
  if (estimate)
    return (
      <>
        <Text accessibilityRole="header" style={N.title}>
          核对这一餐
        </Text>
        <Text style={N.caption}>
          {estimate.ai
            ? `AI 估算 · ${estimate.ai.imageSent ? "文字与照片" : "仅文字"}`
            : estimate.food.provenance?.kind === "manual"
              ? "手动填写 · 未填营养为未知"
              : "演示结果 · 不写入真实记录"}
        </Text>
        {estimate.ingredients.length > 0 && (
          <Text style={N.caption}>{estimate.ingredients.join(" · ")}</Text>
        )}
        {estimate.uncertainties.map((u, i) => (
          <Text key={i} style={N.caption}>
            {u}
          </Text>
        ))}
        <ImpactPreview
          key={estimate.food.version}
          food={estimate.food}
          snapshot={snapshot}
          date={date}
          meal={meal}
          adapter={adapter}
          onSaved={() => setHasSaved(true)}
        />
        {!hasSaved && (
          <Link title="补充描述后重新估算" onPress={() => setEstimate(null)} />
        )}
      </>
    );
  const photoControls = (
    <>
      {!!photos[mode] && (
        <Image
          source={{ uri: photos[mode] }}
          style={K.resultImage}
          resizeMode="contain"
          accessibilityLabel={
            mode === "meal" ? "餐食照片预览" : "包装正面照片预览"
          }
        />
      )}
      <Action
        title="拍照"
        secondary={!!photos[mode]}
        disabled={choosing || loading}
        onPress={() => void choose(true)}
      />
      <Link
        title="从相册选择"
        onPress={() => {
          if (!choosing && !loading) void choose(false);
        }}
      />
      {!!photos[mode] && (
        <Link
          title="清除这张照片"
          onPress={() => {
            if (choosing || loading) return;
            invalidate();
            const copy = copies.current[mode];
            if (copy) void removeUpload(copy.uri);
            delete copies.current[mode];
            setProcessed({ ...copies.current });
            setPhotos((p) => ({ ...p, [mode]: "" }));
            setMessage("照片已清除，相册原图保留。");
          }}
        />
      )}
      {choosing && (
        <Action
          title="取消图片处理"
          secondary
          onPress={() => processing.current?.abort()}
        />
      )}
      {processed[mode] && (
        <Text style={N.caption}>已在本机处理 · 尚未上传</Text>
      )}
    </>
  );
  return (
    <>
      <Text accessibilityRole="header" style={N.title}>
        {mode === "package"
          ? "包装食品"
          : stage === "text"
            ? "描述这一餐"
            : "拍摄餐食"}
      </Text>
      <Link
        title="更换记录方式"
        onPress={() => {
          if (!loading && !choosing) {
            invalidate();
            setStage("choose");
          }
        }}
      />
      {mode === "meal" ? (
        <>
          {stage === "photo" && photoControls}
          {stage === "photo" && (
            <Link
              title={descriptionOpen ? "收起补充描述" : "补充文字描述"}
              onPress={() => setDescriptionOpen(!descriptionOpen)}
            />
          )}
          {(stage === "text" || descriptionOpen) && (
            <TextInput
              accessibilityLabel="餐食补充描述"
              value={description}
              onChangeText={(v) => {
                setDescription(v);
                invalidate();
              }}
              placeholder="吃了什么、吃了多少？"
              multiline
              maxLength={4000}
              textAlignVertical="top"
              placeholderTextColor={c.muted}
              style={K.description}
            />
          )}
          {adapter.kind === "production" && (
            <>
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
              {!!photos.meal && !ai.supportsImage && (
                <Text style={N.caption}>
                  当前模型不支持图片，可改用文字或手动填写。
                </Text>
              )}
              <AiDisclosure
                scope={includeImage ? "meal-image" : "meal-text"}
                onSettings={onAiSettings}
              />
            </>
          )}
          <Action
            title={loading ? "正在请求 AI 估算…" : "估算这餐营养"}
            secondary={stage === "photo" && !photos.meal}
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
          <Link
            title="手动记录这一餐"
            onPress={() => {
              if (!loading && !choosing) manual();
            }}
          />
        </>
      ) : (
        <>
          <Action title="扫描 / 输入条码" onPress={onScan} />
          <Link title="在食品库手动查找" onPress={() => onLibrary()} />
          <Link
            title={packagePhoto ? "收起包装照片" : "拍摄包装正面辅助查找"}
            onPress={() => setPackagePhoto(!packagePhoto)}
          />
          {packagePhoto && (
            <>
              {photoControls}
              {adapter.kind === "production" && processed.package && (
                <PackageAssistant
                  image={processed.package}
                  onSettings={onAiSettings}
                  onCandidate={(candidate) => onLibrary(candidate.name)}
                  useLabel="核对后在食品库查找候选"
                />
              )}
            </>
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
              <Feedback>演示数据 · 未执行食品库匹配或 OCR。</Feedback>
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
