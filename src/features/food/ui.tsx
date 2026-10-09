import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export const foodColors = {
  background: '#f3faf8', surface: '#ffffff', ink: '#183e37', secondary: '#60736e',
  teal: '#157b67', border: '#dce9e4', pale: '#e6f4ed', amber: '#946015', red: '#a43b3b',
};

export function FoodAction({ title, onPress, disabled = false, primary = false, destructive = false }: {
  title: string; onPress: () => void; disabled?: boolean; primary?: boolean; destructive?: boolean;
}) {
  return <Pressable
    accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [foodStyles.action, primary && foodStyles.primaryAction,
      destructive && foodStyles.destructiveAction, disabled && foodStyles.disabled, pressed && foodStyles.pressed]}
  ><Text style={[foodStyles.actionText, primary && foodStyles.primaryActionText,
    destructive && foodStyles.destructiveText]}>{title}</Text></Pressable>;
}

export function FoodField({ label, accessibilityLabel = label, value, onChangeText, multiline = false, disabled = false, numeric = false }: {
  label: string; accessibilityLabel?: string; value: string; onChangeText: (value: string) => void;
  multiline?: boolean; disabled?: boolean; numeric?: boolean;
}) {
  return <View style={foodStyles.field}>
    <Text style={foodStyles.label}>{label}</Text>
    <TextInput accessibilityLabel={accessibilityLabel} value={value} onChangeText={onChangeText}
      multiline={multiline} editable={!disabled} keyboardType={numeric ? 'numbers-and-punctuation' : 'default'}
      selectTextOnFocus style={[foodStyles.input, multiline && foodStyles.multiline, disabled && foodStyles.disabled]}
    />
  </View>;
}

export function FoodCheck({ label, accessibilityLabel = label, value, onChange, disabled = false }: {
  label: string; accessibilityLabel?: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel}
    accessibilityState={{ checked: value, disabled }} disabled={disabled} onPress={() => onChange(!value)}
    style={({ pressed }) => [foodStyles.checkRow, disabled && foodStyles.disabled, pressed && foodStyles.pressed]}>
    <View style={[foodStyles.check, value && foodStyles.checked]}><Text style={foodStyles.checkMark}>{value ? '✓' : ''}</Text></View>
    <Text style={foodStyles.checkLabel}>{label}</Text>
  </Pressable>;
}

export function FoodChoices<T extends string>({ label, accessibilityLabel, value, options, onChange, disabled = false }: {
  label: string; accessibilityLabel: string; value: T;
  options: readonly { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <View style={foodStyles.field}>
    <Text style={foodStyles.label}>{label}</Text>
    <View style={foodStyles.choices}>{options.map((option) => <Pressable key={option.value}
      accessibilityRole="radio" accessibilityLabel={`${accessibilityLabel}-${option.value}`}
      accessibilityState={{ selected: value === option.value, disabled }} disabled={disabled}
      onPress={() => onChange(option.value)}
      style={[foodStyles.choice, value === option.value && foodStyles.selectedChoice, disabled && foodStyles.disabled]}>
      <Text style={[foodStyles.choiceText, value === option.value && foodStyles.selectedChoiceText]}>{option.label}</Text>
    </Pressable>)}</View>
  </View>;
}

export function foodError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const foodStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: foodColors.background },
  content: { padding: 16, gap: 16, paddingBottom: 36 },
  title: { fontSize: 23, fontWeight: '700', color: foodColors.ink },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: foodColors.ink },
  card: { backgroundColor: foodColors.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: foodColors.border, gap: 12 },
  note: { fontSize: 12, lineHeight: 20, color: foodColors.secondary },
  text: { fontSize: 14, lineHeight: 22, color: foodColors.ink },
  warning: { fontSize: 12, lineHeight: 20, color: foodColors.amber },
  error: { backgroundColor: '#fff1ee', padding: 12, borderRadius: 10, gap: 5 },
  errorText: { fontSize: 13, lineHeight: 21, color: foodColors.red },
  notice: { backgroundColor: foodColors.pale, padding: 12, borderRadius: 10 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: foodColors.pale, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  primaryAction: { backgroundColor: foodColors.teal },
  actionText: { color: foodColors.teal, fontWeight: '600', fontSize: 14 },
  primaryActionText: { color: '#fff' },
  destructiveAction: { backgroundColor: '#fff1ee' },
  destructiveText: { color: foodColors.red },
  field: { gap: 6 },
  label: { fontSize: 13, color: foodColors.ink, fontWeight: '500' },
  input: { backgroundColor: foodColors.background, borderWidth: 1, borderColor: foodColors.border, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 10, color: foodColors.ink, fontSize: 15, minHeight: 44 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, paddingVertical: 5 },
  check: { width: 24, height: 24, borderWidth: 1, borderColor: foodColors.teal, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: foodColors.teal },
  checkMark: { color: '#fff', fontSize: 17, fontWeight: '700' },
  checkLabel: { flex: 1, color: foodColors.ink, fontSize: 13, lineHeight: 20 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  choice: { borderWidth: 1, borderColor: foodColors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, minHeight: 40, justifyContent: 'center' },
  selectedChoice: { backgroundColor: foodColors.teal, borderColor: foodColors.teal },
  choiceText: { color: foodColors.secondary, fontSize: 12 },
  selectedChoiceText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  divider: { height: 1, backgroundColor: foodColors.border },
  code: { fontSize: 11, color: foodColors.secondary, lineHeight: 18 },
});
