import test from 'node:test';
import assert from 'node:assert/strict';
import { assertImageAsset, assertOcrDocument } from '../src/infrastructure/ocr/validateNativeResult.ts';

// Synthetic bridge payloads verify rejection rules only, never OCR execution or accuracy.
const expectedHashes = { detector: 'a'.repeat(64), recognizer: 'b'.repeat(64) };
function payload() {
  const image = {
    uri: 'file:///private/processed.png', originalUri: 'file:///private/original.source',
    width: 300, height: 200, sourceOrientation: 1,
    sourceImageHash: 'c'.repeat(64), processedImageHash: 'd'.repeat(64),
    transform: { originalWidth: 300, originalHeight: 200,
      matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], operations: [{ kind: 'exif', orientation: 1 }] },
  };
  const ocr = {
    imageUri: image.uri, evidenceUri: 'file:///private/run.json',
    sourceImageHash: image.sourceImageHash, processedImageHash: image.processedImageHash,
    width: image.width, height: image.height, engineVersion: 'synthetic-contract', modelVersion: 'synthetic-contract',
    modelHashes: { ...expectedHashes }, modelLoadMs: 10, ocrMs: 20, totalMs: 30,
    rawText: '未修正的解码文本',
    blocks: [{ id: 'line-0', text: '未修正的解码文本', page: 0, confidence: 0,
      boundingBox: { left: 10, top: 20, right: 250, bottom: 60 },
      polygon: [{ x: 10, y: 20 }, { x: 250, y: 20 }, { x: 250, y: 60 }, { x: 10, y: 60 }],
    }],
    memory: { observedPeakPssKb: null, sampleCount: 1 },
  };
  return { image, ocr };
}

test('native bridge validator preserves zero-confidence text and does not clamp detector geometry', () => {
  const { image, ocr } = payload();
  ocr.blocks[0].boundingBox.left = -0.2;
  const snapshot = structuredClone(ocr);
  assert.doesNotThrow(() => assertOcrDocument(ocr, image, expectedHashes));
  assert.deepEqual(ocr, snapshot);
});

test('no-text native result is preserved without substituting text or a fallback model', () => {
  const { image, ocr } = payload();
  ocr.blocks = [];
  ocr.rawText = '';
  assert.doesNotThrow(() => assertOcrDocument(ocr, image, expectedHashes));
  assert.equal(ocr.rawText, '');
  assert.equal(ocr.blocks.length, 0);
});

test('rejects remote image files, nonfinite dimensions, missing lineage and invalid EXIF metadata', () => {
  for (const mutate of [
    (image) => { image.uri = 'https://example.invalid/image.png'; },
    (image) => { image.width = Infinity; },
    (image) => { image.sourceImageHash = 'missing'; },
    (image) => { image.sourceOrientation = 1.5; },
    (image) => { image.transform.matrix[0] = NaN; },
  ]) {
    const { image } = payload();
    mutate(image);
    assert.throws(() => assertImageAsset(image));
  }
});

test('rejects old-image results, unpinned model identity and overwritten OCR raw text', () => {
  for (const mutate of [
    (ocr) => { ocr.imageUri = 'file:///private/previous.png'; },
    (ocr) => { ocr.processedImageHash = 'e'.repeat(64); },
    (ocr) => { ocr.width = 301; },
    (ocr) => { ocr.modelHashes.recognizer = 'e'.repeat(64); },
    (ocr) => { ocr.rawText = '人工改写'; },
  ]) {
    const { image, ocr } = payload();
    mutate(ocr);
    assert.throws(() => assertOcrDocument(ocr, image, expectedHashes));
  }
});

test('rejects NaN score, malformed geometry, duplicate IDs and wrong page before overlay rendering', () => {
  for (const mutate of [
    (ocr) => { ocr.blocks[0].confidence = NaN; },
    (ocr) => { ocr.blocks[0].confidence = 1.1; },
    (ocr) => { ocr.blocks[0].boundingBox.left = 260; },
    (ocr) => { ocr.blocks[0].polygon[0].x = Infinity; },
    (ocr) => { ocr.blocks[0].polygon.pop(); },
    (ocr) => { ocr.blocks[0].page = 1; },
    (ocr) => { ocr.blocks.push(structuredClone(ocr.blocks[0])); },
  ]) {
    const { image, ocr } = payload();
    mutate(ocr);
    assert.throws(() => assertOcrDocument(ocr, image, expectedHashes));
  }
});

test('rejects invalid native durations and sampled memory rather than displaying fake measurements', () => {
  for (const mutate of [
    (ocr) => { ocr.totalMs = NaN; },
    (ocr) => { ocr.totalMs = 1; },
    (ocr) => { ocr.memory.observedPeakPssKb = -1; },
  ]) {
    const { image, ocr } = payload();
    mutate(ocr);
    assert.throws(() => assertOcrDocument(ocr, image, expectedHashes));
  }
});
