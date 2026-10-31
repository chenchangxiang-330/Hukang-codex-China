import { AppState, Platform } from "react-native";
import { AiService } from "./service";
import { fetchChatTransport } from "./protocol";
import { nativeChatTransport } from "./nativeTransport";
import { readMealImage } from "./readImage";

/** One session for settings + meals. Nothing is written to AsyncStorage/SQLite/files. */
export const aiService = new AiService(
  Platform.OS === "android" ? nativeChatTransport : fetchChatTransport,
  readMealImage,
);
AppState.addEventListener("change", (state) => {
  if (state === "background") aiService.cancel();
});
