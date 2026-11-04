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
  for (const k of ["蛋白质", "今日卡路里", "脂肪", "膳食纤维"]) {
    await expect(page.getByTestId(`nutrient-${k}`)).toBeVisible();
    await expect(page.getByTestId(`nutrient-track-${k}`)).toBeVisible();
    await expect(page.getByTestId(`nutrient-fill-${k}`)).toHaveCount(0);
  }
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByText("目标设置：我的 → 个人参考目标")).toBeVisible();
  await expect(button("个人参考目标")).toHaveCount(0);
  await shot("browser-home-empty");
  await button("查看完整营养").click();
  await expect(
    page.getByRole("heading", { name: "营养详情", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "矿物质，展开", exact: true }).click();
  await page.getByRole("button", { name: /^钠，/ }).click();
  await expect(page.getByText(/个人参考待完善/).first()).toBeVisible();
  await shot("browser-nutrition-minerals");
  await button("返回").click();
  await button("查看完整营养").click();
  await expect(
    page.getByRole("button", { name: "矿物质，展开", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^钠，/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await button("返回").click();
  await button("拍一拍").click();
  await expect(button("餐食估算")).toBeVisible();
  await expect(button("文字描述")).toHaveCount(0);
  await expect(button("手动填写")).toHaveCount(0);
  await shot("browser-two-entries");
  await button("餐食估算").click();
  await expect(page.getByLabel("餐食补充描述", { exact: true })).toHaveCount(1);
  await expect(button("估算这餐营养")).toHaveAttribute("aria-disabled", "true");
  await shot("browser-meal-photo-required");
  await page.getByLabel("餐食补充描述", { exact: true }).fill("半份米饭");
  await button("返回").click();
  await button("餐食估算").click();
  await expect(page.getByLabel("餐食补充描述", { exact: true })).toHaveValue(
    "半份米饭",
  );
  await button("返回").click();
  await button("包装食品").click();
  await expect(
    page.getByLabel("条码数字（保留前导零）", { exact: true }),
  ).toBeVisible();
  await button("返回").click();
  report.checks.push(
    "Four ordered metrics, true empty data, two entry paths, photo required, one text box and retained draft",
  );
  for (const [scenario, expectedFill, label] of [
    ["nutrition-empty", null, "尚未记录"],
    ["protein-unset", null, "未设置目标"],
    ["protein-partial", null, "已知小计 · 数据不完整"],
    ["protein-unknown", null, "未知"],
    ["protein-range", null, "40–60"],
    ["protein-confirmed", 0.5, "50"],
    ["protein-zero", 0, "0"],
    ["protein-exceeded", 1, "超出目标 20 g"],
    ["protein-estimated", 0.5, "约 50"],
  ]) {
    await open(scenario);
    const row = page.getByTestId("nutrient-蛋白质"),
      track = page.getByTestId("nutrient-track-蛋白质"),
      fill = page.getByTestId("nutrient-fill-蛋白质");
    await expect(track).toBeVisible();
    await expect(row).toContainText(label);
    if (expectedFill === null) {
      await expect(fill).toHaveCount(0);
      await expect(track).not.toHaveAttribute("role", "progressbar");
      await expect(track).toHaveAttribute("aria-label", /暂不计算进度/);
      await expect(row).not.toContainText(/\d+%/);
    } else {
      await expect(track).toHaveAttribute("role", "progressbar");
      await expect(fill).toHaveCount(1);
      await expect
        .poll(async () =>
          fill.evaluate(
            (el) =>
              el.getBoundingClientRect().width /
              el.parentElement.getBoundingClientRect().width,
          ),
        )
        .toBeCloseTo(expectedFill, 2);
    }
    await shot(`browser-progress-${scenario}`);
    report.checks.push(`Nutrition tracks remain visible: ${scenario}`);
  }
  await open("demo");
  await tab("记录").click();
  await button("查看食物 纯牛奶").click();
  await page.getByLabel("修改实际食用份量（mL）", { exact: true }).fill("125");
  await button("确认调整份量").click();
  await expect(page.getByText(/演示份量已更新/)).toBeVisible();
  await button("返回饮食记录").click();
  await expect(page.getByText("1205 kcal", { exact: true })).toBeVisible();
  await tab("今日").click();
  await expect(page.getByTestId("nutrient-今日卡路里")).toContainText("1205");
  await shot("browser-home-isolated-data");
  await button("查看完整营养").click();
  await expect(
    page.getByRole("button", { name: "能量，1205 kcal", exact: true }),
  ).toBeVisible();
  await button("返回").click();
  await tab("记录").click();
  await button("‹ 前一天").click();
  await button("今日营养摘要").click();
  await expect(page.getByText(/2026年10月25日/)).toBeVisible();
  await button("返回").click();
  await expect(
    page.getByRole("radio", { name: "2026-10-25", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  report.checks.push(
    "Shared totals after portion edit, history date propagation and preserved return date",
  );
  await open("demo");
  await button("拍一拍").click();
  await button("餐食估算").click();
  await button("拍照").click();
  await page.getByLabel("餐食补充描述", { exact: true }).fill("半份面条");
  await button("估算这餐营养").click();
  await expect(button("确认食用")).toHaveCount(0);
  await button("吃半份").click();
  await shot("browser-portion-preview");
  await page
    .getByRole("checkbox", {
      name: "我已确认日期、餐次和实际食用份量",
      exact: true,
    })
    .click();
  await button("确认食用").click();
  await expect(
    page.getByText("演示记录已更新，未写入真实数据。", { exact: true }),
  ).toBeVisible();
  await shot("browser-isolated-confirmed");
  report.checks.push(
    "Valid portion required before confirmation; deterministic preview then one successful save",
  );
  await page.setViewportSize({ width: 320, height: 760 });
  for (const scenario of [
    "empty",
    "demo",
    "protein-partial",
    "protein-unknown",
    "protein-exceeded",
  ]) {
    await open(scenario);
    await unclipped(`320dp ${scenario} four metrics`);
    await shot(`browser-320-${scenario}`);
  }
  await tab("我的").click();
  await button("个人参考目标").click();
  await expect(page.getByText("个人参考目标", { exact: true })).toBeVisible();
  await shot("browser-goals");
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
