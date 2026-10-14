import type { ImageAsset, OcrDocument } from '../../domain/ocr/types';

/** Implementations must not download models, upload images, or fall back to remote OCR. */
export interface OcrEngine {
  recognize(image: ImageAsset): Promise<OcrDocument>;
}
