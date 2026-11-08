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
  barOnly = false,
}: {
  title: string;
  total: Total;
  policy?: TargetPolicy | undefined;
  compact?: boolean;
  barOnly?: boolean;
  showTargetHint?: boolean;
}) {
  const s = nutrientProgress(t, p),
    reduced = useReducedMotion();
  const scale = p?.type === "range" ? 1.25 : 1;
  const lower =
    s.fraction === null ? null : Math.min(1, s.low! / (s.max! * scale));
  const upper =
    s.upperFraction === null ? null : Math.min(1, s.high! / (s.max! * scale));
  const fill = useRef(new Animated.Value(0)).current,
    band = useRef(new Animated.Value(0)).current;
  const hasValue = t.count > 0 && (t.value !== null || !!t.range);
  const value = hasValue
    ? `${t.estimated ? "约 " : ""}${formatTotal(t)} ${t.unit}${t.missing ? " · 小计" : ""}`
    : "—";
  const reference = p ? policyLabel(p) : "未设目标";
  const progressText = `${title}营养条，${value}，${reference}${t.missing ? "，数据不完整" : ""}${lower === null ? "，暂不计算进度" : ""}`;
  useEffect(() => {
    const a = Animated.parallel([
      Animated.timing(fill, {
        toValue: lower ?? 0,
        duration: reduced ? 0 : 240,
        useNativeDriver: false,
      }),
      Animated.timing(band, {
        toValue: upper ?? 0,
        duration: reduced ? 0 : 240,
        useNativeDriver: false,
      }),
    ]);
    a.start();
    return () => a.stop();
  }, [lower, upper, reduced, fill, band]);
  const width = (v: Animated.Value) =>
    v.interpolate({
      inputRange: [0, 1],
      outputRange: ["0%", "100%"],
      extrapolate: "clamp",
    });
  return (
    <View
      style={{ gap: compact ? 4 : 7, paddingVertical: compact ? 0 : 8 }}
      testID={`nutrient-${title}`}
    >
      {!barOnly && (
        <View
          style={[
            N.row,
            { justifyContent: "space-between", flexWrap: "wrap", gap: 5 },
          ]}
        >
          <Text style={N.body}>{title}</Text>
          <Text style={N.body}>{value}</Text>
        </View>
      )}
      <Text style={N.caption}>{reference}</Text>
      <View
        testID={`nutrient-track-${title}`}
        style={[N.track, { height: 7 }]}
        accessible
        accessibilityRole={lower === null ? "text" : "progressbar"}
        accessibilityLabel={progressText}
        accessibilityValue={{ text: progressText }}
      >
        {upper !== null && t.range && (
          <Animated.View
            testID={`nutrient-range-${title}`}
            style={[
              N.fill,
              {
                position: "absolute",
                height: 7,
                width: width(band),
                backgroundColor: "#C0DFF1",
                borderRightWidth: 2,
                borderColor: colors.brand,
              },
            ]}
          />
        )}
        {lower !== null && (
          <Animated.View
            testID={`nutrient-fill-${title}`}
            style={[
              N.fill,
              { height: 7, width: width(fill), backgroundColor: colors.sky },
            ]}
          />
        )}
        {p?.type === "range" && s.max && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${(p.range![0] / (s.max * scale)) * 100}%`,
              width: `${((p.range![1] - p.range![0]) / (s.max * scale)) * 100}%`,
              top: -2,
              height: 11,
              borderWidth: 1,
              borderColor: colors.brand,
              borderRadius: 3,
            }}
          />
        )}
      </View>
      {s.excess !== null && (
        <Text style={N.caption}>
          {t.missing ? "已知小计" : t.range ? "至少" : ""}超出
          {p?.type === "range"
            ? "参考范围"
            : p?.type === "upper_limit"
              ? "上限"
              : "目标"}{" "}
          {formatNumber(s.excess)} {t.unit}
        </Text>
      )}
    </View>
  );
}
