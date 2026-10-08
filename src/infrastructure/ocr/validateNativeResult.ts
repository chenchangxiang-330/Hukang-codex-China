import type { ImageAsset, OcrDocument } from '../../domain/ocr/types';

const SHA256 = /^[a-f0-9]{64}$/;

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), `${label} 必须是对象。`);
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonnegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function localFile(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('file:///') && value.length > 'file:///'.length;
}

/** Native bridge types are not validation. Reject corrupt evidence rather than repair its values. */
export function assertImageAsset(value: unknown): asserts value is ImageAsset {
  const image = record(value, '本地图像结果');
  requireCondition(localFile(image.uri) && localFile(image.originalUri), '本地图像结果必须使用本机文件。');
  requireCondition(positiveInteger(image.width) && positiveInteger(image.height), '本地图像尺寸无效。');
  for (const key of ['sourceImageHash', 'processedImageHash']) {
    requireCondition(typeof image[key] === 'string' && SHA256.test(image[key]), `本地图像 ${key} 无效。`);
  }
  requireCondition(typeof image.sourceOrientation === 'number' && Number.isInteger(image.sourceOrientation)
    && image.sourceOrientation >= 1 && image.sourceOrientation <= 8, '本地图像 EXIF 方向无效。');
  const transform = record(image.transform, '图片变换记录');
  requireCondition(positiveInteger(transform.originalWidth) && positiveInteger(transform.originalHeight), '原图尺寸无效。');
  requireCondition(Array.isArray(transform.matrix) && transform.matrix.length === 9
    && transform.matrix.every((n) => typeof n === 'number' && Number.isFinite(n)), '图片变换矩阵无效。');
  requireCondition(Array.isArray(transform.operations), '缺少图片处理操作记录。');
  transform.operations.forEach((operation) => record(operation, '图片处理操作'));
}

/** Checks consistency and the pinned model identity; does not attest Android execution or accuracy. */
export function assertOcrDocument(
  value: unknown,
  image: ImageAsset,
  expectedModelHashes: Readonly<Record<string, string>>,
): asserts value is OcrDocument {
  assertImageAsset(image);
  const result = record(value, 'OCR 结果');
  requireCondition(result.imageUri === image.uri && localFile(result.evidenceUri), 'OCR 结果不是当前本机图片的记录。');
  for (const key of ['sourceImageHash', 'processedImageHash', 'width', 'height'] as const) {
    requireCondition(result[key] === image[key], `OCR ${key} 与当前图片不匹配。`);
  }
  requireCondition(typeof result.rawText === 'string' && Array.isArray(result.blocks), 'OCR 原文或文字块无效。');
  for (const key of ['engineVersion', 'modelVersion']) {
    requireCondition(typeof result[key] === 'string' && result[key].length > 0, '缺少 OCR 引擎或模型版本。');
  }
  const hashes = record(result.modelHashes, 'OCR 模型摘要');
  for (const kind of ['detector', 'recognizer']) {
    const expected = expectedModelHashes[kind];
    requireCondition(typeof expected === 'string' && SHA256.test(expected) && hashes[kind] === expected,
      `OCR ${kind} 不是已固定的官方模型。`);
  }
  for (const key of ['modelLoadMs', 'ocrMs', 'totalMs']) {
    requireCondition(nonnegativeFinite(result[key]), `OCR ${key} 无效。`);
  }
  requireCondition((result.totalMs as number) >= (result.ocrMs as number)
    && (result.totalMs as number) >= (result.modelLoadMs as number), 'OCR 总耗时小于实际执行阶段。');

  const ids = new Set<string>();
  const texts: string[] = [];
  for (const value of result.blocks) {
    const block = record(value, 'OCR 文字块');
    requireCondition(typeof block.id === 'string' && block.id.length > 0 && !ids.has(block.id), 'OCR 文字块 ID 无效或重复。');
    ids.add(block.id);
    requireCondition(typeof block.text === 'string' && block.page === 0, 'OCR 文字块原文或页码无效。');
    texts.push(block.text);
    requireCondition(nonnegativeFinite(block.confidence) && block.confidence <= 1, 'OCR confidence 必须是 0–1 的有限分数。');
    const box = record(block.boundingBox, 'OCR bounding box');
    for (const key of ['left', 'top', 'right', 'bottom']) {
      requireCondition(typeof box[key] === 'number' && Number.isFinite(box[key]), 'OCR bounding box 坐标无效。');
    }
    requireCondition((box.right as number) >= (box.left as number) && (box.bottom as number) >= (box.top as number),
      'OCR bounding box 边界倒置。');
    requireCondition(Array.isArray(block.polygon) && block.polygon.length === 4, 'OCR polygon 必须包含四个点。');
    for (const value of block.polygon) {
      const point = record(value, 'OCR polygon 点');
      requireCondition(typeof point.x === 'number' && Number.isFinite(point.x)
        && typeof point.y === 'number' && Number.isFinite(point.y), 'OCR polygon 坐标无效。');
    }
    // Preserve out-of-frame detector coordinates and zero confidence unchanged.
  }
  requireCondition(result.rawText === texts.join('\n'), 'OCR 原文与逐块解码文字不一致，已拒绝展示。');
  if (result.memory !== undefined) {
    for (const [key, value] of Object.entries(record(result.memory, 'OCR 内存采样'))) {
      requireCondition(value === null || nonnegativeFinite(value), `OCR 内存采样 ${key} 无效。`);
    }
  }
}
