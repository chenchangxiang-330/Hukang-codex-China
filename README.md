# Hukang China

Hukang China 是面向中国大陆用户的本地优先 Android 食品记录应用。普通用户从首页「拍一拍」开始：实时扫描食品条码，命中本机食品库后查看商品并选择入库；未命中时依次保存包装正面、营养成分表，使用手机内置的 PP-OCRv5 国产模型识别，人工核对后保存食品资料。

当前产品入口是 `src/app/index.tsx` → `src/features/simple/SimpleApp.tsx`，UI V1 包含「今日 / 记录 / 食品库 / 我的」四个入口，库存位于食品库内。食品资料和库存分开保存，同一条码不会重复建立商品；库存按购买批次记录数量、单位和可选到期日。

UI V1 在独立分支 `codex/ui-v1` 开发，基于现有 React Native + Expo 项目，未创建 Flutter 项目。设计规范见 [UI V1 Design](docs/UIV1Design.md)，本轮检查、截图和安装包见 [UI V1 验收记录](docs/UIV1Acceptance.md)。

每日记录目前提供主动开启的临时演示；AI 设置只做本地配置格式检查。二者均未连接存储或真实服务，不把演示数据写入食品库。

以下 0.3.3 是历史基线，设备结果不能直接作为 UI V1 的验收；历史构建身份和证据见 [简易版验收记录](docs/SimpleAppAcceptance.md)。

历史基线测试包为 **0.3.3 / versionCode 8**（ARM64，Android 8.0 及以上）。[下载完整构建 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38703696958/artifacts/11958565529)，解压获得 `hukang-0.3.3-arm64.apk`；这是保留 14 天的 Actions 产物，不是正式 Release。

已在断网 Android 模拟器完成图片条码解码、真实包装照片 OCR、人工修正、食品保存、重启、同商品两次入库及三个导出包检查。OPPO 实时镜头与历史安装升级仍未验证。当前临时签名不能保证覆盖已有 App；有本地数据时不要卸载。

## 本地能力

- CameraX 实时预览 + ZXing 本地解码，支持 EAN-13、EAN-8、UPC-A、UPC-E。
- 相册条码识别和手动输入作为辅助入口。
- PP-OCRv5 mobile detector/recognizer 随 APK 打包，Android 本地离线推理，不下载模型。
- 营养照片可旋转、矩形裁剪、失败后重试；原始 OCR、坐标、图片证据、解析候选和人工修订分开保留。
- SQLite 增量迁移到 `user_version=6`，保留食品、证据、草稿和库存。
- 「我的」可导出食品资料包或个人数据 ZIP；食品资料包默认不含照片和私人库存。文件只在本机生成，通过系统分享选择接收方，不自动上传；尚无 App 内一键恢复。

Release APK 不需要 `INTERNET` 或 `ACCESS_NETWORK_STATE`。本版生产运行链路不依赖 Google ML Kit、Google Play Services、云 OCR、Open Food Facts、Wikidata 或在线 AI，也没有自动模型下载。仓库归档测试图片保留其来源与许可声明，不作为生产食品库或联网查询来源。

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run format:ui:check
npm run ui:test # 需要已安装 Chromium；共享 UI 的模拟 controller 测试
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
