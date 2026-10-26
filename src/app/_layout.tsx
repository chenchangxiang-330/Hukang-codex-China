import { Stack } from "expo-router";
import { colors } from "../ui/tokens";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.brand,
      }}
    />
  );
}
