/** TEST ONLY: browser equivalents plus explicit preview-only confirmation. */
export * from "react-native-web";
// The shared Surface takes its web branch. Never pretend to render Android's
// native clipping view in browser evidence.
export function requireNativeComponent(name: string): never {
  throw new Error(
    `Native view ${name} cannot be exercised in the browser preview`,
  );
}
export const Alert = {
  alert(
    title: string,
    message?: string,
    buttons?: { text: string; style?: string; onPress?: () => void }[],
  ) {
    const accepted = window.confirm(
      `${title}\n${message ?? ""}\n\n[UI 预览：此操作仅影响内存模拟数据]`,
    );
    if (accepted)
      buttons
        ?.find((button) => button.style !== "cancel" && button.onPress)
        ?.onPress?.();
  },
};
