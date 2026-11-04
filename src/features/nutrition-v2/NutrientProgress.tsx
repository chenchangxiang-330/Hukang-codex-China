import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { N, useReducedMotion } from "./components";
import { formatTotal, formatNumber, type Total } from "./model";
import type { TargetPolicy } from "../../services/nutrition/profile";
import { colors } from "../../ui/tokens";
import {
  policyLabel,
  nutrientProgress,
} from "../../services/nutrition/progress";
export { policyLabel } from "../../services/nutrition/progress";
export function NutrientProgress({
  title,
  total: t,
  policy: p,
  compact = false,
  showTargetHint = false,
}: {
  title: string;
  total: Total;
  policy?: TargetPolicy | undefined;
  compact?: boolean;
  showTargetHint?: boolean;
}) {
  const s = nutrientProgress(t, p),
    reduced = useReducedMotion();
  const rangeMax = p?.type === "range" ? p.range![1] * 1.25 : null;
  const fraction =
    s.fraction === null
      ? null
      : rangeMax
        ? Math.min(1, t.value! / rangeMax)
        : s.fraction;
  const fill = useRef(new Animated.Value(fraction ?? 0)).current;
  const reference = p ? policyLabel(p) : "未设置目标";
  const progressText = `${title}营养条，${s.status}，${reference}${fraction === null ? "，暂不计算进度" : `，${formatTotal(t)} ${t.unit}`}`;
  useEffect(() => {
    const a = Animated.timing(fill, {
      toValue: fraction ?? 0,
      duration: reduced ? 0 : 240,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [fraction, reduced, fill]);
  return (
    <View
      style={{ gap: compact ? 3 : 5, paddingVertical: compact ? 0 : 8 }}
      testID={`nutrient-${title}`}
    >
      <View
        style={[
          N.row,
          { justifyContent: "space-between", flexWrap: "wrap", gap: 5 },
        ]}
      >
        <Text style={N.body}>{title}</Text>
        <Text style={N.body}>
          {t.count
            ? `${t.estimated ? "约 " : ""}${formatTotal(t)} ${t.unit}`
            : "尚未记录"}
        </Text>
      </View>
      <Text style={N.caption}>
        {reference}
        {!p && showTargetHint ? " · 我的 → 个人参考目标" : ""}
        {t.count && (t.missing || t.estimated || t.value === null)
          ? ` · ${s.status}`
          : ""}
      </Text>
      <View
        testID={`nutrient-track-${title}`}
        style={[N.track, { height: 6 }]}
        accessible
        accessibilityRole={fraction === null ? "text" : "progressbar"}
        accessibilityLabel={progressText}
        accessibilityValue={
          fraction === null ? undefined : { text: progressText }
        }
      >
        {fraction !== null && (
          <Animated.View
            testID={`nutrient-fill-${title}`}
            style={[
              N.fill,
              {
                height: 6,
                backgroundColor: colors.sky,
                width: fill.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                  extrapolate: "clamp",
                }),
              },
            ]}
          />
        )}
        {fraction !== null && p?.type === "range" && (
          <View
            style={{
              position: "absolute",
              left: `${(p.range![0] / rangeMax!) * 100}%`,
              width: `${((p.range![1] - p.range![0]) / rangeMax!) * 100}%`,
              top: -3,
              height: 12,
              borderWidth: 1,
              borderColor: colors.brand,
              borderRadius: 3,
            }}
          />
        )}
      </View>
      {(s.excess !== null || (!compact && s.percent !== null)) && (
        <Text style={N.caption}>
          {s.excess !== null
            ? `超出${p?.type === "range" ? "参考范围" : p?.type === "upper_limit" ? "参考上限" : "目标"} ${formatNumber(s.excess)} ${t.unit}${t.estimated ? "（估算）" : ""}`
            : `已${p?.type === "upper_limit" ? "占参考上限" : "达到目标"}的 ${s.percent}%`}
        </Text>
      )}
    </View>
  );
}
