/** Explicit browser-only media fixture, never executed by production. */
export const requestCameraPermissionsAsync = async () => ({ granted: true });
export const launchCameraAsync = async () => ({
  canceled: false,
  assets: [{ uri: "/assets/archived-milk.jpg" }],
});
export const launchImageLibraryAsync = launchCameraAsync;
