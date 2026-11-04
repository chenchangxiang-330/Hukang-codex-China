import { validatePolicies } from "./profile";
import {
  nutrientInfo,
  parsePortion,
  validateEntry,
  type Entry,
  type Food,
  type Nutrient,
  type Targets,
} from "../../features/nutrition-v2/model";

const text = (v: string, max = 500) => {
  if (typeof v !== "string" || v.length > max)
    throw Error("资料文字过长或格式无效。");
  return v.trim();
};
export function safeId(id: string) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw Error("记录标识无效。");
  return id;
}
/** Explicit allowlist: no arbitrary model fields, headers or request objects enter SQLite. */
export function snapshotEntry(input: Entry): Entry {
  validateEntry(input);
  const f = input.food;
  const nutrients: Food["nutrients"] = {};
  for (const k of Object.keys(nutrientInfo) as Nutrient[]) {
    const fact = f.nutrients[k];
    if (!fact) continue;
    if (
      !["confirmed", "estimated", "unknown"].includes(fact.status) ||
      (fact.unit !== nutrientInfo[k][1] &&
        !(k === "energy" && fact.unit === "kJ"))
    )
      throw Error("营养单位或来源状态无效。");
    if (
      fact.value !== null &&
      (!Number.isFinite(fact.value) || fact.value < 0 || fact.value > 10000000)
    )
      throw Error("营养数值需为有限的非负数，未知请留空。");
    if (
      fact.range &&
      (fact.range.length !== 2 ||
        fact.range.some((n) => !Number.isFinite(n) || n < 0 || n > 10000000) ||
        fact.range[0] > fact.range[1] ||
        fact.value !== null ||
        fact.status !== "estimated")
    )
      throw Error("估算区间无效，请清除区间后填写确定数值。");
    nutrients[k] = {
      value: fact.status === "unknown" ? null : fact.value,
      unit: fact.unit,
      status: fact.status,
      source: text(fact.source),
      ...(fact.range && fact.status !== "unknown"
        ? { range: [...fact.range] as [number, number] }
        : {}),
    };
  }
  const food: Food = {
    id: safeId(f.id),
    kind:
      f.kind === "meal" || f.kind === "packaged"
        ? f.kind
        : f.provenance?.kind === "label"
          ? "packaged"
          : "meal",
    version: text(f.version, 160),
    name: text(f.name, 120),
    source: text(f.source),
    basis: { amount: parsePortion(String(f.basis.amount)), unit: f.basis.unit },
    nutrients,
  };
  if (!food.name) throw Error("请填写食物名称。");
  if (!["g", "mL", "份"].includes(f.basis.unit)) throw Error("计量基准无效。");
  if (f.image) {
    if (!/^(file|content):\/\//.test(f.image))
      throw Error("照片必须来自本机。");
    food.image = f.image;
  }
  if (f.serving) {
    if (!["g", "mL"].includes(f.serving.unit))
      throw Error("每份重量或容量无效。");
    food.serving = {
      amount: parsePortion(String(f.serving.amount)),
      unit: f.serving.unit,
    };
  }
  if (f.packageSize) food.packageSize = text(f.packageSize, 120);
  if (f.provenance) {
    if (!["ai", "label", "manual"].includes(f.provenance.kind))
      throw Error("数据来源无效。");
    food.provenance = {
      kind: f.provenance.kind,
      ...(f.provenance.model ? { model: text(f.provenance.model, 160) } : {}),
      ...(f.provenance.ingredients
        ? {
            ingredients: f.provenance.ingredients
              .slice(0, 30)
              .map((v) => text(v, 160)),
          }
        : {}),
      ...(f.provenance.uncertainties
        ? {
            uncertainties: f.provenance.uncertainties
              .slice(0, 20)
              .map((v) => text(v, 500)),
          }
        : {}),
      ...(f.provenance.nameEdited ? { nameEdited: true } : {}),
    };
  }
  return {
    id: safeId(input.id),
    date: input.date,
    ...(input.consumedTime
      ? { consumedTime: validTime(input.consumedTime) }
      : {}),
    ...(input.timezone ? { timezone: validZone(input.timezone) } : {}),
    meal: input.meal,
    food,
    amount: parsePortion(String(input.amount)),
    unit: input.unit,
  };
}
export function validateTargets(input: Targets): Targets {
  const out: Targets = {};
  if (input.policies) out.policies = validatePolicies(input.policies);
  for (const key of [
    "energy",
    "protein",
    "fiber",
    "sodium",
    "saturatedPercent",
  ] as const) {
    if (input[key] !== undefined) out[key] = parsePortion(String(input[key]));
  }
  if (out.saturatedPercent && out.saturatedPercent > 100)
    throw Error("能量比例不能超过 100%。");
  for (const key of ["fat", "carbohydrate"] as const) {
    const r = input[key];
    if (r) {
      const low = parsePortion(String(r[0])),
        high = parsePortion(String(r[1]));
      if (low > high) throw Error("参考下限不能高于上限。");
      out[key] = [low, high];
    }
  }
  return out;
}

function validTime(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw Error("食用时间请填写 HH:mm。");
  return time;
}
function validZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  } catch {
    throw Error("食用时区无效。");
  }
  return text(zone, 80);
}
