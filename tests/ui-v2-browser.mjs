/** Actual shared RN component rendering. Native camera/OCR/SQLite remain explicit test doubles. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { servePreview } from "../scripts/ui-preview.mjs";
const out = path.resolve("artifacts/nutrition-ui-v2");
await mkdir(out, { recursive: true });
const server = await servePreview(4175),
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-CN",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  }),
  page = await context.newPage();
const report = {
  kind: "shared-react-native-web",
  nativeDeviceVerified: false,
  cameraOcrSqliteMocked: true,
  generatedAt: new Date().toISOString(),
  checks: [],
  screenshots: [],
  errors: [],
  externalRequests: [],
};
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("dialog", (d) => d.accept());
await context.route("**/*", (r) => {
  if (new URL(r.request().url()).hostname === "127.0.0.1") return r.continue();
  report.externalRequests.push(r.request().url());
  return r.abort();
});
const button = (name) => page.getByRole("button", { name, exact: true }),
  tab = (name) => page.getByRole("tab", { name, exact: true });
async function open(scenario = "empty") {
  await page.goto(`http://127.0.0.1:4175/?scenario=${scenario}`);
  await page.waitForFunction(() => window.__HUKANG_UI_PREVIEW__?.mocked);
}
async function shot(name) {
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  report.screenshots.push(name + ".png");
}
async function top() {
  await page.evaluate(() => {
    document.querySelectorAll("#root *").forEach((el) => {
      if (
        el.scrollHeight > el.clientHeight &&
        getComputedStyle(el).overflowY === "auto"
      )
        el.scrollTop = 0;
    });
  });
}
async function unclipped(label) {
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll("#root *")].flatMap((el) => {
      const r = el.getBoundingClientRect(),
        css = getComputedStyle(el);
      if (
        !r.width ||
        !r.height ||
        r.bottom <= 36 ||
        r.top >= innerHeight ||
        css.display === "none"
      )
        return [];
      let p = el.parentElement;
      while (p && p.id !== "root") {
        if (
          ["auto", "scroll", "hidden"].includes(getComputedStyle(p).overflowX)
        )
          return [];
        p = p.parentElement;
      }
      return r.left < -1 || r.right > innerWidth + 1
        ? [{ text: el.textContent?.slice(0, 45), left: r.left, right: r.right }]
        : [];
    }),
  );
  expect(bad, label).toEqual([]);
  report.checks.push(label);
}
try {
  await open();
  await expect(page.getByText(/2000 kcal|1285/)).toHaveCount(0);
  await button("查看完整营养").click();
  await expect(
    page.getByRole("heading", { name: "今日营养", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^碳水化合物，/ }).click();
  await expect(
    page.getByText("理想参考 < 25g　｜　建议上限 50g", { exact: true }),
  ).toBeVisible();
  await button("返回").click();
  await button("拍一拍").click();
  await button("估算这餐营养").click();
  await expect(
    page.getByText("请填写这一餐的文字描述，或在支持图片时勾选发送照片。", {
      exact: true,
    }),
  ).toBeVisible();
  await button("从相册选择").click();
  await page
    .getByLabel("餐食补充描述", { exact: true })
    .fill("牛肉鸡蛋面，一个鸡蛋，面条吃了一半，没有喝汤");
  await button("估算这餐营养").click();
  await expect(
    page.getByText(/请先在 AI 服务设置中填写有效地址/),
  ).toBeVisible();
  await button("返回").click();
  await button("拍一拍").click();
  await expect(page.getByLabel("餐食补充描述", { exact: true })).toHaveValue(
    "牛肉鸡蛋面，一个鸡蛋，面条吃了一半，没有喝汤",
  );
  report.checks.push(
    "Production empty / targets unset / missing sugar / photo+text retained / AI requires valid configuration, no fictional result",
  );
  await tab("包装食品").click();
  await expect(page.getByText(/这不表示食品库没有同款/)).toBeVisible();
  await button("扫描 / 输入条码").click();
  await expect(
    page.getByLabel("条码数字（保留前导零）", { exact: true }),
  ).toBeVisible();
  await button("返回").click();
  await tab("食品库").click();
  await expect(
    page.getByRole("heading", { name: "我的食品库", exact: true }),
  ).toBeVisible();
  await tab("我的").click();
  await button("导出食品资料包").click();
  await expect(page.getByText(/浏览器预览不生成真实食品导出/)).toBeVisible();
  report.checks.push(
    "Both capture routes and all four tabs; existing scanner and export callbacks",
  );
  await open("demo");
  await tab("记录").click();
  await button("查看食物 纯牛奶").click();
  await page.getByLabel("修改实际食用份量（mL）", { exact: true }).fill("125");
  await button("确认调整份量").click();
  await expect(page.getByText(/演示份量已更新/)).toBeVisible();
  await button("返回饮食记录").click();
  await expect(page.getByText("1205 kcal", { exact: true })).toBeVisible();
  await tab("今日").click();
  await expect(page.getByText("1205 kcal", { exact: true })).toBeVisible();
  await button("查看完整营养").click();
  await expect(page.getByText("1205 kcal", { exact: true })).toBeVisible();
  await button("返回").click();
  await tab("记录").click();
  await button("‹ 前一天").click();
  await button("今日营养摘要").click();
  await expect(page.getByText("2026年10月25日", { exact: true })).toBeVisible();
  await button("返回").click();
  await expect(
    page.getByRole("radio", { name: "2026-10-25", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  report.checks.push(
    "Portion recalculates today/diary/detail; same-date navigation, return and date isolation",
  );
  await open("demo");
  await button("拍一拍").click();
  await button("拍照").click();
  await page
    .getByLabel("餐食补充描述", { exact: true })
    .fill("面条一半，没喝汤");
  await button("估算这餐营养").click();
  await expect(
    page.getByText("餐食估算 · 演示结果", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("实际食用份量（份）", { exact: true }).fill("0.5");
  await expect(page.getByText("260–350 kcal", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "我已确认日期、餐次和实际食用份量",
      exact: true,
    })
    .click();
  await button("已食用 · 确认记录").click();
  await expect(button("已记入演示，勿重复提交")).toBeDisabled();
  await button("返回").click();
  await expect(page.getByText("1545–1635 kcal", { exact: true })).toBeVisible();
  report.checks.push(
    "Meal estimate uses ranges; quantity scales ranges, confirmation synchronizes totals and prevents duplicate submission",
  );
  await open("demo");
  await button("拍一拍").click();
  await tab("包装食品").click();
  await button("体验包装结果（演示数据）").click();
  await expect(page.getByText(/整包净含量 250g.*每份 25g/)).toBeVisible();
  await page.getByRole("radio", { name: "份量单位 g", exact: true }).click();
  await page.getByLabel("实际食用份量（g）", { exact: true }).fill("25");
  await expect(page.getByText("147.7 kcal", { exact: true })).toBeVisible();
  await button("加入库存 · 不计摄入").click();
  await button("确认模拟入库").click();
  await button("确认模拟入库").click();
  await expect(
    page.getByText("这笔模拟入库已确认，没有重复提交。", { exact: true }),
  ).toBeVisible();
  await button("返回").click();
  await expect(page.getByText("1285 kcal", { exact: true })).toBeVisible();
  report.checks.push(
    "Package size differs from serving; raw kJ converts once; demo stock remains isolated from intake and real stock",
  );
  await open("exceeded");
  await expect(page.getByText(/添加糖已知小计已超参考上限 10 g/)).toBeVisible();
  await shot("added-sugar-exceeded-390");
  report.checks.push(
    "Known added-sugar subtotal over limit stays qualified by missing data",
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 760 });
    await open();
    await unclipped(`${width}dp empty today`);
    await shot(`today-empty-${width}`);
    await button("查看完整营养").click();
    await unclipped(`${width}dp missing nutrition`);
    await shot(`nutrition-missing-${width}`);
    await open("demo");
    await unclipped(`${width}dp today`);
    await shot(`today-${width}`);
    await tab("记录").click();
    await unclipped(`${width}dp diary`);
    await shot(`diary-${width}`);
    await button("今日营养摘要").click();
    await unclipped(`${width}dp nutrition`);
    await shot(`nutrition-${width}`);
    await page.getByRole("button", { name: /^碳水化合物，/ }).click();
    await page.getByText("添加糖", { exact: true }).scrollIntoViewIfNeeded();
    await shot(`nutrition-added-sugar-${width}`);
    await page.getByRole("button", { name: /^碳水化合物，/ }).click();
    await expect(page.getByText("添加糖", { exact: true })).toHaveCount(0);
    await button("返回").click();
    await button("拍一拍").click();
    await top();
    await unclipped(`${width}dp meal capture`);
    await shot(`capture-meal-${width}`);
    await button("从相册选择").click();
    await page
      .getByLabel("餐食补充描述", { exact: true })
      .fill("一份面，鸡蛋一个，没喝汤");
    await button("估算这餐营养").click();
    await page
      .getByText("餐食估算 · 演示结果", { exact: true })
      .scrollIntoViewIfNeeded();
    await unclipped(`${width}dp meal result`);
    await shot(`meal-result-${width}`);
    await tab("包装食品").click();
    await top();
    await unclipped(`${width}dp package capture`);
    await shot(`capture-package-${width}`);
    await button("体验包装结果（演示数据）").click();
    await page
      .getByText("演示 · 混合坚果", { exact: true })
      .scrollIntoViewIfNeeded();
    await unclipped(`${width}dp package result`);
    await shot(`package-result-${width}`);
  }
  await page.setViewportSize({ width: 320, height: 760 });
  await open("demo");
  await page.evaluate(() => {
    const els = [...document.querySelectorAll("#root *")].filter((e) =>
      [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
    );
    const sizes = els.map((el) => ({
      el,
      font: parseFloat(getComputedStyle(el).fontSize),
      line: parseFloat(getComputedStyle(el).lineHeight),
    }));
    for (const { el, font, line } of sizes) {
      el.style.fontSize = font * 1.4 + "px";
      if (Number.isFinite(line)) el.style.lineHeight = line * 1.4 + "px";
    }
  });
  await unclipped("320dp enlarged text approximation");
  await shot("today-fontscale-320");
  expect(report.errors).toEqual([]);
  expect(report.externalRequests).toEqual([]);
  report.status = "passed";
} catch (e) {
  report.status = "failed";
  report.failure = String(e);
  await shot("failure");
  throw e;
} finally {
  await writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      screenshots: report.screenshots.length,
      failure: report.failure,
    }),
  );
}
