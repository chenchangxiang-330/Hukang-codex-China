/** Browser screenshot fixture only. Actual Android preprocessing is validated on device. */
import type { UploadImage } from "../../src/services/ai/images";
export async function prepareUpload(
  uri: string,
  signal: AbortSignal,
): Promise<UploadImage> {
  if (signal.aborted) throw Error("已取消本地图片处理，没有发送照片。");
  return {
    uri,
    width: 1280,
    height: 1700,
    bytes: 200000,
    mime: "image/jpeg",
    originalBytes: 200000,
    originalWidth: 1280,
    originalHeight: 1700,
    originalMime: "image/jpeg",
    orientation: 1,
    steps: 1,
    metadataRemoved: true,
  };
}
export async function removeUpload(_uri: string) {}

export async function removePickerCopy(_uri: string) {}
