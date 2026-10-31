import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const { AiService } = await import("../src/services/ai/service.ts");
const { chatEndpoint, supportsMealImage } = await import(
  "../src/services/ai/config.ts"
);
const { parseMeal, requestBody, fetchChatTransport } = await import(
  "../src/services/ai/protocol.ts"
);
const { productionNutrition } = await import(
  "../src/features/nutrition-v2/model.ts"
);
const config = {
  provider: "custom",
  baseUrl: "https://mock.example/v1",
  apiKey: "test-only-credential",
  model: "mock-model",
};
const meal = {
  name: "鸡蛋面",
  ingredients: ["面条", "鸡蛋"],
  uncertainties: ["未说明用油量"],
  nutrients: {
    energy: { value: null, range: [400, 600] },
    protein: { value: 20 },
    sodium: { value: null },
  },
};
const completion = (text = "OK", model = "mock-model") =>
  JSON.stringify({
    model,
    choices: [
      { finish_reason: "stop", message: { role: "assistant", content: text } },
    ],
  });
const ok = (request) =>
  Promise.resolve({ url: request.endpoint, status: 200, body: completion() });
function ready(transport = ok, imageReader, timeouts) {
  const s = new AiService(transport, imageReader, timeouts);
  s.update(config);
  s.consent(true);
  return s;
}
const code = (value) => (error) => error.code === value;

test("official/custom endpoint joining preserves prefixes without duplicated /v1", () => {
  for (const [provider, baseUrl, suffix] of [
    ["deepseek", "https://api.deepseek.com", "/chat/completions"],
    ["deepseek", "https://api.deepseek.com/v1/", "/v1/chat/completions"],
    [
      "qwen",
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "/compatible-mode/v1/chat/completions",
    ],
    [
      "qwen",
      "https://ws-123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
      "/compatible-mode/v1/chat/completions",
    ],
    ["custom", "https://mock.example", "/v1/chat/completions"],
    [
      "custom",
      "https://mock.example/proxy/v1/chat/completions",
      "/proxy/v1/chat/completions",
    ],
  ])
    assert.equal(new URL(chatEndpoint({ provider, baseUrl })).pathname, suffix);
  for (const baseUrl of [
    "http://mock.example/v1",
    "https://mock.example/v1/v1",
    "https://u:p@mock.example",
    "https://mock.example/v1?key=x",
    "https://mock.example/#secret",
    "https://mock.example/chat/completions/chat/completions",
  ])
    assert.throws(() => chatEndpoint({ ...config, baseUrl }));
  assert.throws(() =>
    chatEndpoint({ provider: "deepseek", baseUrl: "https://proxy.example" }),
  );
});
test("no request until valid configuration, consent and explicit action", async () => {
  let calls = 0;
  const s = new AiService((r) => {
    calls++;
    return ok(r);
  });
  await assert.rejects(s.testConnection(), code("configuration"));
  s.update(config);
  await assert.rejects(s.testConnection(), code("consent"));
  s.consent(true);
  assert.equal(calls, 0);
  const result = await s.testConnection();
  assert.equal(result.response, "OK");
  assert.equal(calls, 1);
  assert.equal(s.getSnapshot().connection.responseModel, "mock-model");
});
test("connection test is a minimal text request; meal reuses the same session configuration", async () => {
  const requests = [];
  const s = ready(async (r) => {
    requests.push(r);
    return {
      url: r.endpoint,
      status: 200,
      body: completion(requests.length === 1 ? "OK" : JSON.stringify(meal)),
    };
  });
  await s.testConnection();
  const result = await s.estimateMeal({
    imageUri: "file:///retained.jpg",
    description: "鸡蛋面一碗",
  });
  const first = JSON.parse(requests[0].body),
    second = JSON.parse(requests[1].body);
  assert.equal(first.messages.length, 1);
  assert.equal(first.max_tokens, 32);
  assert.equal(first.messages[0].content, "请只回复 OK。");
  assert.equal(second.messages[1].content, "鸡蛋面一碗");
  assert.equal(second.stream, false);
  assert.equal(requests[1].apiKey, requests[0].apiKey);
  assert.equal(second.model, "mock-model");
  assert.equal(result.ai.imageSent, false);
  assert.equal(result.food.nutrients.sodium.value, null);
  assert.equal(result.food.nutrients.fiber.status, "unknown");
  assert.deepEqual(result.food.nutrients.energy.range, [400, 600]);
  assert.equal(result.food.nutrients.protein.status, "estimated");
  assert.deepEqual(productionNutrition.getSnapshot().entries, []);
});
test("provider/model changes invalidate consent and result; destination changes discard old credentials", async () => {
  const seen = [];
  const s = ready(async (r) => {
    seen.push([r.endpoint, r.apiKey, JSON.parse(r.body).model]);
    return ok(r);
  });
  await s.testConnection();
  s.update({ model: "new-model" });
  assert.equal(s.getSnapshot().connection, null);
  await assert.rejects(s.testConnection(), code("consent"));
  s.consent(true);
  await s.testConnection();
  assert.equal(seen.at(-1)[2], "new-model");
  s.update({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
  });
  assert.equal(s.getSnapshot().hasKey, false);
  s.consent(true);
  await assert.rejects(s.testConnection(), code("configuration"));
  s.update({ apiKey: "another-test-only-credential" });
  s.consent(true);
  await s.testConnection();
  assert.deepEqual(seen.at(-1), [
    "https://api.deepseek.com/chat/completions",
    "another-test-only-credential",
    "deepseek-flash",
  ]);
  s.clear();
  assert.equal(s.getSnapshot().hasKey, false);
  assert.equal(s.getSnapshot().connection, null);
  await assert.rejects(s.testConnection(), code("configuration"));
  assert.equal(seen.length, 3);
});
for (const [status, error, expected] of [
  [401, {}, "authentication"],
  [402, {}, "quota"],
  [403, {}, "permission"],
  [429, {}, "rate_limit"],
  [429, { code: "insufficient_quota" }, "quota"],
  [404, { code: "model_not_found" }, "model"],
  [400, { message: "image input not supported" }, "image_unsupported"],
  [500, {}, "server"],
  [302, {}, "redirect"],
  [504, {}, "timeout"],
])
  test(`HTTP ${status}/${expected}: never successful, never retried, never echoes provider errors`, async () => {
    let calls = 0;
    const s = ready(async (r) => {
      calls++;
      return {
        url: r.endpoint,
        status,
        body: JSON.stringify({ error: { ...error, secret: config.apiKey } }),
      };
    });
    await assert.rejects(
      s.testConnection(),
      (e) => e.code === expected && !e.message.includes(config.apiKey),
    );
    assert.equal(calls, 1);
    assert.equal(s.getSnapshot().connection, null);
    assert.equal(s.getSnapshot().operation, null);
  });
test("malformed, empty, truncated, refused, tool-only or oversized model responses fail closed", async () => {
  for (const body of [
    "<html>OK</html>",
    "{}",
    completion(" "),
    completion().replace('"stop"', '"length"'),
    JSON.stringify({
      model: "x",
      choices: [
        {
          finish_reason: "stop",
          message: { role: "assistant", content: "OK", refusal: "denied" },
        },
      ],
    }),
    " ".repeat(1_000_001),
  ]) {
    const s = ready(async (r) => ({ url: r.endpoint, status: 200, body }));
    await assert.rejects(s.testConnection(), code("format"));
    assert.equal(s.getSnapshot().connection, null);
  }
});
test("network failures and redirect mismatches never become connection success", async () => {
  await assert.rejects(
    ready(async () => {
      throw Error(config.apiKey);
    }).testConnection(),
    (e) => e.code === "network" && !e.message.includes(config.apiKey),
  );
  await assert.rejects(
    ready(async () => ({
      url: "https://other.example/",
      status: 200,
      body: completion(),
    })).testConnection(),
    code("redirect"),
  );
});
test("duplicate prevention, cancel, timeout and late replies cannot overwrite newer state", async () => {
  let finish;
  let calls = 0;
  const s = ready((r) => {
    calls++;
    return new Promise((resolve) => {
      finish = () =>
        resolve({ url: r.endpoint, status: 200, body: completion("old") });
    });
  });
  const pending = s.testConnection();
  const stopped = assert.rejects(pending, code("cancelled"));
  await assert.rejects(s.testConnection(), code("busy"));
  s.cancel();
  await stopped;
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(s.getSnapshot().connection, null);
  assert.equal(calls, 1);
  const t = ready(() => new Promise(() => {}), undefined, {
    connection: 15,
    meal: 15,
  });
  await assert.rejects(t.testConnection(), code("timeout"));
  assert.equal(t.getSnapshot().operation, null);
});
test("clearing config aborts in-flight transport and ignores its eventual response", async () => {
  let finish, signal;
  const s = ready((r) => {
    signal = r.signal;
    return new Promise((resolve) => {
      finish = () =>
        resolve({ status: 200, url: r.endpoint, body: completion() });
    });
  });
  const p = s.testConnection();
  const rejected = assert.rejects(p, code("changed"));
  s.clear();
  assert.equal(signal.aborted, true);
  finish();
  await rejected;
  assert.equal(s.getSnapshot().connection, null);
  assert.equal(s.getSnapshot().hasKey, false);
});
test("only explicit image opt-in + known official vision model reads and sends local image", async () => {
  assert.equal(supportsMealImage({ ...config, model: "qwen3-vl-plus" }), false);
  let reads = 0;
  const requests = [];
  const s = ready(
    async (r) => {
      requests.push(JSON.parse(r.body));
      return {
        status: 200,
        url: r.endpoint,
        body: completion(JSON.stringify(meal)),
      };
    },
    async () => {
      reads++;
      return { base64: "/9j/AA==", mime: "image/jpeg" };
    },
  );
  await assert.rejects(
    s.estimateMeal({
      imageUri: "file:///meal.jpg",
      description: "面",
      includeImage: true,
    }),
    code("image_unsupported"),
  );
  assert.equal(reads, 0);
  s.update({
    provider: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-vl-plus",
    apiKey: config.apiKey,
  });
  s.consent(true);
  await s.estimateMeal({ imageUri: "file:///meal.jpg", description: "面" });
  assert.equal(reads, 0);
  const result = await s.estimateMeal({
    imageUri: "file:///meal.jpg",
    description: "面",
    includeImage: true,
  });
  assert.equal(reads, 1);
  assert.equal(result.ai.imageSent, true);
  assert.equal(
    requests.at(-1).messages[1].content[1].image_url.url,
    "data:image/jpeg;base64,/9j/AA==",
  );
  assert.equal(requests.at(-1).enable_thinking, false);
  assert.deepEqual(
    requestBody(
      { ...config, provider: "deepseek", model: "deepseek-flash" },
      "x",
      false,
    ).thinking,
    { type: "disabled" },
  );
});
test("invalid meal nutrition values rejected; unknown stays unknown; model output never exposes credentials", async () => {
  for (const nutrients of [
    { energy: { value: -1 } },
    { protein: { value: "20" } },
    { fat: { range: [50, 10] } },
    { fat: { value: 40, range: [10, 20] } },
  ])
    assert.throws(
      () => parseMeal(JSON.stringify({ ...meal, nutrients }), "AI", undefined),
      code("format"),
    );
  const s = ready(async (r) => ({
    url: r.endpoint,
    status: 200,
    body: completion(config.apiKey + " OK", config.apiKey),
  }));
  await s.testConnection();
  assert.ok(!JSON.stringify(s.getSnapshot()).includes(config.apiKey));
});
test("browser transport posts once with auth, blocks redirects and does not send cookies", async () => {
  const original = global.fetch;
  let seen;
  global.fetch = async (url, init) => {
    seen = { url, init };
    return new Response(completion(), { status: 200 });
  };
  try {
    await ready(fetchChatTransport).testConnection();
    assert.equal(seen.init.headers.Authorization, `Bearer ${config.apiKey}`);
    assert.equal(seen.init.redirect, "error");
    assert.equal(seen.init.credentials, "omit");
    assert.equal(seen.init.method, "POST");
  } finally {
    global.fetch = original;
  }
});
