import type { FoodScanRecord } from "../../domain/food/scan";
import { validDateKey } from "../ui-v1/contracts";

export const nutrientInfo = {
  energy: ["能量", "kcal"],
  protein: ["蛋白质", "g"],
  carbohydrate: ["碳水化合物", "g"],
  fat: ["脂肪", "g"],
  total_sugars: ["总糖", "g"],
  added_sugars: ["添加糖", "g"],
  fiber: ["膳食纤维", "g"],
  saturated_fat: ["饱和脂肪", "g"],
  trans_fat: ["反式脂肪", "g"],
  monounsaturated_fat: ["单不饱和脂肪", "g"],
  polyunsaturated_fat: ["多不饱和脂肪", "g"],
  sodium: ["钠", "mg"],
  potassium: ["钾", "mg"],
  calcium: ["钙", "mg"],
  magnesium: ["镁", "mg"],
  iron: ["铁", "mg"],
  zinc: ["锌", "mg"],
  vitamin_a: ["维生素 A", "µg RAE"],
  vitamin_b1: ["维生素 B1", "mg"],
  vitamin_b2: ["维生素 B2", "mg"],
  vitamin_b6: ["维生素 B6", "mg"],
  vitamin_b12: ["维生素 B12", "µg"],
  vitamin_c: ["维生素 C", "mg"],
  vitamin_d: ["维生素 D", "µg"],
  vitamin_e: ["维生素 E", "mg α-TE"],
  vitamin_k: ["维生素 K", "µg"],
} as const;
export type Nutrient = keyof typeof nutrientInfo;
export type Fact = {
  value: number | null;
  range?: readonly [number, number];
  unit: string;
  status: "confirmed" | "estimated" | "unknown";
  source: string;
};
export type PortionUnit = "g" | "mL" | "份";
export type Food = {
  id: string;
  version: string;
  name: string;
  source: string;
  image?: string | undefined;
  basis: { amount: number; unit: PortionUnit };
  serving?: { amount: number; unit: "g" | "mL" } | undefined;
  packageSize?: string | undefined;
  nutrients: Partial<Record<Nutrient, Fact>>;
  rawEnergy?: { value: string; unit: string } | undefined;
};
export const meals = {
  breakfast: "早餐",
  lunch: "午餐",
  snack: "加餐",
  dinner: "晚餐",
} as const;
export type Meal = keyof typeof meals;
export type Entry = {
  id: string;
  date: string;
  meal: Meal;
  food: Food;
  amount: number;
  unit: PortionUnit;
};
export type Targets = {
  energy?: number;
  carbohydrate?: readonly [number, number];
  fat?: readonly [number, number];
  protein?: number;
  fiber?: number;
  sodium?: number;
  saturatedPercent?: number;
};
export type Snapshot = {
  status: "unavailable" | "ready" | "loading" | "error";
  entries: readonly Entry[];
  targets: Targets;
  message?: string;
};
export type MealRequest = {
  imageUri: string;
  description: string;
  includeImage?: boolean;
};
export type MealEstimate = {
  food: Food;
  ingredients: readonly string[];
  uncertainties: readonly string[];
  ai?: {
    endpoint: string;
    requestedModel: string;
    responseModel: string;
    imageSent: boolean;
  };
};
/** No database, inventory, or model access belongs in a nutrition presentation adapter. */
export interface NutritionAdapter {
  readonly kind: "production" | "demo";
  getSnapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  updatePortion(id: string, amount: number): void;
  record(entry: Entry, operationId: string): void;
  configureTargets(targets: Targets): void;
  demoEstimateMeal?(request: MealRequest): Promise<MealEstimate>;
  demoPackage?(): Food;
}
const unavailable: Snapshot = {
  status: "unavailable",
  entries: [],
  targets: {},
};
const notConnected = () => {
  throw new Error("饮食存储尚未接入，本次没有保存真实记录。");
};
export const productionNutrition: NutritionAdapter = {
  kind: "production",
  getSnapshot: () => unavailable,
  subscribe: () => () => {},
  updatePortion: notConnected,
  record: notConnected,
  configureTargets: () => {
    throw new Error("个人目标保存尚未接入，本次没有保存。");
  },
};
export type Total = {
  value: number | null;
  range?: readonly [number, number];
  unit: string;
  missing: number;
  count: number;
  estimated: boolean;
};
const validNumber = (n: number) => Number.isFinite(n) && n >= 0;
export function parsePortion(text: string): number {
  if (!/^\d+(\.\d{1,3})?$/.test(text.trim()))
    throw new Error("请填写有效份量，最多三位小数。");
  const n = Number(text);
  if (n <= 0 || n > 100000) throw new Error("份量需大于 0，且不超过 100000。");
  return n;
}
export function portionFactor(
  food: Food,
  amount: number,
  unit: PortionUnit,
): number | null {
  if (
    !validNumber(amount) ||
    amount <= 0 ||
    !validNumber(food.basis.amount) ||
    food.basis.amount <= 0
  )
    return null;
  if (unit === food.basis.unit) return amount / food.basis.amount;
  if (food.serving && food.serving.amount > 0) {
    if (unit === "份" && food.basis.unit === food.serving.unit)
      return (amount * food.serving.amount) / food.basis.amount;
    if (food.basis.unit === "份" && unit === food.serving.unit)
      return amount / food.serving.amount / food.basis.amount;
  }
  return null; // A package size never supplies a density or silently defines a serving.
}
export function contribution(entry: Entry, key: Nutrient): Total {
  const f = entry.food.nutrients[key];
  const unit = nutrientInfo[key][1];
  const empty: Total = {
    value: null,
    unit,
    missing: 1,
    count: 1,
    estimated: false,
  };
  const factor = portionFactor(entry.food, entry.amount, entry.unit);
  if (!f || f.status === "unknown" || factor == null) return empty;
  const conversion =
    key === "energy" && f.unit === "kJ"
      ? 1 / 4.184
      : f.unit === unit
        ? 1
        : null;
  if (conversion == null) return empty;
  const scale = factor * conversion;
  if (
    f.range &&
    validNumber(f.range[0]) &&
    validNumber(f.range[1]) &&
    f.range[1] >= f.range[0]
  )
    return {
      value: null,
      range: [f.range[0] * scale, f.range[1] * scale],
      unit,
      missing: 0,
      count: 1,
      estimated: true,
    };
  if (f.value === null || !validNumber(f.value)) return empty;
  return {
    value: f.value * scale,
    unit,
    missing: 0,
    count: 1,
    estimated: f.status === "estimated",
  };
}
export function total(
  entries: readonly Entry[],
  date: string,
  key: Nutrient,
): Total {
  const values = entries
    .filter((e) => e.date === date)
    .map((e) => contribution(e, key));
  let low = 0,
    high = 0,
    known = 0;
  for (const v of values) {
    if (v.range) {
      low += v.range[0];
      high += v.range[1];
      known++;
    } else if (v.value !== null) {
      low += v.value;
      high += v.value;
      known++;
    }
  }
  return {
    value: !known || values.some((v) => v.range) ? null : low,
    ...(known && values.some((v) => v.range)
      ? { range: [low, high] as const }
      : {}),
    unit: nutrientInfo[key][1],
    missing: values.filter((v) => v.missing).length,
    count: values.length,
    estimated: values.some((v) => v.estimated),
  };
}
export function formatNumber(n: number, digits = 1) {
  return Number(n.toFixed(digits)).toString();
}
export function formatTotal(t: Total): string {
  return t.range
    ? `${formatNumber(t.range[0])}–${formatNumber(t.range[1])}`
    : t.value === null
      ? "—"
      : formatNumber(t.value);
}
export function reliability(t: Total): string {
  return !t.count
    ? "尚未记录"
    : t.missing === t.count
      ? "暂无完整数据"
      : t.missing
        ? `已知小计 · ${t.missing} 项缺失`
        : t.estimated
          ? "估算值 · 基于已记录食品"
          : "已确认 · 基于已记录食品";
}
export function findings(
  entries: readonly Entry[],
  date: string,
  targets: Targets,
): string[] {
  if (!entries.some((e) => e.date === date))
    return [
      "先记下实际吃过的食物，再了解今天的营养。",
      "食品库存不会自动计入饮食摄入。",
    ];
  const out: string[] = [];
  const sodium = total(entries, date, "sodium"),
    added = total(entries, date, "added_sugars"),
    fiber = total(entries, date, "fiber");
  for (const [v, label, limit] of [
    [sodium, "钠", targets.sodium ?? 2000],
    [added, "添加糖", 50],
  ] as const) {
    const min = v.range?.[0] ?? v.value;
    if (min !== null && min > limit)
      out.push(
        `目前记录显示，${label}${v.missing ? "已知小计" : "摄入"}已超参考上限 ${formatNumber(min - limit)} ${v.unit}${v.missing ? "，仍有资料缺失" : ""}。`,
      );
    else if (min !== null && !v.missing && min >= limit * 0.8)
      out.push(`目前记录显示，${label}接近参考上限。`);
  }
  if (added.missing) out.push("部分食品缺少添加糖数据，暂不能判断全天摄入。");
  if (fiber.missing) out.push("部分食品缺少膳食纤维数据。");
  if (!out.length)
    out.push("目前记录显示了已摄入的营养，可以继续补全餐食信息。");
  return out.slice(0, 3);
}
export function validateEntry(e: Entry) {
  if (
    !validDateKey(e.date) ||
    !Object.hasOwn(meals, e.meal) ||
    portionFactor(e.food, e.amount, e.unit) === null
  )
    throw new Error("请确认日期、餐次和份量单位。");
}
/** Read confirmed label facts only; never infer sugar grams from ingredients. */
export function foodFromRecord(record: FoodScanRecord, image?: string): Food {
  const c =
    record.review.columns.find(
      (c) => c.reviewed && c.basisKind !== "unknown",
    ) ?? record.review.columns[0];
  const basis =
    c?.basisKind === "per_100g"
      ? { amount: 100, unit: "g" as const }
      : c?.basisKind === "per_100ml"
        ? { amount: 100, unit: "mL" as const }
        : {
            amount: c?.basisKind === "per_serving" ? 1 : 0,
            unit: "份" as const,
          };
  const nutrients: Food["nutrients"] = {};
  for (const r of c?.rows ?? []) {
    const key =
      r.nutrient === "sugars"
        ? "total_sugars"
        : r.nutrient === "dietary_fiber"
          ? "fiber"
          : r.nutrient;
    if (!Object.hasOwn(nutrientInfo, key)) continue;
    const known =
      record.status === "confirmed" &&
      c?.reviewed &&
      r.reviewed &&
      /^\d+(\.\d+)?$/.test(r.amount);
    nutrients[key as Nutrient] = {
      value: known ? Number(r.amount) : null,
      unit: r.unit,
      status: known ? "confirmed" : "unknown",
      source: "本机食品库 · 人工核对",
    };
  }
  const energy = c?.rows.find((r) => r.nutrient === "energy");
  const serving =
    c &&
    c.servingUnit !== "unknown" &&
    /^\d+(\.\d+)?$/.test(c.servingAmount) &&
    Number(c.servingAmount) > 0
      ? { amount: Number(c.servingAmount), unit: c.servingUnit }
      : undefined;
  return {
    id: record.id,
    version: record.updatedAt,
    name: record.review.name,
    source: "本机食品库 · 已保存资料",
    image,
    basis,
    serving,
    packageSize: record.review.specification,
    nutrients,
    rawEnergy: energy ? { value: energy.amount, unit: energy.unit } : undefined,
  };
}
