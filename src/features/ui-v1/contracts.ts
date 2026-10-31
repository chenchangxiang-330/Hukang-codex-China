/** Diary presentation contracts; AI configuration is shared with the real service. */
export const mealTypes = [
  ["breakfast", "早餐"],
  ["lunch", "午餐"],
  ["dinner", "晚餐"],
  ["snack", "加餐"],
] as const;
export type MealType = (typeof mealTypes)[number][0];
export type DiaryNutrients = {
  energyKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbohydrateG: number | null;
};
export interface DiaryEntry extends DiaryNutrients {
  id: string;
  day: string;
  meal: MealType;
  name: string;
  source: "ui_demo";
}
export interface DiaryRepository {
  list(day: string): Promise<readonly DiaryEntry[]>;
}
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function validDateKey(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === day
  );
}
export function shiftDateKey(day: string, offset: number): string {
  if (!validDateKey(day) || !Number.isInteger(offset))
    throw new Error("日期格式不正确");
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function parseDemoAmount(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim()))
    throw new Error("请填写非负数字，小数点使用“.”；未知可留空。");
  const number = Number(value.trim());
  if (!Number.isFinite(number) || number > 100000)
    throw new Error("数值过大，请检查输入。");
  return number;
}
export function summarizeDiary(entries: readonly DiaryEntry[]): DiaryNutrients {
  const result: DiaryNutrients = {
    energyKcal: null,
    proteinG: null,
    fatG: null,
    carbohydrateG: null,
  };
  for (const key of Object.keys(result) as (keyof DiaryNutrients)[]) {
    // A partially known daily total is not a complete daily intake.
    if (entries.length && entries.every((entry) => entry[key] !== null)) {
      result[key] =
        Math.round(entries.reduce((sum, entry) => sum + entry[key]!, 0) * 100) /
        100;
    }
  }
  return result;
}
export {
  validateAiConfiguration,
  type AiConfiguration,
  type AiConfigurationField,
} from "../../services/ai/config";
