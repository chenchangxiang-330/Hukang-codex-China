import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidence } from '../scripts/validate-ocr-evidence.mjs';

// Synthetic contract inputs test the validator only. They are NOT model execution evidence.
const detector = 'a'.repeat(64);
const recognizer = 'b'.repeat(64);
const manifest = { models: { detector: { sha256: detector }, recognizer: { sha256: recognizer } } };
function contractRecord() {
  return {
    schemaVersion: 1,
    id: 'synthetic-validator-test',
    recordedAt: '2026-10-07T00:00:00.000Z',
    image: {
      sourceImageHash: 'c'.repeat(64), processedImageHash: 'd'.repeat(64), width: 300, height: 200,
      sourceOrientation: 1, transform: { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], operations: [] },
    },
    ocr: {
      sourceImageHash: 'c'.repeat(64), processedImageHash: 'd'.repeat(64), width: 300, height: 200,
      engineVersion: 'contract-test', modelVersion: 'contract-test',
      modelHashes: { detector, recognizer }, modelLoadMs: 10, ocrMs: 20, totalMs: 30,
      rawText: '模型契约测试',
      blocks: [{ id: '0', text: '模型契约测试', page: 0, confidence: 0.02,
        boundingBox: { left: 10, top: 20, right: 250, bottom: 60 },
        polygon: [{ x: 10, y: 20 }, { x: 250, y: 20 }, { x: 250, y: 60 }, { x: 10, y: 60 }],
      }],
    },
  };
}

test('preserves low-confidence decoder text rather than treating it as absent', () => {
  const summary = validateEvidence(contractRecord(), manifest);
  assert.equal(summary.blockCount, 1);
});

test('rejects image/result mismatch and manually replaced raw text', () => {
  const wrongImage = contractRecord();
  wrongImage.ocr.sourceImageHash = 'e'.repeat(64);
  assert.throws(() => validateEvidence(wrongImage, manifest), /mismatch/);
  const replacedText = contractRecord();
  replacedText.ocr.rawText = '人工纠正文本';
  assert.throws(() => validateEvidence(replacedText, manifest), /decoder output/);
});

test('rejects unpinned models, NaN confidence and inverted boxes', () => {
  const unpinned = contractRecord();
  unpinned.ocr.modelHashes.detector = 'e'.repeat(64);
  assert.throws(() => validateEvidence(unpinned, manifest), /Unpinned/);
  const nan = contractRecord();
  nan.ocr.blocks[0].confidence = NaN;
  assert.throws(() => validateEvidence(nan, manifest), /confidence/);
  const inverted = contractRecord();
  inverted.ocr.blocks[0].boundingBox.left = 260;
  assert.throws(() => validateEvidence(inverted, manifest), /Inverted/);
});
