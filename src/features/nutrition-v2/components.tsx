import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  useWindowDimensions,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors as c, tokens } from "../../ui/tokens";
import { Surface } from "../../ui/components";
import {
  formatNumber,
  formatTotal,
  formatEstimateRange,
  reliability,
  targetProgress,
  type Total,
} from "./model";

export function TargetProgress({
  title,
  total,
  target,
  onTargets,
}: {
  title: string;
  total: Total;
  target?: number | undefined;
  onTargets: () => void;
}) {
  const state = targetProgress(total, target);
  const reduced = useReducedMotion();
  const fill = useRef(new Animated.Value(state.fraction ?? 0)).current;
  useEffect(() => {
    const animation = Animated.timing(fill, {
      toValue: state.fraction ?? 0,
      duration: reduced ? 0 : 240,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [state.fraction, reduced, fill]);
  return (
    <View style={{ gap: 8 }} testID={`target-${title}`}>
      <View
        style={[N.row, { flexWrap: "wrap", justifyContent: "space-between" }]}
      >
        <Text style={N.body}>{title}</Text>
        <Text style={N.body}>
          {total.estimated ? "约 " : ""}
          {formatTotal(total)} {total.unit}
          {state.goal
            ? ` / 目标 ${formatNumber(state.goal)} ${total.unit}`
            : ""}
        </Text>
      </View>
      {state.goal ? (
        <>
          {state.fraction !== null ? (
            <View
              style={N.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${title}${total.estimated ? "估算" : ""}进度`}
              aria-valuemin={state.percent === null ? undefined : 0}
              aria-valuemax={state.percent === null ? undefined : 100}
              aria-valuenow={
                state.percent === null
                  ? undefined
                  : Math.min(100, state.percent)
              }
              aria-valuetext={
                state.percent === null
                  ? `估算 ${formatTotal(total)} ${total.unit}，目标 ${state.goal} ${total.unit}`
                  : `已达到目标的 ${state.percent}%`
              }
              accessibilityValue={
                state.percent === null
                  ? {
                      text: `估算 ${formatTotal(total)} ${total.unit}，目标 ${state.goal} ${total.unit}`,
                    }
                  : {
                      min: 0,
                      max: 100,
                      now: Math.min(100, state.percent),
                      text: `已达到目标的 ${state.percent}%`,
                    }
              }
            >
              <Animated.View
                style={[
                  N.fill,
                  {
                    backgroundColor: c.sky,
                    width: fill.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0%", "100%"],
                    }),
                  },
                ]}
              />
            </View>
          ) : null}
          <Text style={N.caption}>
            {state.status}
            {state.fraction === null ? " · 暂不显示进度" : ""}
            {state.excess !== null
              ? ` · ${total.estimated ? "估算" : ""}超出目标 ${formatNumber(state.excess)} ${total.unit}`
              : ""}
          </Text>
        </>
      ) : (
        <View style={[N.row, { justifyContent: "space-between" }]}>
          <Text style={N.caption}>{state.status}</Text>
          <Link title="设置目标" onPress={onTargets} />
        </View>
      )}
    </View>
  );
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (live) setReduced(v);
    });
    const s = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      s.remove();
    };
  }, []);
  return reduced;
}
export function Card({
  children,
  blue = false,
}: {
  children: ReactNode;
  blue?: boolean;
}) {
  return <Surface style={[N.card, blue && N.blueCard]}>{children}</Surface>;
}
export function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        N.action,
        secondary && N.actionSecondary,
        pressed &&
          !disabled && {
            backgroundColor: secondary ? c.neutralSoft : c.brandPressed,
          },
        disabled && { opacity: 0.48 },
      ]}
    >
      <Text style={[N.actionText, secondary && { color: c.brand }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Link({
  title,
  onPress,
  chevron = true,
}: {
  title: string;
  onPress: () => void;
  chevron?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [N.link, pressed && { opacity: 0.6 }]}
    >
      <Text style={N.linkText}>{title}</Text>
      {chevron && <Text style={N.chevron}>›</Text>}
    </Pressable>
  );
}
export function Feedback({ children }: { children: ReactNode }) {
  return (
    <View accessibilityLiveRegion="polite" style={N.feedback}>
      <Text style={N.caption}>{children}</Text>
    </View>
  );
}
export function FoodArt({
  name,
  image,
}: {
  name: string;
  image?: string | undefined;
}) {
  return (
    <View style={N.art}>
      {image ? (
        <Image
          source={{ uri: image }}
          resizeMode="contain"
          accessibilityLabel={`${name}照片`}
          style={{ width: 48, height: 48 }}
        />
      ) : (
        <>
          <View style={N.bowlTop} />
          <View style={N.bowl} />
          <View style={N.bowlFoot} />
        </>
      )}
    </View>
  );
}
export function EnergyRing({
  total,
  target,
}: {
  total: Total;
  target?: number | undefined;
}) {
  const { fontScale } = useWindowDimensions();
  const ringSize = 78 * Math.min(1.7, Math.max(1, fontScale));
  const percent =
    target && !total.missing && !total.estimated && total.value !== null
      ? Math.round((total.value / target) * 100)
      : null;
  return (
    <View
      style={[N.ring, { width: ringSize, height: ringSize }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        percent === null
          ? "参考目标未设置或数据尚不完整"
          : `已占个人能量参考的 ${percent}%，不是达标评分`
      }
    >
      {Array.from({ length: 48 }, (_, i) => (
        <View
          key={i}
          style={[
            N.ringTick,
            {
              top: ringSize / 2 - 4,
              left: ringSize / 2 - 3,
              backgroundColor:
                percent !== null && i < (percent / 100) * 48
                  ? c.sky
                  : c.brandSoft,
              transform: [
                { rotate: `${i * 7.5}deg` },
                { translateY: -(ringSize / 2 - 6) },
              ],
            },
          ]}
        />
      ))}
      <Text style={N.ringValue}>{percent === null ? "—" : `${percent}%`}</Text>
      <Text style={N.tiny}>个人参考</Text>
    </View>
  );
}
export function Progress({
  total,
  target,
  range,
  limit,
  ideal,
}: {
  total: Total;
  target?: number | undefined;
  range?: readonly [number, number] | undefined;
  limit?: number;
  ideal?: number;
}) {
  const denominator = limit ?? target ?? range?.[1];
  if (!denominator || denominator <= 0)
    return <Text style={N.caption}>个人参考目标未设置</Text>;
  const exact =
    total.value !== null && !total.range && !total.missing && !total.estimated;
  const fraction = exact ? total.value! / denominator : null;
  const exceeds =
    (total.range?.[0] ?? total.value ?? 0) > denominator && !!limit;
  const max = range ? range[1] * 1.3 : denominator;
  return (
    <View style={{ gap: 8 }}>
      <View
        style={N.track}
        accessible
        accessibilityLabel={
          range
            ? `参考范围 ${range[0]} 至 ${range[1]} ${total.unit}`
            : `${limit ? "参考上限" : "目标"} ${denominator} ${total.unit}`
        }
      >
        {range && (
          <View
            style={[
              N.rangeBand,
              {
                left: `${(range[0] / max) * 100}%`,
                width: `${((range[1] - range[0]) / max) * 100}%`,
              },
            ]}
          />
        )}
        {fraction !== null && (
          <View
            style={[
              N.fill,
              {
                width: `${Math.min(100, (total.value! / max) * 100)}%`,
                backgroundColor: exceeds ? c.warmAccent : c.sky,
              },
            ]}
          />
        )}
        {ideal && (
          <View style={[N.marker, { left: `${(ideal / max) * 100}%` }]} />
        )}
        {limit && <View style={[N.marker, { right: 0 }]} />}
      </View>
      {range ? (
        <Text style={N.caption}>
          参考范围 {range[0]}–{range[1]} {total.unit} · 达到 100% 不代表最好
        </Text>
      ) : (
        <Text style={N.caption}>
          {fraction !== null
            ? `已${limit ? "占参考上限" : "达到目标"}的 ${Math.round(fraction * 100)}%`
            : `${reliability(total)} · 暂不显示精确百分比`}
        </Text>
      )}
      {ideal && (
        <Text style={N.caption}>
          理想参考 &lt; {ideal}g　｜　建议上限 {limit}g
        </Text>
      )}
      {exceeds && (
        <Text style={[N.caption, { color: c.warm }]}>
          已知{total.missing ? "小计" : "摄入"}超出参考上限{" "}
          {formatNumber((total.range?.[0] ?? total.value!) - denominator)}{" "}
          {total.unit}
          {total.missing ? "，仍有数据缺失" : ""}
        </Text>
      )}
    </View>
  );
}
export function Accordion({
  title,
  value,
  hint,
  children,
  open,
  onToggle,
  summary,
}: {
  title: string;
  value: string;
  hint?: string;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
  summary?: ReactNode;
}) {
  const reduced = useReducedMotion(),
    fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (open) {
      fade.setValue(reduced ? 1 : 0);
      Animated.timing(fade, {
        toValue: 1,
        duration: reduced ? 0 : 200,
        useNativeDriver: true,
      }).start();
    }
  }, [open, reduced, fade]);
  return (
    <Surface style={[N.accordion, open && N.accordionOpen]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}，${value}`}
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onToggle}
        style={[N.accordionHead, open && { backgroundColor: c.detailHeader }]}
      >
        <View style={N.grow}>
          <Text style={N.heading}>{title}</Text>
          {hint && <Text style={N.caption}>{hint}</Text>}
        </View>
        <Text style={N.coreValue}>{value}</Text>
        <Text style={N.chevron}>{open ? "−" : "+"}</Text>
      </Pressable>
      {summary && (
        <View style={{ paddingHorizontal: 18, paddingBottom: 16 }}>
          {summary}
        </View>
      )}
      {open && (
        <Animated.View style={[N.accordionBody, { opacity: fade }]}>
          {children}
        </Animated.View>
      )}
    </Surface>
  );
}
export function NutrientLine({
  title,
  total,
}: {
  title: string;
  total: Total;
}) {
  const originalRange = formatEstimateRange(total);
  return (
    <View style={N.metricRow}>
      <View style={N.grow}>
        <Text style={N.body}>{title}</Text>
      </View>
      <View style={N.metricValue}>
        <Text style={N.metric}>
          {total.estimated ? "约 " : ""}
          {total.value === null && !total.range
            ? "—"
            : `${formatTotal(total)} ${total.unit}`}
          {total.missing && (total.value !== null || total.range)
            ? " · 小计"
            : ""}
        </Text>
        {originalRange && (
          <Text style={[N.caption, { textAlign: "right" }]}>
            原估算范围 {originalRange}
          </Text>
        )}
      </View>
    </View>
  );
}
export const N = StyleSheet.create({
  grow: { flex: 1, minWidth: 0, gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  title: {
    color: c.ink,
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: -0.7,
  },
  heading: { color: c.ink, fontSize: 17, lineHeight: 26, fontWeight: "600" },
  body: { color: c.ink, fontSize: 15, lineHeight: 24 },
  caption: { color: c.muted, fontSize: 13, lineHeight: 21 },
  tiny: { color: c.muted, fontSize: 11, lineHeight: 18 },
  card: {
    borderRadius: tokens.radius.lg,
    borderCurve: "continuous",
    padding: 20,
    gap: 14,
    borderColor: c.line,
    shadowColor: c.shadow,
    shadowOpacity: 0.035,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  blueCard: { backgroundColor: c.brandSoft },
  action: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    borderCurve: "continuous",
    backgroundColor: c.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  actionSecondary: {
    backgroundColor: c.brandSoft,
    borderWidth: 1,
    borderColor: c.line,
  },
  actionText: {
    color: c.onBrand,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
    textAlign: "center",
  },
  link: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  linkText: {
    color: c.brand,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    flexShrink: 1,
  },
  chevron: { color: c.brand, fontSize: 23, lineHeight: 30 },
  feedback: {
    padding: 14,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: c.brandSoft,
    borderWidth: 1,
    borderColor: c.line,
  },
  ring: {
    width: 94,
    height: 94,
    alignItems: "center",
    justifyContent: "center",
  },
  ringTick: {
    position: "absolute",
    top: 43,
    left: 44,
    width: 6,
    height: 9,
    borderRadius: 2,
  },
  ringValue: {
    fontSize: 20,
    lineHeight: 27,
    color: c.brand,
    fontWeight: "500",
  },
  track: { height: 7, borderRadius: 4, backgroundColor: c.track },
  fill: { position: "absolute", height: 7, borderRadius: 4 },
  rangeBand: {
    position: "absolute",
    top: -3,
    height: 13,
    borderRadius: 4,
    backgroundColor: c.rangeBand,
  },
  marker: {
    position: "absolute",
    top: -3,
    height: 13,
    width: 2,
    backgroundColor: c.brand,
  },
  accordion: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 24,
    borderCurve: "continuous",
    padding: 0,
    gap: 0,
    overflow: "hidden",
  },
  accordionOpen: { borderColor: c.lineStrong },
  accordionHead: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 18,
    minHeight: 72,
  },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: c.line,
    padding: 18,
    gap: 16,
  },
  coreValue: {
    color: c.brand,
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "600",
    maxWidth: "43%",
    textAlign: "right",
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  metric: {
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "500",
    color: c.ink,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  metricValue: { maxWidth: "60%", alignItems: "flex-end", gap: 3 },
  art: {
    width: 54,
    height: 54,
    backgroundColor: c.neutralSoft,
    borderRadius: 17,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  bowlTop: {
    width: 29,
    height: 8,
    borderRadius: 10,
    borderWidth: 1.3,
    borderColor: c.lineStrong,
    backgroundColor: c.oliveSoft,
  },
  bowl: {
    width: 28,
    height: 16,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    backgroundColor: c.brandSoft,
    borderWidth: 1.2,
    borderColor: c.lineStrong,
    marginTop: -3,
  },
  bowlFoot: {
    width: 14,
    height: 2,
    backgroundColor: c.lineStrong,
    marginTop: 2,
  },
});
