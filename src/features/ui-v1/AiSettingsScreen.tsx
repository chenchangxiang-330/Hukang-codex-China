import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Button, Choices, Field, C, S } from "../simple/ui";
import { PageIntro, StatusPill, Surface } from "../../ui/components";
import {
  UnavailableAiGateway,
  validateAiConfiguration,
  type AiConfiguration,
} from "./contracts";

export function AiSettingsScreen() {
  const [provider, setProvider] =
    useState<AiConfiguration["provider"]>("custom");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [issues, setIssues] = useState<
    ReturnType<typeof validateAiConfiguration>
  >({});
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setApiKey("");
        setMessage("临时密钥已清除，未保存到设备。");
      }
    });
    return () => subscription.remove();
  }, []);
  const changed = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setMessage("");
    setIssues({});
  };
  async function checkConfiguration() {
    const config = { provider, baseUrl, apiKey, model };
    const errors = validateAiConfiguration(config);
    setIssues(errors);
    setMessage("");
    if (Object.keys(errors).length) return;
    setChecking(true);
    try {
      const result = await new UnavailableAiGateway().testConnection(config);
      setMessage(`配置格式已通过。${result.message}`);
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <PageIntro
        eyebrow="AI · 为未来准备"
        title="让饮食更有依据"
        description="先准备服务配置。真正连接前，你始终知道哪些信息会被使用。"
      />
      <Surface>
        <View style={S.sectionRow}>
          <Text style={S.section}>连接状态</Text>
          <StatusPill label="尚未接入" tone="warning" />
        </View>
        <Text style={S.note}>
          本版仅提供设置界面和本地格式校验，不连接服务、不产生费用，也不会上传照片或饮食资料。
        </Text>
      </Surface>
      <Surface>
        <Text style={S.rowTitle}>选择服务商</Text>
        <Choices
          value={provider}
          options={[
            ["custom", "自定义"],
            ["deepseek", "DeepSeek"],
            ["qwen", "通义千问"],
          ]}
          onChange={(value) => {
            setProvider(value as AiConfiguration["provider"]);
            setMessage("");
          }}
        />
        <Text style={S.small}>
          服务商选项用于配置预览，不代表已开通相应服务。
        </Text>
        <Field
          label="API Base URL"
          value={baseUrl}
          onChange={changed(setBaseUrl)}
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
          onChange={changed(setApiKey)}
          placeholder="仅临时输入，不保存"
          secureTextEntry
        />
        {!!issues.apiKey && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {issues.apiKey}
          </Text>
        )}
        <Text style={S.small}>
          密钥仅在当前页面临时保留；离开页面或进入后台后清除。不会写入导出文件。
        </Text>
        <Field
          label="模型名称"
          value={model}
          onChange={changed(setModel)}
          placeholder="填写服务商提供的模型名称"
          autoCapitalize="none"
        />
        {!!issues.model && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {issues.model}
          </Text>
        )}
        <Button
          title={checking ? "正在检查配置" : "检查连接配置"}
          disabled={checking}
          onPress={() => void checkConfiguration()}
        />
        <Text style={S.small}>此操作只检查格式，不会发出网络请求。</Text>
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
            setApiKey("");
            setBaseUrl("");
            setModel("");
            setIssues({});
            setMessage("临时配置已清除。");
          }}
        />
      </Surface>
      <Surface>
        <Text style={S.rowTitle}>营养标签，仍然在本机识别</Text>
        <Text style={S.note}>
          PaddleOCR 与食品资料管理不依赖 AI
          设置。即使没有配置任何服务，扫码、核对和库存功能也可照常使用。
        </Text>
      </Surface>
    </>
  );
}
const styles = StyleSheet.create({
  error: { color: C.red, fontSize: 13, lineHeight: 21 },
  result: { backgroundColor: C.pale, borderRadius: 12, padding: 14 },
});
