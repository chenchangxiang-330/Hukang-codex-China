/** Development only. This module is never imported from src/ or the production router. */
import {
  parsePortion,
  validateEntry,
  type Entry,
  type Food,
  type NutritionAdapter,
  type Nutrient,
  type Snapshot,
  type Targets,
  type MealRequest,
} from "../../src/features/nutrition-v2/model";
export function demoFood(
  id: string,
  name: string,
  values: Partial<Record<Nutrient, number | null>>,
  unit: "g" | "mL" | "份" = "份",
  amount = 1,
): Food {
  return {
    id,
    version: "demo-v1",
    name,
    source: "演示资料 · 非真实食品记录",
    basis: { amount, unit },
    nutrients: Object.fromEntries(
      Object.entries(values).map(([k, value]) => [
        k,
        {
          value,
          unit: k === "energy" ? "kcal" : k === "sodium" ? "mg" : "g",
          status: value === null ? "unknown" : "confirmed",
          source: "演示人工核对",
        },
      ]),
    ),
  };
}
export const packageFixture: Food = {
  ...demoFood("demo-package", "演示 · 混合坚果", {
    energy: 618,
    protein: 5,
    carbohydrate: 5,
    fat: 12,
    total_sugars: 2,
    added_sugars: null,
    fiber: 2.5,
    sodium: 12,
  }),
  basis: { amount: 1, unit: "份" },
  serving: { amount: 25, unit: "g" },
  packageSize: "250g",
  rawEnergy: { value: "618", unit: "kJ" },
  nutrients: {
    ...demoFood("", "", {
      protein: 5,
      carbohydrate: 5,
      fat: 12,
      total_sugars: 2,
      added_sugars: null,
      fiber: 2.5,
      sodium: 12,
    }).nutrients,
    energy: {
      value: 618,
      unit: "kJ",
      status: "confirmed",
      source: "演示标签原始值",
    },
  },
};
export class DemoNutritionAdapter implements NutritionAdapter {
  readonly kind = "demo" as const;
  private listeners = new Set<() => void>();
  private operations = new Set<string>();
  private snapshot: Snapshot;
  lastRequest: MealRequest | null = null;
  constructor(date = "2026-10-26", scenario = "demo") {
    const food = [
      demoFood(
        "milk",
        "纯牛奶",
        {
          energy: 160,
          protein: 8,
          carbohydrate: 12,
          fat: 9,
          total_sugars: 12,
          added_sugars: null,
          sodium: 145,
        },
        "mL",
        250,
      ),
      demoFood(
        "bread",
        "全麦面包",
        {
          energy: 210,
          protein: 8,
          carbohydrate: 37,
          fat: 4,
          fiber: 5,
          total_sugars: 5,
          added_sugars: null,
          sodium: 310,
        },
        "g",
        80,
      ),
      demoFood("lunch", "鸡肉时蔬饭", {
        energy: 620,
        protein: 36,
        carbohydrate: 77,
        fat: 18,
        fiber: 7,
        sodium: 900,
      }),
      demoFood("snack", "酸奶与坚果", {
        energy: 295,
        protein: 10,
        carbohydrate: 32,
        fat: 14,
        total_sugars: 18,
        added_sugars: scenario === "exceeded" ? 60 : null,
        sodium: 320,
      }),
    ];
    this.snapshot = {
      status:
        scenario === "failure"
          ? "error"
          : scenario === "loading-nutrition"
            ? "loading"
            : "ready",
      message: scenario === "failure" ? "演示加载失败，请稍后重试。" : "",
      entries:
        scenario === "nutrition-empty"
          ? []
          : food.map((f, i) => ({
              id: `demo-${i}`,
              date,
              food: f,
              amount: f.basis.amount,
              unit: f.basis.unit,
              meal: i < 2 ? "breakfast" : i === 2 ? "lunch" : "snack",
            })),
      targets: {
        energy: 2000,
        protein: 80,
        carbohydrate: [225, 300],
        fat: [45, 70],
        fiber: 28,
        sodium: 2000,
        saturatedPercent: 10,
      },
    };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Snapshot) {
    this.snapshot = next;
    for (const fn of this.listeners) fn();
  }
  updatePortion = (id: string, amount: number) => {
    parsePortion(String(amount));
    if (!this.snapshot.entries.some((e) => e.id === id))
      throw Error("演示餐食不存在");
    this.publish({
      ...this.snapshot,
      entries: this.snapshot.entries.map((e) =>
        e.id === id ? { ...e, amount } : e,
      ),
    });
  };
  record = (entry: Entry, operationId: string) => {
    validateEntry(entry);
    if (
      this.operations.has(operationId) ||
      this.snapshot.entries.some((e) => e.id === entry.id)
    )
      return;
    this.operations.add(operationId);
    this.publish({
      ...this.snapshot,
      entries: [...this.snapshot.entries, JSON.parse(JSON.stringify(entry))],
    });
  };
  configureTargets = (targets: Targets) =>
    this.publish({ ...this.snapshot, targets: { ...targets } });
  demoEstimateMeal = async (request: MealRequest) => {
    this.lastRequest = { ...request };
    const food = demoFood("demo-meal", "牛肉鸡蛋面（估算）", {}, "份");
    food.version = `demo-${Date.now()}`;
    food.image = request.imageUri;
    food.source = "餐食估算演示 · 非 AI 识别";
    for (const [key, range] of Object.entries({
      energy: [520, 700],
      protein: [24, 34],
      carbohydrate: [65, 90],
      fat: [16, 25],
    }))
      food.nutrients[key as Nutrient] = {
        value: null,
        range: range as [number, number],
        unit: key === "energy" ? "kcal" : "g",
        status: "estimated",
        source: "固定演示区间",
      };
    return {
      food,
      ingredients: ["面条", "牛肉", "鸡蛋", "香菜"],
      uncertainties: [
        "油和酱料用量不确定",
        "面条份量与汤汁摄入需要你确认",
        "钠、添加糖、维生素数据未知",
      ],
    };
  };
  demoPackage = () => JSON.parse(JSON.stringify(packageFixture)) as Food;
}
