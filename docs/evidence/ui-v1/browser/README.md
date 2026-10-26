# UI V1 浏览器证据

2026-10-26，在系统 Chromium 中实际渲染与生产共用的 React Native UI，使用 `react-native-web` 及明确标识的内存 controller。报告为 `report.json`，包含输入源文件 SHA-256；截图文件校验见 `screenshots-sha256.json`。

执行：`npm run ui:test`。34 项检查通过、23 张截图、0 页面异常、0 外部请求。390px 覆盖 18 个状态，320px 覆盖 11 个可见页面。报告用 `dp` 作场景标签，实际测量为浏览器 CSS px，并非 Android 设备 dp 实测。放大字体只做浏览器字号近似。

所有图顶部持续显示「UI 预览 · 模拟数据仅在内存中 · 非设备扫码 / OCR」。没有用此结果宣称相机、PaddleOCR、SQLite、系统分享或 OPPO 验收成功。

| 页面 | 截图 |
| --- | --- |
| 首页与空状态 | [empty](empty.png)、[320px](home-320.png) |
| 扫码及权限失败 | [scan](scan.png)、[denied](denied.png) |
| 建档、营养照片、核对 | [package](package.png)、[nutrition](nutrition.png)、[review](review.png) |
| 商品与库存 | [product](product.png)、[add-stock](add-stock.png)、[stock](stock.png) |
| 食品库 | [library](library.png) |
| 每日记录 | [未接入](diary.png)、[主动开启的演示](diary-demo.png) |
| 我的与设置 | [mine](mine.png)、[AI](ai-settings.png)、[本地检查](ai-local-validation.png)、[profile](profile.png)、[about](about.png) |
| 加载与错误 | [loading](loading.png)、[error](error.png) |

包装图片来自既有许可测试 fixture `tests/fixtures/china-food/6923644266066.jpg`，原来源 macrofactor / Open Food Facts，CC-BY-SA-3.0；详细来源见 [fixtures README](../../../../tests/fixtures/china-food/README.md)。仅用于测试展示，App 不访问此来源，不将其作为食品数据库或识别服务。商品名称、品牌、营养和库存是标记的 UI 样例，不是本轮实际 OCR 结果。
