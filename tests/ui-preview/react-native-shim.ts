/** TEST ONLY: browser equivalents plus explicit preview-only confirmation. */
export * from "react-native-web";
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
