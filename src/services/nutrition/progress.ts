import type { Total } from "../../features/nutrition-v2/model";
import type { TargetPolicy } from "./profile";
export function policyLabel(p?: TargetPolicy) {
  return !p
    ? "参考待完善"
    : p.type === "range"
      ? `参考 ${p.range![0]}–${p.range![1]} ${p.unit}`
      : `${p.type === "upper_limit" ? "上限" : "目标"} ${p.value} ${p.unit}`;
}
export function nutrientProgress(t: Total, p?: TargetPolicy) {
  const max = p?.type === "range" ? p.range![1] : p?.value;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const low = t.range?.[0] ?? t.value, high = t.range?.[1] ?? t.value;
  const known = t.count > 0 && valid(low) && valid(high) && high >= low;
  const denominator = max && Number.isFinite(max) && max > 0 && p?.unit === t.unit ? max : null;
  const complete = known && !t.missing && !t.range;
  const fraction = known && denominator ? Math.min(1, low! / denominator) : null;
  const upperFraction = known && denominator ? Math.min(1, high! / denominator) : null;
  const status = !t.count
    ? "尚未记录"
    : t.value === null && !t.range
      ? "未知"
      : t.missing
        ? "已知小计 · 数据不完整"
        : t.estimated
          ? "AI / 份量估算"
          : "已确认记录";
  const excess = known && denominator && low! > denominator ? low! - denominator : null;
  const percent =
    complete && !t.estimated && p?.type !== "range" && denominator
      ? Math.round((t.value! / denominator) * 100)
      : null;
  return { fraction, upperFraction, low, high, status, excess, percent, max: denominator };
}
