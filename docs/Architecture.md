# Hukang China — Phase 0 / Phase 1 architecture

本轮边界：干净 Android 工程、原版图标、依赖审计与本地 OCR Lab。没有食品营养解析、食品库 UI、药品功能、AI、提醒、云服务或扫码实现。

## Current execution path

```text
Expo Router / OCR Lab screen
  → OCR Lab use cases
  → local image + OCR adapter
  → custom Expo Kotlin module
  → image preparation / bundled PaddleOCR / ONNX Runtime CPU
  → immutable OCR evidence + local result display
```

React Native 0.86.3、Expo 57.0.27、TypeScript 6；实际补丁版本由
`package-lock.json` 锁定。Android minSdk 26，首版只构建 arm64-v8a。
自定义 Kotlin 模块必须通过自建 APK 使用，不支持用 Expo Go 代替本地 OCR。

## Domain and adapter boundaries

| Directory | Responsibility |
| --- | --- |
| `src/app/` | Expo Router route entry; no OCR model or food provider logic |
| `src/features/ocr-lab/` | Phase 1 image selection, rectangular crop, results and measurements |
| `src/application/usecases/` | Coordinate local image operations and recognition |
| `src/application/ports/` | Replaceable OCR, scanner, food and medicine boundaries |
| `src/domain/ocr/` | Image transforms and immutable raw OCR contracts |
| `src/domain/evidence/` | Field provenance and data-use permissions |
| `src/domain/food/` | Mainland label-compatible food data model, not parser implementation |
| `src/domain/medicine/` | Independent drug model; no shared generic Product |
| `src/infrastructure/ocr/` | Custom Kotlin module adapter; no remote fallback |
| `src/infrastructure/food/` | Reserved local-first food adapter boundary, not implemented |
| `modules/hukang-vision/android/` | Local image processing and Paddle OCR inference |
| `models/paddleocr/v5-mobile/` | Fixed model artifacts and paired configs; see model manifest |
| `tests/fixtures/china-food/` | Real-photo fixture plan and independently stored outputs |

## OCR evidence invariants

- The original image file is retained; image processing produces a separate file.
- The transform records EXIF repair, rotation, crop and resize, including a 3×3
  original-to-processed coordinate matrix.
- `OcrDocument.rawText` and each block's `text`, polygon, bounding box,
  recognizer confidence, page and model hashes are raw evidence.
- Coordinates are processed-image pixels. UI fit/zoom is a separate transform.
- Confidence is the recognizer's score, not a calibrated probability or a food
  fact's correctness probability.
- Recognition and user edits must never overwrite raw evidence. Future parsed
  drafts and confirmed records are separate types and records.
- Missing models, image errors and inference errors fail explicitly. There is
  no online OCR, AI, guessed text, or alternate engine fallback.
- Model loading, OCR and total timing use native measurements. Sampled memory
  maxima are labelled as observations, not absolute peak RSS.

## Food boundary reserved for the next phase

```text
BarcodeScanner → raw barcode + format
  → independent GTIN validation
  → ChinaFoodRepository
      → LocalChinaFoodSource
      → explicitly authorized mainland providers, if enabled later
      → package photos + OCR + user confirmation on lookup miss
```

`HukangChinaFoodService` is only an interface reserved for a Hukang-controlled
mainland deployment. It does not configure a URL, API key, HTTP client or active
network dependency. Phase 1 has no food repository adapter or seeded food data.

Food records preserve leading zeros, packaging versions, Chinese name, brand,
category, specification, ingredients, images, provenance and timestamps.
Nutrition supports multiple per-100g, per-100mL and per-serving columns, energy
in its printed unit (kJ first), independent NRV%, sugar and saturated fat, and
2011/2025 label standards. Unknown quantities are not zero. No value is inferred
from NRV% or an unrelated food average. Conversions, when implemented, must be
separate derived records with sufficient serving evidence.

The only shared food/medicine types are field evidence and permission wrappers.
Medicine identity, approval verification and packaging have their own model and
repository. A formatted approval-number candidate is not official validation.

## Migration discipline

Old repositories remain read-only. This phase copies the verified original
`assets/icon.png` and uses small, reviewed image-processing rules. No old app,
generic Product schema, providers, API keys, UI directories, seed data, ML Kit,
OFF/Wikidata, or Vision/AI integration is copied.

The Paddle Android engine is adapted from its fixed official source baseline;
its license and source attribution remain in the native module. Runtime/model
versions are detailed separately in `OcrModelManifest.md`.

Build, installation, real-photo results and release Manifest claims require
actual artifacts. Their status is recorded in the acceptance report; this
architecture document is not evidence of device execution.
