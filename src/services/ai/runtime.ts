import { AppState, Platform } from "react-native";
import { AiService } from "./service";
import { fetchChatTransport } from "./protocol";
import { nativeChatTransport } from "./nativeTransport";
import { readMealImage } from "./readImage";

import { SavedConnection } from "./connection";
import { secureConnectionStorage } from "./secureStorage";
/** One active, verified configuration; credentials restored from Android Keystore storage. */
export const aiService = new AiService(
  Platform.OS === "android" ? nativeChatTransport : fetchChatTransport,
  readMealImage,
);
AppState.addEventListener("change", (state) => {
  if (state === "background") {
    aiService.cancel();
    savedConnection.cancel();
  }
});

export const savedConnection = new SavedConnection(
  aiService,
  secureConnectionStorage,
  () =>
    new AiService(
      Platform.OS === "android" ? nativeChatTransport : fetchChatTransport,
      readMealImage,
    ),
);
void savedConnection.restore();
