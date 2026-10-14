/** One product can have many purchase batches. Counts are never nutrient intake. */
export function parseQuantity(text: string): number {
  if (!/^[1-9]\d{0,3}$/.test(text.trim())) throw new Error('数量请填写 1—9999 的整数。');
  return Number(text.trim());
}
export function validateExpiry(value: string): string | null {
  if (!value.trim()) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new Error('到期日请填写 YYYY-MM-DD，也可以留空。');
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
    throw new Error('到期日不是有效日期。');
  return value.trim();
}
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function expiryLabel(value: string | null, today = localDay()): string {
  if (!value) return '未设置到期日';
  return value < today ? `已到期 · ${value}` : value === today ? '今天到期' : `${value} 到期`;
}
