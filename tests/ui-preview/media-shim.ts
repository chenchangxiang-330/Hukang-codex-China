/** Explicit browser-only media fixture, never executed by production. */
export const requestCameraPermissionsAsync = async () => ({ granted: true });
export const launchCameraAsync = async () => ({
  canceled: false,
  assets: [{ uri: "/assets/archived-milk.jpg" }],
});
export const launchImageLibraryAsync = async (options?: {
  allowsMultipleSelection?: boolean;
}) => ({
  canceled: false,
  assets: Array.from(
    { length: options?.allowsMultipleSelection ? 2 : 1 },
    (_, i) => ({ uri: "/assets/archived-milk.jpg?fixture=" + i }),
  ),
});
