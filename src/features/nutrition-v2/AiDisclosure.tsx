import { useEffect, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { aiDisclosure, type AiScope } from "../../services/ai/disclosure";
import { aiService } from "../../services/ai/runtime";
import { Check } from "../simple/ui";
import { Link, N } from "./components";
export function AiDisclosure({
  scope,
  onSettings,
}: {
  scope: AiScope;
  onSettings: () => void;
}) {
  const ai = useSyncExternalStore(aiService.subscribe, aiService.getSnapshot);
  useSyncExternalStore(aiDisclosure.subscribe, aiDisclosure.getSnapshot);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    aiDisclosure.visit(ai, scope);
    setDetails(false);
  }, [scope, ai.revision, ai.endpoint]);
  const accepted = aiDisclosure.allows(ai, scope);
  const content =
    scope === "profile"
      ? "年龄、身高、体重、运动及选填性别，用于推荐目标"
      : scope === "health-image"
        ? "个人资料与当前体检照片，用于推荐目标"
        : scope === "meal-text"
          ? "餐食文字"
          : scope === "meal-image"
            ? "餐食文字与当前照片"
            : "当前包装照片与名称提取指令";
  return (
    <View style={{ gap: 8 }}>
      <Text style={N.caption}>{content} · 可能产生服务商费用</Text>
      {(!accepted || details) && (
        <>
          <Text selectable style={N.caption}>
            发送至：{ai.endpoint || "尚未配置"}
          </Text>
          <Text style={N.caption}>
            模型：{ai.model || "尚未配置"}
            。仅发送本次内容，不发送历史饮食、食品库或库存。
          </Text>
          <Check
            label="我了解发送内容、服务地址及可能产生的费用"
            value={accepted}
            onChange={(value) => {
              aiService.consent(value);
              aiDisclosure.accept(aiService.getSnapshot(), scope, value);
            }}
          />
          <Link title="配置 AI 服务" onPress={onSettings} />
        </>
      )}
      {accepted && (
        <Link
          title={details ? "收起发送详情" : "发送详情"}
          onPress={() => setDetails(!details)}
        />
      )}
    </View>
  );
}
