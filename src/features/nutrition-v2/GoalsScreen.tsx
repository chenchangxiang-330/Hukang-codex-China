import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Field, Choices } from "../simple/ui";
import { Action, Accordion, Card, Feedback, Link, N } from "./components";
import { AiDisclosure } from "./AiDisclosure";
import { policyLabel } from "./NutrientProgress";
import {
  nutrientInfo,
  type Nutrient,
  type NutritionAdapter,
  type Snapshot,
} from "./model";
import {
  emptyProfile,
  profileIssues,
  policyFor,
  validatePolicies,
  type PersonalProfile,
  type TargetPolicy,
} from "../../services/nutrition/profile";
import { aiService } from "../../services/ai/runtime";
import { aiDisclosure } from "../../services/ai/disclosure";
import { imageLimits } from "../../services/ai/config";
import { AiError, aiErrorMessage } from "../../services/ai/errors";
import {
  keepOriginal,
  deletePrivatePhoto,
} from "../../services/nutrition/privatePhotos";
import {
  prepareUpload,
  removeUpload,
  removePickerCopy,
} from "../../services/ai/images";

export function GoalsScreen({
  adapter,
  snapshot: s,
  onSettings,
  onDraft,
  registerSave,
}: {
  adapter: NutritionAdapter;
  snapshot: Snapshot;
  onSettings: () => void;
  onDraft: () => void;
  registerSave?: (save: (() => Promise<void>) | null) => void;
}) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  const [profile, setProfile] = useState(s.profile ?? emptyProfile());
  const [photos, setPhotos] = useState<readonly string[]>(s.healthPhotos ?? []);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [choosing, setChoosing] = useState(false);
  const pending = useRef<AbortController | null>(null),
    revision = useRef(0),
    live = useRef(true),
    picking = useRef(false);
  const latest = useRef(profile),
    saves = useRef<Promise<void>>(Promise.resolve());
  latest.current = profile;
  const save = (p: PersonalProfile) => {
    const next = saves.current
      .catch(() => {})
      .then(async () => {
        await adapter.saveProfile?.(p);
      });
    saves.current = next;
    return next;
  };
  useEffect(() => {
    registerSave?.(async () => {
      pending.current?.abort();
      await save(latest.current);
    });
    return () => {
      registerSave?.(null);
      live.current = false;
      pending.current?.abort();
    };
  }, []);
  const change = (k: keyof PersonalProfile, value: string) => {
    revision.current++;
    pending.current?.abort();
    const p = { ...latest.current, [k]: value };
    latest.current = p;
    setProfile(p);
    setMessage("");
    void save(p).catch(() => {
      if (live.current) setMessage("资料暂未保存，请重试。");
    });
  };
  async function choose() {
    if (picking.current || pending.current) return;
    picking.current = true;
    setChoosing(true);
    setMessage("");
    const added: string[] = [];
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        exif: false,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, 6 - photos.length),
        orderedSelection: true,
      });
      if (result.canceled) return;
      if (photos.length + result.assets.length > 6)
        throw new AiError("image_count");
      for (const asset of result.assets) {
        const uri = await keepOriginal(
          asset.uri,
          "health-private",
          `health-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        );
        added.push(uri);
        await removePickerCopy(asset.uri);
      }
      if (!live.current) return;
      const next = [...photos, ...added];
      await saves.current;
      await adapter.saveHealthPhotos?.(next);
      revision.current++;
      setPhotos(next);
      added.length = 0;
    } catch (e) {
      if (live.current)
        setMessage(
          e instanceof AiError ? aiErrorMessage(e) : "照片未添加，请重试。",
        );
    } finally {
      for (const uri of added) {
        try {
          deletePrivatePhoto(uri);
        } catch {}
      }
      picking.current = false;
      if (live.current) setChoosing(false);
    }
  }
  async function remove(uri: string) {
    if (picking.current || busy) return;
    picking.current = true;
    setChoosing(true);
    revision.current++;
    pending.current?.abort();
    try {
      const next = photos.filter((p) => p !== uri);
      await saves.current;
      await adapter.saveHealthPhotos?.(next);
      setPhotos(next);
      setPreview(null);
      deletePrivatePhoto(uri);
      setMessage("");
    } catch {
      setMessage("删除未完成，请重试。");
    } finally {
      picking.current = false;
      setChoosing(false);
    }
  }
  async function recommend() {
    if (pending.current || picking.current) return;
    const issues = Object.values(profileIssues(latest.current));
    if (issues.length) {
      setMessage(issues[0]!);
      return;
    }
    const context = aiService.getSnapshot();
    if (!context.connection) {
      setMessage("请先保存 AI 连接。");
      return;
    }
    if (
      !aiDisclosure.allows(context, photos.length ? "health-image" : "profile")
    ) {
      setMessage("请前往 AI 设置授权发送这类资料。");
      return;
    }
    if (photos.length && !imageLimits(context)) {
      setMessage("当前模型不支持图片。");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const ticket = ++revision.current;
    const uploads: string[] = [];
    setBusy(true);
    setMessage("");
    try {
      await save(latest.current);
      const p = adapter.getSnapshot().profile ?? latest.current;
      for (const uri of photos) {
        const upload = await prepareUpload(uri, controller.signal);
        if (
          context.provider === "qwen" &&
          (Math.min(upload.width, upload.height) <= 10 ||
            Math.max(upload.width, upload.height) /
              Math.min(upload.width, upload.height) >
              200)
        ) {
          await removeUpload(upload.uri);
          throw new AiError("image_invalid");
        }
        uploads.push(upload.uri);
      }
      if (
        controller.signal.aborted ||
        context.revision !== aiService.getSnapshot().revision
      )
        throw new AiError("changed");
      const result = await aiService.recommendTargets(
        p,
        uploads,
        controller.signal,
      );
      if (
        !live.current ||
        ticket !== revision.current ||
        controller.signal.aborted
      )
        return;
      await adapter.saveTargetDraft?.({ ...result, healthPhotos: [...photos] });
      onDraft();
    } catch (e) {
      if (live.current)
        setMessage(
          e instanceof AiError ? aiErrorMessage(e) : (e as Error).message,
        );
    } finally {
      for (const uri of uploads) await removeUpload(uri);
      pending.current = null;
      if (live.current) setBusy(false);
    }
  }
  return (
    <>
      <Text style={N.title}>个人资料</Text>
      <Card>
        <Field
          label="年龄（岁）"
          value={profile.age}
          onChange={(v) => change("age", v)}
          numeric
        />
        <Field
          label="身高（cm）"
          value={profile.heightCm}
          onChange={(v) => change("heightCm", v)}
          numeric
        />
        <Field
          label="体重（kg）"
          value={profile.weightKg}
          onChange={(v) => change("weightKg", v)}
          numeric
        />
        <Field
          label="运动状况"
          value={profile.exerciseDescription}
          onChange={(v) => change("exerciseDescription", v)}
          placeholder="例如跑步；没有运动填无"
        />
        <Field
          label="每周运动频率（次/周）"
          value={profile.exerciseFrequencyPerWeek}
          onChange={(v) => change("exerciseFrequencyPerWeek", v)}
          numeric
          placeholder="无运动填 0"
        />
        <Field
          label="性别（选填）"
          value={profile.sex ?? ""}
          onChange={(v) => change("sex", v)}
        />
      </Card>
      <View style={{ gap: 8 }}>
        <Text style={N.heading}>体检照片</Text>
        <Link
          title={choosing ? "正在处理照片…" : "从相册选择"}
          onPress={() => void choose()}
        />
        {!!photos.length && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {photos.map((uri, i) => (
              <View key={uri} style={{ width: 96 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`预览体检照片 ${i + 1}`}
                  onPress={() => setPreview(uri)}
                  style={{ minHeight: 96 }}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: 96, height: 96, borderRadius: 14 }}
                    resizeMode="cover"
                  />
                </Pressable>
                <Link
                  title={`删除照片 ${i + 1}`}
                  onPress={() => void remove(uri)}
                />
              </View>
            ))}
          </View>
        )}
      </View>
      <AiDisclosure
        scope={photos.length ? "health-image" : "profile"}
        onSettings={onSettings}
      />
      <Action
        title={busy ? "正在生成…" : "生成目标草案"}
        disabled={busy || choosing}
        onPress={() => void recommend()}
      />
      {busy && (
        <Link title="取消推荐" onPress={() => pending.current?.abort()} />
      )}
      {!!message && <Feedback>{message}</Feedback>}
      <Modal
        visible={!!preview}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#42382DEE",
            padding: 24,
            paddingTop: 60,
            paddingBottom: 50,
          }}
        >
          <Action title="关闭照片预览" onPress={() => setPreview(null)} />
          {preview && (
            <Image
              source={{ uri: preview }}
              resizeMode="contain"
              style={{ flex: 1, width: "100%" }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

export function TargetDraftScreen({
  adapter,
  snapshot,
  onDone,
}: {
  adapter: NutritionAdapter;
  snapshot: Snapshot;
  onDone: () => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    draft = snapshot.targetDraft;
  const valid = draft && draft.profileRevision === snapshot.profile?.revision;
  async function apply() {
    if (!draft || !valid || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await adapter.applyTargetDraft?.(draft);
      onDone();
    } catch (e) {
      setMessage((e as Error).message);
      lock.current = false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={N.title}>目标草案</Text>
      {valid ? (
        <>
          <Card>
            {(Object.entries(draft.policies) as [Nutrient, TargetPolicy][]).map(
              ([key, policy]) => (
                <View
                  key={key}
                  style={[
                    N.row,
                    { flexWrap: "wrap", justifyContent: "space-between" },
                  ]}
                >
                  <Text style={N.body}>{nutrientInfo[key][0]}</Text>
                  <Text style={N.body}>{policyLabel(policy)}</Text>
                </View>
              ),
            )}
          </Card>
          {!!draft.missing.length && (
            <Text style={N.caption}>{draft.missing[0]}</Text>
          )}
          <Action
            title={busy ? "正在应用…" : "确认应用目标"}
            disabled={busy || !Object.keys(draft.policies).length}
            onPress={() => void apply()}
          />
        </>
      ) : (
        <Text style={N.body}>资料已变化，请返回重新生成草案。</Text>
      )}
      {!!message && <Feedback>{message}</Feedback>}
    </>
  );
}

/** Existing-target management stays separate from the two recommendation steps. */
export function TargetManagementScreen({
  adapter,
  snapshot: s,
  onProfile,
  onDraft,
}: {
  adapter: NutritionAdapter;
  snapshot: Snapshot;
  onProfile: () => void;
  onDraft: () => void;
}) {
  const [manual, setManual] = useState(false),
    [nutrient, setNutrient] = useState<Nutrient>("protein"),
    [type, setType] = useState<TargetPolicy["type"]>("target"),
    [value, setValue] = useState(""),
    [high, setHigh] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const effectiveType = ["protein", "fiber"].includes(nutrient)
    ? "target"
    : ["sodium", "added_sugars", "saturated_fat", "trans_fat"].includes(
          nutrient,
        )
      ? "upper_limit"
      : type;
  async function apply() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const policy = validatePolicies({
        [nutrient]: {
          type: effectiveType,
          unit: nutrientInfo[nutrient][1],
          ...(effectiveType === "range"
            ? { range: [Number(value), Number(high)] }
            : { value: Number(value) }),
          source: "用户手动设置",
          basis: "用户核对后的个人参考",
          applicability: "个人饮食记录参考",
          manual: true,
          profileRevision: s.profile?.revision ?? 0,
          appliedAt: new Date().toISOString(),
        },
      });
      await adapter.configureTargets({
        ...s.targets,
        policies: { ...s.targets.policies, ...policy },
      });
      setManual(false);
      setMessage("目标已更新。");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={N.title}>个人参考目标</Text>
      <Link title="个人资料与目标推荐" onPress={onProfile} />
      {s.targetDraft && <Link title="查看目标草案" onPress={onDraft} />}
      <Card>
        {(Object.keys(nutrientInfo) as Nutrient[])
          .filter((k) => policyFor(s.targets, k))
          .map((k) => (
            <View
              key={k}
              style={[
                N.row,
                { flexWrap: "wrap", justifyContent: "space-between" },
              ]}
            >
              <Text style={N.body}>{nutrientInfo[k][0]}</Text>
              <Text style={N.body}>{policyLabel(policyFor(s.targets, k))}</Text>
            </View>
          ))}
        {!Object.keys(s.targets).length && (
          <Text style={N.caption}>尚未设置目标</Text>
        )}
      </Card>
      <Accordion
        title="手动修改目标"
        value="编辑"
        open={manual}
        onToggle={() => setManual(!manual)}
      >
        <Choices
          value={nutrient}
          options={Object.entries(nutrientInfo).map(([k, [label]]) => [
            k,
            label,
          ])}
          onChange={(v) => {
            setNutrient(v as Nutrient);
            setValue("");
            setHigh("");
          }}
        />
        {![
          "protein",
          "fiber",
          "sodium",
          "added_sugars",
          "saturated_fat",
          "trans_fat",
        ].includes(nutrient) && (
          <Choices
            value={type}
            options={[
              ["target", "目标"],
              ["range", "参考区间"],
              ["upper_limit", "参考上限"],
            ]}
            onChange={(v) => setType(v as TargetPolicy["type"])}
          />
        )}
        <Field
          label={`目标或下限（${nutrientInfo[nutrient][1]}）`}
          value={value}
          onChange={setValue}
          numeric
        />
        {effectiveType === "range" && (
          <Field
            label={`上限（${nutrientInfo[nutrient][1]}）`}
            value={high}
            onChange={setHigh}
            numeric
          />
        )}
        <Action
          title="保存目标修改"
          disabled={busy}
          onPress={() => void apply()}
        />
      </Accordion>
      {!!message && <Feedback>{message}</Feedback>}
    </>
  );
}
