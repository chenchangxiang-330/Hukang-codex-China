import {
  Platform,
  StyleSheet,
  View,
  requireNativeComponent,
  type ColorValue,
  type ViewProps,
  type ViewStyle,
} from "react-native";

type NativeProps = ViewProps & {
  cornerRadius: number;
  curveBorderWidth: number;
  curveBorderColor: ColorValue;
};

const AndroidSurface =
  Platform.OS === "android"
    ? requireNativeComponent<NativeProps>("HukangSurface")
    : null;

/**
 * iOS uses its continuous curve. Android clips its entire native ViewGroup,
 * including full-bleed photos, to a sampled rounded-rectangle superellipse.
 * The Android/web curve is an approximation, not Apple's private geometry.
 */
export function ContinuousView({ style, children, ...props }: ViewProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const radius = typeof flat.borderRadius === "number" ? flat.borderRadius : 28;
  if (AndroidSurface) {
    return (
      <AndroidSurface
        {...props}
        cornerRadius={Math.max(0, radius)}
        curveBorderWidth={
          typeof flat.borderWidth === "number" ? flat.borderWidth : 0
        }
        curveBorderColor={flat.borderColor ?? "transparent"}
        style={[
          style,
          // Keep border width in layout; native drawing supplies its curved stroke.
          { borderRadius: 0, borderColor: "transparent" },
        ]}
      >
        {children}
      </AndroidSurface>
    );
  }
  const curve =
    Platform.OS === "ios"
      ? { borderCurve: "continuous" as const }
      : ({ cornerShape: "superellipse(1.8)" } as ViewStyle);
  return (
    <View {...props} style={[style, curve]}>
      {children}
    </View>
  );
}
