# Hukang China — main 简易本地版架构

当前产品只查询用户自己的食品库。`codex/mainland-v2` 保留技术参考历史；旧 Provider 和 `server/` 仅为未启用的参考代码，不在入口、导航、扫码兜底或启动链路中。

## 用户和数据流程

```text
Expo Router → SimpleApp（今日 / 库存 / 我的）
  → 拍一拍 → CameraX 实时取景 / 相册 → ZXing 本地解码
  → BarcodeNormalizer / Validator → ChinaFoodRepository（SQLite）
      命中 → 商品详情 → 用户确认本次购买数量 → 独立库存批次
      未命中 → 持久草稿 → 包装正面 + 可编辑名称/品牌/规格
              → 营养照片 → EXIF 修复 / 旋转 / 矩形裁剪
              → bundled PP-OCRv5 → 坐标解析 → 人工核对
              → 不可变证据 + 食品/条码事务 → 封面附加/草稿清理
  → 我的 → 本地 JSON/ZIP → 用户主动选择系统分享接收方
```

React Native 0.86.3、Expo 57.0.27、TypeScript 6，依赖补丁锁定于 `package-lock.json`。
Android minSdk 26，仅 `arm64-v8a`。模型与 JS 随包提供；Release 移除 `INTERNET` 和 `ACCESS_NETWORK_STATE`，禁止自动下载、遥测和远程更新。Expo Go 不能替代此原生 APK。

## 代码职责

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 唯一生产路由，进入 SimpleApp |
| `src/features/simple/` | 连续采集、照片调整、人工核对、商品/库存页面、持久草稿及导出 |
| `src/domain/barcode/` | 字符串条码、校验位、UPC-E 展开与 GTIN 等价键 |
| `src/domain/food/` | OCR 坐标行列关联、未知字段、人工核对及食品模型 |
| `src/domain/inventory/` | 包装数量、到期日校验；不同单位不混加 |
| `src/application/usecases/` | 本地图片与 OCR 编排 |
| `src/infrastructure/food/` | SQLite v6、证据文件、条码关联、修订历史 |
| `modules/hukang-vision/android/` | 图片处理、ONNX Runtime/OpenCV、固定国产 PP-OCRv5 |
| `modules/hukang-barcode/android/` | CameraX/ZXing、歧义条码拒绝、本地 ZIP 创建 |
| `src/features/ocr-lab/` | 旧诊断技术参考；不是普通用户入口 |
| `tests/device/` | 安装真实 Release APK 的黑盒离线验收，测试样本不进生产库 |

## 数据与恢复

商品和库存是独立结构。同一条码的再次购买只新增库存批次，不复制食品或运行 OCR。
数据库沿用 `hukang-china-food.db`，schema 1–5 增量到 6，保留历史证据。
新照片在推理前持久化；原图不改写，调整生成新处理图。OCR 失败可调整、重试或保存未确认草稿。
食品与条码由既有事务保存；封面和草稿清理由后续事务处理，失败保留原 ID 和草稿，重试保留最新人工修正。库存仍引用食品时禁止删除食品。

食品资料包通过白名单只输出已确认商品资料，默认不带照片，不含库存；个人导出明确包含库存与证据。所有导出在本机进行，不具有 App 内一键恢复能力。

## OCR evidence invariants

- The original image file is retained; image processing produces a separate file.
- The transform records EXIF repair, rotation, crop and resize, including a 3×3
  original-to-processed coordinate matrix.
- `OcrDocument.rawText` and each block's `text`, polygon, bounding box,
  recognizer confidence, page and model hashes are raw evidence.
- Coordinates are processed-image pixels. UI fit/zoom is a separate transform.
- Confidence is the recognizer's score, not a calibrated probability or a food
  fact's correctness probability.
- Recognition and user edits must never overwrite raw evidence. Future parsed
  drafts and confirmed records are separate types and records.
- Missing models, image errors and inference errors fail explicitly. There is
  no online OCR, AI, guessed text, or alternate engine fallback.
- Model loading, OCR and total timing use native measurements. Sampled memory
  maxima are labelled as observations, not absolute peak RSS.


设备证据见最新简易版验收记录。实现、主机测试、模拟器黑盒测试与 OPPO 物理相机实测必须分开标注。
