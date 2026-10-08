export type Size = Readonly<{ width: number; height: number }>;
export type Rect = Readonly<{ left: number; top: number; right: number; bottom: number }>;
export type CropPercent = Readonly<{ x: string; y: string; width: string; height: string }>;

export const FULL_CROP: CropPercent = Object.freeze({ x: '0', y: '0', width: '100', height: '100' });

/** Image contain coordinates, including letterboxing; boxes use native pixel coordinates. */
export function containGeometry(image: Size, viewport: Size) {
  if ([image.width, image.height, viewport.width, viewport.height].some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error('图片与预览尺寸必须大于零。');
  }
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { scale, width, height, left: (viewport.width - width) / 2, top: (viewport.height - height) / 2 };
}

export function mapRectToPreview(rect: Rect, image: Size, viewport: Size) {
  const fit = containGeometry(image, viewport);
  return {
    left: fit.left + rect.left * fit.scale,
    top: fit.top + rect.top * fit.scale,
    width: Math.max(0, rect.right - rect.left) * fit.scale,
    height: Math.max(0, rect.bottom - rect.top) * fit.scale,
  };
}

/** No silent clamping: an invalid user crop must not crop different pixels than requested. */
export function cropPercentToPixels(crop: CropPercent, image: Size): Rect {
  const values = [crop.x, crop.y, crop.width, crop.height].map((value) => {
    const normalized = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error('裁剪值需填写 0–100 的数字。');
    return Number(normalized);
  });
  const [x, y, width, height] = values as [number, number, number, number];
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width < 1 || image.height < 1) {
    throw new Error('图片尺寸无效。');
  }
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) {
    throw new Error('裁剪宽高必须大于 0，且矩形不能超出图片。');
  }
  const left = Math.round((x / 100) * image.width);
  const top = Math.round((y / 100) * image.height);
  const right = Math.round(((x + width) / 100) * image.width);
  const bottom = Math.round(((y + height) / 100) * image.height);
  if (right <= left || bottom <= top) throw new Error('裁剪区域过小，请至少保留一个像素。');
  return { left, top, right, bottom };
}

export function isFullCrop(crop: CropPercent): boolean {
  return Number(crop.x) === 0 && Number(crop.y) === 0 && Number(crop.width) === 100 && Number(crop.height) === 100;
}
