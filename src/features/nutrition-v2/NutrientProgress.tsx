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
}: {
  title: string;
  total: Total;
  policy?: TargetPolicy | undefined;
  compact?: boolean;
}) {
  const s = nutrientProgress(t, p),
    reduced = useReducedMotion(),
    fill = useRef(new Animated.Value(s.fraction ?? 0)).current;
  const rangeMax = p?.type === "range" ? p.range![1] * 1.25 : null;
  useEffect(() => {
    const a = Animated.timing(fill, {
      toValue:
        s.fraction === null ? 0 : rangeMax ? t.value! / rangeMax : s.fraction,
      duration: reduced ? 0 : 240,
      useNativeDriver: false,
    });
    a.start();
    return () => a.stop();
  }, [s.fraction, t.value, rangeMax, reduced]);
  return (
    <View
      style={{ gap: 5, paddingVertical: compact ? 2 : 8 }}
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
        {policyLabel(p)}
        {t.count && (t.missing || t.estimated || t.value === null)
          ? ` · ${s.status}`
          : ""}
      </Text>
      {s.fraction !== null && (
        <View
          style={[N.track, { height: 6 }]}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{
            text: `${title}，${s.status}，${formatTotal(t)} ${t.unit}，${policyLabel(p)}`,
          }}
        >
          <Animated.View
            style={[
              N.fill,
              {
                backgroundColor: colors.sky,
                width: fill.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                  extrapolate: "clamp",
                }),
              },
            ]}
          />
          {p?.type === "range" && (
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
      )}
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
