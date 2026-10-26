import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, tokens } from "./tokens";

type Tone = "brand" | "neutral" | "warning" | "danger";
const tones = {
  brand: { backgroundColor: colors.brandSoft, color: colors.brand },
  neutral: { backgroundColor: colors.neutralSoft, color: colors.muted },
  warning: { backgroundColor: colors.warmSoft, color: colors.warm },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
} as const;

export function PageIntro({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.intro}>
      <View style={styles.introCopy}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
      {trailing && <View style={styles.trailing}>{trailing}</View>}
    </View>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionCopy}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        {description && <Text style={styles.caption}>{description}</Text>}
      </View>
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <View
      style={[styles.pill, { backgroundColor: tones[tone].backgroundColor }]}
    >
      <Text style={[styles.pillText, { color: tones[tone].color }]}>
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View accessible={false} style={styles.emptyMark}>
        <View style={styles.emptyDot} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action && <View style={styles.emptyAction}>{action}</View>}
    </View>
  );
}

export function StatTile({
  label,
  value,
  unit,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  unit?: string;
  tone?: Tone;
}) {
  return (
    <View style={styles.statTile}>
      <View
        style={[styles.statAccent, { backgroundColor: tones[tone].color }]}
      />
      <Text style={styles.caption}>{label}</Text>
      <Text style={[styles.statValue, { color: tones[tone].color }]}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

export function Surface({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  intro: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: tokens.space.lg,
    paddingVertical: tokens.space.sm,
  },
  introCopy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 190,
    gap: tokens.space.sm,
  },
  trailing: { flexShrink: 0 },
  eyebrow: { ...tokens.type.label, color: colors.brand },
  title: { ...tokens.type.title, color: colors.ink },
  description: { ...tokens.type.body, color: colors.muted },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: tokens.space.md,
    rowGap: tokens.space.xs,
  },
  sectionCopy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 145,
    gap: tokens.space.xs,
  },
  sectionTitle: { ...tokens.type.section, color: colors.ink },
  caption: { ...tokens.type.caption, color: colors.muted },
  action: {
    flexShrink: 1,
    maxWidth: "100%",
    minHeight: tokens.control.minimumTouchSize,
    justifyContent: "center",
  },
  pill: {
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 5,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  pillText: { ...tokens.type.caption, fontWeight: "600", flexShrink: 1 },
  empty: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xxl,
    gap: tokens.space.md,
  },
  emptyMark: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: tokens.space.xs,
  },
  emptyDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderColor: colors.brand,
    borderWidth: 2,
  },
  emptyTitle: {
    ...tokens.type.subtitle,
    color: colors.ink,
    textAlign: "center",
  },
  emptyDescription: {
    ...tokens.type.caption,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 360,
  },
  emptyAction: { alignSelf: "stretch", marginTop: tokens.space.xs },
  statTile: {
    flex: 1,
    minWidth: 104,
    borderRadius: tokens.radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
  },
  statAccent: {
    width: 18,
    height: 3,
    borderRadius: 2,
    marginBottom: tokens.space.xs,
  },
  statValue: {
    fontSize: 27,
    lineHeight: 36,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statUnit: { ...tokens.type.caption, color: colors.muted },
  surface: {
    backgroundColor: colors.surface,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xl,
    gap: tokens.space.lg,
    borderColor: colors.line,
    borderWidth: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    alignSelf: "stretch",
  },
});
