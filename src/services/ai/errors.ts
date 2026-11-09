export type AiErrorCode =
  | "native_unavailable"
  | "configuration"
  | "consent"
  | "busy"
  | "cancelled"
  | "timeout"
  | "network"
  | "authentication"
  | "quota"
  | "permission"
  | "rate_limit"
  | "model"
  | "image_unsupported"
  | "image_count"
  | "image_total_size"
  | "image_invalid"
  | "format"
  | "request"
  | "server"
  | "redirect"
  | "changed";
const messages: Record<AiErrorCode, string> = {
  native_unavailable:
    "此安装包缺少 AI 网络模块，请使用本次完整 Android 测试包。",
  configuration: "请先在 AI 服务设置中填写有效地址、API Key 和模型。",
  consent: "请前往 AI 设置授权发送这类资料。",
  busy: "已有 AI 请求进行中，请等待或先取消，避免重复收费。",
  cancelled: "已取消等待，未保存结果。服务商可能已经处理请求并计费。",
  timeout: "请求超时，已停止等待，没有自动重试。服务商可能已经计费。",
  network: "网络连接失败。请检查网络、HTTPS 地址和证书后手动重试。",
  authentication: "密钥无效或已失效；请核对密钥及服务地址所属地域。",
  quota: "服务商余额或配额不足，请在服务商控制台核对。",
  permission: "服务商拒绝访问，请检查模型权限、地域和账户开通状态。",
  rate_limit: "请求过于频繁，已停止；请稍后手动重试。",
  model: "模型不存在或当前账户无权使用，请核对模型名称。",
  image_unsupported: "当前模型不支持图片，请前往 AI 设置更换模型。",
  image_count: "一次最多发送 6 张体检照片，请减少后重试。",
  image_total_size: "照片合计超过本次 6 MB 请求限制，请减少照片或裁剪后重试。",
  image_invalid: "图片无法读取或达到 4 MB 限制，请重新选择照片。",
  format: "模型响应格式异常或内容不完整，没有生成有效结果，也没有自动重试。",
  request:
    "服务商不接受本次请求。请核对 Chat Completions 协议、地址及模型能力。",
  server: "服务商暂时不可用，请稍后手动重试。",
  redirect: "服务地址要求跳转，已停止请求。请填写最终 HTTPS API 地址。",
  changed: "配置已更改或清除，旧请求已取消，旧结果不会继续使用。",
};
export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode) {
    super(messages[code]);
    this.name = "AiError";
    this.code = code;
  }
}
export function aiErrorMessage(error: unknown) {
  return error instanceof AiError ? error.message : messages.network;
}
/** Provider bodies can echo credentials. Inspect only for classification; never display/log them. */
export function httpError(status: number, body: string) {
  let detail = "";
  try {
    const e = JSON.parse(body)?.error;
    detail = [e?.code, e?.type, e?.message]
      .filter((x) => typeof x === "string")
      .join(" ")
      .toLowerCase()
      .slice(0, 2000);
  } catch {
    /* HTML/plain-text errors are not model responses. */
  }
  if (status >= 300 && status < 400) return new AiError("redirect");
  if (status === 401) return new AiError("authentication");
  if (
    status === 402 ||
    /insufficient_quota|insufficient.*balance|arrearage|quota_exceeded|billing_hard_limit|余额不足/.test(
      detail,
    )
  )
    return new AiError("quota");
  if (status === 429) return new AiError("rate_limit");
  if (
    /model_not_found|invalid_model|model.*(?:does not exist|not exist|not found)/.test(
      detail,
    )
  )
    return new AiError("model");
  if (status === 403) return new AiError("permission");
  if (status === 404) return new AiError("model");
  if (
    /(?:image|vision|multimodal).*(?:not support|unsupported)|(?:not support|unsupported).*(?:image|vision|multimodal)/.test(
      detail,
    )
  )
    return new AiError("image_unsupported");
  if (status === 408 || status === 504) return new AiError("timeout");
  return new AiError(status >= 500 ? "server" : "request");
}
export function redact(text: string, key: string) {
  return (key ? text.split(key).join("[已隐藏]") : text)
    .replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[已隐藏]");
}
