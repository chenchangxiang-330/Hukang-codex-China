import { useEffect, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { Button, Check, Choices, Field, S } from "../simple/ui";
import { Surface } from "../../ui/components";
import { Link, N } from "../nutrition-v2/components";
import {
  providerDefaults,
  chatEndpoint,
  type AiConfiguration,
} from "../../services/ai/config";
import { AiError, aiErrorMessage } from "../../services/ai/errors";
import { aiService, savedConnection } from "../../services/ai/runtime";

export function AiSettingsScreen() {
  const session = useSyncExternalStore(
    aiService.subscribe,
    aiService.getSnapshot,
  );
  const stored = useSyncExternalStore(
    savedConnection.subscribe,
    savedConnection.getSnapshot,
  );
  const [draft, setDraft] = useState<AiConfiguration>(() => ({
    provider: session.baseUrl ? session.provider : "deepseek",
    ...(session.baseUrl
      ? { baseUrl: session.baseUrl, model: session.model }
      : providerDefaults.deepseek),
    apiKey: "",
  }));
  const [advanced, setAdvanced] = useState(false),
    [details, setDetails] = useState(false);
  const [consent, setConsent] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => () => savedConnection.cancel(), []);
  useEffect(() => {
    if (stored.ready && session.hasKey)
      setDraft({
        provider: session.provider,
        baseUrl: session.baseUrl,
        model: session.model,
        apiKey: "",
      });
  }, [stored.ready]);
  function change(patch: Partial<AiConfiguration>) {
    savedConnection.cancel();
    setDraft((v) => ({ ...v, ...patch }));
    setConsent(false);
    setMessage("");
  }
  let endpoint = "请填写有效的 HTTPS 地址";
  try {
    endpoint = chatEndpoint(draft);
  } catch {}
  const sameDestination =
    draft.provider === session.provider &&
    draft.baseUrl.trim() === session.baseUrl.trim();
  async function save() {
    setMessage("");
    const issues = savedConnection.issues(draft);
    if (Object.keys(issues).length) {
      setMessage(Object.values(issues).join(" "));
      return;
    }
    try {
      await savedConnection.save(draft, consent);
      setDraft((v) => ({ ...v, apiKey: "" }));
      setMessage("连接已验证并安全保存。");
    } catch (e) {
      setMessage(
        e instanceof AiError
          ? aiErrorMessage(e)
          : e instanceof Error
            ? e.message
            : "安全保存未完成，请重试。",
      );
    }
  }
  return (
    <Surface>
      <Text style={S.section}>AI 连接</Text>
      <Choices
        value={draft.provider}
        options={[
          ["deepseek", "DeepSeek"],
          ["qwen", "通义千问"],
          ["custom", "自定义"],
        ]}
        onChange={(v) => {
          const provider = v as AiConfiguration["provider"];
          change({ provider, ...providerDefaults[provider], apiKey: "" });
          if (provider === "custom") setAdvanced(true);
        }}
      />
      <Text selectable style={N.caption}>
        {draft.baseUrl || "填写服务地址"}
      </Text>
      <Field
        label="API Key"
        value={draft.apiKey}
        onChange={(apiKey) => change({ apiKey })}
        secureTextEntry
        placeholder={
          session.hasKey && sameDestination
            ? "已安全保存；留空沿用此地址的密钥"
            : "填写服务商密钥"
        }
      />
      <Link
        title={advanced ? "收起地址与模型" : "地址与模型"}
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced && (
        <>
          <Field
            label="API Base URL"
            value={draft.baseUrl}
            onChange={(baseUrl) => change({ baseUrl, apiKey: "" })}
            autoCapitalize="none"
            keyboardType="url"
          />
          <Field
            label="模型名称"
            value={draft.model}
            onChange={(model) => change({ model })}
            autoCapitalize="none"
          />
          <Text style={N.caption}>
            兼容 Chat
            Completions；自定义服务仅支持文字目标推荐。照片能力依服务商与模型而定。
          </Text>
        </>
      )}
      <Text style={S.rowTitle}>
        {`连接状态 · ${stored.saving ? "验证中" : session.connection ? "已连接" : "未连接"}`}
      </Text>
      {session.connection && (
        <Text style={N.caption}>
          最近验证 {new Date(session.connection.testedAt).toLocaleString()} ·{" "}
          {session.connection.requestedModel}
        </Text>
      )}
      <Text selectable style={N.caption}>
        发送一句连接测试文字至 {endpoint}，可能产生服务商费用。
        营养表和餐食照片会先在本机压缩，上传副本小于 4
        MB，再发送至这里配置的服务；营养表仅读取包装实际标注。
      </Text>
      <Check label="同意本次连接测试" value={consent} onChange={setConsent} />
      <Button
        title={stored.saving ? "正在验证与保存…" : "保存连接"}
        disabled={!stored.ready || stored.saving || !consent}
        onPress={() => void save()}
      />
      {stored.saving && <Link title="取消" onPress={savedConnection.cancel} />}
      {!!(message || stored.error) && (
        <Text accessibilityLiveRegion="polite" style={N.body}>
          {message || stored.error}
        </Text>
      )}
      <Link
        title={details ? "收起连接详情" : "连接详情与管理"}
        onPress={() => setDetails(!details)}
      />
      {details && (
        <View style={{ gap: 12 }}>
          {session.connection && (
            <>
              <Text selectable style={N.caption}>
                {session.connection.endpoint}
              </Text>
              <Text style={N.caption}>
                响应模型：{session.connection.responseModel}
                。最近成功不保证下一次请求成功。
              </Text>
            </>
          )}
          <Text style={N.caption}>
            密钥由本机安全存储保护，不进入导出。删除连接后，进行中的旧请求也会停用。
          </Text>
          <Link
            title="删除已保存连接"
            onPress={() =>
              void savedConnection
                .delete()
                .then(() => {
                  setDraft((v) => ({ ...v, apiKey: "" }));
                  setConsent(false);
                  setMessage("已删除连接。");
                })
                .catch((e) => setMessage(e.message))
            }
          />
        </View>
      )}
    </Surface>
  );
}
