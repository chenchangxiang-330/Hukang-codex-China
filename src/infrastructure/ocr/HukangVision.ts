import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import type { BoundingBox, ImageAsset, OcrDocument } from '../../domain/ocr/types';

type VisionModule = {
  prepareImage(uri: string): Promise<ImageAsset>;
  transformImage(uri: string, rotationDegrees: number, crop: BoundingBox | null): Promise<ImageAsset>;
  recognize(uri: string): Promise<OcrDocument>;
};

let nativeModule: VisionModule | undefined;

function vision(): VisionModule {
  if (Platform.OS !== 'android') throw new Error('OCR Lab 目前只支持 ARM64 Android 本地运行。');
  nativeModule ??= requireNativeModule<VisionModule>('HukangVision');
  return nativeModule;
}

function assertImage(image: ImageAsset): void {
  if (!image.uri || !image.originalUri || image.width <= 0 || image.height <= 0) {
    throw new Error('本地图像模块返回了无效图片。');
  }
}

export const hukangVision = {
  async prepareImage(uri: string): Promise<ImageAsset> {
    const image = await vision().prepareImage(uri);
    assertImage(image);
    return image;
  },
  async transformImage(image: ImageAsset, rotationDegrees: number, crop: BoundingBox | null): Promise<ImageAsset> {
    if (!Number.isInteger(rotationDegrees) || rotationDegrees % 90 !== 0) {
      throw new Error('目前只支持 90° 的整数倍旋转。');
    }
    const transformed = await vision().transformImage(image.uri, rotationDegrees, crop);
    assertImage(transformed);
    return transformed;
  },
  async recognize(image: ImageAsset): Promise<OcrDocument> {
    const result = await vision().recognize(image.uri);
    if (typeof result.rawText !== 'string' || !Array.isArray(result.blocks) || result.width !== image.width || result.height !== image.height) {
      throw new Error('OCR 结果与当前图片不匹配，已拒绝展示。');
    }
    return result;
  },
};
