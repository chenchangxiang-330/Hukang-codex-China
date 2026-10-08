# Hukang China Phase 1 验收报告

报告日期：2026-10-08（Asia/Shanghai）。范围：Phase 0、Phase 1；没有开始 Phase 2。本文以 `codex/mainland-v2` 的 `58a50d9` 为已推送文档/工具快照；当前 APK 构建 source 为 `339a66991af93c488e1f1426a3f240edd82fc3ca`。当前新包与历史 `3ef4198` 包的证据分开记录。

**新 release APK 的 native 库打包和实际安装解库均通过，旧 SoLoader 缺库问题已实证解决；API 30 的 ARM 翻译层随后出现 SIGILL，Phase 1 OCR 仍未通过。** 当前包为 **58,709,659 bytes**，SHA-256 为 **`3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`**，实际 Manifest `extractNativeLibs=true`，没有 INTERNET。新包安装后 4 个必需 ARM64 库摘要与 APK 一致，但该模拟器在 `libndk_translation` 解码指令时崩溃，未完成 OCR Lab 启动，没有识别输出。旧包缺库失败与新包翻译层失败分别保留；ARM64 真机未执行，不能外推手机结果。

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
├── docs/evidence/phase1/            原始官方获取和首次构建证据
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

状态：`verified_static`，获取及导入工具为 `verified_host_test`。

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

状态：当前新包构建 `verified_host_test`、APK 内容 `verified_static`、Android 安装与实际库摘要 `verified_android`；当前 API 30 模拟器启动为 `error`，OCR 为 `not_run`。历史旧包另行保存，不混用包身份或错误原因。

**当前实际交付包**来自 [Actions run 37776005573](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573)，构建源码 `339a66991af93c488e1f1426a3f240edd82fc3ca`，release job `113307547677`。此 job 的 release 编译、完整 APK 检查、上传成功；本地取得实际 APK 并再次检查。Android 设备 job 另行计分，不因 release 成功而自动通过。

| 项目 | 当前包实际结果 |
| --- | --- |
| Gradle | `:app:assembleRelease` 成功，`BUILD SUCCESSFUL in 7m 16s` |
| 原生编译 | 完整构建实际执行 `:hukang-vision:compileReleaseKotlin` |
| 模型打包门禁 | 实际执行 `:hukang-vision:verifyBundledOcrModels` |
| 本地实际 APK | `/workspace/Hukang-codex-China/artifacts/hukang-china-phase1-arm64-release.apk` |
| APK 大小 | **58,709,659 bytes**，58.71 MB / 55.99 MiB |
| APK SHA-256 | `3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e` |
| 签名 | APK Signature Scheme v2 校验通过，1 个 signer |
| 分发签名性质 | 工作流临时实验签名，非正式商店/生产发布证书 |
| 完整下载 artifact | [phase1 release APK artifact 11550109995](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573/artifacts/11550109995) |
| 本地独立复核 | 重组实际 APK 后执行 `scripts/verify-apk.py`，`errors: []` |
| 实际 Manifest 解库设置 | `android:extractNativeLibs=true` |
| 必需 native 库 | `libreactnative.so`、`libopencv_java4.so`、`libonnxruntime.so`、`libonnxruntime4j_jni.so` 实际存在，均为 ZIP DEFLATED（compression 8），各摘要已核验 |
| 新包 Android 安装 | job `113311498884` 实际安装成功，4 个必需 ARM64 native 库安装后逐个摘要与 APK 内一致 |
| 新包 Android 运行 | 旧 SoLoader 缺库问题已解决；随后 API 30 `libndk_translation` 出现 SIGILL，未完成 OCR Lab 启动/执行 OCR |

为可信取回新 APK，构建机按固定顺序拆成三份，生成带 repository/commit/run 身份和各份摘要的 transfer manifest，分别上传 GitHub Actions artifact。本地核对 GitHub artifact metadata、每份字节及摘要后，顺序重组，再核对完整 APK 摘要，重新解码 Manifest、校验模型、native 库及签名。三分片是开发产物传输，不是 App 运行时模型下载。完整 APK 没有提交进源码 Git。

当前实际复核原始证据见 [apk-inspection-local.json](evidence/phase1/release-37776005573/apk-inspection-local.json)、[final-manifest.txt](evidence/phase1/release-37776005573/final-manifest.txt)、[apk-transfer-manifest.json](evidence/phase1/release-37776005573/apk-transfer-manifest.json)、[artifact-metadata.json](evidence/phase1/release-37776005573/artifact-metadata.json)。native 库完整摘要在检查 JSON 中保留。GitHub artifacts 为临时保留，当前记录到期时间为 2026-10-22；应按实际 artifact metadata 留存，不依赖永久下载。

native 库改为安装时解出的压缩打包后，实际 APK 从 94,746,723 bytes 变为 58,709,659 bytes；官方模型和字典字节未更换、未量化。该 APK 体积减少不代表运行内存或手机推理速度减少。

**第一份交付包历史保留：** [run 37740050254](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37740050254) / `3ef4198` 曾编译成功（10m 45s），94,746,723 bytes，SHA `4bf12e9ef26e8d9c91f7ad775f222eac2f2d3adca05787ccc306619c22d324d3`。旧包保存在 `artifacts/hukang-china-phase1-arm64-release-3ef4198.apk`，原始静态证据在 `docs/evidence/phase1/release-37740050254/`，已知 native translation 启动失败见第 8 项。不能用新包修复或摘要追溯改变旧包结论。

**首次编译历史保持原样：** [run 37738623906](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37738623906) / `d4b2fcd202b8231691451f92840552435805a936` 曾实际编译成功（10m 50s），APK 同为 94,746,723 bytes，但 SHA 是 `659a487d7c842824601f471285c73ffa4cb681eeddfd65c0416cdb2c502166ba`。当时检查脚本只认识旧 `sdkVersion` 字段，误报 `minSdk is not 26`，导致该 APK 未上传。`3ef4198` 修复后，新包已通过完整检查；第一次错误 JSON 不修改，不拿第一次摘要标识当前包。

首次证据见 [原始 Gradle 日志](evidence/phase1/first-release-37738623906/gradle-release.txt)、[原始 APK 检查结果](evidence/phase1/first-release-37738623906/apk-inspection.json)。本地曾被 Maven 依赖重定向受限域名阻塞；GitHub Actions 实际成功编译解决的是构建供应链问题，没有给 App 引入运行时联网服务。

## 6. OCR 是否完全离线：已经证明什么

| 判断 | 状态与证据 |
| --- | --- |
| 国产模型来源和实际字节 | `verified_static`：官方获取 receipt、来源锁和本地/实际 APK 摘要一致 |
| 模型直接在 APK 中 | `verified_static`：当前交付 APK 内两模型、两原始 YAML 摘要一致 |
| 首次运行自动下载模型 | `verified_static`：没有下载路径，资产缺失时报错；没有运行时下载器 |
| 国外 OCR、AI 或食品网络供应商 | `verified_static`：没有启用；生产 `FOREIGN_NETWORK_SERVICE` 数量为 0 |
| 原生推理实现本地 CPU 路径 | `verified_static`：本地 ORT/OpenCV；ORT 在创建 session 前明确禁用 telemetry |
| App 网络权限 | `verified_static`：当前交付 APK 最终 Manifest 不含 INTERNET |
| Android 离线测试环境设置 | `verified_android`：新包 API 30 session 记录飞行模式 1、Wi-Fi 0、IPv4/IPv6 OUTPUT 默认 DROP，首次 App 启动尝试前已设置 |
| 首次离线启动 | `error`：新包 native 解库和加载已推进，但 API 30 ARM translation SIGILL 导致未完成 OCR Lab 启动；不判定启动成功 |
| 完全离线中文 OCR | `not_run`：尚无 Android 实际 OCR JSON |
| 运行时请求/流量观察 | `not_run`：尚无设备流量观测记录，不声称已抓包验证 |
| 无 Google Play Services 的运行兼容性 | `not_run`：新包测试环境实际禁用 GMS/GSF/Photos，但翻译层崩溃发生在 OCR 前；没有功能通过证据 |

当前可准确表述为“新 APK 已包含官方国产模型，生产网络服务为 0，实际 APK 没有 INTERNET；本地 OCR 代码已编译，native 库安装解出与摘要已实测通过；API 30 翻译层出现已观测的后续启动崩溃”。**不能据此声称“新 App 可以正常打开”或“Android 完全离线中文 OCR 已实测成功”。**

ONNX Runtime、OpenCV、React Native、Expo、AndroidX 等标为 `FOREIGN_OFFLINE_LIBRARY`。GitHub、npm、Maven、SDK、官方模型下载仅在开发/构建阶段使用，不计入 App 运行时海外服务。详见 [MainlandDependencyAudit.md](MainlandDependencyAudit.md)。

系统照片提供者可能展示云端照片，用户主动选择的分享目标也可能联网；本 App 不因此自动上传。离线验收必须使用已在设备本地的原始照片，不将系统或其他 App 的流量冒称 Hukang 的行为。

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

## 8. 中国食品照片、真实 OCR 输出与设备测试

当前状态：输入 `verified_static`；Android OCR `not_run`。**尚无可报告的实际 rawText、bounding boxes 或 confidence，不使用人工转录补齐。**

| 实际原图 | 图像 SHA-256 | 场景 | Android OCR |
| --- | --- | --- | --- |
| `tests/fixtures/china-food/6923644266066.jpg`，1280 × 1700 | `dc87cc54d0a8a4a547d642f46ffb5ab2cbbaa677e2d8316dd4934690332d7103` | 特仑苏中文包装、配料、营养表、小字、倾斜、复杂背景 | `not_run` |
| `tests/fixtures/china-food/6937003117814.jpg`，3024 × 4032 | `a5b53b885d8b464ac2adb3dfd3ab0e928ba5d10a9873e7fd421ea23080156af3` | 中文营养表、曲面包装、低对比、小字 | `not_run` |

两图是已许可的归档实物照片，保留 `CC-BY-SA-3.0` 和 smoothie-app / macrofactor / Open Food Facts 来源署名。它们**不是本轮新拍手机照片**，拍摄设备、地点、时间未知。历史来源仅是测试素材出处，不是 `ChinaFoodRepository` 数据源，没有迁移 OFF 营养数据、API 或旧 ML Kit 结果。`.source.json` 中的人工目读文字仅是独立核验参考，不能输入模型或冒充 OCR 输出。

样本只有两个商品，尚不覆盖牛奶、酸奶、饮料、面包、方便面、零食、调味品的完整类别集，也没有充分的反光、模糊、暗光条件覆盖。当前不计算准确率。

OCR Lab 源码已经实现相册导入、图片展示、EXIF 1–8 方向修复、手动 ±90° 旋转、百分比矩形裁剪、原文/框/分数/耗时展示，以及原图、处理图、变换矩阵、模型摘要和 JSON 的本地证据保存。上述 UI/原生功能已经编译，但每项设备行为仍需独立实测。Confidence 是模型分数，不是校准后的正确率。

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

**最新真实重测 [run 37774801831](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37774801831)：** 测试工具 commit `64808a569ad9e36d4d5d87133db5f8b6633c8c36`，仍测试同一 `3ef4198` / `4bf12e9e…` APK；两个 fixture 均已导入并成功通过媒体索引准备，随后实际尝试启动 `com.hukang.china/.MainActivity`。此 run 的脚本最终报“找不到相册选择按钮”，但真实 logcat 表明原因是启动前期崩溃，不是 UI 匹配或相册权限问题：

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

**新包最新实际运行 [run 37776005573](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573)：** Android job `113311498884` 使用 build/test commit `339a66991af93c488e1f1426a3f240edd82fc3ca`，APK 是本报告 `3dd6e764…`，Android/API/翻译库与前次 API 30 环境一致。

实际安装后，`libreactnative.so`、`libopencv_java4.so`、`libonnxruntime.so`、`libonnxruntime4j_jni.so` 均存在于 package 的 `/lib/arm64/`，4 个摘要逐一与实际 APK 匹配；原始 `installedNativeLibraries` 保留在 session。启动已越过旧 SoLoader 缺库失败，随后真实 logcat/tombstone 出现：

```text
ndk_translation: Undefined instruction 0x7ee1b800
Fatal signal 4 (SIGILL) in tid ... (mqt_v_js), pid ... (com.hukang.china)
libndk_translation.so (...DecodeSimdScalarTwoRegMisc...)
```

回溯指向该系统镜像的 ARM 指令翻译/解码，发生在 OCR 前。测试脚本立即记录 production App process 不再运行，未继续伪造点击或生成成绩；session 为 `error`，`runs=[]`、`processingChecks=[]`。这不是 Paddle 模型识别失败、联网失败或 confidence 为零，而是实际 Android 启动执行阻塞。不能仅由回溯断言所有手机受影响，亦不能断言换镜像一定解决。

原始小型 session/安装库身份/前后规则以及注明完整源 SHA、行号的 tombstone 截取保留于 `docs/evidence/phase1/device-attempt-37776005573/`。脚本原计划 4 次全图基线、旋转往返后和矩形裁剪后 OCR，共 6 次；**6 次是计划，本次实际 OCR 次数为 0，未运行不计算识别准确率。** 原文、框、分数、模型加载时长、OCR 耗时和内存均未产生。

下一轮正在研究使用更新的官方 API 33/34 Android 系统镜像重测**同一**已核验 `339a669` / `3dd6e764…` APK，不更换模型、不重编造包身份、不修改 App 以伪装 ABI。重测尚无实际结果，当前验收保持未通过。

真实执行时须保存 Android 导出的原始 JSON、原图、处理图、截图、设备身份、离线设置、APK 摘要和执行日志。协议及脚本见 [TestProtocol.md](TestProtocol.md) 与 `scripts/run-android-ocr-lab.py`。证据格式验证脚本只核验一致性，不能自证执行真实性。

## 9. 模型加载、OCR 和总耗时

状态：`not_run`。没有可引用的 Android 推理时长，未填写理论估算，也不把新包 7m 16s 的 Gradle 构建时长当 OCR 速度。

| 测量项 | 结果 |
| --- | --- |
| 首次模型加载 `modelLoadMs` / `modelColdLoadMs` | 未测量 |
| 各照片冷启动 OCR `ocrMs` | 未测量 |
| 同进程重复 OCR | 未测量 |
| 原生 `totalMs` | 未测量 |
| 检测/识别分阶段耗时 | 未测量 |
| P50 / P95 | 无运行样本，不计算 |

原生实现使用 Android 时钟记录加载、检测、识别和整体阶段；只有设备实际产生的字段才进入成绩。拟运行的每图 2 次只能提供初步冷/热观察；协议建议每图至少 5 次，不能将少量翻译层模拟器样本解释为手机性能基准。

## 10. 内存情况

状态：`not_run`。Android 模型执行的 PSS、Java heap、native heap 均未测量。模型文件大小和 APK 大小不作为运行内存。

已编译的 `MemorySampler.kt` 在实际运行时采样内存，结果保留采样间隔、样本数量和各观测最高值。报告必须称“采样观测到的最高 PSS”，不能称瞬时绝对峰值 RSS。`adb shell dumpsys meminfo com.hukang.china` 仅为该时刻快照；Java/native heap 也不能简单相加后当作全进程总 RAM。

模拟器宿主进程用量不是 App 内存，不计入 Android OCR 成绩。

## 11. 当前已知错误、限制和未测项目

| 项目 | 类型 | 当前状态与影响 |
| --- | --- | --- |
| 官方模型下载被本地网络策略拒绝 | 构建环境 | 已用正常 GitHub Actions 官方 BOS 下载并可信取回；没有绕过代理/TLS，没有第三方文件 |
| React Native AAR 重定向受限域名 | 构建环境 | 本地构建受阻；GitHub Actions 完整 release 编译实际成功 |
| `sdkmanager` 不在 runner PATH | 构建脚本 bug | 已修复绝对路径发现；首次完整 release 随后成功 |
| aapt2 minSdk 字段误判 | 验证脚本 bug | `3ef4198` 已修复，原始错误记录不改；当前新 APK 已完整通过检查、上传和本地复核 |
| 本地软件模拟器 zygote 重启 | 测试环境 | 未安装 APK、未产出 OCR；转为 KVM 测试，不能据此判定 App bug |
| KVM 设备权限异步竞态 | 测试环境/CI 脚本 | `68beb10` 已修复；重测 KVM 步骤已通过，实际 OCR 输出仍待证据 |
| fixture MediaProvider 路径 | 测试脚本 bug，已实证修复 | `37773783460` 在 App 启动前失败；`64808a5` 改为 `/storage/emulated/0`，`37774801831` 已证明两图均成功索引 |
| React Native SoLoader 缺库崩溃 | 旧包打包/运行环境兼容性，已实证修复 | 旧 `4bf…` 包真实失败；新 `339a669` / `3dd…` 包 4 个必需 ARM64 库实际安装摘要一致，启动已越过缺库加载失败。不是整体启动通过 |
| API 30 native translation SIGILL | 仿真环境执行兼容性，当前阻塞 | 新包 `37776005573` 在 `mqt_v_js` 线程触发 `libndk_translation` 未定义指令，尚未完成 OCR Lab 启动；计划同一 APK 换更新官方镜像重测，未验证能解决，ARM64 真机未测 |
| 原生推理、注册后设备调用和内存稳定性 | 未测 | 编译/autolinking 通过，实际初始化和调用尚无 Android 证据 |
| EXIF 1–8、镜像、旋转/裁剪后的框位置 | 未测 | 实现和 host 几何测试存在；未逐项 Android 执行 |
| 小字、倾斜、曲面、配料文字质量 | 未测 | 已有两张原图，尚无真实 Paddle 输出，不能宣称中文准确率达标 |
| 冷启动/热启动与生命周期 | 未测 | 需保存真实重复执行、后台恢复和强制停止后的记录 |
| 测试集覆盖 | 限制 | 仅两张归档照片，缺少新手机照片和多数食品/成像条件 |
| 实验签名 | 分发限制 | 每次工作流证书可能不同，升级安装可能需要卸载；卸载清除实验记录，不是正式商店签名 |
| 食品、扫码、SQLite、AI | 本轮范围 | 只建必要契约，没有实现 Phase 2 功能；不是 OCR fallback |

OCR 没有在线兜底。识别失败应保留错误和输入，不调用海外 OCR、AI，不用数据库值补写原文。现阶段没有用实际输出证明或否定模型准确性，因此不能列出未经观测的“药品识错”“营养表数字错”等 App bug。

## 12. 下一阶段建议与停止边界

新包已完成真实安装与 ARM64 库摘要门禁，旧缺库问题已实证解决；当前阻塞是 API 30 翻译层 SIGILL。下一步先在更新的官方 Android 仿真环境重测同一已核验 APK，或在真实 ARM64 手机完成 **Phase 1 实际启动和 OCR 证据**：首次离线启动、两图原始 OCR 导出、旋转/裁剪；保存原图/处理图/原生 JSON/框/分数/时长/内存与设备信息，保留失败，不因换镜像而跳过真实性检查。遇到新错误继续限于 Phase 1 处理，不进入食品业务。ARM64 真机、没有 Google Play Services、EXIF 多方向与生命周期仍需独立实测，并补充有权使用的真实手机拍摄食品包装。

只有用户确认 Phase 2 后，才建议进入本地食品记录、营养表业务解析、用户确认/修改、SQLite 和独立条码扫描。解析记录应引用原始 OCR 证据，不能覆盖 `rawText` 或让 NRV% 推算值冒充包装原文。中国中央食品服务仅保留未来边界；本轮未建设云服务、批量录库、药品、AI、提醒或完整主页。

Phase 1 最终是否通过，要由实际 release APK 与 Android 证据共同决定。报告中仍为 `not_run` 的项目不标记完成；完成本轮后停止，等待用户确认。

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
| 实际 resolved release 依赖原始报告 | `docs/evidence/phase1/release-dependencies-local-64808a5.txt` |
| 图片原字节、归属与真实覆盖范围 | `tests/fixtures/china-food/manifest.json`、`README.md`、两份 `.source.json` |
| Android 实测方法与证据要求 | `docs/TestProtocol.md` |
| 生产与构建供应链分开审计 | `docs/MainlandDependencyAudit.md` |

复核已推送修改范围：在新仓库运行 `git diff --name-status a3864c6 58a50d9`。旧启动失败 session/截取已保存提交；本轮新 release 37776005573 证据和报告更新等待统一提交。后续设备证据应明确待测提交/run/APK 摘要，不覆盖上述原始失败证据。

<details>
<summary>已推送快照 58a50d9：实际 165 个路径（新增 164，修改 1，删除 0）</summary>

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

本轮报告更新、release-37776005573 原始新包证据及 device-attempt-37776005573 安装/SIGILL 原始记录不计入以上已推送快照。后续重测不得覆盖这些原始失败。

</details>
