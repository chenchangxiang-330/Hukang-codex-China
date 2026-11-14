import { useSyncExternalStore } from "react";
import { Text } from "react-native";
import { aiDisclosure, type AiScope } from "../../services/ai/disclosure";
import { aiService } from "../../services/ai/runtime";
import { Link, N } from "./components";
/** Daily pages only show a missing prerequisite, never repeat authorization. */
export function AiDisclosure({
  scope,
  onSettings,
}: {
  scope: AiScope;
  onSettings: () => void;
}) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  const message = !ai.connection
    ? "请先保存 AI 连接。"
    : scope.endsWith("image") && !ai.supportsImage
      ? "当前模型不支持图片。"
      : !aiDisclosure.allows(ai, scope)
        ? "请在 AI 设置中授权发送这类资料。"
        : "";
  return message ? (
    <>
      <Text style={N.caption}>{message}</Text>
      <Link title="前往 AI 设置" onPress={onSettings} />
    </>
  ) : null;
}
