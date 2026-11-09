/** Private references only; never part of a food or ordinary export. */
export function healthPhotos(value: unknown): string[] {
  const items =
    typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  if (
    items.some(
      (uri) =>
        typeof uri !== "string" ||
        !/^file:\/\/\/[^?#]*\/health-private\/[^?#]+$/.test(uri) ||
        /(?:\.\.|%2e|%2f|%5c)/i.test(uri),
    )
  )
    throw Error("体检照片路径无效，请重新选择。");
  return [...new Set(items)] as string[];
}
export function samePhotos(
  a: readonly string[] = [],
  b: readonly string[] = [],
) {
  return JSON.stringify(a) === JSON.stringify(b);
}
