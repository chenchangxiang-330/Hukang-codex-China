import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
export const C = { bg: '#F2FAF8', ink: '#163F3C', muted: '#6C8480', teal: '#168F86', pale: '#E0F2EE', line: '#DDEBE7', white: '#FFFFFF', red: '#AA423D' };
export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[S.button, secondary && S.secondary, disabled && S.disabled]}><Text style={[S.buttonText, secondary && { color: C.teal }]}>{title}</Text></Pressable>;
}
export function Field({ label, value, onChange, numeric = false, placeholder = '' }: { label: string; value: string; onChange: (s: string) => void; numeric?: boolean; placeholder?: string; }) {
  return <View style={{ gap: 7 }}><Text style={S.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} keyboardType={numeric ? 'decimal-pad' : 'default'} style={S.input} /></View>;
}
export function Choices({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void; }) {
  return <View style={S.wrap}>{options.map(([key, label]) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ selected: value === key }} accessibilityLabel={label} onPress={() => onChange(key)} style={[S.chip, value === key && S.chipOn]}><Text style={{ color: value === key ? C.white : C.ink, fontSize: 14 }}>{label}</Text></Pressable>)}</View>;
}
export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void; }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={S.checkRow}><View style={[S.checkbox, value && { backgroundColor: C.teal, borderColor: C.teal }]}><Text style={{ color: 'white' }}>{value ? '✓' : ''}</Text></View><Text style={[S.note, { flex: 1 }]}>{label}</Text></Pressable>;
}
export const S = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { padding: 24, gap: 20, paddingBottom: 35 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 34, fontWeight: '800', color: C.ink, letterSpacing: 1 },
  tagline: { fontSize: 16, color: C.muted, lineHeight: 26, marginTop: 4 },
  logo: { width: 54, height: 54, borderRadius: 18 },
  eyebrow: { color: C.teal, fontSize: 14, fontWeight: '700' },
  date: { fontSize: 32, color: C.ink, fontWeight: '700' },
  hero: { backgroundColor: C.teal, borderRadius: 28, padding: 25, gap: 12, marginTop: 2 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cameraIcon: { width: 48, height: 36, borderRadius: 10, borderWidth: 2, borderColor: '#D8F4EF', alignItems: 'center', justifyContent: 'center' },
  lens: { width: 17, height: 17, borderRadius: 12, borderWidth: 2, borderColor: '#D8F4EF' },
  heroArrow: { color: 'white', fontSize: 30 },
  heroTitle: { color: 'white', fontSize: 38, fontWeight: '800', marginTop: 10 },
  heroNote: { fontSize: 16, color: '#D9F0EB', lineHeight: 25 },
  heroBottom: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 18, marginTop: 4, borderTopWidth: 1, borderTopColor: '#59ADA2' },
  stats: { flexDirection: 'row', backgroundColor: C.white, borderRadius: 24, padding: 22, alignItems: 'center' },
  stat: { flex: 1, gap: 5 },
  statDivider: { width: 1, height: 44, backgroundColor: C.line, marginRight: 24 },
  number: { fontSize: 29, fontWeight: '700', color: C.ink },
  countUnit: { fontSize: 14, fontWeight: '400', color: C.muted },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  section: { fontSize: 21, fontWeight: '700', color: C.ink },
  link: { fontSize: 14, color: C.teal, paddingVertical: 10 },
  note: { fontSize: 14, lineHeight: 23, color: C.muted },
  small: { fontSize: 12, lineHeight: 20, color: C.muted },
  footer: { fontSize: 12, color: C.muted, textAlign: 'center', paddingVertical: 10 },
  empty: { padding: 25, borderWidth: 1, borderStyle: 'dashed', borderColor: '#BCD9D1', borderRadius: 22, gap: 8 },
  emptyTitle: { fontSize: 18, color: C.ink, fontWeight: '600' },
  listRow: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 17, backgroundColor: C.white, borderRadius: 20 },
  smallMark: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 17, fontWeight: '600', color: C.ink, lineHeight: 26 },
  chevron: { fontSize: 26, color: C.muted },
  dock: { flexDirection: 'row', marginHorizontal: 17, marginTop: 4, marginBottom: 5, paddingVertical: 15, borderRadius: 28, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E9F1ED', boxShadow: '0 4px 22px rgba(16,63,53,0.08)' },
  dockItem: { flex: 1, alignItems: 'center', gap: 6, padding: 4 },
  dockText: { fontSize: 16, color: C.muted },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.teal },
  header: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: C.ink },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 27, lineHeight: 37, fontWeight: '700', color: C.ink },
  card: { backgroundColor: C.white, borderRadius: 22, padding: 20, gap: 16 },
  button: { backgroundColor: C.teal, borderRadius: 17, paddingVertical: 16, paddingHorizontal: 18, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: C.pale },
  buttonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 15, color: C.ink, lineHeight: 23 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink, backgroundColor: '#FFF' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 12, backgroundColor: C.pale },
  chipOn: { backgroundColor: C.teal },
  two: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  checkbox: { width: 22, height: 22, borderWidth: 1, borderColor: C.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  error: { padding: 16, borderRadius: 15, backgroundColor: '#FFF0EE' },
  notice: { padding: 16, borderRadius: 15, backgroundColor: '#E1F1EB' },
  scanner: { height: 330, backgroundColor: '#173D35', borderRadius: 23, overflow: 'hidden', alignItems: 'stretch', justifyContent: 'center' },
  scanFrame: { position: 'absolute', left: 30, right: 30, top: 105, height: 115, borderWidth: 2, borderColor: '#D0F3DC', borderRadius: 14 },
  photo: { height: 260, width: '100%', backgroundColor: 'white', borderRadius: 20 },
  nutritionPhoto: { height: 290, width: '100%', backgroundColor: 'white', borderRadius: 18 },
  productPhoto: { height: 280, width: '100%', borderRadius: 24, backgroundColor: 'white' },
  progress: { flexDirection: 'row', gap: 7 },
  progressItem: { flex: 1, borderRadius: 20, alignItems: 'center', paddingVertical: 10, backgroundColor: C.pale },
  tablePlaceholder: { backgroundColor: 'white', borderRadius: 23, padding: 25, gap: 15, borderWidth: 1, borderStyle: 'dashed', borderColor: '#BAD7CD' },
  fakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fakeLine: { width: 75, height: 6, borderRadius: 3, backgroundColor: C.line },
  nutrientRow: { gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line },
  busy: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: 'rgba(242,250,248,0.94)' }
});
