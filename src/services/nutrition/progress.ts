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
  const complete = t.count > 0 && t.value !== null && !t.missing && !t.range;
  const fraction = complete && max ? Math.min(1, t.value! / max) : null;
  const status = !t.count
    ? "尚未记录"
    : t.value === null && !t.range
      ? "未知"
      : t.missing
        ? "已知小计 · 数据不完整"
        : t.estimated
          ? "AI / 份量估算"
          : "已确认记录";
  const excess = complete && max && t.value! > max ? t.value! - max : null;
  const percent =
    complete && !t.estimated && p?.type !== "range" && max
      ? Math.round((t.value! / max) * 100)
      : null;
  return { fraction, status, excess, percent, max };
}
