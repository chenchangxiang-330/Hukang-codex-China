import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  StyleSheet,
  type TextInputProps,
} from "react-native";
import { colors, tokens } from "../../ui/tokens";

/** Compatibility names keep existing screens on the shared UI V1 palette. */
export const C = {
  bg: colors.background,
  ink: colors.ink,
  muted: colors.muted,
  teal: colors.brand,
  pale: colors.brandSoft,
  line: colors.line,
  white: colors.surface,
  red: colors.danger,
  warm: colors.warm,
  warmSoft: colors.warmSoft,
  brandPressed: colors.brandPressed,
};

export function Button({
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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        S.button,
        secondary && S.secondary,
        pressed &&
          !disabled &&
          (secondary ? S.secondaryPressed : S.buttonPressed),
        disabled && S.disabled,
      ]}
    >
      <Text style={[S.buttonText, secondary && { color: C.teal }]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder = "",
  hint,
  error,
  secureTextEntry = false,
  editable = true,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  numeric?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  secureTextEntry?: boolean;
  editable?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={S.field}>
      <Text style={S.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error || hint || ""}
        accessibilityState={{ disabled: !editable }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={keyboardType ?? (numeric ? "decimal-pad" : "default")}
        autoCapitalize={
          autoCapitalize ?? (secureTextEntry ? "none" : "sentences")
        }
        autoCorrect={!secureTextEntry}
        secureTextEntry={secureTextEntry}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={C.teal}
        underlineColorAndroid="transparent"
        style={[
          S.input,
          focused && S.inputFocused,
          !!error && S.inputError,
          !editable && S.disabled,
        ]}
      />
      {!!error && (
        <Text accessibilityLiveRegion="polite" style={S.fieldError}>
          {error}
        </Text>
      )}
      {!error && !!hint && <Text style={S.small}>{hint}</Text>}
    </View>
  );
}

export function Choices({
  value,
  options,
  onChange,
  accessibilityPrefix = "",
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
  accessibilityPrefix?: string;
}) {
  return (
    <View style={S.wrap}>
      {options.map(([key, label]) => (
        <Pressable
          key={key}
          accessibilityRole="radio"
          accessibilityState={{
            selected: value === key,
            checked: value === key,
          }}
          accessibilityLabel={
            accessibilityPrefix ? `${accessibilityPrefix} ${label}` : label
          }
          aria-checked={value === key}
          onPress={() => onChange(key)}
          style={({ pressed }) => [
            S.chip,
            value === key && S.chipOn,
            pressed && S.controlPressed,
          ]}
        >
          <Text style={[S.chipText, value === key && { color: C.white }]}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [S.checkRow, pressed && S.controlPressed]}
    >
      <View
        style={[
          S.checkbox,
          value && { backgroundColor: C.teal, borderColor: C.teal },
        ]}
      >
        <Text style={S.checkMark}>{value ? "✓" : ""}</Text>
      </View>
      <Text style={[S.note, { flex: 1, color: C.ink }]}>{label}</Text>
    </Pressable>
  );
}

export const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: {
    padding: tokens.space.xl,
    gap: tokens.space.xxl,
    paddingBottom: tokens.space.xxxl,
    width: "100%",
    maxWidth: tokens.control.pageMaxWidth,
    alignSelf: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.lg,
  },
  brand: { ...tokens.type.title, color: C.ink },
  tagline: { ...tokens.type.body, color: C.muted, marginTop: tokens.space.xs },
  logo: { width: 48, height: 48, borderRadius: tokens.radius.md },
  eyebrow: { ...tokens.type.label, color: C.teal },
  date: { ...tokens.type.display, color: C.ink },
  hero: {
    backgroundColor: C.teal,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xxl,
    gap: tokens.space.md,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cameraIcon: {
    width: 44,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#DCEBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  lens: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#DCEBF5",
  },
  heroArrow: { color: C.white, fontSize: 26 },
  heroTitle: { ...tokens.type.display, color: C.white },
  heroNote: { ...tokens.type.body, color: "#EDF5FA" },
  heroBottom: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.sm,
    justifyContent: "space-between",
    paddingTop: tokens.space.lg,
    marginTop: tokens.space.xs,
    borderTopWidth: 1,
    borderTopColor: "#7291AB",
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.lg,
    backgroundColor: C.white,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: C.line,
    padding: tokens.space.xl,
    alignItems: "center",
  },
  stat: { flex: 1, minWidth: 104, gap: tokens.space.xs },
  statDivider: { width: 1, height: 40, backgroundColor: C.line },
  number: {
    fontSize: 28,
    lineHeight: 38,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: C.ink,
  },
  countUnit: { ...tokens.type.caption, color: C.muted },
  sectionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: tokens.space.md,
  },
  section: { ...tokens.type.section, color: C.ink },
  link: {
    ...tokens.type.label,
    color: C.teal,
    paddingVertical: tokens.space.md,
    minHeight: tokens.control.minimumTouchSize,
  },
  note: { fontSize: 14, lineHeight: 23, color: C.muted },
  small: { ...tokens.type.caption, color: C.muted },
  footer: {
    ...tokens.type.caption,
    color: C.muted,
    textAlign: "center",
    paddingVertical: tokens.space.md,
  },
  empty: {
    backgroundColor: C.white,
    padding: tokens.space.xxl,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: tokens.radius.lg,
    gap: tokens.space.sm,
  },
  emptyTitle: { ...tokens.type.subtitle, color: C.ink },
  listRow: {
    flexDirection: "row",
    gap: tokens.space.md,
    alignItems: "center",
    padding: tokens.space.lg,
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    minHeight: 80,
  },
  smallMark: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowTitle: { ...tokens.type.subtitle, color: C.ink },
  chevron: { fontSize: 24, color: C.muted },
  dock: {
    flexDirection: "row",
    paddingHorizontal: tokens.space.sm,
    paddingTop: tokens.space.sm,
    paddingBottom: tokens.space.xs,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  dockItem: {
    flex: 1,
    minHeight: tokens.control.minimumTouchSize,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.xs,
    paddingHorizontal: tokens.space.xs,
    paddingVertical: tokens.space.sm,
  },
  dockText: { ...tokens.type.caption, color: C.muted, textAlign: "center" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.teal },
  header: {
    flexDirection: "row",
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.bg,
  },
  headerTitle: {
    ...tokens.type.subtitle,
    color: C.ink,
    flex: 1,
    textAlign: "center",
  },
  back: {
    width: tokens.control.minimumTouchSize,
    height: tokens.control.minimumTouchSize,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...tokens.type.title, color: C.ink },
  card: {
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xl,
    gap: tokens.space.lg,
  },
  button: {
    backgroundColor: C.teal,
    borderRadius: tokens.radius.sm,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.lg,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
    borderWidth: 1,
    borderColor: "transparent",
  },
  buttonPressed: { backgroundColor: C.brandPressed },
  secondary: { backgroundColor: C.pale, borderColor: "#D8E5EF" },
  secondaryPressed: { backgroundColor: "#D4E5F2" },
  buttonText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    color: C.white,
    textAlign: "center",
    flexShrink: 1,
  },
  disabled: { opacity: 0.48 },
  controlPressed: { opacity: 0.72 },
  label: { ...tokens.type.label, color: C.ink },
  field: { gap: tokens.space.sm, minWidth: 0 },
  input: {
    minHeight: tokens.control.fieldMinHeight,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: tokens.space.md,
    fontSize: 16,
    lineHeight: 24,
    color: C.ink,
    backgroundColor: C.white,
  },
  inputFocused: { borderColor: C.teal, backgroundColor: "#FCFEFF" },
  inputError: { borderColor: C.red },
  fieldError: { ...tokens.type.caption, color: C.red },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.sm,
    alignItems: "center",
  },
  chip: {
    minHeight: tokens.control.minimumTouchSize,
    paddingVertical: tokens.space.md,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.sm,
    backgroundColor: C.pale,
    maxWidth: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  chipText: {
    ...tokens.type.label,
    color: C.ink,
    textAlign: "center",
    flexShrink: 1,
  },
  chipOn: { backgroundColor: C.teal },
  two: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: tokens.space.md,
    alignItems: "flex-start",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    borderColor: C.muted,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkMark: {
    color: C.white,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  checkRow: {
    flexDirection: "row",
    gap: tokens.space.md,
    alignItems: "center",
    minHeight: tokens.control.minimumTouchSize,
    paddingVertical: tokens.space.md,
  },
  error: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: "#F0D0CB",
    backgroundColor: colors.dangerSoft,
  },
  notice: {
    padding: tokens.space.lg,
    borderRadius: tokens.radius.md,
    backgroundColor: C.pale,
  },
  scanner: {
    height: 330,
    backgroundColor: "#213C50",
    borderRadius: tokens.radius.lg,
    overflow: "hidden",
    alignItems: "stretch",
    justifyContent: "center",
  },
  scanFrame: {
    position: "absolute",
    left: 24,
    right: 24,
    top: 105,
    height: 115,
    borderWidth: 2,
    borderColor: "#E2F1FA",
    borderRadius: tokens.radius.sm,
  },
  photo: {
    height: 260,
    width: "100%",
    backgroundColor: C.white,
    borderRadius: tokens.radius.md,
  },
  nutritionPhoto: {
    height: 290,
    width: "100%",
    backgroundColor: C.white,
    borderRadius: tokens.radius.md,
  },
  productPhoto: {
    height: 280,
    width: "100%",
    borderRadius: tokens.radius.lg,
    backgroundColor: C.white,
  },
  progress: { flexDirection: "row", gap: tokens.space.sm },
  progressItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: tokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.xs,
    backgroundColor: C.pale,
  },
  tablePlaceholder: {
    backgroundColor: C.white,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.xl,
    gap: tokens.space.lg,
    borderWidth: 1,
    borderColor: C.line,
  },
  fakeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.space.md,
  },
  fakeLine: { width: 64, height: 5, borderRadius: 3, backgroundColor: C.line },
  nutrientRow: {
    gap: tokens.space.md,
    paddingTop: tokens.space.lg,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  busy: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.space.lg,
    padding: tokens.space.xxl,
    backgroundColor: "rgba(247,248,245,0.97)",
  },
});
