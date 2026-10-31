export type AiProvider = "deepseek" | "qwen" | "custom";
export interface AiConfiguration {
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}
export type AiConfigurationField = "baseUrl" | "apiKey" | "model";
export const providerDefaults = {
  custom: { baseUrl: "", model: "" },
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-flash" },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-vl-plus",
  },
} as const;
export const providerLabels = {
  custom: "自定义兼容服务",
  deepseek: "DeepSeek",
  qwen: "通义千问",
};

function isQwenHost(host: string) {
  return (
    /^dashscope(?:-intl|-us)?\.aliyuncs\.com$/.test(host) ||
    /^[a-z0-9-]+\.(?:cn-beijing|cn-hongkong|ap-southeast-1|us-east-1|ap-northeast-1)\.maas\.aliyuncs\.com$/.test(
      host,
    )
  );
}

/** Preserve an explicit API prefix. Never append a second /v1 or completion path. */
export function chatEndpoint(
  config: Pick<AiConfiguration, "baseUrl" | "provider">,
) {
  const raw = config.baseUrl.trim();
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    !url.hostname.includes(".") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\s\\{}<>]/.test(raw)
  )
    throw new Error("invalid URL");
  let path = url.pathname.replace(/\/+$/, "");
  if (/\/v1\/v1(?:\/|$)/i.test(path) || /\/\//.test(path))
    throw new Error("duplicate path");
  if (
    config.provider === "deepseek" &&
    (url.hostname !== "api.deepseek.com" ||
      url.port ||
      !["", "/v1", "/chat/completions", "/v1/chat/completions"].includes(path))
  )
    throw new Error("use the official DeepSeek endpoint or select custom");
  if (
    config.provider === "qwen" &&
    (!isQwenHost(url.hostname) ||
      url.port ||
      !["/compatible-mode/v1", "/compatible-mode/v1/chat/completions"].includes(
        path,
      ))
  )
    throw new Error(
      "use the regional Qwen compatible endpoint or select custom",
    );
  if (!path) path = config.provider === "deepseek" ? "" : "/v1";
  if (!path.endsWith("/chat/completions")) path += "/chat/completions";
  if (/\/chat\/completions\/chat\/completions$/.test(path))
    throw new Error("duplicate path");
  url.pathname = path;
  return url.href;
}

export function validateAiConfiguration(
  config: AiConfiguration,
): Partial<Record<AiConfigurationField, string>> {
  const errors: Partial<Record<AiConfigurationField, string>> = {};
  try {
    chatEndpoint(config);
  } catch {
    errors.baseUrl =
      config.provider === "custom"
        ? "请填写 HTTPS API 地址，不含账号、密码、查询参数、片段或重复路径。"
        : "请填写该服务商官方 HTTPS 兼容接口地址；代理地址请选择自定义。通义千问须包含 /compatible-mode/v1。";
  }
  if (
    !config.apiKey.trim() ||
    config.apiKey.length > 4096 ||
    /[^\x21-\x7e]/.test(config.apiKey.trim())
  )
    errors.apiKey = "请填写有效临时密钥，不包含空格、换行或非 ASCII 字符。";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/@+\-]{0,127}$/.test(config.model.trim()))
    errors.model = "请填写服务商提供的模型名称（最多 128 个字符，不含空格）。";
  return errors;
}

/** Conservative allowlist, verified against provider docs on 2026-10-31.
 * Unknown/custom models remain text-only; a text test never proves vision support. */
export function supportsMealImage(
  config: Pick<AiConfiguration, "provider" | "baseUrl" | "model">,
) {
  try {
    chatEndpoint(config);
  } catch {
    return false;
  }
  return (
    (config.provider === "deepseek" &&
      config.model.trim() === "deepseek-flash") ||
    (config.provider === "qwen" && config.model.trim() === "qwen3-vl-plus")
  );
}
