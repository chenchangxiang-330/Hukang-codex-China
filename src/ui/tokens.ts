/** UI V1 uses platform fonts so Chinese text follows Android accessibility settings. */
export const colors = {
  background: "#F7F8F5",
  surface: "#FFFFFF",
  brand: "#286B52",
  brandPressed: "#1C513E",
  brandSoft: "#E8F0E9",
  ink: "#20332A",
  muted: "#617068",
  line: "#DFE6DD",
  warm: "#965D2F",
  warmAccent: "#B87945",
  warmSoft: "#F8EDE0",
  danger: "#A73F38",
  dangerSoft: "#FFF0ED",
  neutralSoft: "#EFF2EC",
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
