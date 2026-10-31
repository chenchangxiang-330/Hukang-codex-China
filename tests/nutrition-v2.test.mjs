import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const m = await import("../src/features/nutrition-v2/model.ts");
const { DemoNutritionAdapter, demoFood, packageFixture } = await import(
  "./ui-preview/nutrition-demo.ts"
);
const date = "2026-10-26";
const entry = (food, amount = food.basis.amount, unit = food.basis.unit) => ({
  id: "test",
  date,
  meal: "lunch",
  food,
  amount,
  unit,
});
test("production nutrition starts unavailable with no sample foods or targets and refuses writes", async () => {
  const p = m.productionNutrition;
  assert.deepEqual(p.getSnapshot(), {
    status: "unavailable",
    entries: [],
    targets: {},
  });
  assert.throws(() => p.record(entry(packageFixture), "x"), /尚未接入/);
  assert.throws(() => p.updatePortion("x", 10), /尚未接入/);
  assert.throws(() => p.configureTargets({ energy: 2000 }), /尚未接入/);
  await assert.rejects(
    p.estimateMeal({ imageUri: "local://photo", description: "面条吃一半" }),
    /尚未接入/,
  );
});
test("per-serving energy preserves raw kJ and converts once; package is not a serving; no g/mL guessing", () => {
  const e = entry(packageFixture, 25, "g");
  assert.ok(Math.abs(m.contribution(e, "energy").value - 618 / 4.184) < 1e-9);
  assert.ok(
    Math.abs(
      m.contribution(entry(packageFixture, 250, "g"), "energy").value -
        6180 / 4.184,
    ) < 1e-9,
  );
  assert.equal(packageFixture.rawEnergy.value, "618");
  assert.equal(
    m.contribution(entry(packageFixture, 25, "mL"), "energy").value,
    null,
  );
  assert.equal(m.contribution(e, "total_sugars").value, 2);
  assert.equal(m.contribution(e, "added_sugars").value, null);
});
test("unknown, confirmed zero, ranges, missing subtotals and date isolation stay distinct", () => {
  const f = demoFood("a", "A", { energy: 100, added_sugars: null, sodium: 0 });
  const g = demoFood("b", "B", { energy: null, sodium: null });
  const list = [entry(f), { ...entry(g), id: "b" }];
  assert.equal(m.total(list, date, "energy").value, 100);
  assert.equal(m.total(list, date, "energy").missing, 1);
  assert.equal(m.total(list, date, "sodium").value, 0);
  assert.equal(m.total(list, date, "added_sugars").value, null);
  assert.equal(m.total(list, "2026-10-27", "energy").count, 0);
  f.nutrients.energy = {
    value: null,
    range: [100, 200],
    unit: "kcal",
    status: "estimated",
    source: "test",
  };
  assert.deepEqual(m.total([entry(f, 0.5)], date, "energy").range, [50, 100]);
  assert.equal(m.total([entry(f, 0.5)], date, "energy").value, null);
});
test("demo portion changes propagate through one snapshot without changing another date or food version", () => {
  const d = new DemoNutritionAdapter(date);
  const before = d.getSnapshot();
  assert.equal(m.total(before.entries, date, "energy").value, 1285);
  d.updatePortion("demo-0", 125);
  assert.equal(m.total(d.getSnapshot().entries, date, "energy").value, 1205);
  assert.equal(before.entries[0].amount, 250);
  assert.equal(m.total(d.getSnapshot().entries, date, "protein").value, 58);
  assert.equal(d.getSnapshot().entries[0].food.version, "demo-v1");
  assert.equal(
    m.total(d.getSnapshot().entries, "2026-10-25", "energy").value,
    null,
  );
});
test("preview has no write side effect and repeated confirmation is idempotent", () => {
  const d = new DemoNutritionAdapter(date);
  const e = entry(packageFixture);
  m.total([...d.getSnapshot().entries, e], date, "energy");
  assert.equal(d.getSnapshot().entries.length, 4);
  d.record(e, "op");
  d.record(e, "op");
  d.record({ ...e, id: "new" }, "op");
  assert.equal(d.getSnapshot().entries.length, 5);
  e.food.name = "changed external object";
  assert.notEqual(d.getSnapshot().entries[4].food.name, e.food.name);
  packageFixture.name = "演示 · 混合坚果";
});
test("known subtotal exceeding added-sugar limit is reported with missing-data qualification", () => {
  const d = new DemoNutritionAdapter(date, "exceeded");
  assert.match(
    m.findings(d.getSnapshot().entries, date, {}).join(" "),
    /添加糖已知小计已超参考上限 10 g/,
  );
  const normal = new DemoNutritionAdapter(date);
  assert.doesNotMatch(
    m.findings(normal.getSnapshot().entries, date, {}).join(" "),
    /添加糖.*过量|全部达标/,
  );
});
test("meal estimate preserves photo-plus-text request and ranges after portion scaling", async () => {
  const d = new DemoNutritionAdapter(date);
  const request = {
    imageUri: "local://photo",
    description: "一个鸡蛋，面条一半，没喝汤",
  };
  const result = await d.estimateMeal(request);
  assert.deepEqual(d.lastRequest, request);
  assert.deepEqual(
    m.contribution(entry(result.food, 0.5), "energy").range,
    [260, 350],
  );
  assert.equal(m.contribution(entry(result.food), "sodium").value, null);
  assert.throws(() =>
    m.validateEntry({ ...entry(result.food), date: "2026-02-30" }),
  );
  for (const v of ["0", "-1", "1e3", "Infinity", ""])
    assert.throws(() => m.parsePortion(v));
});

test("existing food-label adapter maps sugar and fiber without inventing added sugar or mutating evidence", () => {
  const record = {
    id: "real-label",
    updatedAt: "version-2",
    status: "confirmed",
    review: {
      name: "标签食品",
      specification: "250g",
      columns: [
        {
          basisKind: "per_serving",
          reviewed: true,
          servingAmount: "25",
          servingUnit: "g",
          rows: [
            { nutrient: "energy", amount: "618", unit: "kJ", reviewed: true },
            { nutrient: "sugars", amount: "4", unit: "g", reviewed: true },
            {
              nutrient: "dietary_fiber",
              amount: "2",
              unit: "g",
              reviewed: true,
            },
            { nutrient: "sodium", amount: "<2", unit: "mg", reviewed: true },
          ],
        },
      ],
    },
    evidence: { ocr: { rawText: "original evidence" } },
  };
  const original = JSON.stringify(record),
    food = m.foodFromRecord(record);
  assert.equal(food.nutrients.total_sugars.value, 4);
  assert.equal(food.nutrients.fiber.value, 2);
  assert.equal(food.nutrients.added_sugars, undefined);
  assert.equal(food.nutrients.sodium.value, null);
  assert.equal(food.rawEnergy.value, "618");
  assert.equal(m.contribution(entry(food, 50, "g"), "total_sugars").value, 8);
  assert.equal(JSON.stringify(record), original);
});
