import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hashPattern = /^[a-f0-9]{64}$/;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Validates an exported record's consistency; cannot attest that Android executed it. */
export function validateEvidence(record, modelManifest) {
  assert.equal(record.schemaVersion, 1, 'Unsupported evidence schema');
  assert.equal(typeof record.id, 'string');
  assert.ok(record.id.length > 0);
  assert.ok(Number.isFinite(Date.parse(record.recordedAt)), 'Missing capture timestamp');
  const { image, ocr } = record;
  assert.ok(image && ocr, 'Expected actual image and native OCR result');
  for (const key of ['sourceImageHash', 'processedImageHash']) {
    assert.match(image[key], hashPattern, `Invalid image ${key}`);
    assert.equal(image[key], ocr[key], `Image/OCR ${key} mismatch`);
  }
  for (const key of ['width', 'height']) {
    assert.ok(Number.isInteger(image[key]) && image[key] > 0, `Invalid image ${key}`);
    assert.equal(image[key], ocr[key], `Image/OCR ${key} mismatch`);
  }
  assert.ok(image.sourceOrientation >= 1 && image.sourceOrientation <= 8);
  assert.equal(image.transform.matrix.length, 9);
  image.transform.matrix.forEach((number) => assert.ok(Number.isFinite(number), 'Invalid transform'));
  assert.ok(Array.isArray(image.transform.operations));
  assert.equal(typeof ocr.rawText, 'string');
  assert.equal(typeof ocr.engineVersion, 'string');
  assert.equal(typeof ocr.modelVersion, 'string');
  assert.ok(ocr.engineVersion && ocr.modelVersion, 'Missing engine/model identity');
  for (const name of ['detector', 'recognizer']) {
    assert.equal(ocr.modelHashes[name], modelManifest.models[name].sha256, `Unpinned ${name} model`);
  }
  for (const key of ['modelLoadMs', 'ocrMs', 'totalMs']) {
    assert.ok(Number.isFinite(ocr[key]) && ocr[key] >= 0, `Invalid measured ${key}`);
  }
  assert.ok(ocr.totalMs >= ocr.ocrMs, 'Total time must include OCR time');
  assert.ok(Array.isArray(ocr.blocks), 'Missing native OCR blocks');
  const ids = new Set();
  const warnings = [];
  for (const block of ocr.blocks) {
    assert.equal(typeof block.id, 'string');
    assert.ok(!ids.has(block.id), 'Duplicate OCR block ID');
    ids.add(block.id);
    assert.equal(typeof block.text, 'string');
    assert.equal(block.page, 0, 'Phase 1 expects one page');
    assert.ok(Number.isFinite(block.confidence) && block.confidence >= 0 && block.confidence <= 1,
      'Recognizer confidence must be finite and between zero and one');
    const box = block.boundingBox;
    assert.ok(box && ['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(box[key])), 'Invalid bounding box');
    assert.ok(box.right >= box.left && box.bottom >= box.top, 'Inverted bounding box');
    assert.ok(Array.isArray(block.polygon) && block.polygon.length === 4, 'Expected four-point detector polygon');
    for (const point of block.polygon) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'Invalid polygon point');
    }
    if (box.left < 0 || box.top < 0 || box.right > ocr.width || box.bottom > ocr.height) {
      warnings.push(`Block ${block.id} box extends beyond processed image; inspect overlay.`);
    }
  }
  assert.equal(ocr.rawText, ocr.blocks.map((block) => block.text).join('\n'), 'Raw text must remain actual decoder output');
  for (const [key, value] of Object.entries(ocr.memory ?? {})) {
    assert.ok(value === null || (Number.isFinite(value) && value >= 0), `Invalid sampled memory ${key}`);
  }
  return {
    runId: record.id,
    sourceImageHash: ocr.sourceImageHash,
    processedImageHash: ocr.processedImageHash,
    blockCount: ocr.blocks.length,
    rawCharacterCount: [...ocr.rawText].length,
    modelLoadMs: ocr.modelLoadMs,
    ocrMs: ocr.ocrMs,
    totalMs: ocr.totalMs,
    memory: ocr.memory ?? null,
    warnings,
    limitation: 'Evidence consistency only; no authenticity, accuracy or offline-runtime attestation',
  };
}

export async function validateExportFile(file) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  const modelManifest = JSON.parse(await readFile(path.join(root, 'models/paddleocr/v5-mobile/manifest.json'), 'utf8'));
  const summary = validateEvidence(record, modelManifest);
  for (const [key, hashKey] of [['original', 'sourceImageHash'], ['processed', 'processedImageHash']]) {
    const filename = record.savedFiles?.[key];
    assert.ok(filename && filename === path.basename(filename), `Missing safe savedFiles.${key}`);
    const bytes = await readFile(path.join(path.dirname(file), filename));
    const hash = createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash, record.image[hashKey], `Exported ${key} image hash mismatch`);
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log(JSON.stringify({ status: 'not_run', reason: 'No actual Android exports supplied', accuracy: null }, null, 2));
  } else {
    const runs = [];
    const seen = new Set();
    for (const file of files) {
      const result = await validateExportFile(path.resolve(file));
      assert.ok(!seen.has(result.runId), 'Duplicate run ID; do not double-count the same run');
      seen.add(result.runId);
      runs.push(result);
    }
    console.log(JSON.stringify({ status: 'consistent_evidence', runs, accuracy: null }, null, 2));
  }
}
