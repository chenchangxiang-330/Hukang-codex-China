import { requireNativeModule } from "expo-modules-core";
import { AiError } from "./errors";
import type { ChatResponse, ChatTransport } from "./protocol";

type NativeAi = {
  post(
    id: string,
    endpoint: string,
    key: string,
    body: string,
    timeoutMs: number,
  ): Promise<ChatResponse>;
  cancel(id: string): void;
};
export const nativeChatTransport: ChatTransport = async ({
  endpoint,
  apiKey,
  body,
  timeoutMs,
  signal,
}) => {
  if (signal.aborted) throw new AiError("cancelled");
  let module: NativeAi;
  try {
    module = requireNativeModule<NativeAi>("HukangAi");
  } catch {
    throw new AiError("native_unavailable");
  }
  const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const abort = () => module.cancel(id);
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await module.post(id, endpoint, apiKey, body, timeoutMs);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    throw new AiError(
      code === "AI_TIMEOUT"
        ? "timeout"
        : code === "AI_FORMAT"
          ? "format"
          : code === "AI_CANCELLED"
            ? "cancelled"
            : "network",
    );
  } finally {
    signal.removeEventListener("abort", abort);
  }
};
