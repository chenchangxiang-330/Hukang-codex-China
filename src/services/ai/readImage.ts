import { File } from "expo-file-system";
import { AiError } from "./errors";
import type { MealImage } from "./protocol";

/** Called only after explicit consent + image opt-in, never when merely picking a photo. */
export async function readMealImage(uri: string): Promise<MealImage> {
  if (!/^(file|content):\/\//.test(uri)) throw new AiError("image_invalid");
  const file = new File(uri);
  if (!file.exists || file.size <= 0 || file.size > 4 * 1024 * 1024)
    throw new AiError("image_invalid");
  const base64 = await file.base64();
  // Check bytes, not the filename extension or an untrusted MIME claim.
  const mime = base64.startsWith("/9j/")
    ? "image/jpeg"
    : base64.startsWith("iVBORw0KGgo")
      ? "image/png"
      : null;
  if (!mime) throw new AiError("image_invalid");
  return { base64, mime };
}
