# Hukang China

Hukang China 是面向中国大陆用户的本地优先 Android 食品记录应用。普通用户从首页「拍一拍」开始：实时扫描食品条码，命中本机食品库后查看商品并选择入库；未命中时依次保存包装正面、营养成分表，使用手机内置的 PP-OCRv5 国产模型识别，人工核对后保存食品资料。

当前产品入口是 `src/app/index.tsx` → `src/features/simple/SimpleApp.tsx`，包含「今日 / 库存 / 我的」三个入口。食品资料和库存分开保存，同一条码不会重复建立商品；库存按购买批次记录数量、单位和可选到期日。

当前简易版的构建身份、下载入口、截图和验证边界见 [简易版验收记录](docs/SimpleAppAcceptance.md)。

## 本地能力

- CameraX 实时预览 + ZXing 本地解码，支持 EAN-13、EAN-8、UPC-A、UPC-E。
- 相册条码识别和手动输入作为辅助入口。
- PP-OCRv5 mobile detector/recognizer 随 APK 打包，Android 本地离线推理，不下载模型。
- 营养照片可旋转、矩形裁剪、失败后重试；原始 OCR、坐标、图片证据、解析候选和人工修订分开保留。
- SQLite 增量迁移到 `user_version=6`，保留食品、证据、草稿和库存。
- 「我的」可导出食品资料包或个人数据 ZIP；食品资料包默认不含照片和私人库存。文件只在本机生成，通过系统分享选择接收方，不自动上传；尚无 App 内一键恢复。

Release APK 不需要 `INTERNET` 或 `ACCESS_NETWORK_STATE`。项目没有 Google ML Kit、Google Play Services、云 OCR、Open Food Facts、Wikidata、在线 AI 或自动模型下载。

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run verify:assets
cd android
./gradlew :app:assembleRelease
```

模型来源、版本、许可证和 SHA-256 见 [OcrModelManifest](docs/OcrModelManifest.md)。本机真机相机、OPPO Find X7 Ultra、跨版本签名升级和低照度/反光包装识别必须以实际设备证据为准；模拟器相册测试不能替代物理相机验收。

## 视觉资产

`assets/icon.png` 继承自只读参考仓库 `Hukang-codex/assets/icon.png`，未重绘。SHA-256：

```text
d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2
```

## 文档

- [简易版使用说明](docs/SimpleApp.md)
- [Architecture and phase boundaries](docs/Architecture.md)
- [Mainland dependency audit](docs/MainlandDependencyAudit.md)
- [数据库迁移](docs/DatabaseMigrations.md)
- [Android 签名与升级策略](docs/AndroidSigningAndUpgradePolicy.md)
- [OCR 模型清单](docs/OcrModelManifest.md)

`Hukang-codex` 和 `Hukang-deepseek` 是只读参考仓库。本项目的实验技术分支 `codex/mainland-v2` 保留，不在本次产品整合中删除。
