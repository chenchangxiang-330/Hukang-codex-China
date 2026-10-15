import type { BoundingBox, Point } from '../../domain/ocr/types';
import { containGeometry, type Size } from '../ocr-lab/geometry';

/** Touch coordinates become pixels in the displayed processed image. Letterbox
 * starts are ignored; dragging past an image edge stops at that visible edge. */
export function previewCrop(start: Point, end: Point, image: Size, viewport: Size): BoundingBox | null {
  const fit = containGeometry(image, viewport);
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  if (start.x < fit.left || start.x > fit.left + fit.width || start.y < fit.top || start.y > fit.top + fit.height) return null;
  const point = (p: Point) => ({ x: Math.max(0, Math.min(image.width, Math.round((p.x - fit.left) / fit.scale))), y: Math.max(0, Math.min(image.height, Math.round((p.y - fit.top) / fit.scale))) });
  const a = point(start), b = point(end);
  const rectangle = { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
  return rectangle.right - rectangle.left < 8 || rectangle.bottom - rectangle.top < 8 ? null : rectangle;
}
