import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import type { BoundingBox, ImageAsset, OcrDocument } from '../../domain/ocr/types';
import modelManifest from '../../../models/paddleocr/v5-mobile/manifest.json';
import { assertImageAsset, assertOcrDocument } from './validateNativeResult';

type VisionModule = {
  prepareImage(uri: string): Promise<ImageAsset>;
  transformImage(uri: string, rotationDegrees: number, crop: BoundingBox | null): Promise<ImageAsset>;
  recognize(uri: string): Promise<OcrDocument>;
  fileSha256(uri: string): Promise<{ sha256: string }>;
};

let nativeModule: VisionModule | undefined;

function vision(): VisionModule {
  if (Platform.OS !== 'android') throw new Error('OCR Lab 目前只支持 ARM64 Android 本地运行。');
  nativeModule ??= requireNativeModule<VisionModule>('HukangVision');
  return nativeModule;
}

export const hukangVision = {
  async fileSha256(uri: string): Promise<string> {
    const result = await vision().fileSha256(uri);
    if (!/^[a-f0-9]{64}$/.test(result.sha256)) throw new Error('本地图片摘要无效。');
    return result.sha256;
  },
  async prepareImage(uri: string): Promise<ImageAsset> {
    const image = await vision().prepareImage(uri);
    assertImageAsset(image);
    return image;
  },
  async transformImage(image: ImageAsset, rotationDegrees: number, crop: BoundingBox | null): Promise<ImageAsset> {
    if (!Number.isInteger(rotationDegrees) || rotationDegrees % 90 !== 0) {
      throw new Error('目前只支持 90° 的整数倍旋转。');
    }
    const transformed = await vision().transformImage(image.uri, rotationDegrees, crop);
    assertImageAsset(transformed);
    return transformed;
  },
  async recognize(image: ImageAsset): Promise<OcrDocument> {
    const result = await vision().recognize(image.uri);
    assertOcrDocument(result, image, {
      detector: modelManifest.models.detector.sha256,
      recognizer: modelManifest.models.recognizer.sha256,
    });
    return result;
  },
};
