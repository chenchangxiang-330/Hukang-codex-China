/** Shared React Native presentation tests. Explicitly NOT an Android/native acceptance. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { servePreview } from "../scripts/ui-preview.mjs";
const out = path.resolve("artifacts/ui-v1");
await mkdir(out, { recursive: true });
await rm(path.join(out, "failure.png"), { force: true });
async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(filename)));
    else if (/\.(tsx?|mjs)$/.test(filename)) result.push(filename);
  }
  return result;
}
const inputs = [
  ...(await sourceFiles("src/features/simple")),
  ...(await sourceFiles("src/features/ui-v1")),
  ...(await sourceFiles("src/ui")),
  ...(await sourceFiles("tests/ui-preview")),
  "app.json",
  "scripts/ui-preview.mjs",
  "tests/ui-v1-browser.mjs",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    inputs.sort().map(async (filename) => [
      filename,
      createHash("sha256")
        .update(await readFile(filename))
        .digest("hex"),
    ]),
  ),
);
const server = await servePreview(4174);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "zh-CN",
  deviceScaleFactor: 1,
});
const report = {
  kind: "shared-react-native-web-ui",
  generatedAt: new Date().toISOString(),
  sourceHashes,
  mockedController: true,
  nativeBarcodeVerified: false,
  nativeOcrVerified: false,
  sqliteVerified: false,
  physicalDeviceVerified: false,
  checks: [],
  screenshots: [],
  errors: [],
  unexpectedNetwork: [],
};
context.on("request", (req) => {
  if (!new URL(req.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
    report.unexpectedNetwork.push(req.url());
});
await context.route("**/*", (route) => {
  if (new URL(route.request().url()).hostname === "127.0.0.1")
    return route.continue();
  return route.abort();
});
const page = await context.newPage();
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
async function open(scenario = "empty") {
  await page.goto(`http://127.0.0.1:4174/?scenario=${scenario}`);
  await page.waitForFunction(
    () => window.__HUKANG_UI_PREVIEW__?.mocked === true,
  );
}
async function screen(name) {
  // React Native Web Modal uses a short exit timer; capture the settled page.
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, name + ".png") });
  report.screenshots.push(name + ".png");
}
async function noHorizontalOverflow(label) {
  const offenders = await page.evaluate(() =>
    [...document.querySelectorAll("#root *")].flatMap((el) => {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      if (
        !r.width ||
        !r.height ||
        css.display === "none" ||
        css.visibility === "hidden" ||
        r.bottom <= 36 ||
        r.top >= innerHeight
      )
        return [];
      return r.left < -1 || r.right > innerWidth + 1
        ? [
            {
              tag: el.tagName,
              role: el.getAttribute("role"),
              text: (el.textContent || "").slice(0, 60),
              left: r.left,
              right: r.right,
            },
          ]
        : [];
    }),
  );
  expect(offenders, label).toEqual([]);
  report.checks.push(label);
}
try {
  for (const scenario of [
    "empty",
    "filled",
    "diary",
    "library",
    "stock",
    "mine",
    "scan",
    "denied",
    "package",
    "nutrition",
    "review",
    "product",
    "add-stock",
    "ai-settings",
    "about",
    "profile",
    "loading",
    "error",
  ]) {
    await open(scenario);
    await noHorizontalOverflow(
      `390dp ${scenario}: no visible horizontal clipping`,
    );
    await screen(scenario);
  }
  await open();
  await page.getByRole("tab", { name: "记录", exact: true }).click();
  await expect(
    page.getByText("饮食存储尚未接入", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "体验记录演示", exact: true }).click();
  await expect(
    page.getByText("演示模式 · 非真实饮食", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "添加午餐演示记录", exact: true })
    .click();
  await page.getByLabel("演示餐食名称", { exact: true }).fill("界面测试午餐");
  for (const [field, value] of [
    ["能量（kcal）", "125"],
    ["蛋白质（g）", "5"],
    ["脂肪（g）", "3"],
    ["碳水化合物（g）", "15"],
  ])
    await page.getByLabel(field, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "保留本次演示记录", exact: true })
    .click();
  await expect(page.getByText("425", { exact: true })).toBeVisible();
  await screen("diary-demo");
  await page
    .getByRole("button", { name: "编辑界面测试午餐", exact: true })
    .click();
  await page.getByLabel("能量（kcal）", { exact: true }).fill("130");
  await page
    .getByRole("button", { name: "保留本次演示记录", exact: true })
    .click();
  await expect(page.getByText("430", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "前一天", exact: true }).click();
  await expect(page.getByText("界面测试午餐", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "后一天", exact: true }).click();
  await expect(page.getByText("界面测试午餐", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "编辑界面测试午餐", exact: true })
    .click();
  await page
    .getByRole("button", { name: "删除这条演示记录", exact: true })
    .click();
  await expect(page.getByText("300", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "结束演示并清除", exact: true })
    .click();
  await expect(
    page.getByText("饮食存储尚未接入", { exact: true }),
  ).toBeVisible();
  report.checks.push(
    "Explicit diary demo: add/edit/date isolation/delete/end; no production persistence",
  );

  await open("ai-settings");
  await page.getByRole("button", { name: "检查连接配置", exact: true }).click();
  await expect(page.getByText(/请填写/).first()).toBeVisible();
  await page
    .getByLabel("API Base URL", { exact: true })
    .fill("http://invalid.example/v1");
  await page
    .getByLabel("API Key", { exact: true })
    .fill("ui-preview-not-real-key");
  await page.getByLabel("模型名称", { exact: true }).fill("preview-model");
  await page.getByRole("button", { name: "检查连接配置", exact: true }).click();
  await expect(page.getByText(/HTTPS/).first()).toBeVisible();
  await page
    .getByLabel("API Base URL", { exact: true })
    .fill("https://example.invalid/v1");
  await page.getByRole("button", { name: "检查连接配置", exact: true }).click();
  await expect(page.getByText(/配置格式已通过/)).toBeVisible();
  expect(
    await page.getByLabel("API Key", { exact: true }).getAttribute("type"),
  ).toBe("password");
  await screen("ai-local-validation");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await page.getByRole("tab", { name: "我的", exact: true }).click();
  await page.getByRole("button", { name: /^AI 服务设置/ }).click();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  report.checks.push(
    "AI settings: invalid/valid local validation, masked key, leave-page key cleared, no network request",
  );

  await open("library");
  await page
    .getByLabel("搜索食品名称或品牌", { exact: true })
    .fill("不存在的演示食品");
  await expect(
    page.getByText("暂时没有符合条件的食品", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "清除筛选与搜索", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "演示 · 纯牛奶", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "食品筛选：待确认", exact: true })
    .click();
  await expect(
    page.getByText("暂时没有符合条件的食品", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "食品筛选：全部", exact: true })
    .click();
  report.checks.push("Library search/filter empty-state and reset");

  await open();
  await page.getByRole("button", { name: "拍一拍", exact: true }).click();
  await page
    .getByLabel("条码数字（保留前导零）", { exact: true })
    .fill("6923644266066");
  await page.getByRole("button", { name: "查询本机食品", exact: true }).click();
  await expect(page.getByText("先记下它的样子", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "从相册选择包装", exact: true })
    .click();
  await page.getByLabel("商品名称", { exact: true }).fill("UI 模拟录入牛奶");
  await page
    .getByRole("button", { name: "下一步，拍营养表", exact: true })
    .click();
  await page
    .getByRole("button", { name: "从相册选择营养表", exact: true })
    .click();
  await page.getByLabel("商品名称", { exact: true }).fill("UI 模拟录入牛奶");
  await page.getByLabel("蛋白质含量", { exact: true }).fill("3.60");
  await page.getByRole("checkbox", { name: /我已对照照片/ }).click();
  await page
    .getByRole("button", { name: "确认并保存食品", exact: true })
    .click();
  await page.getByRole("button", { name: "加入我的库存", exact: true }).click();
  await page.getByLabel("本次购入数量", { exact: true }).fill("2");
  await page.getByRole("radio", { name: "瓶", exact: true }).click();
  await page.getByRole("button", { name: "确认加入库存", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__HUKANG_UI_PREVIEW__.stock[0]?.quantity),
    )
    .toBe(2);
  await screen("mock-flow-stock");
  report.checks.push(
    "Production presentation callbacks exercised with mock controller: manual input/capture/review/confirm/stock (NOT native barcode/OCR/SQLite proof)",
  );

  await page.setViewportSize({ width: 320, height: 760 });
  for (const scenario of [
    "empty",
    "library",
    "stock",
    "scan",
    "package",
    "review",
    "product",
    "add-stock",
    "ai-settings",
    "diary",
    "mine",
  ]) {
    await open(scenario);
    await noHorizontalOverflow(
      `320dp ${scenario}: no visible horizontal clipping`,
    );
  }
  await open();
  await screen("home-320");
  await page.setViewportSize({ width: 390, height: 844 });
  await open("product");
  await page.evaluate(() => {
    const textNodes = [...document.querySelectorAll("#root *")].filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
    );
    const sizes = textNodes.map((el) => ({
      el,
      font: parseFloat(getComputedStyle(el).fontSize),
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    for (const { el, font, line } of sizes) {
      el.style.fontSize = font * 1.4 + "px";
      if (Number.isFinite(line)) el.style.lineHeight = line * 1.4 + "px";
    }
  });
  await noHorizontalOverflow(
    "390dp product enlarged text approximation: no visible horizontal clipping",
  );
  await screen("product-enlarged-text");
  expect(report.errors).toEqual([]);
  expect(report.unexpectedNetwork).toEqual([]);
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.failure = String(error);
  await screen("failure");
  throw error;
} finally {
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      failure: report.failure,
    }),
  );
}
