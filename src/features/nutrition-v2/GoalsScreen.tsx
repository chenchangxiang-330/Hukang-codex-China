import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image, Text, View } from "react-native";
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
  type TargetDraft,
  type TargetPolicy,
} from "../../services/nutrition/profile";
import { aiService } from "../../services/ai/runtime";
import { aiDisclosure } from "../../services/ai/disclosure";
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
  onDone,
  registerSave,
  initial = false,
}: {
  adapter: NutritionAdapter;
  snapshot: Snapshot;
  onSettings: () => void;
  onDone: () => void;
  initial?: boolean;
  registerSave?: (save: (() => Promise<void>) | null) => void;
}) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  useSyncExternalStore(aiDisclosure.subscribe, aiDisclosure.getSnapshot);
  const [profile, setProfile] = useState(s.profile ?? emptyProfile()),
    [open, setOpen] = useState(initial || !s.profile);
  const [draft, setDraft] = useState<TargetDraft | null>(s.targetDraft ?? null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [health, setHealth] = useState<string | null>(null),
    [healthOpen, setHealthOpen] = useState(false);
  const [manual, setManual] = useState(false),
    [referenceDetails, setReferenceDetails] = useState(false),
    [nutrient, setNutrient] = useState<Nutrient>("protein"),
    [type, setType] = useState<TargetPolicy["type"]>("target"),
    [value, setValue] = useState(""),
    [high, setHigh] = useState("");
  const pending = useRef<AbortController | null>(null),
    revision = useRef(0);
  const healthRef = useRef<string | null>(null);
  healthRef.current = health;
  useEffect(
    () => () => {
      pending.current?.abort();
      if (healthRef.current) deletePrivatePhoto(healthRef.current);
    },
    [],
  );
  const scope = health ? "health-image" : "profile";
  const change = (k: keyof PersonalProfile, v: string) => {
    revision.current++;
    pending.current?.abort();
    setProfile((p) => ({ ...p, [k]: v }));
    setMessage("");
  };
  async function saveProfile() {
    await adapter.saveProfile?.(profile);
    const p = adapter.getSnapshot().profile ?? profile;
    setProfile(p);
    return p;
  }
  useEffect(() => {
    registerSave?.(async () => {
      await saveProfile();
    });
    return () => registerSave?.(null);
  }, [profile]);
  async function saveLater() {
    try {
      await saveProfile();
      await adapter.deferOnboarding?.();
      onDone();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function recommend() {
    if (busy) return;
    const issues = profileIssues(profile);
    if (Object.keys(issues).length) {
      setMessage(Object.values(issues).join(" "));
      setOpen(true);
      return;
    }
    if (!aiDisclosure.allows(aiService.getSnapshot(), scope)) {
      setMessage("请确认本次发送内容。");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    const ticket = ++revision.current;
    setBusy(true);
    setMessage("");
    let upload: string | undefined;
    try {
      const p = await saveProfile();
      if (health) {
        upload = (await prepareUpload(health, controller.signal)).uri;
      }
      const d = await aiService.recommendTargets(p, upload, controller.signal);
      if (ticket !== revision.current) throw Error("资料已修改，请重新估算。");
      await adapter.saveTargetDraft?.(d);
      setDraft(d);
      setMessage("草案已生成，核对后再应用。");
    } catch (e) {
      setMessage(
        e instanceof AiError ? aiErrorMessage(e) : (e as Error).message,
      );
    } finally {
      if (upload) await removeUpload(upload);
      setBusy(false);
      pending.current = null;
    }
  }
  async function photo(camera: boolean) {
    revision.current++;
    pending.current?.abort();
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setMessage("相机权限未开启，可以从相册选择或跳过。");
          return;
        }
      }
      const result = await (
        camera
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync
      )({ mediaTypes: ["images"], quality: 1, exif: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const uri = await keepOriginal(
        asset.uri,
        "health-private",
        `health-${Date.now()}`,
      );
      await removePickerCopy(asset.uri);
      if (health) deletePrivatePhoto(health);
      setHealth(uri);
      setMessage("照片仅保存在本机，推荐时需另行确认发送。");
    } catch {
      setMessage("照片选择失败，可重试或跳过。");
    }
  }
  async function manualDraft() {
    try {
      const p = await saveProfile();
      const forced = ["protein", "fiber"].includes(nutrient)
        ? "target"
        : ["sodium", "added_sugars", "saturated_fat", "trans_fat"].includes(
              nutrient,
            )
          ? "upper_limit"
          : type;
      const policy: TargetPolicy = {
        type: forced,
        unit: nutrientInfo[nutrient][1],
        ...(forced === "range"
          ? { range: [Number(value), Number(high)] as [number, number] }
          : { value: Number(value) }),
        source: "用户手动设置",
        basis: "用户核对后的个人参考",
        applicability: "个人饮食记录参考",
        manual: true,
        profileRevision: p.revision,
      };
      const policies = validatePolicies({
        ...(draft?.profileRevision === p.revision ? draft.policies : {}),
        [nutrient]: policy,
      });
      const d = {
        policies,
        missing: draft?.missing ?? [],
        profileRevision: p.revision,
        generatedAt: new Date().toISOString(),
        model: draft?.model ?? "用户设置",
      };
      setDraft(d);
      await adapter.saveTargetDraft?.(d);
      setManual(false);
      setMessage("手改目标已加入草案，尚未替换现有目标。");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function apply() {
    if (!draft || busy) return;
    try {
      setBusy(true);
      await saveProfile();
      await adapter.applyTargetDraft?.(draft);
      setDraft(null);
      if (health) {
        deletePrivatePhoto(health);
        setHealth(null);
      }
      setMessage("已应用核对后的目标。");
      if (initial) onDone();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Text style={N.heading}>{initial ? "设置个人参考" : "个人参考目标"}</Text>
      {initial && (
        <Text style={N.caption}>可以先保存草稿，继续使用本机食品和记录。</Text>
      )}
      <Link
        title={ai.connection ? "AI 连接已保存" : "配置 AI 连接"}
        onPress={onSettings}
      />
      <Accordion
        title="个人资料"
        value={Object.keys(profileIssues(profile)).length ? "待完善" : "查看"}
        open={open}
        onToggle={() => setOpen(!open)}
      >
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
          placeholder="平时做什么运动？例如羽毛球、跑步；没有的话填无"
        />
        <Field
          label="每周运动频率（次/周）"
          value={profile.exerciseFrequencyPerWeek}
          onChange={(v) => change("exerciseFrequencyPerWeek", v)}
          numeric
          placeholder="一周几次？无运动填 0"
        />
        <Field
          label="性别（选填）"
          value={profile.sex ?? ""}
          onChange={(v) => change("sex", v)}
        />
        <Action
          title="保存资料草稿"
          secondary
          disabled={busy}
          onPress={() =>
            void saveProfile()
              .then(() => setMessage("资料草稿已保存。"))
              .catch((e) => setMessage(e.message))
          }
        />
      </Accordion>
      <Accordion
        title="体检照片（可跳过）"
        value={health ? "已选择" : "未选择"}
        open={healthOpen}
        onToggle={() => setHealthOpen(!healthOpen)}
      >
        <Text style={N.caption}>
          照片只用于本次推荐，独立于食品图片和普通导出。可随时删除。
        </Text>
        {health ? (
          <>
            <Image
              source={{ uri: health }}
              style={{ height: 160, width: "100%" }}
              resizeMode="contain"
            />
            <Link
              title="删除体检照片"
              onPress={() => {
                revision.current++;
                pending.current?.abort();
                deletePrivatePhoto(health);
                setHealth(null);
              }}
            />
          </>
        ) : (
          <>
            <Action
              title="拍摄体检照片"
              secondary
              onPress={() => void photo(true)}
            />
            <Action
              title="从相册选择体检照片"
              secondary
              onPress={() => void photo(false)}
            />
          </>
        )}
        <Link
          title="跳过体检照片"
          onPress={() => {
            revision.current++;
            pending.current?.abort();
            if (health) deletePrivatePhoto(health);
            setHealth(null);
            setHealthOpen(false);
          }}
        />
      </Accordion>
      <AiDisclosure scope={scope} onSettings={onSettings} />
      <Action
        title={
          busy
            ? "正在处理…"
            : Object.keys(s.targets).length
              ? "AI 重新估算"
              : "生成目标草案"
        }
        disabled={busy || !ai.connection}
        onPress={() => void recommend()}
      />
      {busy && (
        <Link title="取消推荐" onPress={() => pending.current?.abort()} />
      )}
      {draft && (
        <Card>
          <Text style={N.heading}>待确认草案</Text>
          {(Object.entries(draft.policies) as [Nutrient, TargetPolicy][]).map(
            ([k, p]) => (
              <View key={k} style={{ gap: 5 }}>
                <Text style={N.body}>
                  {nutrientInfo[k][0]}　{policyLabel(p)}
                  {p.manual ? " · 用户修改" : " · AI 推荐"}
                </Text>
                <Text style={N.caption}>
                  现有：{policyLabel(policyFor(s.targets, k))}
                  {policyFor(s.targets, k)?.manual ? " · 已手改" : ""}
                </Text>
                <Text style={N.caption}>
                  {p.basis} · {p.applicability}
                </Text>
              </View>
            ),
          )}
          {draft.missing.map((m, i) => (
            <Text key={i} style={N.caption}>
              待完善：{m}
            </Text>
          ))}
          <Action
            title="确认应用目标"
            disabled={busy || !Object.keys(draft.policies).length}
            onPress={() => void apply()}
          />
        </Card>
      )}
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
              ["target", "点目标"],
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
        {type === "range" &&
          ![
            "protein",
            "fiber",
            "sodium",
            "added_sugars",
            "saturated_fat",
            "trans_fat",
          ].includes(nutrient) && (
            <Field
              label={`上限（${nutrientInfo[nutrient][1]}）`}
              value={high}
              onChange={setHigh}
              numeric
            />
          )}
        <Action
          title="加入目标草案"
          secondary
          disabled={busy}
          onPress={() => void manualDraft()}
        />
      </Accordion>
      {!draft && (
        <Card>
          <Text style={N.heading}>当前参考</Text>
          {(Object.keys(nutrientInfo) as Nutrient[])
            .filter((k) => policyFor(s.targets, k))
            .map((k) => (
              <Text key={k} style={N.body}>
                {nutrientInfo[k][0]}　{policyLabel(policyFor(s.targets, k))}
                {policyFor(s.targets, k)?.manual ? " · 用户修改" : ""}
              </Text>
            ))}
          {!Object.keys(s.targets).length && (
            <Text style={N.caption}>尚未设置目标。</Text>
          )}
          {!!Object.keys(s.targets).length && (
            <Accordion
              title="目标依据与应用时间"
              value="查看"
              open={referenceDetails}
              onToggle={() => setReferenceDetails(!referenceDetails)}
            >
              {(Object.keys(nutrientInfo) as Nutrient[])
                .filter((k) => policyFor(s.targets, k))
                .map((k) => {
                  const p = policyFor(s.targets, k)!;
                  return (
                    <View key={k} style={{ gap: 4 }}>
                      <Text style={N.body}>
                        {nutrientInfo[k][0]} ·{" "}
                        {p.manual ? "用户修改" : "AI 推荐"}
                      </Text>
                      <Text style={N.caption}>
                        {p.source} · {p.basis} · {p.applicability}
                      </Text>
                      <Text style={N.caption}>
                        {p.appliedAt
                          ? `应用于 ${new Date(p.appliedAt).toLocaleString()}`
                          : "既有目标，应用时间未记录"}
                      </Text>
                    </View>
                  );
                })}
            </Accordion>
          )}
        </Card>
      )}
      {!!message && <Feedback>{message}</Feedback>}
      {initial && (
        <Action
          title="保存草稿，稍后继续"
          secondary
          disabled={busy}
          onPress={() => void saveLater()}
        />
      )}
    </>
  );
}
