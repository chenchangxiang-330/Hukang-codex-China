import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const { AiService } = await import("../src/services/ai/service.ts");
const { parseLabel, labelEvidence } = await import(
  "../src/services/ai/label.ts"
);
const { validateFoodReview } = await import("../src/domain/food/review.ts");
const { foodFromRecord, contribution } = await import(
  "../src/features/nutrition-v2/model.ts"
);
const { orphanDraftUris } = await import(
  "../src/features/simple/draftFiles.ts"
);
const config = {
  provider: "qwen",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: "qwen3-vl-plus",
  apiKey: "local-non-secret-fixture",
};
const label = {
  name: "TEST milk",
  columns: [
    {
      basis: "per_100ml",
      basisText: "每100mL",
      rows: [
        { nutrient: "energy", label: "能量", amount: "418.4", unit: "kJ" },
        { nutrient: "protein", label: "蛋白质", amount: "3.6", unit: "g" },
        { nutrient: "calcium", label: "钙", amount: "100", unit: "mg" },
        { nutrient: "sodium", label: "钠", amount: null, unit: "mg" },
      ],
    },
  ],
};
const completion = (text) =>
  JSON.stringify({
    model: config.model,
    choices: [
      { finish_reason: "stop", message: { role: "assistant", content: text } },
    ],
  });
const image = {
  base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
  mime: "image/png",
  bytes: 24,
};
const confirmed = (review) => ({
  ...review,
  columns: review.columns.map((c) => ({
    ...c,
    reviewed: true,
    rows: c.rows.map((r) => ({ ...r, reviewed: true })),
  })),
});
test("packaging table retains basis, missing amounts, extra nutrients and deterministic unit/portion conversion", () => {
  const review = confirmed(parseLabel(JSON.stringify(label)));
  assert.deepEqual(validateFoodReview(review, "confirmed"), []);
  assert.equal(review.columns[0].rows[3].amount, "");
  const food = foodFromRecord({
    id: "test",
    status: "confirmed",
    review,
    updatedAt: "v1",
  });
  const entry = { food, amount: 250, unit: "mL" };
  assert.equal(contribution(entry, "energy").value, 250);
  assert.equal(contribution(entry, "protein").value, 9);
  assert.equal(contribution(entry, "calcium").value, 250);
  assert.equal(contribution(entry, "sodium").value, null);
  assert.equal(contribution({ ...entry, unit: "g" }, "protein").value, null);
  for (const mutation of [
    { columns: [] },
    { columns: [{ ...label.columns[0], basis: "made-up" }] },
    {
      columns: [
        {
          ...label.columns[0],
          rows: [
            { nutrient: "protein", label: "蛋白质", amount: "NaN", unit: "g" },
          ],
        },
      ],
    },
  ])
    assert.throws(
      () => parseLabel(JSON.stringify({ ...label, ...mutation })),
      (e) => e.code === "format",
    );
  const missingBasis = confirmed(
    parseLabel(
      JSON.stringify({
        ...label,
        columns: [{ ...label.columns[0], basis: "unknown" }],
      }),
    ),
  );
  assert(validateFoodReview(missingBasis, "confirmed").length);
});
test("one label request uses current configuration and actual image payload; model switch/clear takes effect", async () => {
  const requests = [];
  const service = new AiService(
    async (r) => {
      requests.push(r);
      return {
        url: r.endpoint,
        status: 200,
        body: completion(JSON.stringify(label)),
      };
    },
    async () => image,
  );
  service.update(config);
  service.consent(true, [
    "meal-text",
    "meal-image",
    "package-image",
    "label-image",
    "profile",
    "health-image",
  ]);
  const result = await service.readNutritionLabel("file:///compressed.png");
  const payload = JSON.parse(requests[0].body);
  assert.equal(payload.model, config.model);
  assert.equal(
    payload.messages[1].content[1].image_url.url,
    `data:image/png;base64,${image.base64}`,
  );
  assert.match(payload.messages[0].content, /禁止根据外观/);
  assert.equal(result.review.columns[0].basisKind, "per_100ml");
  assert.equal(requests.length, 1);
  service.update({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    apiKey: "second-test-fixture",
  });
  service.consent(true, [
    "meal-text",
    "meal-image",
    "package-image",
    "label-image",
    "profile",
    "health-image",
  ]);
  await service.readNutritionLabel("file:///compressed.png");
  assert.equal(
    requests[1].endpoint,
    "https://api.deepseek.com/chat/completions",
  );
  assert.equal(requests[1].apiKey, "second-test-fixture");
  service.clear();
  await assert.rejects(
    service.readNutritionLabel("file:///compressed.png"),
    (e) => e.code === "configuration",
  );
  assert.equal(requests.length, 2);
});
for (const [status, code] of [
  [401, "authentication"],
  [429, "rate_limit"],
  [403, "permission"],
  [402, "quota"],
  [500, "server"],
])
  test(`label HTTP ${status} stays failure with one request`, async () => {
    let calls = 0;
    const s = new AiService(
      async (r) => {
        calls++;
        return { url: r.endpoint, status, body: "{}" };
      },
      async () => image,
    );
    s.update(config);
    s.consent(true, [
      "meal-text",
      "meal-image",
      "package-image",
      "label-image",
      "profile",
      "health-image",
    ]);
    await assert.rejects(
      s.readNutritionLabel("file:///a"),
      (e) => e.code === code,
    );
    assert.equal(calls, 1);
    assert.equal(s.getSnapshot().operation, null);
  });
test("label timeout, cancellation, stale configuration, malformed response and image limit never yield a table", async () => {
  for (const mode of [
    "timeout",
    "cancelled",
    "changed",
    "format",
    "image_invalid",
  ]) {
    let calls = 0;
    const s = new AiService(
      async (r) => {
        calls++;
        if (mode === "format")
          return { url: r.endpoint, status: 200, body: completion("{}") };
        return new Promise(() => {});
      },
      async () =>
        mode === "image_invalid"
          ? { ...image, base64: Buffer.alloc(4_000_000).toString("base64") }
          : image,
      { connection: 30, meal: 30 },
    );
    s.update(config);
    s.consent(true, [
      "meal-text",
      "meal-image",
      "package-image",
      "label-image",
      "profile",
      "health-image",
    ]);
    const c = new AbortController();
    const promise = s.readNutritionLabel("file:///a", c.signal);
    if (mode === "cancelled") c.abort();
    if (mode === "changed") s.clear();
    await assert.rejects(promise, (e) => e.code === mode);
    assert(calls <= 1);
  }
});
test("discarded draft cleanup excludes referenced snapshots, album files and arbitrary paths", () => {
  const root = "file:///data/files/",
    a = root + "ocr-lab/images/aaaa.png",
    b = root + "ocr-lab/images/bbbb.source",
    external = "file:///storage/album/photo.png";
  const result = orphanDraftUris(
    [
      {
        nutritionImage: { uri: a, originalUri: b },
        temporaryUris: [external, root + "ocr-lab/images/../secret.json"],
      },
    ],
    [{ snapshot_json: JSON.stringify({ image: a }) }],
    root,
  );
  assert.deepEqual(
    result.sort(),
    [b, root + "ocr-lab/images/bbbb.json"].sort(),
  );
});
