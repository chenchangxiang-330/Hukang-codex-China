import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const { nutrientProgress } = await import(
  "../src/services/nutrition/progress.ts"
);
const { originalTask, restoreOriginal, retryTask, acceptsResult } =
  await import("../src/services/covers/tasks.ts");
const total = { value: 50, unit: "g", count: 1, missing: 0, estimated: false };
const goal = { type: "target", unit: "g", value: 100 };
test("unset, unknown, incomplete, estimated, exceeded and range progress have distinct meanings", () => {
  assert.equal(nutrientProgress(total).fraction, null);
  assert.equal(nutrientProgress(total, goal).fraction, 0.5);
  assert.equal(nutrientProgress(total, goal).percent, 50);
  for (const patch of [{ count: 0 }, { value: null }])
    assert.equal(nutrientProgress({ ...total, ...patch }, goal).fraction, null);
  assert.equal(
    nutrientProgress({ ...total, estimated: true }, goal).percent,
    null,
  );
  assert.equal(nutrientProgress({ ...total, value: 150 }, goal).fraction, 1);
  assert.equal(nutrientProgress({ ...total, value: 150 }, goal).excess, 50);
  assert.equal(
    nutrientProgress(total, { type: "range", range: [40, 80], unit: "g" })
      .percent,
    null,
  );
});
test("stale image completion is rejected after retry or restore; identity is never fabricated", () => {
  const waiting = originalTask("food", "file:///original", "asset", "v1");
  assert.equal(waiting.state, "waiting_identity");
  assert(!acceptsResult(waiting, waiting));
  const running = {
    ...waiting,
    state: "processing",
    modelSha256: "a".repeat(64),
  };
  assert(acceptsResult(running, running));
  assert(!acceptsResult(restoreOriginal(running), running));
  assert(!acceptsResult(retryTask(running), running));
  assert(!acceptsResult({ ...running, inputVersion: "v2" }, running));
});

test("AI midpoint drives progress while original bounds and subtotal semantics remain available", () => {
  const range = nutrientProgress(
    { ...total, value: null, range: [29, 52], estimated: true },
    { ...goal, value: 90 },
  );
  assert.equal(range.fraction, 40.5 / 90);
  assert.equal(range.upperFraction, 52 / 90);
  assert.equal(range.percent, null);
  assert.equal(range.value, 40.5);
  assert.equal(range.low, 29);
  assert.equal(range.high, 52);
  const partial = nutrientProgress({ ...total, missing: 1 }, goal);
  assert.equal(partial.fraction, 0.5);
  assert.equal(partial.percent, null);
  assert.match(partial.status, /数据不完整/);
  assert.equal(nutrientProgress(total, { ...goal, unit: "mg" }).fraction, null);
  assert.equal(
    nutrientProgress({ ...total, value: null, range: [-1, 50] }, goal).fraction,
    null,
  );
});

test("every target policy fills at its upper bound and only strictly greater intake exceeds it", () => {
  for (const policy of [
    goal,
    { ...goal, type: "upper_limit" },
    { type: "range", range: [75, 100], unit: "g" },
  ]) {
    const equal = nutrientProgress({ ...total, value: 100 }, policy);
    assert.equal(equal.fraction, 1);
    assert.equal(equal.excess, null);
    const above = nutrientProgress({ ...total, value: 100.1 }, policy);
    assert.equal(above.fraction, 1);
    assert.ok(above.excess > 0);
    const below = nutrientProgress({ ...total, value: 99.9 }, policy);
    assert.ok(Math.abs(below.fraction - 0.999) < 1e-12);
    assert.equal(below.excess, null);
    const estimated = nutrientProgress(
      { ...total, value: null, range: [90, 130], estimated: true },
      policy,
    );
    assert.equal(estimated.fraction, 1);
    assert.equal(estimated.excess, 10);
    const equalEstimate = nutrientProgress(
      { ...total, value: null, range: [80, 120], estimated: true },
      policy,
    );
    assert.equal(equalEstimate.fraction, 1);
    assert.equal(equalEstimate.excess, null);
  }
});

test("unset or invalid targets never hide or fabricate the intake value", () => {
  for (const policy of [
    undefined,
    { ...goal, value: 0 },
    { ...goal, value: NaN },
    { ...goal, unit: "mg" },
    { type: "range", range: [120, 100], unit: "g" },
  ]) {
    const result = nutrientProgress(
      { ...total, value: null, range: [40, 70], estimated: true },
      policy,
    );
    assert.equal(result.value, 55);
    assert.equal(result.max, null);
    assert.equal(result.fraction, null);
    assert.equal(result.excess, null);
  }
});
