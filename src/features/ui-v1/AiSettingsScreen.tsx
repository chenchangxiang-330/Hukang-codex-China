import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Check, Choices, Field, C, S } from "../simple/ui";
import { PageIntro, StatusPill, Surface } from "../../ui/components";
import {
  providerDefaults,
  type AiConfiguration,
  type AiConfigurationField,
} from "../../services/ai/config";
import { aiErrorMessage } from "../../services/ai/errors";
import { aiService } from "../../services/ai/runtime";

export function AiSettingsScreen() {
  const session = useSyncExternalStore(
    aiService.subscribe,
    aiService.getSnapshot,
  );
  // Never read the session key back into the screen. Replacement input stays masked.
  const [apiKey, setApiKey] = useState("");
  const [issues, setIssues] = useState<
    Partial<Record<AiConfigurationField, string>>
  >({});
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      pending.current?.abort();
    },
    [],
  );
  function change(patch: Partial<AiConfiguration>) {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    aiService.update(patch);
    setIssues({});
    setMessage("");
  }
  async function checkConfiguration() {
    if (pending.current) return;
    const errors = aiService.issues();
    setIssues(errors);
    setMessage("");
    if (Object.keys(errors).length) return;
    const controller = new AbortController();
    pending.current = controller;
    const ticket = ++generation.current;
    try {
      await aiService.testConnection(controller.signal);
      if (ticket === generation.current) {
        setApiKey("");
        setMessage("连接成功，已收到有效模型响应。");
      }
    } catch (error) {
      if (ticket === generation.current) setMessage(aiErrorMessage(error));
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  const checking = session.operation === "connection";
  return (
    <>
      <PageIntro
        eyebrow="AI · 按需连接"
        title="让饮食更有依据"
        description="填写自己的服务配置，先测试连接，再用于餐食估算。"
      />
      <Surface>
        <View style={S.sectionRow}>
          <Text style={S.section}>连接状态</Text>
          <StatusPill
            label={
              checking ? "测试中" : session.connection ? "已连接" : "未测试"
            }
            tone={session.connection ? "brand" : "warning"}
          />
        </View>
        <Text style={S.note}>
          仅在你主动测试或估算时联网。测试会发送一句“请只回复
          OK”，可能产生服务商费用；不会发送食品库、库存或饮食历史。
        </Text>
        {session.connection && (
          <>
            <Text selectable style={S.note}>
              实际接口：{session.connection.endpoint}
            </Text>
            <Text style={S.note}>
              请求模型：{session.connection.requestedModel}
            </Text>
            <Text style={S.note}>
              响应模型：{session.connection.responseModel}
            </Text>
            <Text style={S.note}>模型回复：{session.connection.response}</Text>
            <Text style={S.small}>
              测试时间：{new Date(session.connection.testedAt).toLocaleString()}
              。连接成功仅代表本次文字请求有效。
            </Text>
          </>
        )}
      </Surface>
      <Surface>
        <Text style={S.rowTitle}>选择服务商</Text>
        <Choices
          value={session.provider}
          options={[
            ["custom", "自定义"],
            ["deepseek", "DeepSeek"],
            ["qwen", "通义千问"],
          ]}
          onChange={(value) => {
            const provider = value as AiConfiguration["provider"];
            if (provider === session.provider) return;
            setApiKey("");
            change({ provider, ...providerDefaults[provider], apiKey: "" });
          }}
        />
        <Text style={S.small}>
          支持 Chat Completions
          兼容协议。通义千问的地址与密钥须属于同一地域；代理服务请选择自定义。
        </Text>
        <Field
          label="API Base URL"
          value={session.baseUrl}
          onChange={(baseUrl) => {
            setApiKey("");
            change({ baseUrl });
          }}
          placeholder="https://your-service.example/v1"
          autoCapitalize="none"
          keyboardType="url"
        />
        {!!issues.baseUrl && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {issues.baseUrl}
          </Text>
        )}
        <Field
          label="API Key"
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            change({ apiKey: value });
          }}
          placeholder={
            session.hasKey ? "已临时配置，输入可替换" : "仅在内存中使用，不保存"
          }
          secureTextEntry
        />
        {!!issues.apiKey && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {issues.apiKey}
          </Text>
        )}
        <Text style={S.small}>
          {session.hasKey ? "临时密钥已配置。" : "尚未配置密钥。"}
          页面间共用，手动清除或应用进程退出后失效；不写入普通存储或导出。更换服务地址会清除旧密钥。
        </Text>
        <Field
          label="模型名称"
          value={session.model}
          onChange={(model) => change({ model })}
          placeholder="填写服务商提供的模型名称"
          autoCapitalize="none"
        />
        {!!issues.model && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {issues.model}
          </Text>
        )}
        <Text selectable style={S.note}>
          将连接：{session.endpoint || "请先填写有效的 HTTPS 地址"}
        </Text>
        <Text style={S.small}>
          餐食估算只发送你主动提交的描述。照片需另行勾选，且仅对已核实支持图片的模型开放。
        </Text>
        <Check
          label="我了解发送内容、服务地址及可能产生的费用"
          value={session.consent}
          onChange={aiService.consent}
        />
        <Button
          title={checking ? "正在连接模型…" : "检查连接配置"}
          disabled={session.operation !== null}
          onPress={() => void checkConfiguration()}
        />
        {checking && (
          <Button
            title="取消连接测试"
            secondary
            onPress={() => pending.current?.abort()}
          />
        )}
        {!!message && (
          <View style={styles.result}>
            <Text accessibilityLiveRegion="polite" style={S.note}>
              {message}
            </Text>
          </View>
        )}
        <Button
          title="清除临时配置"
          secondary
          onPress={() => {
            generation.current++;
            pending.current?.abort();
            pending.current = null;
            aiService.clear();
            setApiKey("");
            setIssues({});
            setMessage("临时配置已清除，旧密钥和旧请求已停用。");
          }}
        />
      </Surface>
      <Surface>
        <Text style={S.rowTitle}>营养标签，仍然在本机识别</Text>
        <Text style={S.note}>
          PaddleOCR 与食品资料管理不依赖 AI 设置。扫码、离线
          OCR、人工核对、食品保存、库存和导出可继续离线使用。
        </Text>
      </Surface>
    </>
  );
}
const styles = StyleSheet.create({
  error: { color: C.red, fontSize: 13, lineHeight: 21 },
  result: { backgroundColor: C.pale, borderRadius: 12, padding: 14 },
});
