# Hukang China — Phase 3.1 architecture

本轮边界：条码身份查询可选走 Hukang 控制的国内 HTTPS 服务；条码解码、PaddleOCR、营养表解析、人工核对、SQLite 食品记录和修订历史始终在本机。没有云 OCR、在线 AI、药品、账号、云同步或海外业务服务。商品查询默认关闭、按次明确启用，服务未配置时不影响离线流程。

## Current execution path

```text
Expo Router / OCR Lab screen
  → OCR Lab use cases
  → local image + OCR adapter
  → custom Expo Kotlin module
  → image preparation / bundled PaddleOCR / ONNX Runtime CPU
  → immutable OCR evidence + geometry parser
  → Food Review + SQLite local repository + barcode association

Barcode miss (only after local lookup)
  → explicit user consent
  → fixed Hukang HTTPS `/v1/food-identity/lookup` (barcode fields only)
  → identity candidate → user confirmation
  → local nutrition photo/OCR/review → SQLite identity + evidence transaction
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
| `src/infrastructure/food/` | Local SQLite food adapter, evidence and revision storage |
| `modules/hukang-vision/android/` | Local image processing and Paddle OCR inference |
| `modules/hukang-barcode/android/` | ZXing core image decoder for EAN-13/EAN-8/UPC-A/UPC-E; local URI only |
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

## Food lookup boundary

```text
BarcodeScanner → raw barcode + format
  → `modules/hukang-barcode` (ZXing core, local image only)
  → independent GTIN validation
  → ChinaFoodRepository
      → LocalChinaFoodSource
      → optional explicitly authorized mainland identity provider
      → package photos + OCR + user confirmation on lookup miss
```

`ChinaFoodRepository` always runs first. `ConfiguredChinaFoodProvider` accepts only
a build-time Hukang HTTPS origin and sends the validated raw barcode, GTIN, lookup
key and format; it never accepts an upstream URL, vendor key, image, OCR text or
food record. In-flight requests are deduplicated and stale responses are dropped.
The server keeps any supplier credential in deployment secrets and fails closed
when it is not configured. Provider responses are transient until the user
confirms the identity; unknown cache rights are rejected by SQLite.
The ZXing image decoder accepts only local URIs. `expo-camera` is deliberately absent:
its Android scanner adds ML Kit and Google Play Services. A future native camera
preview must hand a local capture URI to this decoder; camera permission and
physical preview execution remain separately verified.

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

## Product identity versus nutrition

商品身份和营养标签是两条独立的本地记录链。`food_identity` 保存条码查询得到
的名称、品牌、规格、来源、获取时间和 `draft` / `pending_confirmation` /
`confirmed` 状态；`food_identity_revisions` 保存每次供应商结果或用户编辑的快照。
现有 `food_evidence`、`parsed-nutrition.json` 和 `food_revisions` 继续保存原图、
不可变 OCR 原文、坐标解析候选及营养人工核对历史。确认商品身份不会自动确认营养
数据，服务商返回的营养字段也不会覆盖用户拍摄的标签。

SQLite `user_version=3` 从 v1/v2 逐步迁移，不清空任何旧表；身份保存和其历史
写入同一个事务，并以 `updatedAt` 拒绝过期编辑。身份数据的 `source.policy`
保留授权、缓存及再分发状态，未知政策不会被推定为允许。
