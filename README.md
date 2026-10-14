# Hukang China · OCR Lab

中国大陆版 Hukang 的新工程。本轮范围是 **Phase 0 + Phase 1**：干净分层结构、
原版 App 图标、运行依赖审计，以及 Android 本地 PaddleOCR 技术验证页面。

当前已实际构建 ARM64 Release APK（58,709,659 bytes），最终 Manifest 没有 INTERNET。
同一 APK 在 Android 15 / API 35 官方 ARM 翻译模拟器中，已完成六次完全离线 OCR，
包括旋转往返与矩形裁剪后的识别。ARM64 真机、EXIF 2–8 和完整生产验收仍未验证。
APK 入口、原始输出和限制见 [验收报告](docs/Phase1AcceptanceReport.md)，
本次成功执行原始记录见 [设备证据](docs/evidence/phase1/device-37781340401/README.md)。

## Scope

- React Native + TypeScript + Expo Router、自定义 Kotlin Android 模块。
- Android minSdk 26，首版只支持 arm64-v8a；自建 APK，不使用 Expo Go 运行 OCR。
- 本地相册导入、EXIF 修复、手动旋转、矩形裁剪。
- 固定 PP-OCRv5 mobile 检测／识别模型，ONNX Runtime 1.21.1 CPU 本地推理。
- 展示真实原文、文字框、recognizer score 与 native 耗时；保留原图和原始结果。
- 国内食品及药品数据边界仅有类型／接口，不实现食品解析、库 UI 或云服务。

没有 ML Kit、在线 OCR、海外 Vision、Open Food Facts、Wikidata、AI、遥测服务、
自动模型下载或在线失败兜底。模型缺失或推理失败明确报错。首版生产配置移除
网络权限；最终 APK 必须单独核查，不能把配置当作真机验收结果。

## Development

```sh
npm ci
npm run typecheck
npm test
npm run verify:assets
cd android
./gradlew :app:assembleRelease
```

构建前必须具备 Android SDK / NDK、固定模型文件及配置。Gradle 会校验模型资产；
缺失模型不得用空文件或 mock 代替来宣称 release 可运行。准确的模型位置、
许可证和获取状态见 [OcrModelManifest](docs/OcrModelManifest.md)。

`npm run verify:apk -- <APK_PATH>` 的实际参数见脚本／验收说明。自动检查与
Android 安装后真实执行是不同层级；是否已经完成构建和设备执行，以本轮
验收报告中的证据为准。

## Icon provenance

`assets/icon.png` 来自只读参考仓库 `Hukang-codex/assets/icon.png`，1024×1024，
未转换、未重绘、未改变设计。源／目标 SHA-256：

```text
d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2
```

## Documents

- [Architecture and phase boundaries](docs/Architecture.md)
- [Mainland dependency audit](docs/MainlandDependencyAudit.md)
- [OCR model manifest](docs/OcrModelManifest.md)
- [Food and medicine source rights](docs/FoodDataSources.md)
- [Phase 1 acceptance report](docs/Phase1AcceptanceReport.md)
- [Android OCR evidence test protocol](docs/TestProtocol.md)
- [Phase 1 verification milestones](docs/Phase1Progress.md)

`Hukang-codex` 与 `Hukang-deepseek` 只读，不在其中开发、提交或删除文件。
Phase 1 结束后停止，下一阶段需重新确认范围。APK 大小、实拍 OCR 输出、速度、
内存及离线执行均须使用实际构建／设备数据，不用人工转录冒充 OCR。
