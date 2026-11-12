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

export type NutrientProgressProps = {
  title: string;
  total: Total;
  policy?: TargetPolicy | undefined;
  compact?: boolean;
  barOnly?: boolean;
  energyHero?: boolean;
  color?: string;
  showTargetHint?: boolean;
};

export function NutrientProgress({
  title,
  total: t,
  policy: p,
  compact = false,
  barOnly = false,
  energyHero = false,
  color = colors.brand,
  showTargetHint = true,
}: NutrientProgressProps) {
  const s = nutrientProgress(t, p),
    reduced = useReducedMotion();
  const fraction = s.fraction ?? 0;
  // A remounted page starts at its actual saved intake, never from an empty bar.
  const fill = useRef(new Animated.Value(fraction)).current;
  const previous = useRef(fraction);
  useEffect(() => {
    if (reduced) {
      fill.setValue(fraction);
      previous.current = fraction;
      return;
    }
    if (previous.current === fraction) return;
    previous.current = fraction;
    const animation = Animated.timing(fill, {
      toValue: fraction,
      duration: 160,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fraction, reduced, fill]);

  const hasValue = t.count > 0 && s.value !== null;
  const amount = hasValue ? formatTotal(t) : "—";
  const estimated = t.estimated || !!t.range;
  const value = hasValue
    ? `${estimated ? "约 " : ""}${amount} ${t.unit}${t.missing ? " · 小计" : ""}`
    : "—";
  const hasTarget = s.max !== null;
  const reference = hasTarget ? policyLabel(p) : "";
  const progressText = `${title}，${value}，${reference}${t.missing ? "，数据不完整" : ""}${s.fraction === null ? "，暂不计算进度" : ""}`;
  const barColor = s.excess !== null ? colors.danger : color;
  const trackHeight = compact ? 5 : 7;
  return (
    <View
      style={{
        gap: compact ? 4 : 7,
        paddingVertical: compact ? 0 : 8,
        minWidth: 0,
      }}
      testID={`nutrient-${title}`}
    >
      {!barOnly &&
        (energyHero ? (
          <View style={{ gap: 3 }}>
            <Text style={N.caption}>{title}</Text>
            <Text
              style={[
                N.body,
                {
                  fontSize: 34,
                  lineHeight: 41,
                  fontWeight: "600",
                  letterSpacing: -1.4,
                  fontVariant: ["tabular-nums"],
                },
              ]}
            >
              {hasValue && estimated ? (
                <Text style={[N.caption, { letterSpacing: 0 }]}>约 </Text>
              ) : null}
              {amount}
              {hasValue ? (
                <Text style={[N.caption, { letterSpacing: 0 }]}> {t.unit}</Text>
              ) : null}
            </Text>
            {t.missing > 0 && hasValue ? (
              <Text style={N.tiny}>已知小计 · 数据不完整</Text>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              N.row,
              {
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: compact ? 3 : 5,
              },
            ]}
          >
            <Text style={compact ? N.tiny : N.body}>{title}</Text>
            <Text
              style={[
                compact ? N.caption : N.body,
                { fontVariant: ["tabular-nums"] },
              ]}
            >
              {value}
            </Text>
          </View>
        ))}
      {hasTarget && (
        <>
          {showTargetHint && (
            <Text style={compact ? N.tiny : N.caption}>{reference}</Text>
          )}
          <View
            testID={`nutrient-track-${title}`}
            style={[N.track, { height: trackHeight }]}
            accessible
            accessibilityRole={s.fraction === null ? "text" : "progressbar"}
            accessibilityLabel={progressText}
            accessibilityValue={{ text: progressText }}
          >
            {s.fraction !== null && (
              <Animated.View
                testID={`nutrient-fill-${title}`}
                style={[
                  N.fill,
                  {
                    height: trackHeight,
                    width: fill.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                      extrapolate: "clamp",
                    }),
                    backgroundColor: barColor,
                  },
                ]}
              />
            )}
            {p?.type === "range" && s.max && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: `${(p.range![0] / s.max) * 100}%`,
                  width: `${((p.range![1] - p.range![0]) / s.max) * 100}%`,
                  top: 0,
                  height: trackHeight,
                  borderWidth: 1,
                  borderColor: color,
                  borderRadius: 3,
                }}
              />
            )}
          </View>
          {s.excess !== null && showTargetHint && (
            <Text style={compact ? N.tiny : N.caption}>
              {t.missing ? "已知小计" : ""}
              {estimated ? "估算" : ""}超出
              {p?.type === "range"
                ? "参考范围"
                : p?.type === "upper_limit"
                  ? "上限"
                  : "目标"}{" "}
              {formatNumber(s.excess)} {t.unit}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
