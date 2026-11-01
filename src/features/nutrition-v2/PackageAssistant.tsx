import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image, Text } from "react-native";
import { aiService } from "../../services/ai/runtime";
import { aiErrorMessage } from "../../services/ai/errors";
import {
  prepareUpload,
  removeUpload,
  type UploadImage,
} from "../../services/ai/images";
import type { PackageIdentityEstimate } from "../../services/ai/protocol";
import { Check, Field } from "../simple/ui";
import { Action, Card, Feedback, N } from "./components";
export type PackageHint = {
  name: string;
  brand: string;
  model: string;
  uncertainties: readonly string[];
};
export function PackageAssistant({
  image,
  sourceUri,
  onCandidate,
  onSettings,
  onLookup,
  useLabel = "核对后使用此名称候选",
  blocked = false,
}: {
  image?: UploadImage | undefined;
  sourceUri?: string | undefined;
  onCandidate: (candidate: PackageHint) => void;
  onSettings: () => void;
  onLookup?: () => void;
  useLabel?: string;
  blocked?: boolean;
}) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  const [prepared, setPrepared] = useState<UploadImage | null>(null);
  const [result, setResult] = useState<PackageIdentityEstimate | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [brand, setBrand] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const active = useRef<AbortController | null>(null),
    generation = useRef(0),
    local = useRef("");
  useEffect(
    () => () => {
      generation.current++;
      active.current?.abort();
      if (local.current) void removeUpload(local.current);
    },
    [],
  );
  useEffect(() => {
    generation.current++;
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setResult(null);
    setConfirmed(false);
    setMessage("");
  }, [ai.revision, sourceUri, image?.uri]);
  useEffect(() => {
    if (local.current) void removeUpload(local.current);
    local.current = "";
    setPrepared(null);
  }, [sourceUri]);
  const run = async () => {
    if (active.current) return;
    const controller = new AbortController(),
      ticket = ++generation.current;
    active.current = controller;
    setBusy(true);
    setMessage("");
    setResult(null);
    setConfirmed(false);
    try {
      if (!image && !prepared) {
        if (!sourceUri) throw Error("请先选择包装照片。");
        const copy = await prepareUpload(sourceUri, controller.signal);
        if (ticket !== generation.current) {
          void removeUpload(copy.uri);
          return;
        }
        local.current = copy.uri;
        setPrepared(copy);
        setMessage("上传副本已在本机准备，请检查清晰度，再确认发送。");
        return;
      }
      const out = await aiService.identifyPackage(
        (image ?? prepared)!.uri,
        controller.signal,
      );
      if (ticket === generation.current) {
        setResult(out);
        setName(out.candidates[0]?.name ?? "");
        setBrand(out.candidates[0]?.brand ?? "");
      }
    } catch (e) {
      if (ticket === generation.current)
        setMessage(
          !image && !prepared ? (e as Error).message : aiErrorMessage(e),
        );
    } finally {
      if (active.current === controller) active.current = null;
      if (ticket === generation.current) setBusy(false);
    }
  };
  return (
    <Card blue>
      <Text style={N.heading}>包装正面 · AI 辅助</Text>
      <Text style={N.caption}>
        只提取可见名称与品牌候选，不识别唯一商品、不生成条码或营养值。优先扫码查食品库，名称相近仍需你核对。
      </Text>
      {prepared && (
        <>
          <Image
            source={{ uri: prepared.uri }}
            style={{ height: 170, width: "100%" }}
            resizeMode="contain"
            accessibilityLabel="包装上传副本预览"
          />
          <Text style={N.tiny}>
            {prepared.width} × {prepared.height} · {prepared.bytes} 字节 ·
            已去除定位等元数据
          </Text>
        </>
      )}
      <Text selectable style={N.caption}>
        发送至：{ai.endpoint || "尚未配置"}
      </Text>
      <Text style={N.caption}>
        模型：{ai.model || "尚未配置"}。
        {ai.supportsImage
          ? "将只发送当前包装副本与名称提取指令，可能产生服务商费用。"
          : "当前配置尚不支持图片，请改用扫码、手动录入或离线 OCR。"}
      </Text>
      <Check
        label="我了解发送内容、服务地址及可能产生的费用"
        value={ai.consent}
        onChange={aiService.consent}
      />
      <Action
        title={
          busy
            ? "正在处理包装…"
            : !image && !prepared
              ? "在本机准备包装副本"
              : "确认发送包装照片"
        }
        disabled={
          busy ||
          (!sourceUri && !image) ||
          (!!(image || prepared) && !ai.supportsImage)
        }
        onPress={() => void run()}
      />
      {busy && (
        <Action
          title="取消包装处理"
          secondary
          onPress={() => active.current?.abort()}
        />
      )}
      <Action title="配置 AI 服务" secondary onPress={onSettings} />
      {onLookup && (
        <Action title="扫码或手动输入条码" secondary onPress={onLookup} />
      )}
      {message && <Feedback>{message}</Feedback>}
      {result && (
        <>
          <Text style={N.heading}>AI 推测 · 待人工核对</Text>
          <Text style={N.tiny}>来源模型 {result.model} · 未保存食品或饮食</Text>
          {result.uncertainties.map((u, i) => (
            <Text key={i} style={N.caption}>
              · {u}
            </Text>
          ))}
          {result.candidates.map((c, i) => (
            <Action
              key={i}
              title={`选择候选 ${c.name} ${c.brand}`}
              secondary
              onPress={() => {
                setName(c.name);
                setBrand(c.brand);
                setConfirmed(false);
              }}
            />
          ))}
          {!result.candidates.length && (
            <Text style={N.caption}>
              没有可靠候选。可以继续扫码、手动录入或拍摄营养表。
            </Text>
          )}
          <Field
            label="核对候选名称"
            value={name}
            onChange={(v) => {
              setName(v);
              setConfirmed(false);
            }}
          />
          <Field
            label="核对候选品牌"
            value={brand}
            onChange={(v) => {
              setBrand(v);
              setConfirmed(false);
            }}
          />
          {blocked && (
            <Text style={N.caption}>
              已有填写或确认的身份资料，AI
              不会覆盖。请保留原值，在原有编辑框中人工核对。
            </Text>
          )}
          <Check
            label="已核对照片中的名称和品牌"
            value={confirmed}
            onChange={setConfirmed}
          />
          <Action
            title={useLabel}
            disabled={
              !confirmed ||
              !name.trim() ||
              blocked ||
              name.length > 80 ||
              brand.length > 80
            }
            onPress={() => {
              onCandidate({
                name: name.trim(),
                brand: brand.trim(),
                model: result.model,
                uncertainties: result.uncertainties,
              });
              setConfirmed(false);
              setMessage("候选已交给你选择的下一步，未保存食品或饮食。");
            }}
          />
        </>
      )}
    </Card>
  );
}
