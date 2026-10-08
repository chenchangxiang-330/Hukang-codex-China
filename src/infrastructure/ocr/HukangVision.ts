import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import type { BoundingBox, ImageAsset, OcrDocument } from '../../domain/ocr/types';
import modelManifest from '../../../models/paddleocr/v5-mobile/manifest.json';
import { assertImageAsset, assertOcrDocument } from './validateNativeResult';

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

export const hukangVision = {
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
