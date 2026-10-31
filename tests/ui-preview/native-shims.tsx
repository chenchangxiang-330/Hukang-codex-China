/** TEST ONLY. Native services are unavailable in this browser UI preview. */
import React from "react";
import app from "../../app.json";
import { View, Text } from "react-native-web";
export const Stack = Object.assign(() => null, { Screen: () => null });
export const StatusBar = () => null;
export const SafeAreaView = ({ children, edges: _edges, ...props }: any) => (
  <View {...props}>{children}</View>
);
export const SafeAreaProvider = ({ children }: any) => <>{children}</>;
export const useSafeAreaInsets = () => ({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
export const useSafeAreaFrame = () => ({
  x: 0,
  y: 0,
  width: innerWidth,
  height: innerHeight,
});
export const initialWindowMetrics = {
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  frame: { x: 0, y: 0, width: 390, height: 844 },
};
export function requireNativeViewManager() {
  return ({ style }: any) => (
    <View
      style={[
        style,
        {
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: "#173B2D",
        },
      ]}
    >
      <Text
        style={{
          color: "#E2EFE8",
          textAlign: "center",
          fontSize: 15,
          lineHeight: 24,
        }}
      >
        相机预览占位{"\n"}浏览器不执行扫码或 OCR
      </Text>
    </View>
  );
}
export default { expoConfig: { version: app.expo.version } };

export function requireNativeModule() {
  throw new Error("Native module unavailable in browser preview");
}
