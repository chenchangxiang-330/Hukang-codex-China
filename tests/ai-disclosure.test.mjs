import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const { aiDisclosure, validScopes } = await import(
  "../src/services/ai/disclosure.ts"
);
test("connection consent alone never authorizes data; health also requires profile grant", () => {
  const a = { consent: true, authorizedScopes: [] };
  assert.equal(aiDisclosure.allows(a, "meal-image"), false);
  assert.equal(
    aiDisclosure.allows(
      { ...a, authorizedScopes: ["health-image"] },
      "health-image",
    ),
    false,
  );
  const granted = {
    ...a,
    authorizedScopes: ["profile", "health-image", "meal-image"],
  };
  assert(aiDisclosure.allows(granted, "health-image"));
  assert(aiDisclosure.allows(granted, "meal-image"));
  assert.equal(aiDisclosure.allows(granted, "label-image"), false);
  assert.equal(
    aiDisclosure.allows({ ...granted, consent: false }, "meal-image"),
    false,
  );
  assert.deepEqual(
    validScopes(["health-image", "unrecognized", "health-image"]),
    ["health-image"],
  );
});
