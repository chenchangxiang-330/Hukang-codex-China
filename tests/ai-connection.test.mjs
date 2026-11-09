import test from "node:test";
import assert from "node:assert/strict";
import "./register-typescript.mjs";
const { AiService } = await import("../src/services/ai/service.ts");
const { SavedConnection } = await import("../src/services/ai/connection.ts");
const { parseTargetDraft, profileIssues, emptyProfile } = await import(
  "../src/services/nutrition/profile.ts"
);
const config = {
  provider: "custom",
  baseUrl: "https://one.example/v1",
  model: "mock",
  apiKey: "isolated-test-key",
};
const body = (text) =>
  JSON.stringify({
    model: "mock",
    choices: [
      { finish_reason: "stop", message: { role: "assistant", content: text } },
    ],
  });
const policy = {
  type: "target",
  unit: "g",
  value: 80,
  source: "fixture",
  basis: "isolated profile",
  applicability: "test only",
};
const profile = {
  ...emptyProfile(),
  age: "30",
  heightCm: "170",
  weightKg: "65",
  exerciseDescription: "无",
  exerciseFrequencyPerWeek: "0",
  revision: 2,
};
function fixture() {
  let raw = null,
    status = 200,
    response = "OK",
    writes = 0,
    fail = false,
    calls = [];
  const transport = async (r) => {
    calls.push(r);
    return {
      url: r.endpoint,
      status,
      body: status === 200 ? body(response) : "{}",
    };
  };
  const storage = {
    read: async () => raw,
    write: async (v) => {
      writes++;
      if (fail) throw Error("disk");
      raw = v;
    },
    delete: async () => {
      raw = null;
    },
  };
  const active = new AiService(transport);
  const manager = new SavedConnection(
    active,
    storage,
    () => new AiService(transport),
  );
  return {
    active,
    manager,
    storage,
    calls,
    setStatus: (s) => (status = s),
    setResponse: (r) => (response = r),
    failWrite: () => (fail = true),
    raw: () => raw,
    writes: () => writes,
    transport,
  };
}
test("secure save activates only verified config; restart restores without HTTP", async () => {
  const f = fixture();
  await f.manager.save(config, true);
  assert.equal(f.calls.length, 1);
  assert(f.active.getSnapshot().connection);
  assert(!JSON.stringify(f.active.getSnapshot()).includes(config.apiKey));
  const restored = new AiService(f.transport),
    manager = new SavedConnection(
      restored,
      f.storage,
      () => new AiService(f.transport),
    );
  await manager.restore();
  assert.equal(f.calls.length, 1);
  assert.equal(restored.getSnapshot().model, "mock");
  assert(restored.getSnapshot().hasKey);
  restored.consent(true, [
    "meal-text",
    "meal-image",
    "package-image",
    "label-image",
    "profile",
    "health-image",
  ]);
  f.setResponse(
    JSON.stringify({
      name: "test",
      ingredients: [],
      uncertainties: [],
      nutrients: { protein: { value: 8.5 } },
    }),
  );
  await restored.estimateMeal({ description: "isolated meal", imageUri: "" });
  assert.equal(f.calls.at(-1).apiKey, config.apiKey);
});
test("draft failure and atomic write failure preserve active configuration and old secret", async () => {
  const f = fixture();
  await f.manager.save(config, true);
  const old = f.raw();
  f.setStatus(401);
  await assert.rejects(
    f.manager.save(
      { ...config, baseUrl: "https://two.example", apiKey: "new-isolated-key" },
      true,
    ),
    { code: "authentication" },
  );
  assert.equal(f.raw(), old);
  assert.equal(f.active.getSnapshot().baseUrl, config.baseUrl);
  f.setStatus(200);
  f.failWrite();
  await assert.rejects(
    f.manager.save({ ...config, model: "other" }, true),
    /安全保存失败/,
  );
  assert.equal(f.raw(), old);
  assert.equal(f.active.getSnapshot().model, "mock");
});
test("blank replacement key only reuses credential for identical destination; delete cancels old calls", async () => {
  const f = fixture();
  await f.manager.save(config, true);
  await f.manager.save({ ...config, apiKey: "", model: "new-model" }, true);
  assert.equal(f.calls.at(-1).apiKey, config.apiKey);
  assert.equal(JSON.parse(f.calls.at(-1).body).model, "new-model");
  const count = f.calls.length;
  await assert.rejects(
    f.manager.save(
      { ...config, baseUrl: "https://two.example", apiKey: "" },
      true,
    ),
    { code: "configuration" },
  );
  assert.equal(f.calls.length, count);
  await f.manager.delete();
  assert.equal(f.raw(), null);
  assert.equal(f.active.getSnapshot().hasKey, false);
  f.active.consent(true, [
    "meal-text",
    "meal-image",
    "package-image",
    "label-image",
    "profile",
    "health-image",
  ]);
  await assert.rejects(f.active.testConnection(), { code: "configuration" });
});
test("failed secure deletion still forgets the session key and forbids blank-key reuse", async () => {
  const f = fixture();
  await f.manager.save(config, true);
  f.storage.delete = async () => {
    throw Error("device storage unavailable");
  };
  await assert.rejects(f.manager.delete(), /删除未完成/);
  assert.equal(f.active.getSnapshot().hasKey, false);
  assert.equal(f.manager.getSnapshot().saved, false);
  assert(f.manager.issues({ ...config, apiKey: "" }).apiKey);
  const calls = f.calls.length;
  await assert.rejects(
    f.manager.save({ ...config, apiKey: "" }, true),
    (e) => e.code === "configuration",
  );
  assert.equal(f.calls.length, calls);
  assert(
    f.raw(),
    "The failure remains visible; no successful disk deletion is claimed",
  );
});
test("delete during late secure write cannot resurrect a tested draft", async () => {
  const f = fixture();
  await f.manager.save(config, true);
  let release, entered;
  const started = new Promise((r) => (entered = r)),
    wait = new Promise((r) => (release = r));
  const original = f.storage.write;
  f.storage.write = async (v) => {
    entered();
    await wait;
    await original(v);
  };
  const saving = f.manager.save({ ...config, model: "new" }, true);
  await started;
  const deleting = f.manager.delete();
  release();
  await assert.rejects(saving, { code: "changed" });
  await deleting;
  assert.equal(f.raw(), null);
  assert(!f.active.getSnapshot().hasKey);
});
test("targets use all required persisted fields; absent optional sex and health photo allowed", async () => {
  const f = fixture();
  await f.manager.save(config, true);
  f.active.consent(true, [
    "meal-text",
    "meal-image",
    "package-image",
    "label-image",
    "profile",
    "health-image",
  ]);
  f.setResponse(
    JSON.stringify({
      policies: { protein: policy },
      missing: ["other nutrients unknown"],
    }),
  );
  const draft = await f.active.recommendTargets(profile);
  const sent = JSON.parse(JSON.parse(f.calls.at(-1).body).messages[1].content);
  assert.deepEqual(sent, {
    age: 30,
    heightCm: 170,
    weightKg: 65,
    exerciseDescription: "无",
    exerciseFrequencyPerWeek: 0,
    sex: "未提供",
  });
  assert.equal(draft.profileRevision, 2);
  assert.equal(draft.policies.protein.manual, false);
  assert.equal(f.active.getSnapshot().operation, null);
  f.setResponse("{}");
  await assert.rejects(f.active.recommendTargets(profile), { code: "format" });
});
test("profile mandatory fields and structured target units/types never invent values", () => {
  assert.equal(Object.keys(profileIssues(profile)).length, 0);
  for (const k of [
    "age",
    "heightCm",
    "weightKg",
    "exerciseDescription",
    "exerciseFrequencyPerWeek",
  ])
    assert(Object.keys(profileIssues({ ...profile, [k]: "" })).length);
  assert(
    Object.keys(profileIssues({ ...profile, exerciseFrequencyPerWeek: "1" }))
      .length,
  );
  assert(
    Object.keys(profileIssues({ ...profile, exerciseDescription: "跑步" }))
      .length,
  );
  assert.throws(() =>
    parseTargetDraft(
      JSON.stringify({
        policies: { protein: { ...policy, unit: "mg" } },
        missing: [],
      }),
      profile,
      "mock",
    ),
  );
  assert.throws(() =>
    parseTargetDraft(
      JSON.stringify({
        policies: { sodium: { ...policy, unit: "mg" } },
        missing: [],
      }),
      profile,
      "mock",
    ),
  );
  const unknown = parseTargetDraft(
    JSON.stringify({ policies: {}, missing: ["资料不足"] }),
    profile,
    "mock",
  );
  assert.deepEqual(unknown.policies, {});
});

test("saved grants survive restart/model update; test-only and new address cannot inherit them", async () => {
  const f = fixture();
  await f.manager.save(config, true, ["meal-image", "profile", "health-image"]);
  const restarted = new AiService(f.transport);
  const restored = new SavedConnection(
    restarted,
    f.storage,
    () => new AiService(f.transport),
  );
  await restored.restore();
  assert.equal(f.calls.length, 1, "restore is not a paid request");
  assert.deepEqual(restarted.getSnapshot().authorizedScopes, [
    "meal-image",
    "profile",
    "health-image",
  ]);
  await restored.save(
    { ...config, model: "model-b", apiKey: "" },
    true,
    restarted.getSnapshot().authorizedScopes,
  );
  assert(restarted.getSnapshot().authorizedScopes.includes("health-image"));
  await restored.save(
    { ...config, baseUrl: "https://two.example/v1", apiKey: "new-test-key" },
    true,
  );
  assert.deepEqual(restarted.getSnapshot().authorizedScopes, []);
  const count = f.calls.length;
  await assert.rejects(restarted.recommendTargets(profile), {
    code: "consent",
  });
  assert.equal(f.calls.length, count);
  await restored.delete();
  assert.deepEqual(restarted.getSnapshot().authorizedScopes, []);
  assert.equal(await f.storage.read(), null);
});

test("all selected health photos are sent once in order; deleted photo absent; limits fail before transport", async () => {
  const calls = [],
    read = [];
  const s = new AiService(
    async (r) => {
      calls.push(JSON.parse(r.body));
      return {
        url: r.endpoint,
        status: 200,
        body: body(
          JSON.stringify({ policies: { protein: policy }, missing: [] }),
        ),
      };
    },
    async (uri) => {
      read.push(uri);
      return {
        mime: "image/jpeg",
        base64: Buffer.from(uri).toString("base64"),
      };
    },
  );
  s.update({
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    apiKey: "test-only",
  });
  s.consent(true, ["profile", "health-image"]);
  const photos = ["photo-A", "photo-C", "photo-D"];
  await s.recommendTargets(profile, photos);
  assert.deepEqual(read, photos);
  const content = calls[0].messages[1].content;
  assert.deepEqual(
    content
      .slice(1)
      .map((p) =>
        Buffer.from(p.image_url.url.split(",")[1], "base64").toString(),
      ),
    photos,
  );
  assert.equal(content.length, 4);
  assert.equal(JSON.parse(content[0].text).heightCm, 170);
  await assert.rejects(s.recommendTargets(profile, Array(7).fill("x")), {
    code: "image_count",
  });
  assert.equal(calls.length, 1);
  // A preexisting single-photo caller still works.
  await s.recommendTargets(profile, "legacy-single");
  assert.equal(calls[1].messages[1].content.length, 2);
  s.update({ model: "unknown-model" });
  s.consent(true, ["profile", "health-image"]);
  await assert.rejects(s.recommendTargets(profile, photos), {
    code: "image_unsupported",
  });
  assert.equal(calls.length, 2);
});

test("combined image bytes and single-image limits reject entire request without partial upload", async () => {
  let sent = 0;
  const s = new AiService(
    async () => {
      sent++;
      throw Error("must not send");
    },
    async () => ({
      mime: "image/jpeg",
      base64: Buffer.alloc(2_400_000).toString("base64"),
    }),
  );
  s.update({
    provider: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3-vl-plus",
    apiKey: "test",
  });
  s.consent(true, ["profile", "health-image"]);
  await assert.rejects(s.recommendTargets(profile, ["a", "b"]), {
    code: "image_total_size",
  });
  assert.equal(sent, 0);
  s.consent(true, ["profile"]);
  await assert.rejects(s.recommendTargets(profile, ["a"]), { code: "consent" });
  assert.equal(sent, 0);
});
