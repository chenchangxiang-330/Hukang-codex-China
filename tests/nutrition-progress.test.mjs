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
  for (const patch of [{ missing: 1 }, { count: 0 }, { value: null }])
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
