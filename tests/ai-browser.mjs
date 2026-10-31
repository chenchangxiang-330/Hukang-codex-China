/** Shared production AI service + real RN screens; HTTP model responses are simulated. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { servePreview } from "../scripts/ui-preview.mjs";
const out = "artifacts/ai-api/browser";
await mkdir(out, { recursive: true });
const server = await servePreview(4177);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  locale: "zh-CN",
});
const report = {
  kind: "browser-shared-RN-UI-mock-HTTP",
  liveProviderTested: false,
  nativeDevice: false,
  checks: [],
  screenshots: [],
  errors: [],
};
const requests = [];
let mode = "ok",
  release;
const meal = {
  name: "鸡蛋面（模拟服务响应）",
  ingredients: ["鸡蛋", "面条"],
  uncertainties: ["未说明用油量"],
  nutrients: {
    energy: { value: null, range: [400, 600] },
    protein: { value: 20 },
    carbohydrate: { value: 55 },
    fat: { value: null, range: [10, 20] },
    sodium: { value: null },
  },
};
const completion = (text, model) => ({
  model,
  choices: [
    { finish_reason: "stop", message: { role: "assistant", content: text } },
  ],
});
page.on("pageerror", (e) => report.errors.push(e.message));
await page.route("**/*", async (route) => {
  const request = route.request();
  if (new URL(request.url()).hostname === "127.0.0.1") return route.continue();
  if (request.method() === "OPTIONS")
    return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "POST",
      },
    });
  const body = request.postDataJSON();
  requests.push({ url: request.url(), body }); // No request headers or credentials retained in artifacts.
  const replyMode = mode;
  if (replyMode === "pending")
    await new Promise((resolve) => {
      release = resolve;
    });
  try {
    await route.fulfill({
      status: replyMode === "auth" ? 401 : replyMode === "rate" ? 429 : 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body:
        replyMode === "malformed"
          ? "{}"
          : JSON.stringify(
              replyMode === "auth" || replyMode === "rate"
                ? { error: { message: "mock failure" } }
                : completion(
                    body.messages.length === 1
                      ? "OK · 模拟服务"
                      : JSON.stringify(meal),
                    body.model,
                  ),
            ),
    });
  } catch {
    /* cancelled browser request */
  }
});
const button = (name) => page.getByRole("button", { name, exact: true });
const field = (name) => page.getByLabel(name, { exact: true });
const consent = () =>
  page.getByRole("checkbox", {
    name: "我了解发送内容、服务地址及可能产生的费用",
    exact: true,
  });
async function screenshot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  report.screenshots.push(name + ".png");
}
async function configure(base = "https://mock.example/v1", model = "model-a") {
  await field("API Base URL").fill(base);
  await field("API Key").fill("non-secret-test-fixture");
  await field("模型名称").fill(model);
  await consent().click();
}
try {
  await page.goto("http://127.0.0.1:4177/?scenario=ai-settings");
  await button("检查连接配置").click();
  await expect(page.getByText(/请填写/).first()).toBeVisible();
  expect(requests).toHaveLength(0);
  await configure();
  expect(requests).toHaveLength(0);
  await button("检查连接配置").click();
  await expect(
    page.getByText("连接成功，已收到有效模型响应。", { exact: true }),
  ).toBeVisible();
  await expect(field("API Key")).toHaveValue("");
  expect(requests[0].url).toBe("https://mock.example/v1/chat/completions");
  await page.getByText("连接状态", { exact: true }).scrollIntoViewIfNeeded();
  await screenshot("browser-settings-mock-success");
  report.checks.push(
    "Explicit minimal test succeeds only after valid model content; actual endpoint/model visible; key masked and not reloaded.",
  );
  await button("返回").click();
  await button("拍一拍").click();
  await field("餐食补充描述").fill("一碗鸡蛋面，半份面条");
  await button("估算这餐营养").click();
  await expect(
    page.getByText("餐食估算 · AI 估算", { exact: true }),
  ).toBeVisible();
  expect(requests.at(-1).body.model).toBe("model-a");
  expect(requests.at(-1).body.messages[1].content).toContain("半份面条");
  await expect(page.getByText(/仅基于文字描述，未识别照片/)).toBeVisible();
  await expect(button("饮食存储未接入 · 仅预览")).toBeDisabled();
  await page
    .getByText("餐食估算 · AI 估算", { exact: true })
    .scrollIntoViewIfNeeded();
  await screenshot("browser-meal-mock-preview");
  await button("0.5 × 基准份量").click();
  await expect(page.getByText(/200–300/).first()).toBeVisible();
  report.checks.push(
    "Meal uses settings config; text-only preview, unknown sodium, half-portion recomputation; no production storage action.",
  );
  await button("配置 AI 服务").click();
  await expect(field("API Key")).toHaveValue("");
  await field("模型名称").fill("model-b");
  await consent().click();
  await button("返回").click();
  await button("估算这餐营养").click();
  await expect(page.getByText(/model-b。仅在当前页面预览/)).toBeVisible();
  expect(requests.at(-1).body.model).toBe("model-b");
  await button("从相册选择").click();
  await expect(page.getByText(/照片仅保留/)).toBeVisible();
  await button("估算这餐营养").click();
  await expect(page.getByText(/未识别照片/)).toBeVisible();
  expect(typeof requests.at(-1).body.messages[1].content).toBe("string");
  report.checks.push(
    "Changed model used by next meal; unsupported/custom vision never uploads photo.",
  );
  await button("配置 AI 服务").click();
  for (const [failure, message] of [
    ["auth", /密钥无效/],
    ["rate", /请求过于频繁/],
    ["malformed", /模型响应格式异常/],
  ]) {
    mode = failure;
    const before = requests.length;
    await button("检查连接配置").click();
    await expect(page.getByText(message)).toBeVisible();
    expect(requests).toHaveLength(before + 1);
    await expect(page.getByText("已连接", { exact: true })).toHaveCount(0);
  }
  await screenshot("browser-settings-auth-rate-format");
  mode = "pending";
  const before = requests.length;
  await button("检查连接配置").click();
  await expect(button("正在连接模型…")).toBeDisabled();
  await expect.poll(() => requests.length).toBe(before + 1);
  await button("取消连接测试").click();
  await expect(page.getByText(/已取消等待/)).toBeVisible();
  release();
  mode = "ok";
  await button("清除临时配置").click();
  await button("返回").click();
  await button("估算这餐营养").click();
  await expect(
    page.getByText(/请先在 AI 服务设置中填写有效地址/),
  ).toBeVisible();
  expect(requests).toHaveLength(before + 1);
  report.checks.push(
    "Authentication/rate/malformed responses fail visibly once; cancel restores controls; clear prevents reuse of old credentials.",
  );
  await button("配置 AI 服务").click();
  await page.getByRole("radio", { name: "通义千问", exact: true }).click();
  await field("API Key").fill("non-secret-test-fixture");
  await consent().click();
  await button("返回").click();
  await page
    .getByRole("checkbox", { name: "同时发送这张餐食照片", exact: true })
    .click();
  await button("估算这餐营养").click();
  await expect(page.getByText(/基于本次描述与照片/)).toBeVisible();
  expect(requests.at(-1).url).toBe(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  );
  expect(
    requests
      .at(-1)
      .body.messages[1].content[1].image_url.url.startsWith(
        "data:image/jpeg;base64,",
      ),
  ).toBe(true);
  expect(requests.at(-1).body.enable_thinking).toBe(false);
  report.checks.push(
    "Known official vision model sends image only after opt-in using documented multimodal payload (provider response mocked).",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await button("配置 AI 服务").click();
  await field("API Base URL").scrollIntoViewIfNeeded();
  await screenshot("browser-ai-settings-320");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    320,
  );
  expect(report.errors).toEqual([]);
  report.requestCount = requests.length;
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.errors.push(String(error));
  await screenshot("failure");
  throw error;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
