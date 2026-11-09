import {
  keepOriginal,
  deletePrivatePhoto,
} from "../../services/nutrition/privatePhotos";
import {
  prepareUpload,
  removeUpload,
  removePickerCopy,
  type UploadImage,
} from "../../services/ai/images";
import { AiDisclosure } from "./AiDisclosure";
import { aiDisclosure } from "../../services/ai/disclosure";
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
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
import { aiErrorMessage } from "../../services/ai/errors";

export function ImpactPreview({
  food: initialFood,
  snapshot,
  date,
  meal,
  adapter,
  onStock,
  onSaved,
  mealResult = false,
}: {
  food: Food;
  snapshot: Snapshot;
  date: string;
  meal: Meal;
  adapter: NutritionAdapter;
  onStock?: () => void;
  onSaved?: () => void;
  mealResult?: boolean;
}) {
  const resumed =
    snapshot.intakeDraft?.food.id === initialFood.id
      ? snapshot.intakeDraft
      : null;
  const [food, setFood] = useState(resumed?.food ?? initialFood),
    [day, setDay] = useState(resumed?.date ?? date),
    [selectedMeal, setMeal] = useState<Meal>(resumed?.meal ?? meal);
  const [amount, setAmount] = useState(
      mealResult ? "1" : resumed ? String(resumed.amount) : "",
    ),
    [unit, setUnit] = useState<PortionUnit>(
      mealResult ? "份" : (resumed?.unit ?? food.basis.unit),
    );
  const [selection, setSelection] = useState(mealResult ? "1" : ""),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [details, setDetails] = useState(false),
    [message, setMessage] = useState("");
  const [time, setTime] = useState(
    resumed?.consumedTime ??
      `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
  );
  const zone =
    resumed?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const operation = useRef(
      resumed?.id ??
        `intake-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ),
    submitted = useRef(false);
  const committed =
    saved || snapshot.entries.some((e) => e.id === operation.current);
  const one =
    food.basis.unit === "份"
      ? { amount: 1, unit: "份" as const }
      : food.serving?.unit === food.basis.unit
        ? food.serving
        : null;
  const beverage = food.basis.unit === "mL";
  let entry: Entry | null = null,
    validation = "";
  try {
    if (mealResult && (food.basis.unit !== "份" || food.basis.amount !== 1))
      throw Error("整餐营养基准无效，请重新估算。");
    if (!selection) throw Error("请选择实际食用份量。");
    entry = {
      id: operation.current,
      date: day,
      meal: selectedMeal,
      food,
      amount: parsePortion(amount),
      unit,
      consumedTime: time,
      timezone: zone,
    };
    if (adapter.kind === "production")
      snapshotEntry({ ...entry, food: { ...entry.food, image: undefined } });
    else validateEntry(entry);
  } catch (e) {
    validation = (e as Error).message;
    entry = null;
  }
  // Persist a recoverable draft, never a daily intake. A resumed draft still
  // requires a new explicit portion choice and confirmation.
  let recoverable: Entry | null = null;
  try {
    recoverable = snapshotEntry(
      entry ?? {
        id: operation.current,
        date: day,
        meal: selectedMeal,
        food,
        amount: food.basis.amount,
        unit: food.basis.unit,
        consumedTime: time,
        timezone: zone,
      },
    );
  } catch {
    /* Keep the last valid draft while a field is incomplete. */
  }
  const draftJson =
    recoverable && !committed ? JSON.stringify(recoverable) : "";
  const latestDraft = useRef("");
  latestDraft.current = draftJson;
  useEffect(() => {
    if (!draftJson || saving || adapter.kind !== "production") return;
    const timer = setTimeout(() => {
      void adapter
        .saveIntakeDraft?.(JSON.parse(draftJson))
        .catch(() => setMessage("草稿暂未保存，请重试；尚未计入摄入。"));
    }, 350);
    return () => clearTimeout(timer);
  }, [draftJson, saving]);
  useEffect(
    () => () => {
      if (latestDraft.current && adapter.kind === "production")
        void adapter
          .saveIntakeDraft?.(JSON.parse(latestDraft.current))
          .catch(() => {});
    },
    [],
  );
  const projected =
    entry && !committed ? [...snapshot.entries, entry] : snapshot.entries;
  const changed = () => {
    setConfirmed(false);
    setMessage("");
  };
  async function confirm() {
    if (!entry || submitted.current || committed) return;
    submitted.current = true;
    setSaving(true);
    try {
      await adapter.saveIntakeDraft?.(entry);
      await adapter.record(entry, operation.current);
      latestDraft.current = "";
      setSaved(true);
      setMessage(
        adapter.kind === "production"
          ? "已保存这次食用。"
          : "演示记录已更新，未写入真实数据。",
      );
      onSaved?.();
    } catch (e) {
      submitted.current = false;
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (mealResult)
    return (
      <>
        <View
          pointerEvents={saving || committed ? "none" : "auto"}
          style={{ gap: 12 }}
        >
          <Card>
            <Field
              label="餐食名称"
              value={food.name}
              onChange={(name) =>
                setFood({
                  ...food,
                  name,
                  provenance: {
                    ...(food.provenance ?? { kind: "ai" }),
                    nameEdited: true,
                  },
                })
              }
            />
            <Text style={N.caption}>AI 估算 · 1 份</Text>
            {(
              [
                "energy",
                "protein",
                "carbohydrate",
                "fat",
                "fiber",
                "total_sugars",
                "added_sugars",
                "sodium",
                ...Object.keys(nutrientInfo).filter(
                  (k) =>
                    ![
                      "energy",
                      "protein",
                      "carbohydrate",
                      "fat",
                      "fiber",
                      "total_sugars",
                      "added_sugars",
                      "sodium",
                    ].includes(k) &&
                    food.nutrients[k as keyof typeof nutrientInfo]?.status !==
                      "unknown" &&
                    food.nutrients[k as keyof typeof nutrientInfo],
                ),
              ] as (keyof typeof nutrientInfo)[]
            ).map((k) => (
              <NutrientLine
                key={k}
                title={nutrientInfo[k][0]}
                total={contribution(
                  {
                    id: operation.current,
                    date: day,
                    meal: selectedMeal,
                    food,
                    amount: 1,
                    unit: "份",
                  },
                  k,
                )}
              />
            ))}
            <FoodEditor compact food={food} onChange={setFood} />
          </Card>
          <Card>
            <Field
              label="食用日期"
              value={day}
              onChange={setDay}
              placeholder="YYYY-MM-DD"
            />
            <Field
              label="食用时间"
              value={time}
              onChange={setTime}
              placeholder="HH:mm"
            />
            <Choices
              value={selectedMeal}
              options={Object.entries(meals)}
              accessibilityPrefix="食用餐次"
              onChange={(v) => setMeal(v as Meal)}
            />
          </Card>
          {!!validation && <Feedback>{validation}</Feedback>}
          <Action
            title={saving ? "正在保存…" : committed ? "已保存" : "确认保存"}
            disabled={
              !entry || saving || committed || snapshot.status !== "ready"
            }
            onPress={() => void confirm()}
          />
        </View>
        {!!message && <Feedback>{message}</Feedback>}
      </>
    );
  return (
    <>
      <View
        pointerEvents={saving || committed ? "none" : "auto"}
        style={{ gap: 12 }}
      >
        <Card>
          <FoodEditor
            food={food}
            onChange={(f) => {
              setFood(f);
              setSelection("");
              changed();
            }}
          />
          {food.image && (
            <Image
              source={{ uri: food.image }}
              style={K.resultImage}
              resizeMode="contain"
              accessibilityLabel="本机原图预览"
            />
          )}
        </Card>
        <Card>
          <Text style={N.heading}>{dateLabel(day)} · 食用预测</Text>
          {(["protein", "energy", "fat", "fiber"] as const).map((k) => {
            const before = total(snapshot.entries, day, k),
              after = total(projected, day, k),
              added = entry ? contribution(entry, k) : null;
            return (
              <View key={k} style={{ gap: 3 }}>
                <Text style={N.body}>{nutrientInfo[k][0]}</Text>
                <Text style={N.caption}>
                  {before.count ? formatTotal(before) : "尚未记录"}
                  {entry
                    ? ` + ${formatTotal(added!)} → ${formatTotal(after)}`
                    : ""}{" "}
                  {nutrientInfo[k][1]}
                  {after.missing ? " · 已知小计 / 数据缺失" : ""}
                  {after.estimated ? " · 估算" : ""}
                </Text>
              </View>
            );
          })}
          <View style={N.wrap}>
            {[0.5, 1].map((n) => (
              <Action
                key={n}
                title={`${beverage ? "喝" : "吃"}${n === 0.5 ? "半" : "一"}份`}
                secondary
                disabled={!one}
                onPress={() => {
                  if (!one) return;
                  setSelection(String(n));
                  setAmount(String(one.amount * n));
                  setUnit(one.unit);
                  changed();
                }}
              />
            ))}
            <Action
              title={`自己填写${beverage ? "喝" : "吃"}多少`}
              secondary
              onPress={() => {
                setSelection("custom");
                setUnit(food.basis.unit);
                changed();
              }}
            />
          </View>
          <Text style={N.caption}>
            {one
              ? `一份 = ${one.amount}${one.unit} · 营养基准 ${food.basis.amount}${food.basis.unit}`
              : "每份重量或容量未知，请填写实际数量；不把每 100g 当作一包。"}
          </Text>
          {selection === "custom" && (
            <Field
              label={`实际食用份量（${unit}）`}
              value={amount}
              onChange={(v) => {
                setAmount(v);
                changed();
              }}
              numeric
            />
          )}
          {!!selection && selection !== "custom" && (
            <Text style={N.body}>
              本次 {amount} {unit}
            </Text>
          )}
          <Field
            label="拟食用日期"
            value={day}
            onChange={(v) => {
              setDay(v);
              changed();
            }}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="食用时间"
            value={time}
            onChange={(v) => {
              setTime(v);
              changed();
            }}
            placeholder="HH:mm"
          />
          <Choices
            value={selectedMeal}
            options={Object.entries(meals)}
            accessibilityPrefix="拟食用餐次"
            onChange={(v) => {
              setMeal(v as Meal);
              changed();
            }}
          />
          <Accordion
            title="营养与来源"
            value="查看"
            open={details}
            onToggle={() => setDetails(!details)}
          >
            <Text style={N.caption}>{food.source}</Text>
            <Text style={N.caption}>
              时区 {zone}。确认前不累计；份量由已知基准计算，不另行请求 AI。
            </Text>
            {entry &&
              (Object.keys(nutrientInfo) as (keyof typeof nutrientInfo)[]).map(
                (k) => (
                  <NutrientLine
                    key={k}
                    title={nutrientInfo[k][0]}
                    total={contribution(entry!, k)}
                  />
                ),
              )}
          </Accordion>
          {!!selection && validation && <Feedback>{validation}</Feedback>}
          {entry && (
            <>
              <Check
                label="我已确认日期、餐次和实际食用份量"
                value={confirmed}
                onChange={setConfirmed}
              />
              <Action
                title={
                  saving
                    ? "正在保存…"
                    : committed
                      ? "已保存这次食用"
                      : "确认食用"
                }
                disabled={
                  !confirmed ||
                  saving ||
                  committed ||
                  snapshot.status !== "ready"
                }
                onPress={() => void confirm()}
              />
            </>
          )}
        </Card>
      </View>
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
  const [stage, setStage] = useState<"choose" | "photo">("choose"),
    [original, setOriginal] = useState(snapshot.captureDraft?.original ?? ""),
    [description, setDescription] = useState(
      snapshot.captureDraft?.description ?? "",
    );
  const [estimate, setEstimate] = useState<MealEstimate | null>(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [choosing, setChoosing] = useState(false),
    [hasSaved, setHasSaved] = useState(false);
  const uploadCopy = useRef<{ original: string; upload: UploadImage } | null>(
    null,
  );
  const request = useRef<AbortController | null>(null),
    generation = useRef(0),
    live = useRef(true),
    picker = useRef(false);
  const draftId = useRef(
    snapshot.captureDraft?.id ??
      `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const persist = async (uri = original, text = description) => {
    await adapter.saveCaptureDraft?.(
      uri ? { id: draftId.current, original: uri, description: text } : null,
    );
  };
  const invalidate = () => {
    request.current?.abort();
    generation.current++;
    setLoading(false);
    setEstimate(null);
    setMessage("");
  };
  useEffect(
    () => () => {
      live.current = false;
      request.current?.abort();
      generation.current++;
      if (uploadCopy.current) void removeUpload(uploadCopy.current.upload.uri);
    },
    [],
  );
  useEffect(() => {
    if (!visible) request.current?.abort();
  }, [visible]);
  useEffect(() => {
    invalidate();
  }, [ai.revision]);
  useEffect(() => {
    registerBack(() => {
      if (loading) {
        request.current?.abort();
        return true;
      }
      if (choosing) return true;
      if (hasSaved) return false;
      if (estimate) {
        setEstimate(null);
        return true;
      }
      if (stage === "photo") {
        void persist().catch(() => setMessage("草稿保存失败，请重试。"));
        setStage("choose");
        return true;
      }
      return false;
    });
    return () => registerBack(null);
  }, [stage, estimate, hasSaved, loading, choosing, original, description]);
  useEffect(() => {
    if (visible) onStepChange();
  }, [stage, !!estimate]);
  async function choose(camera: boolean) {
    if (picker.current) return;
    picker.current = true;
    setChoosing(true);
    invalidate();
    let source = "",
      kept = "";
    let processed: UploadImage | undefined;
    const ticket = generation.current;
    try {
      if (camera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) throw Error("相机权限未开启，可以改用相册。");
      }
      const result = await (
        camera
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync
      )({ mediaTypes: ["images"], quality: 1, allowsEditing: false });
      if (result.canceled || !result.assets[0]) return;
      source = result.assets[0].uri;
      if (!live.current || ticket !== generation.current) return;
      const controller = new AbortController();
      request.current = controller;
      processed = await prepareUpload(source, controller.signal);
      if (uploadCopy.current) await removeUpload(uploadCopy.current.upload.uri);
      uploadCopy.current = null;
      const uri =
        adapter.kind === "demo"
          ? source
          : await keepOriginal(
              source,
              "meal-drafts",
              `${draftId.current}-${Date.now()}`,
            );
      kept = uri;
      if (
        !live.current ||
        ticket !== generation.current ||
        controller.signal.aborted
      )
        return;
      await persist(uri);
      kept = "";
      if (!live.current) return;
      uploadCopy.current = { original: uri, upload: processed };
      processed = undefined;
      if (original && adapter.kind === "production")
        deletePrivatePhoto(original);
      setOriginal(uri);
      setMessage("");
    } catch (e) {
      if (live.current) setMessage((e as Error).message);
    } finally {
      if (processed) await removeUpload(processed.uri);
      if (kept && adapter.kind === "production") deletePrivatePhoto(kept);
      if (source && adapter.kind === "production")
        await removePickerCopy(source);
      picker.current = false;
      request.current = null;
      if (live.current) setChoosing(false);
    }
  }
  async function run() {
    if (request.current || loading) return;
    if (!original) {
      setMessage("请先拍照或选择餐食照片。");
      return;
    }
    if (adapter.kind === "production" && !ai.supportsImage) {
      setMessage("当前模型不支持餐食照片，请在 AI 设置中选择支持图片的模型。");
      return;
    }
    if (
      adapter.kind === "production" &&
      !aiDisclosure.allows(aiService.getSnapshot(), "meal-image")
    ) {
      setMessage("请前往 AI 设置授权发送餐食照片。");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const ticket = ++generation.current;
    setLoading(true);
    setMessage("");
    let upload: UploadImage | undefined;
    try {
      await persist();
      upload =
        uploadCopy.current?.original === original
          ? uploadCopy.current.upload
          : await prepareUpload(original, controller.signal);
      const input = { imageUri: upload.uri, description, includeImage: true };
      const result =
        adapter.kind === "demo" && adapter.demoEstimateMeal
          ? await adapter.demoEstimateMeal(input)
          : await aiService.estimateMeal(input, controller.signal);
      if (
        !live.current ||
        ticket !== generation.current ||
        controller.signal.aborted
      )
        return;
      result.food = { ...result.food, kind: "meal", image: original };
      await adapter.saveIntakeDraft?.({
        id: `intake-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: localDay(),
        meal,
        food: result.food,
        amount: result.food.basis.amount,
        unit: result.food.basis.unit,
        consumedTime: `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setEstimate(result);
    } catch (e) {
      if (live.current && ticket === generation.current)
        setMessage(
          e instanceof Error && !(e as { code?: string }).code
            ? e.message
            : aiErrorMessage(e),
        );
    } finally {
      if (upload) await removeUpload(upload.uri);
      uploadCopy.current = null;
      if (request.current === controller) request.current = null;
      if (live.current && ticket === generation.current) setLoading(false);
    }
  }
  if (!visible) return null;
  if (stage === "choose")
    return (
      <>
        <Text accessibilityRole="header" style={N.title}>
          记录一餐
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="餐食估算"
          style={K.mode}
          onPress={() => setStage("photo")}
        >
          <Text style={N.heading}>餐食</Text>
          <Text style={N.caption}>拍照或选图，AI 估算 ›</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="包装食品"
          style={K.mode}
          onPress={onScan}
        >
          <Text style={N.heading}>包装食品</Text>
          <Text style={N.caption}>扫描条码 ›</Text>
        </Pressable>
      </>
    );
  if (estimate)
    return (
      <>
        <Text style={N.title}>核对这一餐</Text>
        {adapter.kind === "demo" && <Text style={N.caption}>隔离演示数据</Text>}
        <ImpactPreview
          key={estimate.food.version}
          mealResult
          food={estimate.food}
          snapshot={snapshot}
          date={localDay()}
          meal={meal}
          adapter={adapter}
          onSaved={() => setHasSaved(true)}
        />
        {!hasSaved && (
          <Link title="返回照片，重新估算" onPress={() => setEstimate(null)} />
        )}
      </>
    );
  return (
    <>
      <Text style={N.title}>拍摄餐食</Text>
      <Card>
        {original ? (
          <View>
            <Image
              source={{ uri: original }}
              style={K.resultImage}
              resizeMode="contain"
              accessibilityLabel="餐食原图预览"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="删除这张照片"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                width: 48,
                height: 48,
                backgroundColor: c.surface,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
              }}
              disabled={choosing || loading}
              onPress={() => {
                invalidate();
                if (uploadCopy.current)
                  void removeUpload(uploadCopy.current.upload.uri);
                uploadCopy.current = null;
                void persist("", description)
                  .then(() => {
                    if (adapter.kind === "production")
                      deletePrivatePhoto(original);
                    setOriginal("");
                  })
                  .catch((e) => setMessage(e.message));
              }}
            >
              <Text style={{ color: c.ink, fontSize: 26 }}>×</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={N.caption}>选择一张清楚的餐食照片。</Text>
        )}
        <Action
          title="拍照"
          secondary={!!original}
          disabled={choosing || loading}
          onPress={() => void choose(true)}
        />
        <Link
          title="从相册选择"
          onPress={() => {
            if (!choosing && !loading) void choose(false);
          }}
        />
        <TextInput
          accessibilityLabel="餐食补充描述"
          value={description}
          onChangeText={(v) => {
            setDescription(v);
            invalidate();
          }}
          onBlur={() => void persist().catch((e) => setMessage(e.message))}
          placeholder="选填：半碗米饭、鸡腿去皮…"
          multiline
          maxLength={4000}
          textAlignVertical="top"
          placeholderTextColor={c.muted}
          style={K.description}
        />
      </Card>
      {original && adapter.kind === "production" && (
        <>
          <AiDisclosure
            scope="meal-image"
            onSettings={() => {
              void persist()
                .then(onAiSettings)
                .catch((e) => setMessage(e.message));
            }}
          />
        </>
      )}
      <Action
        title={loading ? "正在估算…" : "估算这餐营养"}
        disabled={
          !original ||
          loading ||
          choosing ||
          (adapter.kind === "production" && !ai.supportsImage)
        }
        onPress={() => void run()}
      />
      {choosing && (
        <Link title="取消图片处理" onPress={() => request.current?.abort()} />
      )}

      {loading && (
        <Link title="取消本次估算" onPress={() => request.current?.abort()} />
      )}
      {!!message && <Feedback>{message}</Feedback>}
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
