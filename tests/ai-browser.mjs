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
page.setDefaultTimeout(30_000);
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
                      : body.messages[0]?.content.includes(
                            "饮食记录参考目标助手",
                          )
                        ? JSON.stringify({
                            policies: {
                              protein: {
                                type: "target",
                                value: 80,
                                unit: "g",
                                source: "模拟服务",
                                basis: "隔离测试资料",
                                applicability: "仅测试",
                              },
                            },
                            missing: ["微量元素资料不足"],
                          })
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
async function screenshot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
  report.screenshots.push(name + ".png");
}
try {
  await page.goto("http://127.0.0.1:4177/?scenario=ai-settings");
  await field("API Key").fill("non-secret-test-fixture");
  await page
    .getByRole("checkbox", { name: "同意本次连接测试", exact: true })
    .click();
  for (const name of [
    "餐食照片与描述：估算营养",
    "个人资料：推荐营养目标",
    "体检照片（可选）：辅助目标推荐",
    "包装与营养表照片：读取包装信息",
  ])
    await page.getByRole("checkbox", { name, exact: true }).check();
  await button("保存连接").click();
  await expect(
    page.getByText("连接已验证并安全保存。", { exact: true }),
  ).toBeVisible();
  await expect(field("API Key")).toHaveValue("");
  expect(requests[0].url).toBe("https://api.deepseek.com/chat/completions");
  await screenshot("browser-saved-connection");
  await button("返回").click();
  await page.getByRole("tab", { name: "我的", exact: true }).click();
  await button("个人参考目标").click();
  await button("个人资料与目标推荐").click();
  for (const [label, value] of [
    ["年龄（岁）", "30"],
    ["身高（cm）", "170"],
    ["体重（kg）", "65"],
    ["运动状况", "无"],
    ["每周运动频率（次/周）", "0"],
  ])
    await field(label).fill(value);
  const beforePhotos = requests.length;
  await button("从相册选择").click();
  await expect(button("预览体检照片 2")).toBeVisible();
  await button("从相册选择").click();
  await expect(button("预览体检照片 4")).toBeVisible();
  await button("删除照片 2").click();
  await expect(button("预览体检照片 4")).toHaveCount(0);
  await button("预览体检照片 1").click();
  await button("关闭照片预览").click();
  expect(requests.length).toBe(beforePhotos);
  await screenshot("browser-profile-multiple-photos");
  await button("生成目标草案").click();
  await expect(page.getByText("目标草案", { exact: true })).toBeVisible();
  await expect(field("年龄（岁）")).not.toBeVisible();
  const request = requests.at(-1).body.messages[1].content;
  expect(JSON.parse(request[0].text).heightCm).toBe(170);
  expect(request.filter((p) => p.type === "image_url")).toHaveLength(3);
  await screenshot("browser-target-draft");
  const generatedCount = requests.length;
  await button("返回").click();
  await expect(field("身高（cm）")).toHaveValue("170");
  await expect(button("预览体检照片 3")).toBeVisible();
  await field("体重（kg）").fill("66");
  await button("返回").click();
  await expect(button("查看目标草案")).toHaveCount(0);
  expect(requests.length).toBe(generatedCount);
  await expect(page.getByText("尚未设置目标", { exact: true })).toBeVisible();
  await button("个人资料与目标推荐").click();
  await expect(field("体重（kg）")).toHaveValue("66");
  await button("生成目标草案").click();
  await expect(page.getByText("目标草案", { exact: true })).toBeVisible();
  await button("确认应用目标").click();
  await expect(page.getByText(/目标 80 g/)).toBeVisible();
  await page
    .getByRole("button", { name: "手动修改目标，编辑", exact: true })
    .click();
  await field("目标或下限（g）").fill("90");
  await button("保存目标修改").click();
  await expect(page.getByText(/目标 90 g/)).toBeVisible();
  await screenshot("browser-manual-target");
  await button("返回").click();
  await page.getByRole("tab", { name: "今日", exact: true }).click();
  await button("拍一拍").click();
  await button("餐食估算").click();
  await button("从相册选择").click();
  await field("餐食补充描述").fill("一碗面，少油");
  const initial = requests.length;
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(button("前往 AI 设置")).toHaveCount(0);
  await button("估算这餐营养").click();
  await expect(page.getByText("AI 估算 · 1 份", { exact: true })).toBeVisible();
  expect(requests.length).toBe(initial + 1);
  expect(requests.at(-1).body.messages[1].content[1].type).toBe("image_url");
  await expect(page.getByText("碳水化合物", { exact: true })).toBeVisible();
  await expect(button("吃半份")).toHaveCount(0);
  await expect(button("自己填写吃多少")).toHaveCount(0);
  await expect(button("吃一份")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await field("食用时间").fill("12:34");
  await field("食用日期").fill("2026-11-09");
  await screenshot("browser-meal-model-preview");
  await page
    .getByRole("button", { name: "核对或修改营养数值，编辑", exact: true })
    .click();
  await field("蛋白质（g / 基准）").fill("21");
  await button("核对或修改营养数值，编辑").click();
  await button("确认保存").click();
  await expect(
    page.getByText("已保存这次食用。", { exact: true }),
  ).toBeVisible();
  await expect(button("已保存")).toHaveAttribute("aria-disabled", "true");
  await button("返回").click();
  await page.getByRole("tab", { name: "我的", exact: true }).click();
  await button("AI 服务设置").click();
  await expect(field("API Key")).toHaveValue("");
  await button("地址与模型").click();
  await field("模型名称").fill("deepseek-pro");
  await page
    .getByRole("checkbox", { name: "同意本次连接测试", exact: true })
    .click();
  mode = "auth";
  await button("保存连接").click();
  await expect(page.getByText(/密钥无效或已失效/)).toBeVisible();
  await expect(page.getByText(/最近验证.*deepseek-flash/)).toBeVisible();
  mode = "rate";
  await button("保存连接").click();
  await expect(page.getByText(/请求过于频繁/)).toBeVisible();
  mode = "malformed";
  await button("保存连接").click();
  await expect(page.getByText(/响应格式异常/)).toBeVisible();
  mode = "pending";
  await button("保存连接").click();
  await expect(button("正在验证与保存…")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await button("取消").click();
  release?.();
  await expect(page.getByText(/已取消等待|配置已改变/)).toBeVisible();
  await button("连接详情与管理").click();
  await button("删除已保存连接").click();
  await expect(page.getByText("已删除连接。", { exact: true })).toBeVisible();
  await expect(
    page.getByText("连接状态 · 未连接", { exact: true }),
  ).toBeVisible();
  await screenshot("browser-deleted-connection");
  report.checks.push(
    "Verified secure-save boundary, all profile inputs, structured draft then confirmation, manual override, persistent scoped grants, multi-photo append/delete/all-image request, independent draft screen and invalidation, one-serving direct meal save, failed drafts retain active config, auth/rate/malformed/cancel/delete states",
  );
  expect(report.errors).toEqual([]);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.errors.push(String(error));
  await screenshot("failure");
  throw error;
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify(report, null, 2));
