import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const {
  validDateKey,
  shiftDateKey,
  parseDemoAmount,
  summarizeDiary,
  validateAiConfiguration,
} = await import("../src/features/ui-v1/contracts.ts");

test("diary dates preserve calendar boundaries and reject invented dates", () => {
  assert.equal(validDateKey("2026-02-29"), false);
  assert.equal(validDateKey("2028-02-29"), true);
  assert.equal(shiftDateKey("2028-02-28", 1), "2028-02-29");
  assert.equal(shiftDateKey("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
  assert.throws(() => shiftDateKey("2026-02-30", 1));
});
test("diary totals preserve unknown rather than present a partial daily total as complete", () => {
  const item = {
    id: "demo",
    day: "2026-10-26",
    meal: "breakfast",
    name: "示例",
    source: "ui_demo",
    energyKcal: 200,
    proteinG: 10,
    fatG: null,
    carbohydrateG: 20,
  };
  assert.deepEqual(summarizeDiary([]), {
    energyKcal: null,
    proteinG: null,
    fatG: null,
    carbohydrateG: null,
  });
  assert.deepEqual(
    summarizeDiary([
      item,
      { ...item, energyKcal: null, proteinG: 5.5, fatG: 2 },
    ]),
    { energyKcal: null, proteinG: 15.5, fatG: null, carbohydrateG: 40 },
  );
  assert.equal(parseDemoAmount(""), null);
  assert.equal(parseDemoAmount("0"), 0);
  assert.equal(parseDemoAmount("3.60"), 3.6);
  for (const text of ["-1", "1e3", "3,6", "NaN", "Infinity", "100001"])
    assert.throws(() => parseDemoAmount(text));
});
test("AI configuration rejects unsafe or incomplete input without echoing keys", () => {
  const config = {
    provider: "custom",
    baseUrl: "https://service.example/v1",
    apiKey: "test-only-placeholder",
    model: "test-model",
  };
  assert.deepEqual(validateAiConfiguration(config), {});
  for (const baseUrl of [
    "http://service.example",
    "https://user:pass@service.example",
    "https://service.example?key=value",
    "https://service.example#fragment",
    "not-a-url",
  ])
    assert.ok(validateAiConfiguration({ ...config, baseUrl }).baseUrl);
  const issues = validateAiConfiguration({
    ...config,
    apiKey: "line\nbreak",
    model: "",
  });
  assert.ok(issues.apiKey);
  assert.ok(issues.model);
  assert.doesNotMatch(
    JSON.stringify(issues),
    /line|break|test-only-placeholder/,
  );
});
