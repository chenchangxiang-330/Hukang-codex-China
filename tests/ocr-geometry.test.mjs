import assert from 'node:assert/strict';
import test from 'node:test';
import { containGeometry, cropPercentToPixels, mapRectToPreview } from '../src/features/ocr-lab/geometry.ts';

test('letterboxed portrait bounding box maps into actual image area rather than viewport origin', () => {
  const image = { width: 1000, height: 2000 };
  const viewport = { width: 400, height: 320 };
  assert.deepEqual(containGeometry(image, viewport), { scale: 0.16, width: 160, height: 320, left: 120, top: 0 });
  assert.deepEqual(mapRectToPreview({ left: 100, top: 200, right: 500, bottom: 600 }, image, viewport), {
    left: 136, top: 32, width: 64, height: 64,
  });
});

test('landscape image maps with vertical letterboxing', () => {
  assert.deepEqual(mapRectToPreview({ left: 0, top: 0, right: 2000, bottom: 1000 },
    { width: 2000, height: 1000 }, { width: 400, height: 320 }), { left: 0, top: 60, width: 400, height: 200 });
});

test('percent crop emits native left/top/right/bottom pixels including right edge', () => {
  assert.deepEqual(cropPercentToPixels({ x: '25', y: '10', width: '75', height: '50' }, { width: 1200, height: 800 }), {
    left: 300, top: 80, right: 1200, bottom: 480,
  });
});

test('out-of-bounds, zero, invalid text and subpixel-empty crops reject instead of silently clamping', () => {
  const image = { width: 100, height: 100 };
  for (const crop of [
    { x: '70', y: '0', width: '40', height: '100' },
    { x: '0', y: '0', width: '0', height: '100' },
    { x: '', y: '0', width: '100', height: '100' },
    { x: '0', y: '0', width: 'Infinity', height: '100' },
    { x: '0', y: '0', width: '0.01', height: '100' },
  ]) assert.throws(() => cropPercentToPixels(crop, image));
});

test('invalid viewport dimensions are rejected before creating overlay NaN coordinates', () => {
  assert.throws(() => containGeometry({ width: 100, height: 100 }, { width: 0, height: 320 }));
});
