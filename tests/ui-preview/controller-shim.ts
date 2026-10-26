/** TEST ONLY module boundary. UI is real; native controller is never executed. */
export const labels = ["能量", "蛋白质", "脂肪", "碳水化合物", "钠"];
export const nutrientIds = [
  "energy",
  "protein",
  "fat",
  "carbohydrate",
  "sodium",
];
export const basis = (c: any) =>
  c.basisKind === "per_100g"
    ? "每100g"
    : c.basisKind === "per_100ml"
      ? "每100mL"
      : c.basisKind === "per_serving"
        ? `每份${c.servingAmount ? `（${c.servingAmount}${c.servingUnit}）` : ""}`
        : "计量基准待确认";
export const problem = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export function useSimpleApp(): never {
  throw new Error("Preview must inject its explicitly mocked controller.");
}
