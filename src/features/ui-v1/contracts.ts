/** Presentation-only contracts. No database adapter or network client is installed. */
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
export interface AiConfiguration {
  provider: "deepseek" | "qwen" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
}
export type AiConfigurationField = "baseUrl" | "apiKey" | "model";
export function validateAiConfiguration(
  config: AiConfiguration,
): Partial<Record<AiConfigurationField, string>> {
  const issues: Partial<Record<AiConfigurationField, string>> = {};
  try {
    const url = new URL(config.baseUrl.trim());
    if (
      url.protocol !== "https:" ||
      !url.hostname.includes(".") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("invalid");
  } catch {
    issues.baseUrl = "请填写 HTTPS 地址，不包含账号、密码、查询参数或片段。";
  }
  if (!config.apiKey.trim() || /\s/.test(config.apiKey.trim()))
    issues.apiKey = "请填写临时测试密钥，不包含空格或换行。";
  if (
    !config.model.trim() ||
    config.model.length > 128 ||
    /[\r\n]/.test(config.model)
  )
    issues.model = "请填写有效模型名称（最多 128 个字符）。";
  return issues;
}
export type AiConnectionResult = { status: "unavailable"; message: string };
export interface AiAnalysisGateway {
  testConnection(config: AiConfiguration): Promise<AiConnectionResult>;
  analyzeDay(day: string, entries: readonly DiaryEntry[]): Promise<never>;
}
/** A fail-closed placeholder: no requests, credentials storage, or fake results. */
export class UnavailableAiGateway implements AiAnalysisGateway {
  async testConnection(_config: AiConfiguration): Promise<AiConnectionResult> {
    return {
      status: "unavailable",
      message: "AI 服务接口尚未接入，未执行联网测试。",
    };
  }
  async analyzeDay(
    _day: string,
    _entries: readonly DiaryEntry[],
  ): Promise<never> {
    throw new Error("AI 分析尚未接入，没有生成分析结果。");
  }
}
