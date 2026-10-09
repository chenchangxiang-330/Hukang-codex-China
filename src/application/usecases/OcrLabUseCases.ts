import type { ImageAsset, OcrEvidence, OcrDocument } from '../../domain/ocr/types';
import { hukangVision } from '../../infrastructure/ocr/HukangVision';

export type { OcrEvidence } from '../../domain/ocr/types';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Captures only the actual native result; no transcription, parser or inference fallback. */
export async function recognizeAndCapture(image: ImageAsset): Promise<OcrEvidence> {
  const ocr = await hukangVision.recognize(image);
  const timestamp = new Date();
  const immutableImage = JSON.parse(JSON.stringify(image)) as ImageAsset;
  const immutableOcr = JSON.parse(JSON.stringify(ocr)) as OcrDocument;
  return deepFreeze({
    schemaVersion: 1 as const,
    id: `${timestamp.getTime()}-${image.processedImageHash.slice(0, 12)}`,
    recordedAt: timestamp.toISOString(),
    image: immutableImage,
    ocr: immutableOcr,
  });
}
