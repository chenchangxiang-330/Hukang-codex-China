/** Pixel coordinates in the processed image, before any UI display scaling. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface BoundingBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ImageTransform {
  /** Row-major 3x3 matrix mapping original image coordinates to processed coordinates. */
  readonly matrix: readonly number[];
  readonly operations: readonly Readonly<Record<string, unknown>>[];
  readonly originalWidth: number;
  readonly originalHeight: number;
}

/** Both URIs are app-private local files. Original bytes are never overwritten. */
export interface ImageAsset {
  readonly uri: string;
  readonly originalUri: string;
  readonly width: number;
  readonly height: number;
  readonly sourceImageHash: string;
  readonly processedImageHash: string;
  readonly sourceOrientation: number;
  readonly transform: ImageTransform;
  /** Native elapsed time for import/EXIF preparation and all applied transforms; no UI dwell. */
  readonly preprocessingMs?: number;
  /** Native elapsed time for the latest successful prepare/transform operation. */
  readonly preprocessingLastOperationMs?: number;
}

export interface OcrBlock {
  readonly id: string;
  /** Exact decoder output; business interpretation must not replace it. */
  readonly text: string;
  readonly boundingBox: BoundingBox;
  readonly polygon: readonly Point[];
  /** Recognizer score, not a calibrated probability or business confidence. */
  readonly confidence: number;
  /** Zero-based page index. Phase 1 processes one image: page 0. */
  readonly page: number;
}

export interface OcrStageTimings {
  readonly detPreprocessMs: number;
  readonly detInferenceMs: number;
  readonly detPostprocessMs: number;
  readonly recPreprocessMs: number;
  readonly recInferenceMs: number;
  readonly recPostprocessMs: number;
  readonly pipelineOverheadMs: number;
  readonly detInputShape: readonly number[];
  readonly recInputShapes: readonly (readonly number[])[];
}

/** Immutable OCR evidence. Parsed or user-confirmed values belong in separate records. */
export interface OcrDocument {
  readonly imageUri: string;
  readonly evidenceUri: string;
  readonly sourceImageHash: string;
  readonly processedImageHash: string;
  readonly rawText: string;
  readonly blocks: readonly OcrBlock[];
  readonly width: number;
  readonly height: number;
  readonly engineVersion: string;
  readonly modelVersion: string;
  readonly modelHashes: Readonly<Record<string, string>>;
  readonly modelLoadMs: number;
  /** Session initialization within the first native engine load; carried on subsequent runs. */
  readonly modelColdLoadMs?: number;
  /** Metadata read and prepared-image decode at recognition, before model loading. */
  readonly imageDecodeMs?: number;
  readonly ocrMs: number;
  readonly totalMs: number;
  /** Measured by the native engine, not inferred by JavaScript or from CI duration. */
  readonly timings?: OcrStageTimings;
  /** Optional sampled measurements; keys must state their units. Not necessarily peak RSS. */
  readonly memory?: Readonly<Record<string, number | null>>;
}

/** Snapshot captured from the native engine; business interpretations live elsewhere. */
export type OcrEvidence = Readonly<{
  schemaVersion: 1;
  id: string;
  recordedAt: string;
  image: ImageAsset;
  ocr: OcrDocument;
}>;

export type OcrFailureCode =
  | 'MODEL_MISSING'
  | 'MODEL_HASH_MISMATCH'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_LARGE'
  | 'NO_TEXT'
  | 'INFERENCE_FAILED'
  | 'UNSUPPORTED_PLATFORM';
