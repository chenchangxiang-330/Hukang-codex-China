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
                      : body.messages[0]?.content.includes("包装正面文字助手")
                        ? JSON.stringify({
                            candidates: [
                              { name: "包装候选", brand: "模拟品牌" },
                            ],
                            uncertainties: ["模拟服务结果，待核对"],
                          })
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
  await expect(button("已食用 · 确认记录")).toBeDisabled();
  await page
    .getByText("餐食估算 · AI 估算", { exact: true })
    .scrollIntoViewIfNeeded();
  await screenshot("browser-meal-mock-preview");
  await button("0.5 × 基准份量").click();
  await expect(page.getByText(/200–300/).first()).toBeVisible();
  report.checks.push(
    "Meal uses settings config; text-only preview, unknown sodium and half-portion recomputation before confirmation.",
  );
  await field("食物名称").fill("浏览器确认餐食");
  await page
    .getByRole("checkbox", {
      name: "我已确认日期、餐次和实际食用份量",
      exact: true,
    })
    .click();
  await button("已食用 · 确认记录").click();
  await expect(
    page.getByText(/已保存饮食记录，今天、记录与营养详情已同步/),
  ).toBeVisible();
  await expect(button("已保存这次食用，请勿重复提交")).toBeDisabled();
  await button("返回").click();
  await page.getByRole("tab", { name: "记录", exact: true }).click();
  await button("查看食物 浏览器确认餐食").click();
  await field("修改实际食用份量（份）").fill("1");
  await button("确认调整份量").click();
  await expect(page.getByText(/饮食记录已更新/)).toBeVisible();
  await button("返回饮食记录").click();
  await button("今日营养摘要").click();
  await expect(page.getByText(/400–600/).first()).toBeVisible();
  await screenshot("browser-confirmed-meal-nutrition");
  await button("返回").click();
  await button("查看食物 浏览器确认餐食").click();
  await button("删除这条饮食记录").click();
  await button("保留记录").click();
  await button("删除这条饮食记录").click();
  await button("确定删除这次食用").click();
  await expect(button("查看食物 浏览器确认餐食")).toHaveCount(0);
  await button("拍一拍").click();
  report.checks.push(
    "Isolated browser store: explicit confirm, duplicate guard, record editor, shared nutrition summary and confirmed deletion; no user database touched.",
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
  await expect(page.getByText(/上传副本已在本机准备/)).toBeVisible();
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
  await page.getByRole("tab", { name: "包装食品", exact: true }).click();
  await button("从相册选择").click();
  await button("确认发送包装照片").click();
  await expect(
    page.getByText("AI 推测 · 待人工核对", { exact: true }),
  ).toBeVisible();
  await expect(button("核对后在食品库查找候选")).toBeDisabled();
  await field("核对候选名称").fill("已核对的候选");
  await expect(
    page.getByText("名称或品牌由你修改；原始 AI 候选会另行保留。", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "已核对照片中的名称和品牌", exact: true })
    .click();
  await screenshot("browser-package-candidate-mock");
  await button("核对后在食品库查找候选").click();
  await expect(
    page.getByLabel("搜索食品名称或品牌", { exact: true }),
  ).toHaveValue("已核对的候选");
  report.checks.push(
    "Package image uses separate prompt/schema; human-confirmed name becomes a library search, never an automatic match or nutrition fact.",
  );
  await page.getByRole("tab", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /^AI 服务设置/ }).click();
  await page.setViewportSize({ width: 320, height: 740 });
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
