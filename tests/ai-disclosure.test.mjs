import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const { createDisclosure } = await import("../src/services/ai/disclosure.ts");
test("AI acknowledgement is scoped to destination, config and current sending range; clear revokes it", () => {
  const d = createDisclosure(),
    a = {
      revision: 1,
      endpoint: "https://mock.example/v1/chat/completions",
      consent: true,
    };
  d.visit(a, "meal-text");
  assert.equal(d.allows(a, "meal-text"), false);
  d.accept(a, "meal-text", true);
  assert.equal(d.allows(a, "meal-text"), true);
  d.visit(a, "meal-text");
  assert.equal(d.allows(a, "meal-text"), true);
  d.visit(a, "meal-image");
  assert.equal(d.allows(a, "meal-image"), false);
  d.visit(a, "meal-text");
  assert.equal(d.allows(a, "meal-text"), false);
  d.accept(a, "meal-image", true);
  assert.equal(d.allows(a, "package-image"), false);
  assert.equal(d.allows({ ...a, revision: 2 }, "meal-image"), false);
  assert.equal(
    d.allows({ ...a, endpoint: "https://new.example" }, "meal-image"),
    false,
  );
  assert.equal(d.allows({ ...a, consent: false }, "meal-image"), false);
  d.accept(a, "meal-image", false);
  assert.equal(d.allows(a, "meal-image"), false);
});
