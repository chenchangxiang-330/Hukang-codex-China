/** TEST ONLY. The screens below are production components with an injected fake controller. */
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { SimpleAppView } from "../../src/features/simple/SimpleApp";
import { DemoNutritionAdapter } from "./nutrition-demo";
import { setPreviewStore } from "./store-shim";
import { normalizeBarcode } from "../../src/domain/barcode/normalize";

const scenario =
  new URLSearchParams(location.search).get("scenario") ?? "empty";
const barcode = normalizeBarcode({
  rawValue: "6923644266066",
  format: "EAN_13",
  decodedAt: "2026-10-26T04:00:00Z",
});
const rows = [
  {
    nutrient: "energy",
    label: "能量",
    amount: "309",
    unit: "kJ",
    nrvPercent: "4",
  },
  {
    nutrient: "protein",
    label: "蛋白质",
    amount: "3.6",
    unit: "g",
    nrvPercent: "6",
  },
  { nutrient: "fat", label: "脂肪", amount: "4.4", unit: "g", nrvPercent: "7" },
  {
    nutrient: "carbohydrate",
    label: "碳水化合物",
    amount: "5.0",
    unit: "g",
    nrvPercent: "2",
  },
  {
    nutrient: "sodium",
    label: "钠",
    amount: "58",
    unit: "mg",
    nrvPercent: "3",
  },
].map((row) => ({ ...row, nrvNotDeclared: false, reviewed: true }));
const reviewValue = {
  name: "演示 · 纯牛奶",
  brand: "界面测试品牌",
  specification: "250 mL",
  ingredients: "生牛乳（演示录入）",
  columns: [
    {
      id: "column-preview",
      basisKind: "per_100ml",
      basisRawText: "每100mL",
      servingAmount: "",
      servingUnit: "unknown",
      servingSizeNotDeclared: false,
      reviewed: true,
      rows,
    },
  ],
};
const image = {
  uri: "/assets/archived-milk.jpg",
  originalUri: "/assets/archived-milk.jpg",
  width: 1280,
  height: 1700,
  sourceImageHash: "preview-not-ocr-proof",
  processedImageHash: "preview-not-ocr-proof",
  sourceOrientation: 1,
  transform: {
    matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    operations: [],
    originalWidth: 1280,
    originalHeight: 1700,
  },
};
const evidence = {
  schemaVersion: 1,
  id: "preview-evidence",
  recordedAt: "2026-10-26T04:00:00Z",
  image,
  ocr: {
    rawText: "【UI 演示文字，非本次 OCR 输出】\n营养成分表\n每100mL",
    blocks: [],
    width: 1280,
    height: 1700,
    imageUri: image.uri,
    evidenceUri: "preview://evidence",
    modelVersion: "not-executed",
    modelHashes: {},
    engineVersion: "preview",
    sourceImageHash: image.sourceImageHash,
    processedImageHash: image.processedImageHash,
    modelLoadMs: 0,
    ocrMs: 0,
    totalMs: 0,
  },
};
const sample = {
  schemaVersion: 1,
  id: "preview-food",
  createdAt: "2026-10-26T04:00:00Z",
  updatedAt: "2026-10-26T04:00:00Z",
  status: "confirmed",
  review: reviewValue,
  evidence,
  parsed: {
    columns: [],
    issues: ["UI fixture, parser not executed"],
    completeCandidateTable: false,
  },
  revisions: [],
  barcodes: [
    {
      id: "preview-barcode",
      foodId: "preview-food",
      rawValue: "6923644266066",
      format: "EAN_13",
      lookupKey: barcode.lookupKey,
      validationStatus: "valid",
      acquiredBy: "manual",
      scannedAt: "2026-10-26T04:00:00Z",
    },
  ],
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const summary = (food: any) => ({
  id: food.id,
  name: food.review.name,
  brand: food.review.brand,
  status: food.status,
  updatedAt: food.updatedAt,
});
const captureScenarios = ["package", "nutrition", "review"];
function makeDraft(step = "package") {
  return {
    id: "preview-draft",
    barcode,
    acquiredBy: "manual",
    step,
    name: reviewValue.name,
    brand: reviewValue.brand,
    specification: reviewValue.specification,
    ...(step === "package" ? {} : { packageImage: image }),
    ...(step === "review"
      ? { nutrition: evidence, review: clone(reviewValue) }
      : {}),
  };
}
function Preview() {
  const [nutritionAdapter] = useState(() =>
    [
      "demo",
      "exceeded",
      "nutrition-empty",
      "failure",
      "loading-nutrition",
    ].includes(scenario)
      ? new DemoNutritionAdapter("2026-10-26", scenario)
      : undefined,
  );
  const initialScreen = [
    "scan",
    "denied",
    ...captureScenarios,
    "product",
    "add-stock",
    "ai-settings",
    "about",
    "profile",
  ].includes(scenario)
    ? scenario === "denied"
      ? "scan"
      : scenario
    : "home";
  const [screen, setScreen] = useState(initialScreen),
    [tab, setTab] = useState(
      ["diary", "library", "stock", "mine"].includes(scenario)
        ? scenario
        : "today",
    );
  const [records, setRecords] = useState<any[]>(
    [
      "empty",
      "scan",
      "denied",
      "error",
      "loading",
      ...captureScenarios,
    ].includes(scenario)
      ? []
      : [clone(sample)],
  );
  const [stock, setStock] = useState<any[]>(
    ["stock", "filled", "long"].includes(scenario)
      ? [
          {
            id: "preview-stock",
            food_id: sample.id,
            name: sample.review.name,
            brand: sample.review.brand,
            quantity: 2,
            unit: "瓶",
            expires_on: "2026-11-12",
            created_at: "2026-10-26T04:00:00Z",
          },
        ]
      : [],
  );
  const [draft, setDraftState] = useState<any>(
      captureScenarios.includes(scenario) ? makeDraft(scenario) : null,
    ),
    draftRef = useRef<any>(draft);
  const [resume, setResume] = useState<any>(null),
    [product, setProduct] = useState<any>(sample),
    [review, setReview] = useState<any>(
      scenario === "review" ? clone(reviewValue) : null,
    );
  const [confirmed, setConfirmed] = useState(false),
    [originalText, setOriginalText] = useState(false),
    [editing, setEditing] = useState<any>(null);
  const [permission, setPermission] = useState(scenario !== "denied"),
    [torch, setTorch] = useState(false),
    [scanToken, setScanToken] = useState(0),
    [manual, setManual] = useState(""),
    [manualFormat, setManualFormat] = useState("EAN_13");
  const [quantity, setQuantity] = useState("1"),
    [unit, setUnit] = useState("件"),
    [expiry, setExpiry] = useState(""),
    [search, setSearch] = useState(""),
    [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(
      scenario === "loading" ? "正在读取本机食品库" : "",
    ),
    [error, setError] = useState<string | null>(
      scenario === "error"
        ? "演示错误状态：暂时无法读取本机食品资料，请稍后重试。"
        : null,
    ),
    [notice, setNotice] = useState<string | null>(null);
  const scroll = useRef<any>(null),
    generation = useRef(0),
    request = useRef("preview-purchase-1");
  function setDraft(value: any) {
    const next = typeof value === "function" ? value(draftRef.current) : value;
    draftRef.current = next;
    setDraftState(next);
  }
  function navigate(next: string) {
    setScreen(next);
    setError(null);
    setNotice(null);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  function patchDraft(patch: any) {
    setDraft({ ...draftRef.current, ...patch });
  }
  async function task(message: string, action: () => Promise<void>) {
    setBusy(message);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  function updateReview(next: any) {
    setReview(next);
    patchDraft({
      review: next,
      name: next.name,
      brand: next.brand,
      specification: next.specification,
    });
    setConfirmed(false);
  }
  function updateColumn(id: string, patch: any) {
    updateReview({
      ...review,
      columns: review.columns.map((c: any) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    });
  }
  async function lookup(raw: string) {
    if (!/^\d{13}$/.test(raw)) {
      setError("演示输入校验：请填写13位条码。此预览不执行实际条码解码。");
      return;
    }
    const found = records.find((r) =>
      r.barcodes?.some((b: any) => b.rawValue === raw),
    );
    if (found) {
      setProduct(found);
      navigate("product");
    } else {
      const d = makeDraft();
      d.barcode = { ...barcode, scan: { ...barcode.scan, rawValue: raw } };
      setDraft(d);
      navigate("package");
    }
  }
  async function capture(which: string) {
    if (which === "package") {
      patchDraft({ packageImage: image });
      return;
    }
    patchDraft({
      nutrition: evidence,
      nutritionImage: image,
      step: "review",
      review: clone(reviewValue),
    });
    setReview(clone(reviewValue));
    navigate("review");
  }
  async function saveFood() {
    if (!confirmed) throw Error("请先核对演示字段。");
    const next = {
      ...clone(sample),
      id: draftRef.current?.id ?? sample.id,
      review: clone(review),
    };
    setRecords((current) => [next, ...current.filter((f) => f.id !== next.id)]);
    setProduct(next);
    setDraft(null);
    setResume(null);
    navigate("product");
    setNotice("演示食品已保存在内存中，刷新页面即清除。");
  }
  function showStock() {
    setQuantity("1");
    setUnit("件");
    setExpiry("");
    request.current = "preview-purchase-" + Date.now();
    navigate("add-stock");
  }
  setPreviewStore({
    async addStock(
      foodId: string,
      q: string,
      u: string,
      e: string,
      id: string,
    ) {
      if (!/^\d+$/.test(q) || Number(q) < 1) throw Error("请输入大于0的整数。");
      setStock((current) =>
        current.some((s) => s.id === id)
          ? current
          : [
              {
                id,
                food_id: foodId,
                name: product.review.name,
                brand: product.review.brand,
                quantity: Number(q),
                unit: u,
                expires_on: e || null,
                created_at: new Date().toISOString(),
              },
              ...current,
            ],
      );
    },
    async reduceStock(id: string) {
      setStock((current) =>
        current.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item,
        ),
      );
    },
    async removeStock(id: string) {
      setStock((current) => current.filter((item) => item.id !== id));
    },
    async deleteProduct(id: string) {
      if (stock.some((item) => item.food_id === id))
        throw Error("演示食品仍有库存。");
      setRecords((current) => current.filter((item) => item.id !== id));
    },
  });
  const p: any = {
    tab,
    setTab,
    screen,
    foods: records.map(summary),
    stock,
    stockCovers: Object.fromEntries(records.map((r) => [r.id, image.uri])),
    resume,
    draft,
    product,
    cover: image.uri,
    busy,
    error,
    setError,
    notice,
    setNotice,
    permission,
    foreground: true,
    torch,
    setTorch,
    scanToken,
    setScanToken,
    manual,
    setManual,
    manualFormat,
    setManualFormat,
    review,
    confirmed,
    setConfirmed,
    originalText,
    setOriginalText,
    quantity,
    setQuantity,
    unit,
    setUnit,
    expiry,
    setExpiry,
    request: request.current,
    search,
    setSearch,
    photos,
    setPhotos,
    scroll,
    generation,
    draftRef,
    async refresh() {},
    patchDraft,
    async retainDraft(next: any) {
      setDraft(next);
      setResume(next);
    },
    task,
    navigate,
    back() {
      navigate("home");
      return true;
    },
    async openProduct(id: string) {
      setProduct(records.find((f) => f.id === id) ?? sample);
      navigate("product");
    },
    lookup,
    async startScan() {
      navigate("scan");
    },
    async beginScan() {
      setPermission(true);
      navigate("scan");
    },
    async pickBarcode() {
      setNotice(
        "浏览器预览不能识别条码。请使用手动输入体验页面跳转；这不算扫码通过。",
      );
    },
    capture,
    async readPackage() {
      setNotice("浏览器预览不执行包装 OCR，可手动填写演示商品名。");
    },
    async transformNutrition() {
      setNotice("图片变换需要原生模块；预览不执行。");
    },
    async retryNutrition() {
      await capture("nutrition");
    },
    async saveCaptureDraft() {
      setResume(draftRef.current);
      navigate("home");
      setNotice("演示草稿仅保留在当前页面内存。");
    },
    updateReview,
    updateColumn,
    saveFood,
    showStock,
    exportData() {
      setNotice(
        "浏览器预览不生成真实食品导出。请在 Android App 使用已实现的本机导出。",
      );
    },
    stepTitle:
      (
        {
          scan: "拍一拍",
          package: "拍商品包装",
          nutrition: "拍营养成分表",
          review: "核对营养信息",
          product: "商品详情",
          "add-stock": "加入我的库存",
          library: "我的食品",
          "ai-settings": "AI 服务设置",
          about: "关于护康",
          profile: "本机用户",
        } as any
      )[screen] ?? "护康",
    date: new Date("2026-10-26T12:00:00+08:00"),
    setDraft,
    setReview,
    setProduct,
    setEditing,
    editing,
  };
  useEffect(() => {
    (window as any).__HUKANG_UI_PREVIEW__ = {
      mocked: true,
      scenario,
      screen,
      tab,
      foods: records.length,
      stock: stock.map((s) => ({ quantity: s.quantity, unit: s.unit })),
      nativeCalls: 0,
    };
  }, [screen, tab, records, stock]);
  return (
    <SimpleAppView
      controller={p}
      {...(nutritionAdapter ? { nutritionAdapter } : {})}
    />
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
