/** Milk / sky system uses platform fonts so Chinese text follows Android accessibility settings. */
export const colors = {
  sky: "#96CAE9",
  onSky: "#214C68",
  detailBackground: "#EAF1F6",
  detailHeader: "#DCEAF4",
  background: "#FFFDF7",
  surface: "#FFFEFA",
  brand: "#386F95",
  brandPressed: "#2D5A7B",
  brandSoft: "#EAF4FB",
  ink: "#30485C",
  muted: "#697B88",
  line: "#D8E4ED",
  warm: "#8A6949",
  warmAccent: "#B79874",
  warmSoft: "#F5EEDF",
  danger: "#9D5A53",
  dangerSoft: "#FAEFEB",
  neutralSoft: "#EFF4F7",
} as const;

export const tokens = {
  colors,
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 },
  radius: { sm: 12, md: 18, lg: 24, pill: 999 },
  type: {
    display: { fontSize: 32, lineHeight: 42, fontWeight: "700" },
    title: { fontSize: 28, lineHeight: 38, fontWeight: "700" },
    section: { fontSize: 20, lineHeight: 29, fontWeight: "700" },
    subtitle: { fontSize: 17, lineHeight: 26, fontWeight: "600" },
    body: { fontSize: 16, lineHeight: 25, fontWeight: "400" },
    caption: { fontSize: 13, lineHeight: 21, fontWeight: "400" },
    label: { fontSize: 14, lineHeight: 22, fontWeight: "600" },
  },
  control: { minimumTouchSize: 48, fieldMinHeight: 52, pageMaxWidth: 680 },
} as const;
