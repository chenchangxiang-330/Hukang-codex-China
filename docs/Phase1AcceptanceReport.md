# Hukang China Phase 1 验收报告

报告日期：2026-10-08（Asia/Shanghai）。范围：Phase 0、Phase 1；没有开始 Phase 2。本文证据快照为已推送的 `10f0ea95ab63cfd1821b7ac57d45f3e327eaf37d`，实际 APK build source 为 `339a66991af93c488e1f1426a3f240edd82fc3ca`，最终成功测试 source 为 `a0c85d544ed2bccea225ead8a4e063acccadb764`。App、测试工具、历史旧包和各次成绩分别记录。

**Phase 1 核心技术验证已达成：真实 Android App 在 API 35 仿真环境完成 6 次完全离线的官方 PaddleOCR，手动旋转、旋转往返后 OCR、矩形裁剪后 OCR 均有实际证据。** release APK 为 **58,709,659 bytes**，SHA-256 **`3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`**，最终 Manifest 没有 INTERNET。保留原图、处理图、实际原文、框、confidence、模型摘要、原生时长/采样内存，错文未纠正。ARM64 真机、EXIF 2–8、更多食品/拍摄条件和长期性能尚未验证，不能标为完整生产验收或手机性能达标；没有开始 Phase 2。

本文使用以下状态，避免把不同层级的证据混为一谈：

| 状态 | 含义 |
| --- | --- |
| `verified_static` | 已核验实际文件、来源、摘要、依赖配置或实际 APK 内容 |
| `verified_host_test` | 已在构建机实际运行测试、工具或编译；不表示 Android 功能执行成功 |
| `verified_android` | 已在真实 Android 设备或模拟器上执行，并保存该次 APK 身份和原始结果 |
| `not_run` | 尚未执行，不能填写识别率、速度或内存数值 |
| `error` | 实际步骤失败；需区分构建工具、测试环境和 App 问题 |

## 1. 新项目实际目录与边界

新仓库实际路径：`/workspace/Hukang-codex-China`。开发分支：`codex/mainland-v2`。远程仓库：[chenchangxiang-330/Hukang-codex-China](https://github.com/chenchangxiang-330/Hukang-codex-China)。没有合并 `main`。

```text
Hukang-codex-China/
├── src/
│   ├── app/                         Expo Router 路由
│   ├── features/ocr-lab/            OCR Lab 页面、状态、几何、证据保存
│   ├── application/
│   │   ├── ports/                  OCR、食品、药品、扫码独立契约
│   │   └── usecases/               图片与 OCR 用例
│   ├── domain/                     OCR、证据、食品、药品、条码类型
│   └── infrastructure/
│       ├── ocr/                    Kotlin 适配与原生结果校验
│       └── food/                   预留边界，尚无食品库实现
├── modules/hukang-vision/           自定义 Expo/Kotlin Android module
├── android/                        Android 工程、launcher/splash、Gradle wrapper
├── assets/icon.png                 原版 Hukang 图标原始字节
├── models/paddleocr/v5-mobile/      官方 ONNX、原始 YAML、来源锁、许可
├── plugins/                        离线 Android 配置插件
├── scripts/                        模型、APK、fixture 与设备证据工具
├── tests/fixtures/china-food/       两张有署名的归档实物包装照片
├── docs/evidence/phase1/            官方获取、实际 APK、历史失败与6次 OCR 原始证据
├── .github/workflows/               release 构建与 Android 设备测试工作流
└── artifacts/                      本地构建/测试产物位置；不批量提交缓存
```

实际技术栈为 React Native `0.86.3`、React `19.2.3`、TypeScript `6.0.3`、Expo `57.0.27`、Expo Router `57.0.25`；npm 版本由 `package-lock.json` 锁定。原生为 Kotlin、ONNX Runtime Android `1.21.1` CPU、OpenCV Android `4.5.3.0`、AndroidX ExifInterface `1.4.1`。Android 最低 API 26，首版只打包 `arm64-v8a`。

`ChinaFoodRepository`、`LocalChinaFoodSource` 和未来的 `HukangChinaFoodService` 仅为独立接口；食品模型兼容中国营养标签的每 100g/100mL、kJ、NRV%、来源和更新时间。`MedicineRepository` 与食品模型分离。扫码只有 `BarcodeScanner` 契约。这些不是已实现的食品库、扫码 UI 或云服务。

两个旧仓库只用于读取原图标及两张已有测试输入，没有复制旧项目大型目录，也没有迁移旧 OCR、食品供应商、AI、API Key、UI 或通用 `Product` 结构。旧仓库不参与新版写入和提交。

## 2. 实际修改文件与阶段提交

以下是当前实际存在并已提交的主要文件；完整路径清单见本文附录。

| 工作 | 实际文件 |
| --- | --- |
| 版本锁定与 Expo 配置 | `package.json`、`package-lock.json`、`app.json`、`tsconfig.json`、`expo-env.d.ts` |
| 路由与 OCR Lab | `src/app/_layout.tsx`、`src/app/index.tsx`、`src/features/ocr-lab/{OcrLabScreen.tsx,useOcrLab.ts,geometry.ts,evidence.ts}` |
| 分层契约和独立模型 | `src/application/ports/{OcrEngine,ChinaFoodRepository,MedicineRepository,BarcodeScanner}.ts`、`src/application/usecases/OcrLabUseCases.ts`、`src/domain/{ocr,evidence,food,medicine,barcode}/types.ts` |
| 原生调用边界 | `src/infrastructure/ocr/{HukangVision.ts,validateNativeResult.ts}`、`modules/hukang-vision/expo-module.config.json`、`modules/hukang-vision/android/build.gradle` |
| 图片与推理实现 | `HukangVisionModule.kt`、`ImageStore.kt`、`MemorySampler.kt`、`com/paddle/ocr/` 下的检测、识别、CTC、几何、预处理等 Kotlin 文件 |
| 离线生产配置 | `plugins/withOfflineAndroid.cjs`、`android/app/src/main/AndroidManifest.xml`、`android/app/build.gradle`、`android/gradle.properties` |
| 官方模型资产 | `models/paddleocr/v5-mobile/{detector.onnx,recognizer.onnx,detector.yml,inference.yml,manifest.json,source-lock.json,NOTICE.md,LICENSE-PaddleOCR.txt}` |
| 构建与证据 | `.github/workflows/{phase1-release.yml,phase1-device.yml,phase1-device-retest.yml}`、`scripts/{fetch-models.py,verify-apk.py,split-apk.py,android-device-evidence.py,run-android-ocr-lab.py,validate-ocr-evidence.mjs,verify-assets.mjs,verify-fixtures.mjs}` |
| 测试 | `tests/{ocr-native-result.test.mjs,ocr-geometry.test.mjs,ocr-evidence-validator.test.mjs,test_model_acquisition.py}`、`tests/fixtures/china-food/` |
| 图标 | `assets/icon.png` 与 `android/app/src/main/res/` 中由它生成的 launcher、foreground、splash 资源 |
| 审计与实证文档 | `docs/{Architecture,FoodDataSources,MainlandDependencyAudit,OcrModelManifest,Phase1Progress,TestProtocol}.md`、`docs/evidence/phase1/` |

阶段提交均在 `codex/mainland-v2`，已推送；提交没有进入旧仓库或 `main`：

| 提交 | 已保存内容 |
| --- | --- |
| `c4476c3` | 中断前的工作备份 |
| `7214101` | 原生注册、Gradle 配置与返回契约修复 |
| `304863e` | 官方模型获取、固定摘要门禁、release 构建工作流 |
| `6fda523` | 实际取得并核验的官方模型、原始 YAML 和来源锁 |
| `d4b2fcd` | SDK 工具绝对路径发现与构建证据保存 |
| `b1ba9fe` | 离线 Android UI 测试脚本与模拟器工作流 |
| `e985bd5` | UI 自动化匹配和设备证据采集说明 |
| `3ef4198` | 修复新版 aapt2 的 minSdk 字段解析，保留首次真实证据 |
| `089d95c` | 首次真实 release 编译与最终 Manifest 实证文档 |
| `68beb10` | 修复 KVM 设备权限竞态、独立重测已检查 APK、保存当前 APK 实际复核证据 |
| `64808a5` | 修复 Android 测试图片媒体索引的 `/sdcard` 别名路径问题 |
| `32dd83d` | 保存实际 APK 交付和首次 Android 安装/媒体索引失败证据与报告 |
| `a0a491a` | 正常开启 legacy native library packaging，新增旋转往返/裁剪实际 UI 测试路径 |
| `339a669` | 严格检查实际 APK 解库配置、必需 ARM64 库和安装后逐库摘要 |
| `cd6614c` | 保存 SoLoader 真实启动失败、原始日志截取和 resolved release 依赖审计 |
| `58a50d9` | 文档入口、验证里程碑和 native packaging 待实证历史 |
| `00568a8` | 保存实际重新构建 APK、完整本地检查和可信分片身份 |
| `91cf7dc` | 同一已核验 APK 转至官方 API 35 系统镜像测试 |
| `5603558` | 保存实际 ARM64 库解出、摘要和 API 30 翻译层 SIGILL 原始证据 |
| `f113662` | 生产 Android 15 PhotoPicker 导航，不假设缩略图暴露文件名 |
| `675717c` | 保存两张照片各2次的实际离线 PaddleOCR 输出、截图与测量 |
| `a0c85d5` | 修复测试工具方向按钮匹配和证据文件 glob，启动同包旋转/裁剪重测 |
| `0008669` | 按原始内容摘要保留实际processed PNG，并更新离线验证里程碑 |
| `5ec7edc` | 已推送4次离线基线验收报告，真实错误与尚未验证内容明确区分 |
| `10f0ea9` | 保存最终6次实际离线OCR、旋转/裁剪、截图与原始JSON，以及独立本地实物核验 |

实际执行通过：TypeScript `tsc --noEmit`、Node 测试 15/15、官方模型导入安全测试 5/5、资产与 fixture 摘要核验、Gradle `help`、Expo Android autolinking。autolinking 实际解析到 `com.hukang.vision.HukangVisionModule`，与 Kotlin 类一致。

这些测试属于 `verified_host_test`，不代表模型已在 Android 推理。archive 安全测试使用合成压缩包核验路径穿越、链接、重复成员和解压限额，没有生成伪 OCR 文本。

本地实际执行 releaseRuntimeClasspath 依赖图检查：exit 0，`BUILD SUCCESSFUL in 1m`，200 个不同 resolved Maven coordinates，无 `FAILED` 或 unresolved `(n)` 节点。原始 [release-dependencies-local-64808a5.txt](evidence/phase1/release-dependencies-local-64808a5.txt) 为 94,037 bytes，SHA-256 `d57d33e056827d4fc66d759ad4bd70526f1e115cfd43b44b55f6ecd022131dd0`。清单未出现 GMS、ML Kit、Firebase、在线 OCR/AI 或遥测 SDK coordinates；普通 Google/AndroidX utility 是本地库。依赖图解析不是二进制全部下载、网络抓包或设备推理实证，详见 [MainlandDependencyAudit.md](MainlandDependencyAudit.md)。

## 3. 原版图标 SHA-256 校验

状态：`verified_static`。原始 PNG 未转换，复制前后完全一致：

| 文件 | SHA-256 |
| --- | --- |
| `/workspace/Hukang-codex/assets/icon.png` | `d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2` |
| `/workspace/Hukang-codex-China/assets/icon.png` | `d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2` |

原图分辨率为 1024 × 1024。没有 AI 重绘，没有更改 Logo、颜色、比例或设计。Expo 配置中的 App 图标和 splash 均指向 `assets/icon.png`；原生多密度资源是该资产的生成结果。当前没有宣称已经在手机上目视验收 launcher/splash。

## 4. PaddleOCR 模型、配置、字典与 SHA-256

状态：资产身份为 `verified_static`、获取/导入工具为 `verified_host_test`；本报告固定组合已在 API 35 的实际 Android 原生推理中运行，为 `verified_android`。原始 device JSON 记录相同模型/config 摘要，不只根据模型文件名推断。

模型仅来自 PaddlePaddle 官方发布。首次可信获取是 [Actions run 37737586793](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37737586793)，源码提交 `304863e`，直接从官方百度 BOS HTTPS 归档下载。固定官方 Hugging Face revision 是允许的另一路来源；没有使用第三方镜像、占位模型、APK 提取文件、重导出的 ONNX 或重建字典。

| 实际文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `detector.onnx` | 4,826,518 | `a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d` |
| `recognizer.onnx` | 16,534,782 | `da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092` |
| 原始 `detector.yml` | 903 | `98069072e1b6b37d727fd9d9f11725faa46d6ea0de012f2ed26caea011c37699` |
| 原始识别 `inference.yml` | 148,345 | `5dfeb2777f6d0db8177d8128a8acfcf6e6276dc4ac73ea3bf0dc06d6a5e85d8e` |

两份 ONNX 合计 21,361,300 bytes，约 20.37 MiB；这是模型文件大小，不是 APK 增量或运行内存。

| 固定项目 | 内容 |
| --- | --- |
| 源码基线 | PaddleOCR 官方 `v3.7.0` Android SDK，经明确适配 |
| 检测模型 | `PP-OCRv5_mobile_det_onnx`，revision `e6f4fa85f00e168c862bc462aebca69eef9b3d3d` |
| 识别模型 | `PP-OCRv5_mobile_rec_onnx`，revision `ed152b8b495f84de93cda5709d768548a9127622` |
| License | 官方模型和 PaddleOCR 源码为 Apache-2.0，保留许可与来源说明 |
| 运行时 | ONNX Runtime Android 1.21.1 CPU；OpenCV 4.5.3.0 |
| 检测输入 | FP32 NCHW/BGR；最长边 960，32 对齐；按官方 mean/std 归一化 |
| 识别输入 | FP32 NCHW/BGR；高度 48，动态宽度，最小补齐宽度 320；归一化后补零 |
| 方向 | EXIF 修复与手动旋转；没有额外 classifier |
| 字典 | 原始 YAML 的 `PostProcess.character_dict`；原始顺序 18,383 项，首项 U+3000；追加 ASCII 空格及 CTC blank 后 18,385 输出类别 |
| 有序字典 SHA | `02c0a0121c577dfa211f11de21084e3abd23478a77ea4fbdf71ee7a3e990a717` |
| APK 内路径 | `assets/models/paddleocr/v5-mobile/` |

可信模型 artifact ID 为 `11531893631`，ZIP 18,625,900 bytes，实测 SHA-256 为 `543a762c650c9fad885863321b02a9e7e6df1082c45541c3b56ad3af9696374a`，与 GitHub artifact digest 一致。本地取得后再次按仓库独立来源锁核验；上传包内的 manifest 不作为信任根。

详情和可复现命令见 [OcrModelManifest.md](OcrModelManifest.md)、[source-lock.json](../models/paddleocr/v5-mobile/source-lock.json)、[官方获取 receipt](evidence/phase1/official-model-acquisition-37737586793.json)。模型和配置摘要在下载/导入、Gradle release 打包、APK 检查、原生初始化多层核对；缺失或不符明确失败，不下载替代模型。

## 5. 实际 Android release APK 构建结果

状态：当前包构建 `verified_host_test`、APK内容 `verified_static`，最终API35安装/离线启动/6次OCR/旋转和裁剪为 `verified_android`。API30历史错误保留；真机与多方向EXIF仍未测，不混用环境和成绩。

**当前实际交付包**来自 [Actions run 37776005573](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573)，构建源码 `339a66991af93c488e1f1426a3f240edd82fc3ca`，release job `113307547677`。此 job 的 release 编译、完整 APK 检查、上传成功；本地取得实际 APK 并再次检查。Android 设备 job 另行计分，不因 release 成功而自动通过。

| 项目 | 当前包实际结果 |
| --- | --- |
| Gradle | `:app:assembleRelease` 成功，`BUILD SUCCESSFUL in 7m 16s` |
| 原生编译 | 完整构建实际执行 `:hukang-vision:compileReleaseKotlin` |
| 模型打包门禁 | 实际执行 `:hukang-vision:verifyBundledOcrModels` |
| 本地实际 APK | [下载当前工作区 APK](/workspace/Hukang-codex-China/artifacts/hukang-china-phase1-arm64-release.apk) |
| APK 大小 | **58,709,659 bytes**，58.71 MB / 55.99 MiB |
| APK SHA-256 | `3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e` |
| 签名 | APK Signature Scheme v2 校验通过，1 个 signer |
| 分发签名性质 | 工作流临时实验签名，非正式商店/生产发布证书 |
| 完整下载 artifact | [phase1 release APK artifact 11550109995](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573/artifacts/11550109995)，GitHub可能要求登录 |
| 本地独立复核 | 重组实际 APK 后执行 `scripts/verify-apk.py`，`errors: []` |
| 实际 Manifest 解库设置 | `android:extractNativeLibs=true` |
| 必需 native 库 | `libreactnative.so`、`libopencv_java4.so`、`libonnxruntime.so`、`libonnxruntime4j_jni.so` 实际存在，均为 ZIP DEFLATED（compression 8），各摘要已核验 |
| 新包 Android 安装 | job `113311498884` 实际安装成功，4 个必需 ARM64 native 库安装后逐个摘要与 APK 内一致 |
| API 30 运行历史 | 旧 SoLoader 缺库解决后，API 30 `libndk_translation` 出现 SIGILL，未完成 OCR Lab 启动 |
| API 35 当前实证 | `37781340401` / job `113324913574` 成功；同一APK完成4次全图基线、1次旋转往返后、1次矩形裁剪后OCR，以及3项实际图片变换检查 |

为可信取回新 APK，构建机按固定顺序拆成三份，生成带 repository/commit/run 身份和各份摘要的 transfer manifest，分别上传 GitHub Actions artifact。本地核对 GitHub artifact metadata、每份字节及摘要后，顺序重组，再核对完整 APK 摘要，重新解码 Manifest、校验模型、native 库及签名。三分片是开发产物传输，不是 App 运行时模型下载。完整 APK 没有提交进源码 Git。

当前实际复核原始证据见 [apk-inspection-local.json](evidence/phase1/release-37776005573/apk-inspection-local.json)、[final-manifest.txt](evidence/phase1/release-37776005573/final-manifest.txt)、[apk-transfer-manifest.json](evidence/phase1/release-37776005573/apk-transfer-manifest.json)、[artifact-metadata.json](evidence/phase1/release-37776005573/artifact-metadata.json)。native 库完整摘要在检查 JSON 中保留。GitHub artifacts 为临时保留，当前记录到期时间为 2026-10-22；应按实际 artifact metadata 留存，不依赖永久下载。

native 库改为安装时解出的压缩打包后，实际 APK 从 94,746,723 bytes 变为 58,709,659 bytes；官方模型和字典字节未更换、未量化。该 APK 体积减少不代表运行内存或手机推理速度减少。

**第一份交付包历史保留：** [run 37740050254](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37740050254) / `3ef4198` 曾编译成功（10m 45s），94,746,723 bytes，SHA `4bf12e9ef26e8d9c91f7ad775f222eac2f2d3adca05787ccc306619c22d324d3`。旧包保存在 `artifacts/hukang-china-phase1-arm64-release-3ef4198.apk`，原始静态证据在 `docs/evidence/phase1/release-37740050254/`，已知 native translation 启动失败见第 8 项。不能用新包修复或摘要追溯改变旧包结论。

**首次编译历史保持原样：** [run 37738623906](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37738623906) / `d4b2fcd202b8231691451f92840552435805a936` 曾实际编译成功（10m 50s），APK 同为 94,746,723 bytes，但 SHA 是 `659a487d7c842824601f471285c73ffa4cb681eeddfd65c0416cdb2c502166ba`。当时检查脚本只认识旧 `sdkVersion` 字段，误报 `minSdk is not 26`，导致该 APK 未上传。`3ef4198` 修复后，新包已通过完整检查；第一次错误 JSON 不修改，不拿第一次摘要标识当前包。

首次证据见 [原始 Gradle 日志](evidence/phase1/first-release-37738623906/gradle-release.txt)、[原始 APK 检查结果](evidence/phase1/first-release-37738623906/apk-inspection.json)。本地曾被 Maven 依赖重定向受限域名阻塞；GitHub Actions 实际成功编译解决的是构建供应链问题，没有给 App 引入运行时联网服务。

## 6. OCR 是否完全离线：已经证明什么

| 判断 | 状态与证据 |
| --- | --- |
| 国产模型来源和实际字节 | `verified_static`：官方receipt、来源锁、本地/实际APK/device JSON模型与config摘要一致 |
| 模型直接在APK中 | `verified_static`：模型、原始YAML和字典固定打包；没有首次启动下载 |
| 本地模型初始化和推理 | `verified_android`：API35实际Kotlin+ORT CPU运行，6份原生输出；固定国产模型，不是host推理或人工文字 |
| 海外OCR/AI/食品供应商 | `verified_static`：没有生产集成或在线fallback，`FOREIGN_NETWORK_SERVICE=0` |
| App网络权限 | `verified_static`：实际APK没有INTERNET/ACCESS_NETWORK_STATE |
| 启动前离线状态 | `verified_android`：飞行模式1、Wi-Fi0、GMS/GSF/Photos disabled；IPv4/IPv6 OUTPUT默认DROP前后记录保留 |
| 首次离线启动与中文OCR | `verified_android`：release未连接Metro，本地相册导入→4次基线、旋转往返后1次、裁剪后1次实际识别成功 |
| Google Play Services依赖 | `verified_android`：镜像内GMS/GSF/Photos实际禁用后成功；不是“系统从未安装Google服务”的真机实验 |
| 流量观察 | 保存系统规则和计数；未做完整packet capture或App UID专项审计，不声称抓包为零 |
| ARM64真机完全离线OCR | `not_run`：本次为x86_64 Android+官方ARM native translation，不是真机 |

**已经实际证明：记录的API35 Android App在首次启动前离线条件下，从APK加载官方国产模型，经生产UI本地相册、图片处理和原生模块完成6次中文OCR，保留真实原文、坐标、分数与测量。** 该结论结合APK权限、设备session、源图/模型摘要、原始native/JS记录和截图。没有网络模型下载、AI补文或其他OCR引擎。

这不等于所有Android版本、ARM64手机、多方向EXIF、长时间使用或完整生产验收通过。API30同包的历史翻译层错误保留，不能因API35成功而删除。

ORT、OpenCV、React Native、Expo、AndroidX标为 `FOREIGN_OFFLINE_LIBRARY`。GitHub/npm/Maven/SDK和官方模型获取是开发供应链，不是用户OCR服务器依赖。ORT明确禁用telemetry，APK网络权限移除，详见 [MainlandDependencyAudit.md](MainlandDependencyAudit.md)。

系统相册/用户主动分享的其他App可有独立网络行为；本次选用设备本地fixture并禁用Google Photos，没有把外部行为说成Hukang上传。

## 7. 实际最终 Manifest 是否存在 INTERNET

状态：`verified_static`。结论来自当前新 APK 在本地再次执行 aapt2 的解码输出，不是 `app.json` 的期望配置。当前 APK 摘要为 `3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`。

| 检查 | 当前实际最终 APK |
| --- | --- |
| `android.permission.INTERNET` | 不存在 |
| `android.permission.ACCESS_NETWORK_STATE` | 不存在 |
| `android.permission.CAMERA` / `RECORD_AUDIO` | 不存在；Phase 1 只导入相册 |
| 最低 SDK / target SDK | 26 / 36 |
| native ABI | 仅 `arm64-v8a` |
| `android:extractNativeLibs` | true；4 个必需 native 库压缩打包，通过实际 APK 门禁 |
| Google Play Services 照片模块下载 metadata service | 配置插件去除；实际解码 Manifest 中没有该 service |
| 模型配置和 ONNX | 打包后摘要全部一致 |

该 APK 列出的权限是 `READ_EXTERNAL_STORAGE`（maxSdk 32）、`WRITE_EXTERNAL_STORAGE`（maxSdk 32）、`VIBRATE` 和 App 私有的 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`。这些不是互联网权限。当前原始解码文本见 [final-manifest.txt](evidence/phase1/release-37776005573/final-manifest.txt)，权限和 ABI 输出见 [本地 APK 检查 JSON](evidence/phase1/release-37776005573/apk-inspection-local.json)。

每次后续 APK 都需重新检查，首次包的结果不能自动授予新包同样状态。

## 8. 中国食品照片、真实OCR输出、旋转和裁剪

**最终Android测试job已实际成功。** [run 37781340401](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401)，job `113324913574`，test source `a0c85d544ed2bccea225ead8a4e063acccadb764`，App build `339a66991af93c488e1f1426a3f240edd82fc3ca`，同一APK `3dd6e764…`。session状态 `verified_android_emulated`，6份真实OCR与3项图片变换检查，不是真机验收。

环境：`sdk_gphone64_x86_64`、Android15/API35、官方Google APIs userdebug镜像、安全补丁2024-09-05；ARM bridge `libndk_translation` 0.2.3，SHA `9b5808354a85d722a290ae879400b909aa961955e80ea1a7e807aea9416d92f9`。4个必需ARM64库安装后摘要与APK一致。首次启动前飞行模式1、Wi-Fi0、GMS/GSF/Photos disabled，IPv4/IPv6 OUTPUT默认DROP，规则前后保留。实际设备[session.json](evidence/phase1/device-37781340401/session.json)与build/test身份分别保存。

可信取得的 [小型证据artifact11552408564](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401/artifacts/11552408564)：15,116,060 bytes，ZIP SHA `d6a5e6529c8fbf3804aa28692bb4285ceee3e0ccac0bf06a032cfa7c5ae50805`。它实际包含6份native/JS记录、4份处理图片/metadata、截图、session和CI一致性报告；已下载并校验。完整 [artifact11553038552](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401/artifacts/11553038552) 为48,957,940 bytes，GitHub报告digest `54ae589b9176d88a54b2b5db04d10bab6559817469e5ed025fb6d6c3fc1a8e10`，**没有在本地下载这个完整ZIP**，不声称本地重验全部原始导出子目录。

CI 对其实际6份导出的原图、processed图、record做完整摘要与证据检查，[evidence-consistency.json](evidence/phase1/device-37781340401/evidence-consistency.json) 为该次真实通过结果。本地小型包缺各record子目录的 `original.bin`/`processed.png`；本地另外核验六份原文、框、模型字段、原图fixture摘要，以及实际保留PNG的字节摘要和尺寸，结果见 [local-record-and-retained-image-check.json](evidence/phase1/device-37781340401/local-record-and-retained-image-check.json)。牛奶、右转、旋转往返和裁剪PNG取自本次small artifact；零食PNG取自先前已下载的完整artifact `37779323597` 的原始导出，其hash与本次输出相同。CI全文件检查、本地部分实物核验和记录schema一致性边界分开，不以parser检查单独认证执行真实性。

原生Kotlin Float与导出JS Number的JSON小数表示略有不同，本地核验其IEEE-754 Float32位值相同；实际confidence没有被业务修改。原文、框与计时字段也已比对。记录中的运行时路径保持原样，没有为让本地校验通过而重写JSON或重建处理图片。

| 原图与场景 | 原图SHA-256 | 实际处理与基线 |
| --- | --- | --- |
| `6923644266066.jpg`，1280×1700；特仑苏、配料/营养、小字、倾斜、复杂背景 | `dc87cc54d0a8a4a547d642f46ffb5ab2cbbaa677e2d8316dd4934690332d7103` | 不缩小，39块，2次；另有旋转往返39块和裁剪33块 |
| `6937003117814.jpg`，3024×4032；曲面、中文营养表、低对比小字 | `a5b53b885d8b464ac2adb3dfd3ab0e928ba5d10a9873e7fd421ea23080156af3` | sampleSize2→1512×2016、matrix0.5，21块，2次 |

这是两个有许可的归档实物包装，不是本轮新拍，拍摄设备/地点/时间未知；保留CC-BY-SA-3.0与smoothie-app/macrofactor/Open Food Facts归属。历史来源不是食品数据库/API，未迁移其营养字段或ML Kit结果；人工目读真值没有输入OCR。两图及派生变换仍只有两个商品，不把旋转/裁剪新增为真实拍摄样本。类别、反光、暗光、模糊等覆盖不足，不计算代表性准确率。

以下直接读取最终run的native JSON写入报告，原文、错字、单位和行顺序不修正。全量每块polygon、boundingBox、confidence、page、模型与图片摘要在原始文件保留。

**图1第一次原始输出**：[photo-1-run-1-native.json](evidence/phase1/device-37781340401/photo-1-run-1-native.json)。

```text
6L
好
特仑苏
营养成分表
项目
每100mL
NRV%
能量
309kJ
4%
蛋白质
3.6g
脂肪
6%
4.4g
%2
碳水化合物
5.0g
钠钙
58mg
3%
120mg
15%
配
料：生牛乳
产品类型：全脂灭菌乳
产品标准号：GB25190
生产日期：见包装喷码
保质期：6个月
生产厂两产地：具体见喷码前两位代码
存条件：常温密闭保存。
开启前，无需冷藏；
开启后，请立即饮用。
请物连同包装在微波炉中加热。
润费者热线：400-6603333
请勿乱扔空包
国人
PLEASE DISPOSE PROPERLY
保持环境酒洁
```

**图2第一次原始输出**：[photo-2-run-1-native.json](evidence/phase1/device-37781340401/photo-2-run-1-native.json)。

```text
营养成分表
每100克（g）
项目
NRV%
能量
2075千焦(k)
25%
蛋白质
21.0克(g)
35%
37.7克(g)
脂肪
63%
碳水化合物
19.0克(g）
6%
钠
1248毫克（mg）
62%
请你吃零食
商业信息中心《2022年中国休闲零食市场报告》
```

可辨中文和数字不等于表格正确结构化：全图把钠/钙合成“钠钙”，NRV出现“%2”而7%未独立保留；“请物…”、“润费者…”、“保持环境酒洁”是实际错文。图2“2075千焦(k)”漏J。对照照片的观察另写在报告，不改JSON；部分错文confidence>0.93。营养业务解析没有实现，不从这些字符串猜营养事实。

| 真实块（processed pixels） | boundingBox：left,top,right,bottom | 原始confidence |
| --- | --- | ---: |
| 图1“特仑苏” | 450,432,753,561 | 0.9979282 |
| 图1“钠钙” | 304,971,355,1062 | 0.9717849 |
| 图2“1248毫克（mg）” | 556,522,974,622 | 0.90365654 |
| 裁剪“860%28” | 553,707,645,898 | 0.2592969 |

图1score范围0.21275023–0.99994344，图2为0.8842335–0.9998801，裁剪为0.2592969–0.9999537；不是正确概率或准确率。低分块保留，高分错文不被自动纠正。page均0，坐标按各自processed图定义，不能直接混入原图坐标。

**实际生产UI变换验收**：

| 操作 | 实测结果与边界 |
| --- | --- |
| 手动顺时针90° | 1700×1280；matrix `[0,-1,1700,1,0,0,0,0,1]`，实际PNG SHA `c4d5276838e6b8d6d0f098a6ce93750d5b65f51125f62dc9e909f835f31bbf71`；UI、metadata、尺寸/摘要通过。没有单独对90°横置文字执行OCR或独立逐像素评分 |
| 手动逆时针90°往返 | 回到1280×1700，identity matrix；编码PNG SHA恢复 `ab0fa267a12b01474fad5dd95c315fc0fe6918b3b64d5cd08340bfead06c0c2a`，与基线字节相同；真实OCR39块，rawText/blocks与基线相同 |
| 10/10/80/80%矩形裁剪 | crop(left128,top170,right1152,bottom1530)，1024×1360；matrix `[1,0,-128,0,1,-170,0,0,1]`；实际PNG SHA `3a90d9e6ddd6e89ebc135168d7bdafe42df2d281f7ce996b2f79f44384abc138`；生产UI、实际文件和33块OCR通过，不声称独立逐像素验证 |

两图EXIF均reportedOrientation0（缺失/未知）→有效1；没有EXIF2–8/镜像实测。变换原图hash不变，处理图和完整operations/matrix另存；不覆盖原图。截图和metadata保存在最终证据目录；实际处理PNG按内容hash统一保存在 [actual-processed-images](evidence/phase1/actual-processed-images/)，来源关系见 [sources.json](evidence/phase1/actual-processed-images/sources.json)。

**裁剪后实际原文**：[processing-crop-run-native.json](evidence/phase1/device-37781340401/processing-crop-run-native.json)，不是把全图文字人工删几行。

```text
Tetra Pak
特仑苏
营养成分表
项目
每100mL
NRV%
能量
309kJ
4%
蛋白质
3.6g
860%28
脂肪
4.4g
碳水化合物
5.0g
钠
58mg
钙
120mg
15%
配
料：生牛乳
产品类型：全脂灭菌乳
产品标准号：GB25190
生产日期：见包装喷码
保质期：6个月
生产厂级产地：具体见喷码前两位代码
存条件：常温密闭保存。
开启前，无需冷藏；
开启后，请立即饮用。
请勿连同包装在微波炉中加热。
润费者热线：400-6603333
```

裁剪使钠/钙分为两块，警示字“勿”在本次正确，但产生NRV合并错文“860%28”，且“润费者…”仍错；不能称裁剪全面提高准确率。当前保留这种真实变化，没有用原图输出或业务parser覆盖。

最终6次OCR原始JSON、JS记录、实际UI截图、变换metadata与session保留于 `docs/evidence/phase1/device-37781340401/`；实际PNG原样保存在共享的 `actual-processed-images/`。旧4次基线及失败记录不改。协议见 [TestProtocol.md](TestProtocol.md)。

<details>
<summary>历史构建、安装与启动失败：证据保留，不覆盖本次真实基线</summary>

本地无 KVM 的模拟器启动不稳定，出现 zygote/system_server 重启；未安装目标 APK，未执行 OCR。此为测试环境 `error`，不能把它记录为 App 崩溃或模型失败。

首次 GitHub KVM 设备作业 `113192732753` 也尚未启动 Android：udev 规则异步应用产生了设备存在但暂不可写的竞态。`68beb10` 加入 udev settle，并将权限修复严格限于测试 runner 的 `/dev/kvm`。独立重测试工作流直接取回上述已检查 APK，核验来源、完整 APK 和模型/config 摘要；它不重编译或替换待测包。

独立重测 [Actions run 37773783460](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37773783460)，测试工具 commit `68beb1088bcaa4de9eb708b8642e7c485b89c12b`、设备 job `113299503239`，已实际启动 Android 并完成目标 APK 安装。实际记录如下：

| 已实际执行项目 | 设备证据 |
| --- | --- |
| KVM / Android 启动 | KVM 设备可访问；脚本确认 `sys.boot_completed` 后继续，Android 11 / API 30 |
| 设备 | `sdk_gphone_x86_64`，Google APIs userdebug 模拟器，security patch 2021-08-05 |
| ABI | `x86_64,x86,arm64-v8a,armeabi-v7a,armeabi`；不是 ARM64 真机 |
| 翻译层 | `ro.dalvik.vm.native.bridge=libndk_translation.so`，`/system/lib64/libndk_translation.so` 摘要 `09ed4a608ec4434cb021751320d59ec1e81086617af07b880eb8c95073d72199` |
| 目标包安装 | `adb install -r` exit 0，package 信息 `primaryCpuAbi=arm64-v8a`、version 0.1.0，无 debuggable 标志 |
| 安装包身份 | 与本报告 `3ef4198` APK 完整 SHA-256 和字节数一致 |
| 离线设置 | 计划首次启动前，飞行模式 1、Wi-Fi 0、data disabled；IPv4 与 IPv6 OUTPUT 默认 policy DROP，前后规则原样保留 |
| Google 服务 | `com.google.android.gms`、`com.google.android.gsf`、`com.google.android.apps.photos` 实际 disabled-user；没有声称系统镜像不含它们 |

**此 run 最终为 `error`，尚未启动 OCR App。** 图片文件实际 push 成功，但测试媒体索引使用 `/sdcard` 别名；Android MediaProvider 要求路径位于 `/storage/emulated/0`，导致第二张 fixture 索引失败。session 的 `runs` 为 `[]`，没有原生 OCR 记录。此为测试图片准备/脚本错误，不是 App、ORT、模型或相册调用失败，也不把未启动 App 的离线设置当作离线 OCR 成功。`64808a5` 已使用 canonical storage path 修复并推送，下一次真实重测已证明两图媒体索引成功。

这次已证明 Android 环境启动和 ARM64-only 包安装；翻译库存在不能替代实际 ARM64 推理执行证明。镜像自带官方 `libndk_translation`，后续成功也必须标为 x86_64 Android + ARM native translation，不能称为 ARM64 真机兼容性或手机性能测量。

原始失败 session 和小型设备证据保留于 `docs/evidence/phase1/device-attempt-37773783460/`，没有人工 OCR 输出。

**旧包启动失败重测 [run 37774801831](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37774801831)：** 测试工具 commit `64808a569ad9e36d4d5d87133db5f8b6633c8c36`，仍测试同一 `3ef4198` / `4bf12e9e…` APK；两个 fixture 均已导入并成功通过媒体索引准备，随后实际尝试启动 `com.hukang.china/.MainActivity`。此 run 的脚本最终报“找不到相册选择按钮”，但真实 logcat 表明原因是启动前期崩溃，不是 UI 匹配或相册权限问题：

```text
FATAL EXCEPTION: main
com.facebook.soloader.SoLoaderDSONotFoundError:
  couldn't find DSO to load: libreactnative.so
DirectApkSoSource[root = [.../base.apk!/lib/x86_64]]
Native lib dir: .../lib/arm64
```

实际 APK 只包含 `arm64-v8a`。该仿真环境的 SoLoader 直接 APK 加载源选择了 `lib/x86_64`，而 `extractNativeLibs=false` 下安装的 ARM64 native lib 目录没有解出的库，导致加载失败。日志在 React Native `MainApplication.onCreate` 的初始化阶段终止；JS 页面和 `HukangVision` 尚未执行，session 的 `runs` 仍为 `[]`。因此原文、框、confidence、模型加载和 OCR 性能仍是 `not_run`；不能把错误截图、人工真值或 UI 错误提示当作识别输出。

这是旧 `3ef4198` App/RN 打包与该 native translation 环境的启动兼容性问题。ARM64 真机未执行，影响范围不能外推。`a0a491a` 已正常启用 legacy native library packaging，`339a669` 新包已在真实 APK 和实际安装检查中证明解库配置、ARM64 文件与摘要一致。没有伪装 ABI、加入 x86 模型、改模型来源或在线兜底。新包下述实际安装和加载记录已证明缺库问题实证修复；后续翻译层错误单独记录，不将“缺库修复”说成“启动整体成功”。

该次原始 session/设备规则和从原始 logcat **截取**的崩溃文本保留于 `docs/evidence/phase1/device-attempt-37774801831/`。截取文件注明完整源日志 SHA-256 和行号，不冒充完整日志。这些历史失败仅属于旧 `3ef4198` / `4bf12e9e…` 包，不能用新包修复改变它的原始测试结论。

**API 30 历史实际运行 [run 37776005573](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573)：** Android job `113311498884` 使用 build/test commit `339a66991af93c488e1f1426a3f240edd82fc3ca`，APK 是本报告 `3dd6e764…`，Android/API/翻译库与前次 API 30 环境一致。

实际安装后，`libreactnative.so`、`libopencv_java4.so`、`libonnxruntime.so`、`libonnxruntime4j_jni.so` 均存在于 package 的 `/lib/arm64/`，4 个摘要逐一与实际 APK 匹配；原始 `installedNativeLibraries` 保留在 session。启动已越过旧 SoLoader 缺库失败，随后真实 logcat/tombstone 出现：

```text
ndk_translation: Undefined instruction 0x7ee1b800
Fatal signal 4 (SIGILL) in tid ... (mqt_v_js), pid ... (com.hukang.china)
libndk_translation.so (...DecodeSimdScalarTwoRegMisc...)
```

回溯指向该系统镜像的 ARM 指令翻译/解码，发生在 OCR 前。测试脚本立即记录 production App process 不再运行，未继续伪造点击或生成成绩；session 为 `error`，`runs=[]`、`processingChecks=[]`。这不是 Paddle 模型识别失败、联网失败或 confidence 为零，而是实际 Android 启动执行阻塞。不能仅由回溯断言所有手机受影响，亦不能断言换镜像一定解决。

原始小型 session/安装库身份/前后规则以及注明完整源 SHA、行号的 tombstone 截取保留于 `docs/evidence/phase1/device-attempt-37776005573/`。脚本原计划 4 次全图基线、旋转往返后和矩形裁剪后 OCR，共 6 次；**6 次是计划，本次实际 OCR 次数为 0，未运行不计算识别准确率。** 原文、框、分数、模型加载时长、OCR 耗时和内存均未产生。

后续已使用官方 API 35 镜像对同一 `339a669` / `3dd6e764…` APK 重测，取得本节已列出的真实基线与最终6次成功记录；未为换镜像更换模型、伪装 ABI 或重编 App。API 30 的旧失败仍是该环境的实际结论。


此前 [run 37779323597](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37779323597) 已完成4次基线，但其helper在“右转90°”按钮定位失败。原始4份输出、时长/内存和最终failure保留于 `device-attempt-37779323597/`。后续修复只改测试工具，未重编或更换App；不能把旧job改成success。本报告最终主要成绩来自新的成功run37781340401，不混用两次session的测量。

</details>

## 9. 模型加载、OCR与总耗时

状态：最终API35的6次原生测量为 `verified_android`，没有理论估算或host推理成绩。

| 实际运行 | modelLoadMs | ocrMs | totalMs | detInferenceMs | recInferenceMs |
| --- | ---: | ---: | ---: | ---: | ---: |
| 图1首次冷加载 | 1,384 | 86,121 | 87,641 | 8,715 | 76,858 |
| 图1第二次 | 0 | 84,178 | 84,259 | 8,764 | 74,933 |
| 图2第一次（模型已加载） | 0 | 48,382 | 48,536 | 8,468 | 39,536 |
| 图2第二次 | 0 | 48,695 | 48,848 | 8,534 | 39,786 |
| 图1旋转往返后 | 0 | 83,652 | 83,778 | 8,582 | 74,602 |
| 图1矩形裁剪后 | 0 | 73,272 | 73,344 | 8,524 | 64,375 |

首次 `modelLoadMs=1384`，记录另有 `modelColdLoadMs=1079`，不同计时字段原样保留，不相互替换。图2首次是该图第一次，模型已在同进程加载；不是第二个模型冷启动。

本轮图1全图OCR84.18–86.12秒、图2全图48.38–48.70秒，旋转往返83.652秒，裁剪73.272秒。识别网络约39.54–76.86秒，占大头；检测约8.47–8.76秒。前次独立run37779323597的4次基线为85.06–88.55秒/49.25–49.87秒，历史测量保留，不混做本轮数值或选最好结果。

这些是x86_64宿主执行ARM native translation的CPU测量，**不是ARM64手机速度，不能承诺手机同样耗时或移动端性能达标**。每图基线仅2次，不计算P50/P95或稳定性。裁剪只有1次，只能说明该次流程通过，不当作一般加速结论。真机性能/多次数/后台重启仍未测。7m16s是APK构建时间，与OCR速度无关。

## 10. 内存情况

状态：最终API35实际原生采样 `verified_android`。采样间隔50ms，记录OCR期间观测最高PSS/Java/native heap；不是瞬时绝对峰值RSS。

| 实际运行 | 观测最高PSS（KiB / MiB） | 观测最高Java heap（MiB） | 观测最高native heap（MiB） | 样本数 |
| --- | ---: | ---: | ---: | ---: |
| 图1首次冷加载 | 529,067 / 516.67 | 56.03 | 265.13 | 1,752 |
| 图1第二次 | 657,407 / 642.00 | 53.94 | 404.67 | 1,685 |
| 图2第一次（模型已加载） | 687,791 / 671.67 | 46.66 | 435.06 | 970 |
| 图2第二次 | 693,719 / 677.46 | 49.22 | 435.23 | 976 |
| 图1旋转往返后 | 711,565 / 694.89 | 53.70 | 449.47 | 1,675 |
| 图1矩形裁剪后 | 718,063 / 701.23 | 47.74 | 450.33 | 1,465 |

本轮最大采样PSS为 **718,063 KiB / 701.23 MiB**。前次4次基线最高为695,363 KiB/679.07MiB；本次增加了变换/图片和2次OCR，不能仅比较两次最大值推断永久增长或泄漏。

原始字节/KiB字段完整在JSON。PSS包含App的UI、图片、模型、runtime等；Java/native heap不简单相加为全进程RAM，宿主模拟器用量不等于App内存。短时尖峰可能漏采。`dumpsys meminfo`是一次快照，不是峰值。

同进程6次采样显示PSS/native heap增加，需要真机长序列、session释放和生命周期检查；这些数据不能独自证明泄漏。翻译层环境的内存不代表ARM64手机。APK/模型文件大小也不作为运行内存。

## 11. 当前已知问题、限制和未测项目

| 项目 | 类型 | 最终实际状态与影响 |
| --- | --- | --- |
| 官方模型本地下载失败 | 构建环境，已解决交付 | Actions直接获取官方BOS，固定ONNX/config/字典SHA通过并可信取回；无第三方文件或运行时下载 |
| Gradle发布配置/原生注册 | 已验证修复 | library版本与autolinking类修复；真实release编译、API35实际模块调用/模型初始化通过 |
| RN AAR本地重定向/SDK工具PATH | 构建环境/脚本 | Actions真实编译完成，SDK绝对路径修复；不宣称本地网络策略全放行 |
| aapt2字段误判 | 已验证修复 | 当前实际APK完整检查通过，首次错误JSON保留 |
| 无KVM/权限race/MediaProvider别名 | 历史测试环境/helper | 后续KVM启动、canonical索引均实证通过，不删除旧失败 |
| SoLoader缺库 | 旧包打包兼容性，已修复 | 新包解出4个ARM64库，安装hash与APK一致，模型实际执行；旧4bf失败结论保留 |
| API30 ARM translation SIGILL | 旧镜像执行兼容性 | 同一3dd包API30失败；API35 bridge0.2.3完成6次流程。不是所有Android版本或真机已通过 |
| Android15 picker/旋转控件定位 | helper，已实证修复 | 仅改测试工具；最终生产UI相册、右转/左转、裁剪/OCR真实通过，无App测试后门 |
| OCR错文/NRV合行/单位漏字 | 已观测模型/检测/图像质量 | 全图%2/钠钙、裁剪860%28、高分错字及图2漏J原样保留；业务营养解析未实现，不猜数值 |
| 单次90°横置图OCR/精确像素评估 | 未测/边界 | 90°变换UI、尺寸、matrix/PNG真实通过；OCR在往返恢复后执行。没有独立像素解码评分/每框IoU |
| EXIF2–8/镜像 | 未测 | 样本只缺失EXIF→有效1，源码支持不等于多方向实际验收 |
| 手机速度/内存/兼容性 | 未测 | 全部现有成绩为API35仿真翻译层；ARM64真机未执行，不称性能达标 |
| 生命周期/长序列 | 未完整测 | 首次离线初始化、同进程6次通过；后台、强制停止/重启、长期内存释放未完整验证 |
| 测试集覆盖 | 限制 | 2张有许可归档包装，不是本轮新拍；多数类别、反光/模糊/暗光不足，未计算代表性准确率 |
| 本地取得证据范围 | 实证边界 | 下载小型真实记录/变换PNG；完整48.96MB ZIP未本地下载。CI6份全导出检查通过，本地实物/字段核验单独记录 |
| 实验签名 | 分发限制 | 临时release-mode证书，非正式商店签名；不同构建可能需卸载旧包，卸载清除实验记录 |
| 食品库/扫码/SQLite/AI | 本轮范围 | 仅独立接口/模型，未开始Phase2，也不作为OCR fallback |

原文和所有块永久保留；没有AI、数据库或人工值覆盖错文，confidence不是准确概率。原始OCR与未来解释/用户确认保持分离。

## 12. 下一阶段建议与停止边界

**本轮Phase1核心技术验证已完成：官方国产模型在实际Android App中，断网首次启动后经生产UI执行中文OCR，原文/框/分数/测量留存，并实际验证手动旋转、旋转往返后和裁剪后识别。** 最终CI设备job成功，但这是明确环境与有限样本的技术证明，不是ARM64真机、全方向EXIF、全部食品或正式生产发布验收。

优先补充真实ARM64手机离线运行与性能、多方向EXIF/镜像、有权使用的真实中国食品手机照片、后台/重启和长序列内存；现有高分错文/NRV合行需作为图像和检测评估输入，不靠修改原文掩盖。不要从仿真耗时推算手机速度。

完成本轮后停止，不继续Phase2。只有用户确认后才建议实现本地食品记录、营养业务解析、用户确认/修改、SQLite和独立条码。解析/修订引用原始OCR，不覆盖rawText、不用NRV%反推值冒充包装原文。中国中央食品服务仅保留未来接口，没有建设云服务、批量录库、药品、AI、提醒或完整主页。

最终结论按实证分开：Phase0工程/图标/依赖审计通过；Phase1 API35离线OCR技术链与所测试旋转/裁剪通过；真机、多方向EXIF、代表性质量和正式发布仍未验证。等待用户确认后续范围。

## 附录：原始证据与复核入口

| 证据 | 位置 |
| --- | --- |
| 官方下载身份和获取实测 | `docs/evidence/phase1/official-model-acquisition-37737586793.json` |
| 独立模型/config 来源锁 | `models/paddleocr/v5-mobile/source-lock.json` |
| 官方配置、字典和版本明细 | `models/paddleocr/v5-mobile/manifest.json`、`docs/OcrModelManifest.md` |
| 第一次真实 release Gradle 原始输出 | `docs/evidence/phase1/first-release-37738623906/gradle-release.txt` |
| 第一次实际 APK 解码 Manifest | `docs/evidence/phase1/first-release-37738623906/final-manifest.txt` |
| 第一次 APK 实测及原始检查错误 | `docs/evidence/phase1/first-release-37738623906/apk-inspection.json` |
| 第一份交付旧包的完整复核与身份 | `docs/evidence/phase1/release-37740050254/`，APK SHA `4bf12e9e…` |
| 当前新 APK 的本地完整复核 | `docs/evidence/phase1/release-37776005573/apk-inspection-local.json` |
| 当前新 APK 解码 Manifest | `docs/evidence/phase1/release-37776005573/final-manifest.txt` |
| 当前新 APK 分片及完整身份 | `docs/evidence/phase1/release-37776005573/apk-transfer-manifest.json` |
| 新包可信 GitHub artifact 来源/提交/摘要 | `docs/evidence/phase1/release-37776005573/artifact-metadata.json` |
| 不重编译已检查 APK 的独立设备重测 | `.github/workflows/phase1-device-retest.yml` |
| 实际 Android 安装成功、媒体索引失败 session | `docs/evidence/phase1/device-attempt-37773783460/session.json` |
| 该次待测 APK/测试工具身份 | `docs/evidence/phase1/device-attempt-37773783460/build-identity.json` |
| 该次 KVM、禁用服务和前后 OUTPUT 规则 | `docs/evidence/phase1/device-attempt-37773783460/` 下原始小型文本 |
| 第二次真实启动失败和待测身份 | `docs/evidence/phase1/device-attempt-37774801831/{session.json,build-identity.json}` |
| 第二次 RN 启动崩溃原始日志截取 | `docs/evidence/phase1/device-attempt-37774801831/startup-crash-excerpt.txt`，含源 SHA 与行号 |
| 新包实际安装库摘要、SIGILL 前后 session | `docs/evidence/phase1/device-attempt-37776005573/{session.json,build-identity.json}` |
| 新包翻译层崩溃原始 tombstone 截取 | `docs/evidence/phase1/device-attempt-37776005573/tombstone-excerpt.txt`，含完整源 SHA 与行号 |
| 最终API35成功的6次离线OCR与3项图片检查 | `docs/evidence/phase1/device-37781340401/{session.json,build-identity.json,artifact-identity.json}` |
| 最终全量rawText/每块几何/分数/测量 | 同目录 `photo-{1,2}-run-{1,2}-native.json`、`processing-{roundtrip,crop}-run-native.json` 与6份对应原始 `record.json` |
| 最终实际UI图像框/原文和旋转/裁剪截图 | 同目录 `photo-{1,2}-actual-{boxes,text}.png`、`processing-*.png` |
| 最终图片变换metadata/matrix | 同目录 `processing-{baseline,right-90,roundtrip,crop}-image.json` |
| 最终CI对6份完整导出的一致性检查 | `docs/evidence/phase1/device-37781340401/evidence-consistency.json` |
| 最终本地6份字段与实际保留图核验/边界 | `docs/evidence/phase1/device-37781340401/local-record-and-retained-image-check.json`、`README.md` |
| 历史API35离线4次基线与helper失败 | `docs/evidence/phase1/device-attempt-37779323597/session.json`、`build-identity.json`、`artifact-identity.json` |
| 实际原样processed PNG及原图关系 | `docs/evidence/phase1/actual-processed-images/` 与 `sources.json` |
| 历史4次真实导出的一致性复核 | `docs/evidence/phase1/device-attempt-37779323597/baseline-evidence-consistency-local.json` |
| 实际 resolved release 依赖原始报告 | `docs/evidence/phase1/release-dependencies-local-64808a5.txt` |
| 图片原字节、归属与真实覆盖范围 | `tests/fixtures/china-food/manifest.json`、`README.md`、两份 `.source.json` |
| Android 实测方法与证据要求 | `docs/TestProtocol.md` |
| 生产与构建供应链分开审计 | `docs/MainlandDependencyAudit.md` |

复核已推送修改范围：在新仓库运行 `git diff --name-status a3864c6 10f0ea9`。当前APK身份、历史失败、4次历史基线和最终6次成功的原始记录均已提交并推送保存；本报告最终更新等待统一提交。App源目录从当前APK的 `339a669` 至证据快照 `10f0ea9` 无修改，测试工具来源另记为 `a0c85d5`；不把后续文档/工具提交伪装成APK build source，也不覆盖原始成功或失败证据。

<details>
<summary>已推送快照 10f0ea9：实际 259 个路径（新增 258，修改 1，删除0）</summary>

```text
A	.github/workflows/phase1-device-retest.yml
A	.github/workflows/phase1-device.yml
A	.github/workflows/phase1-release.yml
A	.gitignore
M	README.md
A	android/.gitignore
A	android/app/build.gradle
A	android/app/proguard-rules.pro
A	android/app/src/debug/AndroidManifest.xml
A	android/app/src/debugOptimized/AndroidManifest.xml
A	android/app/src/main/AndroidManifest.xml
A	android/app/src/main/java/com/hukang/china/MainActivity.kt
A	android/app/src/main/java/com/hukang/china/MainApplication.kt
A	android/app/src/main/res/drawable-hdpi/splashscreen_logo.png
A	android/app/src/main/res/drawable-mdpi/splashscreen_logo.png
A	android/app/src/main/res/drawable-xhdpi/splashscreen_logo.png
A	android/app/src/main/res/drawable-xxhdpi/splashscreen_logo.png
A	android/app/src/main/res/drawable-xxxhdpi/splashscreen_logo.png
A	android/app/src/main/res/drawable/ic_launcher_background.xml
A	android/app/src/main/res/drawable/rn_edit_text_material.xml
A	android/app/src/main/res/mipmap-hdpi/ic_launcher.webp
A	android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.webp
A	android/app/src/main/res/mipmap-mdpi/ic_launcher.webp
A	android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.webp
A	android/app/src/main/res/mipmap-xhdpi/ic_launcher.webp
A	android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.webp
A	android/app/src/main/res/mipmap-xxhdpi/ic_launcher.webp
A	android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.webp
A	android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.webp
A	android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.webp
A	android/app/src/main/res/values-night/colors.xml
A	android/app/src/main/res/values/colors.xml
A	android/app/src/main/res/values/strings.xml
A	android/app/src/main/res/values/styles.xml
A	android/build.gradle
A	android/gradle.properties
A	android/gradle/wrapper/gradle-wrapper.jar
A	android/gradle/wrapper/gradle-wrapper.properties
A	android/gradlew
A	android/gradlew.bat
A	android/settings.gradle
A	app.json
A	artifacts/README.md
A	assets/icon.png
A	docs/Architecture.md
A	docs/FoodDataSources.md
A	docs/MainlandDependencyAudit.md
A	docs/OcrModelManifest.md
A	docs/Phase1AcceptanceReport.md
A	docs/Phase1Progress.md
A	docs/TestProtocol.md
A	docs/evidence/phase1/actual-processed-images/3a90d9e6ddd6e89ebc135168d7bdafe42df2d281f7ce996b2f79f44384abc138.png
A	docs/evidence/phase1/actual-processed-images/45b7133d873e7965306bd2caafa0752479617cd88d4857597fb203a9daf5e5ea.png
A	docs/evidence/phase1/actual-processed-images/ab0fa267a12b01474fad5dd95c315fc0fe6918b3b64d5cd08340bfead06c0c2a.png
A	docs/evidence/phase1/actual-processed-images/c4d5276838e6b8d6d0f098a6ce93750d5b65f51125f62dc9e909f835f31bbf71.png
A	docs/evidence/phase1/actual-processed-images/sources.json
A	docs/evidence/phase1/device-37781340401/README.md
A	docs/evidence/phase1/device-37781340401/artifact-identity.json
A	docs/evidence/phase1/device-37781340401/build-identity.json
A	docs/evidence/phase1/device-37781340401/device-job-excerpt.txt
A	docs/evidence/phase1/device-37781340401/evidence-consistency.json
A	docs/evidence/phase1/device-37781340401/final-connectivity.txt
A	docs/evidence/phase1/device-37781340401/final-ipv4-rules.txt
A	docs/evidence/phase1/device-37781340401/final-ipv6-rules.txt
A	docs/evidence/phase1/device-37781340401/final-properties.txt
A	docs/evidence/phase1/device-37781340401/initial-ipv4-rules.txt
A	docs/evidence/phase1/device-37781340401/initial-ipv6-rules.txt
A	docs/evidence/phase1/device-37781340401/installed-package.txt
A	docs/evidence/phase1/device-37781340401/ip6tables-rules.txt
A	docs/evidence/phase1/device-37781340401/iptables-rules.txt
A	docs/evidence/phase1/device-37781340401/kvm.txt
A	docs/evidence/phase1/device-37781340401/last-window.xml
A	docs/evidence/phase1/device-37781340401/local-record-and-retained-image-check.json
A	docs/evidence/phase1/device-37781340401/meminfo-snapshot.txt
A	docs/evidence/phase1/device-37781340401/photo-1-actual-boxes.png
A	docs/evidence/phase1/device-37781340401/photo-1-actual-text.png
A	docs/evidence/phase1/device-37781340401/photo-1-run-1-native.json
A	docs/evidence/phase1/device-37781340401/photo-1-run-1/record.json
A	docs/evidence/phase1/device-37781340401/photo-1-run-2-native.json
A	docs/evidence/phase1/device-37781340401/photo-1-run-2/record.json
A	docs/evidence/phase1/device-37781340401/photo-2-actual-boxes.png
A	docs/evidence/phase1/device-37781340401/photo-2-actual-text.png
A	docs/evidence/phase1/device-37781340401/photo-2-run-1-native.json
A	docs/evidence/phase1/device-37781340401/photo-2-run-1/record.json
A	docs/evidence/phase1/device-37781340401/photo-2-run-2-native.json
A	docs/evidence/phase1/device-37781340401/photo-2-run-2/record.json
A	docs/evidence/phase1/device-37781340401/processing-baseline-image.json
A	docs/evidence/phase1/device-37781340401/processing-crop-actual-boxes.png
A	docs/evidence/phase1/device-37781340401/processing-crop-actual-text.png
A	docs/evidence/phase1/device-37781340401/processing-crop-image.json
A	docs/evidence/phase1/device-37781340401/processing-crop-preview-ui.png
A	docs/evidence/phase1/device-37781340401/processing-crop-run-native.json
A	docs/evidence/phase1/device-37781340401/processing-crop-run/record.json
A	docs/evidence/phase1/device-37781340401/processing-right-90-image.json
A	docs/evidence/phase1/device-37781340401/processing-right-90-ui.png
A	docs/evidence/phase1/device-37781340401/processing-roundtrip-image.json
A	docs/evidence/phase1/device-37781340401/processing-roundtrip-run-native.json
A	docs/evidence/phase1/device-37781340401/processing-roundtrip-run/record.json
A	docs/evidence/phase1/device-37781340401/processing-roundtrip-ui.png
A	docs/evidence/phase1/device-37781340401/root-identity.txt
A	docs/evidence/phase1/device-37781340401/session.json
A	docs/evidence/phase1/device-attempt-37773783460/build-identity.json
A	docs/evidence/phase1/device-attempt-37773783460/disabled-packages.txt
A	docs/evidence/phase1/device-attempt-37773783460/final-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37773783460/final-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37773783460/initial-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37773783460/initial-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37773783460/kvm.txt
A	docs/evidence/phase1/device-attempt-37773783460/root-identity.txt
A	docs/evidence/phase1/device-attempt-37773783460/session.json
A	docs/evidence/phase1/device-attempt-37774801831/build-identity.json
A	docs/evidence/phase1/device-attempt-37774801831/disabled-packages.txt
A	docs/evidence/phase1/device-attempt-37774801831/final-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37774801831/final-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37774801831/initial-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37774801831/initial-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37774801831/kvm.txt
A	docs/evidence/phase1/device-attempt-37774801831/root-identity.txt
A	docs/evidence/phase1/device-attempt-37774801831/session.json
A	docs/evidence/phase1/device-attempt-37774801831/startup-crash-excerpt.txt
A	docs/evidence/phase1/device-attempt-37776005573/arm-instruction-analysis.txt
A	docs/evidence/phase1/device-attempt-37776005573/build-identity.json
A	docs/evidence/phase1/device-attempt-37776005573/disabled-packages.txt
A	docs/evidence/phase1/device-attempt-37776005573/final-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37776005573/final-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37776005573/initial-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37776005573/initial-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37776005573/kvm.txt
A	docs/evidence/phase1/device-attempt-37776005573/root-identity.txt
A	docs/evidence/phase1/device-attempt-37776005573/session.json
A	docs/evidence/phase1/device-attempt-37776005573/startup-crash-excerpt.txt
A	docs/evidence/phase1/device-attempt-37776005573/tombstone-excerpt.txt
A	docs/evidence/phase1/device-attempt-37779323597/README.md
A	docs/evidence/phase1/device-attempt-37779323597/artifact-identity.json
A	docs/evidence/phase1/device-attempt-37779323597/baseline-evidence-consistency-local.json
A	docs/evidence/phase1/device-attempt-37779323597/build-identity.json
A	docs/evidence/phase1/device-attempt-37779323597/disabled-packages.txt
A	docs/evidence/phase1/device-attempt-37779323597/final-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37779323597/final-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37779323597/initial-ipv4-rules.txt
A	docs/evidence/phase1/device-attempt-37779323597/initial-ipv6-rules.txt
A	docs/evidence/phase1/device-attempt-37779323597/installed-package.txt
A	docs/evidence/phase1/device-attempt-37779323597/last-window.xml
A	docs/evidence/phase1/device-attempt-37779323597/meminfo-snapshot.txt
A	docs/evidence/phase1/device-attempt-37779323597/photo-1-actual-boxes.png
A	docs/evidence/phase1/device-attempt-37779323597/photo-1-actual-text.png
A	docs/evidence/phase1/device-attempt-37779323597/photo-1-run-1-native.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-1-run-1/record.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-1-run-2-native.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-1-run-2/record.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-2-actual-boxes.png
A	docs/evidence/phase1/device-attempt-37779323597/photo-2-actual-text.png
A	docs/evidence/phase1/device-attempt-37779323597/photo-2-run-1-native.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-2-run-1/record.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-2-run-2-native.json
A	docs/evidence/phase1/device-attempt-37779323597/photo-2-run-2/record.json
A	docs/evidence/phase1/device-attempt-37779323597/processing-baseline-image.json
A	docs/evidence/phase1/device-attempt-37779323597/session.json
A	docs/evidence/phase1/first-release-37738623906/apk-inspection.json
A	docs/evidence/phase1/first-release-37738623906/final-manifest.txt
A	docs/evidence/phase1/first-release-37738623906/gradle-release.txt
A	docs/evidence/phase1/first-release-37738623906/official-model-acquisition.json
A	docs/evidence/phase1/official-model-acquisition-37737586793.json
A	docs/evidence/phase1/release-37740050254/apk-extraction-negative-control-339a669.json
A	docs/evidence/phase1/release-37740050254/apk-inspection-local.json
A	docs/evidence/phase1/release-37740050254/apk-transfer-manifest.json
A	docs/evidence/phase1/release-37740050254/artifact-metadata.json
A	docs/evidence/phase1/release-37740050254/final-manifest.txt
A	docs/evidence/phase1/release-37776005573/all-artifact-metadata.json
A	docs/evidence/phase1/release-37776005573/apk-inspection-local.json
A	docs/evidence/phase1/release-37776005573/apk-transfer-manifest.json
A	docs/evidence/phase1/release-37776005573/artifact-metadata.json
A	docs/evidence/phase1/release-37776005573/final-manifest.txt
A	docs/evidence/phase1/release-37776005573/gradle-build-excerpt.txt
A	docs/evidence/phase1/release-dependencies-local-64808a5.txt
A	expo-env.d.ts
A	models/paddleocr/v5-mobile/LICENSE-PaddleOCR.txt
A	models/paddleocr/v5-mobile/NOTICE.md
A	models/paddleocr/v5-mobile/detector.onnx
A	models/paddleocr/v5-mobile/detector.yml
A	models/paddleocr/v5-mobile/inference.yml
A	models/paddleocr/v5-mobile/manifest.json
A	models/paddleocr/v5-mobile/recognizer.onnx
A	models/paddleocr/v5-mobile/source-lock.json
A	modules/hukang-vision/android/THIRD_PARTY_NOTICES.md
A	modules/hukang-vision/android/build.gradle
A	modules/hukang-vision/android/consumer-rules.pro
A	modules/hukang-vision/android/licenses/PaddleOCR-APACHE-2.0.txt
A	modules/hukang-vision/android/src/main/AndroidManifest.xml
A	modules/hukang-vision/android/src/main/java/com/hukang/vision/HukangVisionModule.kt
A	modules/hukang-vision/android/src/main/java/com/hukang/vision/ImageStore.kt
A	modules/hukang-vision/android/src/main/java/com/hukang/vision/MemorySampler.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/EngineConfig.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/PaddleOCRConfig.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/engine/DetectionEngine.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/engine/OCREngine.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/engine/OCREngineResult.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/engine/ORTSessionManager.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/engine/RecognitionEngine.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/model/ModelConfig.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/model/OCRBox.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/model/OCRError.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/model/OCRResult.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/postprocess/BoxSorter.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/postprocess/CTCDecoder.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/postprocess/DBPostProcessor.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/postprocess/PolygonUnclip.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/postprocess/QuadGeometry.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/postprocess/QuadTextCrop.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/preprocess/DetPreprocessor.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/preprocess/RecPreprocessor.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/util/BitmapUtils.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/util/ImageUtils.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/util/MathUtils.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/util/OpenCVUtils.kt
A	modules/hukang-vision/android/src/main/java/com/paddle/ocr/util/YamlUtils.kt
A	modules/hukang-vision/expo-module.config.json
A	modules/hukang-vision/package.json
A	package-lock.json
A	package.json
A	plugins/withOfflineAndroid.cjs
A	scripts/android-device-evidence.py
A	scripts/fetch-models.py
A	scripts/run-android-ocr-lab.py
A	scripts/split-apk.py
A	scripts/validate-ocr-evidence.mjs
A	scripts/verify-apk.py
A	scripts/verify-assets.mjs
A	scripts/verify-fixtures.mjs
A	src/app/_layout.tsx
A	src/app/index.tsx
A	src/application/ports/BarcodeScanner.ts
A	src/application/ports/ChinaFoodRepository.ts
A	src/application/ports/MedicineRepository.ts
A	src/application/ports/OcrEngine.ts
A	src/application/usecases/OcrLabUseCases.ts
A	src/domain/barcode/types.ts
A	src/domain/evidence/types.ts
A	src/domain/food/types.ts
A	src/domain/medicine/types.ts
A	src/domain/ocr/types.ts
A	src/features/ocr-lab/OcrLabScreen.tsx
A	src/features/ocr-lab/evidence.ts
A	src/features/ocr-lab/geometry.ts
A	src/features/ocr-lab/useOcrLab.ts
A	src/infrastructure/food/README.md
A	src/infrastructure/ocr/HukangVision.ts
A	src/infrastructure/ocr/validateNativeResult.ts
A	tests/fixtures/china-food/6923644266066.jpg
A	tests/fixtures/china-food/6923644266066.source.json
A	tests/fixtures/china-food/6937003117814.jpg
A	tests/fixtures/china-food/6937003117814.source.json
A	tests/fixtures/china-food/README.md
A	tests/fixtures/china-food/manifest.json
A	tests/ocr-evidence-validator.test.mjs
A	tests/ocr-geometry.test.mjs
A	tests/ocr-native-result.test.mjs
A	tests/test_model_acquisition.py
A	tsconfig.json
```

</details>
