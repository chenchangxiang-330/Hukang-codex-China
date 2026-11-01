import { requireNativeModule } from "expo-modules-core";
export type UploadImage = {
  uri: string;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  originalBytes: number;
  originalWidth: number;
  originalHeight: number;
  originalMime: string;
  orientation: number;
  steps: number;
  metadataRemoved: boolean;
};
type NativeImages = {
  prepareImage(id: string, uri: string): Promise<UploadImage>;
  cancel(id: string): void;
  removeUpload(uri: string): Promise<void>;
};
const native = () => requireNativeModule<NativeImages>("HukangAi");
const messages: Record<string, string> = {
  IMAGE_CANCELLED: "已取消本地图片处理，没有发送照片。",
  IMAGE_SOURCE_SIZE: "原图超过本机 50 MB 处理上限，请选择较小的照片。",
  IMAGE_DIMENSIONS: "图片尺寸过大，请先在相册裁剪或选择较小副本。",
  IMAGE_FORMAT:
    "此图片格式无法在当前手机解码，请改用 JPEG、PNG 或可读取的相册图片。",
  IMAGE_MEMORY: "手机暂时没有足够内存处理照片，请选择较小图片。",
  IMAGE_LIMIT:
    "已完成有限次压缩，仍超过 4,000,000 字节，照片没有发送，请重选。",
  IMAGE_READ: "图片无法读取或处理，请重新选择照片。",
  IMAGE_ENCODE: "无法生成上传副本，请重新选择照片。",
};
export async function prepareUpload(
  uri: string,
  signal: AbortSignal,
): Promise<UploadImage> {
  const id = `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (signal.aborted) throw Error(messages.IMAGE_CANCELLED);
  const cancel = () => native().cancel(id);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const image = await native().prepareImage(id, uri);
    if (signal.aborted) {
      await removeUpload(image.uri);
      throw Error(messages.IMAGE_CANCELLED);
    }
    if (
      image.bytes > 4_000_000 ||
      image.width > 2048 ||
      image.height > 2048 ||
      image.bytes <= 0 ||
      !image.metadataRemoved
    ) {
      await removeUpload(image.uri);
      throw Error(messages.IMAGE_LIMIT);
    }
    return image;
  } catch (error) {
    throw Error(
      signal.aborted
        ? messages.IMAGE_CANCELLED
        : (messages[(error as { code?: string })?.code ?? ""] ??
            messages.IMAGE_READ),
    );
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
export async function removeUpload(uri: string) {
  try {
    await native().removeUpload(uri);
  } catch {
    /* app-owned cache expires after 24h; never touches originals */
  }
}
