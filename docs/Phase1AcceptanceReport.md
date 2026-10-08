# Hukang China Phase 1 验收报告

报告日期：2026-10-08（Asia/Shanghai）。范围：Phase 0、Phase 1；没有开始 Phase 2。已推送快照为 `0008669`；当前 APK 构建 source 为 `339a66991af93c488e1f1426a3f240edd82fc3ca`，本次已有实测的测试工具 source 为 `f113662a82546880483bfae920845dada659eec5`。App 构建、测试工具和历史旧包身份分别记录。

**同一 release APK 已在 API 35 Android 仿真环境中完成 4 次真实、完全离线的中文 PaddleOCR；Phase 1 尚未整体验收通过，旋转/裁剪正在重测。** 当前包为 **58,709,659 bytes**，SHA-256 为 **`3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`**，实际 Manifest 没有 INTERNET。两张真实归档包装照片各执行 2 次，保留实际原文、框、confidence、原始模型/图片摘要与时长/采样内存；没有人工补写。旧 SoLoader 缺库已修复，API 30 翻译层 SIGILL 的历史失败保留；API 35 对同一 APK 的离线基线通过不代表 ARM64 真机兼容性、手机速度或全部 Phase 1 功能通过。

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
├── docs/evidence/phase1/            官方获取、实际 APK、设备失败与4次 OCR 原始证据
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

状态：当前包构建 `verified_host_test`、APK 内容 `verified_static`、API 35 安装/启动/四次基线 OCR 为 `verified_android`。API 30 的历史启动 `error` 保留；本次旋转/裁剪验收未完成。不同 Android 镜像和 APK 身份不混用。

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
| API 35 当前实证 | `37779323597` 使用同一 APK，首次离线启动、相册导入、两图各2次真实本地 OCR 成功；旋转/裁剪测试工具后来失败，不能说整套 job 成功 |

为可信取回新 APK，构建机按固定顺序拆成三份，生成带 repository/commit/run 身份和各份摘要的 transfer manifest，分别上传 GitHub Actions artifact。本地核对 GitHub artifact metadata、每份字节及摘要后，顺序重组，再核对完整 APK 摘要，重新解码 Manifest、校验模型、native 库及签名。三分片是开发产物传输，不是 App 运行时模型下载。完整 APK 没有提交进源码 Git。

当前实际复核原始证据见 [apk-inspection-local.json](evidence/phase1/release-37776005573/apk-inspection-local.json)、[final-manifest.txt](evidence/phase1/release-37776005573/final-manifest.txt)、[apk-transfer-manifest.json](evidence/phase1/release-37776005573/apk-transfer-manifest.json)、[artifact-metadata.json](evidence/phase1/release-37776005573/artifact-metadata.json)。native 库完整摘要在检查 JSON 中保留。GitHub artifacts 为临时保留，当前记录到期时间为 2026-10-22；应按实际 artifact metadata 留存，不依赖永久下载。

native 库改为安装时解出的压缩打包后，实际 APK 从 94,746,723 bytes 变为 58,709,659 bytes；官方模型和字典字节未更换、未量化。该 APK 体积减少不代表运行内存或手机推理速度减少。

**第一份交付包历史保留：** [run 37740050254](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37740050254) / `3ef4198` 曾编译成功（10m 45s），94,746,723 bytes，SHA `4bf12e9ef26e8d9c91f7ad775f222eac2f2d3adca05787ccc306619c22d324d3`。旧包保存在 `artifacts/hukang-china-phase1-arm64-release-3ef4198.apk`，原始静态证据在 `docs/evidence/phase1/release-37740050254/`，已知 native translation 启动失败见第 8 项。不能用新包修复或摘要追溯改变旧包结论。

**首次编译历史保持原样：** [run 37738623906](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37738623906) / `d4b2fcd202b8231691451f92840552435805a936` 曾实际编译成功（10m 50s），APK 同为 94,746,723 bytes，但 SHA 是 `659a487d7c842824601f471285c73ffa4cb681eeddfd65c0416cdb2c502166ba`。当时检查脚本只认识旧 `sdkVersion` 字段，误报 `minSdk is not 26`，导致该 APK 未上传。`3ef4198` 修复后，新包已通过完整检查；第一次错误 JSON 不修改，不拿第一次摘要标识当前包。

首次证据见 [原始 Gradle 日志](evidence/phase1/first-release-37738623906/gradle-release.txt)、[原始 APK 检查结果](evidence/phase1/first-release-37738623906/apk-inspection.json)。本地曾被 Maven 依赖重定向受限域名阻塞；GitHub Actions 实际成功编译解决的是构建供应链问题，没有给 App 引入运行时联网服务。

## 6. OCR 是否完全离线：已经证明什么

| 判断 | 状态与证据 |
| --- | --- |
| 国产模型来源和实际字节 | `verified_static`：官方获取 receipt、来源锁、本地/实际 APK 与 device JSON 摘要一致 |
| 模型直接在 APK 中 | `verified_static`：实际两模型、原始 YAML 和字典固定打包，没有首次启动下载 |
| 运行中自动下载模型 | `verified_static`：没有下载路径，资产缺失时报错；本次离线首次加载成功 |
| 国外 OCR、AI 或食品供应商 | `verified_static`：没有启用，生产 `FOREIGN_NETWORK_SERVICE` 为 0 |
| 本地模型初始化和推理 | `verified_android`：API 35 实际运行 Kotlin + ORT CPU，产生4份原生结果，模型/config 摘要对应固定官方资产 |
| App 网络权限 | `verified_static`：实际 APK 不含 INTERNET / ACCESS_NETWORK_STATE |
| 首次启动前离线设置 | `verified_android`：API 35 session 记录飞行模式1、Wi-Fi0、GMS/GSF/Photos disabled；IPv4/IPv6 OUTPUT 默认 DROP 前后原样保留 |
| 首次离线启动与中文 OCR | `verified_android`：同一 release APK 未连接 Metro，选择本地两图并实际识别4次；不是 host Python 结果或人工真值 |
| Google Play Services 依赖 | `verified_android`：系统镜像内的 GMS/GSF/Photos实际禁用后，以上基线仍完成；不是“系统从未安装过Google服务”的真机实验 |
| 流量观察 | 已保存环境规则和计数；未进行完整 packet capture 或 App UID 专属流量审计，不声称抓包为零 |
| ARM64 真机完全离线 OCR | `not_run`：本次为 x86_64 Android + 官方 ARM native translation，未在真实 ARM64 手机执行 |

**本次已实际证明：在记录的 API 35 Android 仿真环境中，官方国产模型直接从已打包 release APK 加载，用户通过本地相册的生产 UI 路径完成4次离线中文 OCR，保存真实原文、坐标、分数和测量。** 此判断结合实际 APK 网络权限、离线首次启动、源图/模型摘要、原生 JSON 与 UI 截图；没有在线 OCR fallback、模型下载或 AI 补文。

不能把上述局部通过扩展为所有 Android 版本、ARM64 真机、旋转/裁剪、多方向 EXIF 或完整 Phase 1 验收通过。API 30 同一 APK 的历史翻译层崩溃仍保留，不能因 API 35 基线成功而删除。

ONNX Runtime、OpenCV、React Native、Expo、AndroidX 等是 `FOREIGN_OFFLINE_LIBRARY`。GitHub、npm、Maven、SDK 和官方模型下载只发生在开发/构建供应链；不计作用户 OCR 的境外服务器依赖。ORT 在创建 session 前明确禁用 telemetry，实际 APK 网络权限也已移除，详见 [MainlandDependencyAudit.md](MainlandDependencyAudit.md)。

系统相册可展示云端图片，用户主动分享的目标 App 也可有自己的网络行为；本次使用已在设备本地的两份 fixture，并禁用 Google Photos。没有把外部系统/App 行为算成 Hukang 自动上传。

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

本项基线状态为 `verified_android`。已有两张照片各2次真实 OCR，共4次；每张图两次的 `rawText`、文字块几何和 confidence 相同。**整次设备 job 后来在手动旋转按钮定位处失败，不能把4次基线成功写成整套测试通过。**

实际执行：[run 37779323597](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37779323597)，test source `f113662a82546880483bfae920845dada659eec5`，App build `339a66991af93c488e1f1426a3f240edd82fc3ca`，APK SHA `3dd6e764…`。信任来源见 [artifact-identity.json](evidence/phase1/device-attempt-37779323597/artifact-identity.json)：artifact ID `11551632136`，ZIP 30,991,029 bytes，SHA-256 `a99ffb24e05548bc1c681ca208cbc29e2e093a61ede7777f53dce9395d96963b`。

设备是 `sdk_gphone64_x86_64`，Android 15 / API 35，官方 Google APIs userdebug 镜像，安全补丁2024-09-05；`libndk_translation` version0.2.3，实际 SHA `9b5808354a85d722a290ae879400b909aa961955e80ea1a7e807aea9416d92f9`。APK中只有ARM64库，安装后4库摘要与APK一致，在官方native bridge上执行。测试前飞行模式1、Wi-Fi0，GMS/GSF/Photos disabled；前后IPv4/IPv6 OUTPUT默认DROP。完整原始 [session.json](evidence/phase1/device-attempt-37779323597/session.json) 保留设备、动作、模型测量与最终helper错误。

| 实际原图 | 原图SHA-256 | 处理图与覆盖 | 实际基线 |
| --- | --- | --- | --- |
| `6923644266066.jpg`，1280×1700 | `dc87cc54d0a8a4a547d642f46ffb5ab2cbbaa677e2d8316dd4934690332d7103` | 1280×1700不缩小；特仑苏包装、配料、营养表、小字、倾斜、复杂背景 | 39个文字块，2次真实输出 |
| `6937003117814.jpg`，3024×4032 | `a5b53b885d8b464ac2adb3dfd3ab0e928ba5d10a9873e7fd421ea23080156af3` | decode sampleSize2→1512×2016，matrix缩放0.5；中文营养表、曲面包装、小字 | 21个文字块，2次真实输出 |

两图是有许可的归档实物包装照片，保留 `CC-BY-SA-3.0` 与 smoothie-app / macrofactor / Open Food Facts 来源署名。它们不是本轮新拍，拍摄设备、地点、时间未知；来源URL不是食品查询API或数据库源，未迁移OFF营养字段或旧ML Kit结果。`.source.json` 中人工目读真值没有输入本次OCR，不冒充模型输出。照片仅两个商品，未充分覆盖食品类别、反光、暗光、模糊，不能宣称代表中国市场准确率。

下面文字直接取自本次原生JSON，保留错字、空格、单位和行顺序，没有parser/人工修正。完整每块polygon、boundingBox、confidence、page、模型摘要和变换见原始文件。

**图1第一次原始输出**：[photo-1-run-1-native.json](evidence/phase1/device-attempt-37779323597/photo-1-run-1-native.json)。

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

**图2第一次原始输出**：[photo-2-run-1-native.json](evidence/phase1/device-attempt-37779323597/photo-2-run-1-native.json)。

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

实际结果既有可辨中文与营养数字，也有错误：图1把钠/钙合为“钠钙”，NRV输出出现“%2”，未独立保留照片中7%；“请物连同包装…”、“润费者热线…”、“保持环境酒洁”均是实际错文。图2“2075千焦(k)”丢了单位中的J。以上观察独立对照原图，不回写结果。表格行/列仍依靠坐标证据，rawText顺序不是结构化营养表；Phase 1没有业务解析或食品字段成绩。

| 真实块样例（processed image像素） | boundingBox：left,top,right,bottom | 原始confidence |
| --- | --- | ---: |
| 图1“特仑苏” | 450,432,753,561 | 0.9979282 |
| 图1“钠钙” | 304,971,355,1062 | 0.9717849 |
| 图1“%2” | 686,914,771,1031 | 0.50947875 |
| 图2“1248毫克（mg）” | 556,522,974,622 | 0.90365654 |

图1confidence范围0.21275023–0.99994344，图2范围0.8842335–0.9998801；这不是准确率，部分错文分数超过0.93。低分块没有删除，高分错文也没有被“修正为正确值”。JSON全量保存各块四边形，page为0。实际UI截图 [原文/耗时](evidence/phase1/device-attempt-37779323597/photo-1-actual-text.png) 和 [图片/文字框](evidence/phase1/device-attempt-37779323597/photo-1-actual-boxes.png) 可核查；仅截图不能代替原始JSON或逐框精度评价。

EXIF实际记录是两图均 `reportedOrientation=0`（缺失/未知），有效orientation1。图2解码缩小有完整矩阵、源图和处理图摘要；不能说EXIF 2–8、镜像、或方向错误的图片修复已实证。原图不覆盖，实际processed文件另存。

4次基线后，helper报 `UI element not found: 右转 90°`，`processingChecks=[]`。这是自动化方向按钮匹配未覆盖生产UI带箭头的文字，不是基线OCR失败；当前手动旋转与矩形裁剪仍为待验证。`a0c85d5` 已修复helper并以 [run 37781340401](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401) 重测同一APK，拟执行4次基线+旋转往返+裁剪共6次，尚无可引用的该次结果，不提前记通过。

原始native/Expo记录、截图和摘要已在 `docs/evidence/phase1/device-attempt-37779323597/` 提交保留。原图在fixtures，实际processed PNG也按原始内容摘要保留于 [actual-processed-images](evidence/phase1/actual-processed-images/)，未转换或修图：[sources.json](evidence/phase1/actual-processed-images/sources.json)记录它们与原图、运行记录的关系。可信完整artifact和本地 `artifacts/device-attempt-37779323597/` 另保留导出文件。[baseline-evidence-consistency-local.json](evidence/phase1/device-attempt-37779323597/baseline-evidence-consistency-local.json)记录实际文件摘要/尺寸/证据一致性复核；此格式检查不单独认证Android执行真实性。

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

后续已使用官方 API 35 镜像对同一 `339a669` / `3dd6e764…` APK 重测，取得下文真实基线；未为换镜像更换模型、伪装 ABI 或重编 App。API 30 的旧失败仍是该环境的实际结论。

</details>

实际测试协议见 [TestProtocol.md](TestProtocol.md)。只有实际执行的能力标记verified_android；未测的方向/生命周期/真机项目仍单独列出，不因拿到4份JSON而自动完成。

## 9. 模型加载、OCR 和总耗时

状态：API 35基线4次为 `verified_android`，以下数值来自原生JSON，不是理论预计或host Python推理。

| 实际运行 | modelLoadMs | ocrMs | totalMs | detInferenceMs | recInferenceMs |
| --- | ---: | ---: | ---: | ---: | ---: |
| 图1第一次（进程内首次模型加载） | 1,393 | 88,554 | 90,133 | 8,782 | 79,238 |
| 图1第二次 | 0 | 85,057 | 85,164 | 9,066 | 75,526 |
| 图2第一次（模型已加载） | 0 | 49,251 | 49,434 | 8,523 | 40,371 |
| 图2第二次 | 0 | 49,870 | 50,013 | 8,714 | 40,818 |

原始记录另有 `modelColdLoadMs=1105`；这是不同测量字段，保留原值，不把它替换外层modelLoadMs1393。图2“第一次”是该图第一次，不是模型冷启动。检测输入实际 `[1,3,960,736]` 与 `[1,3,960,704]`；识别为每文字块batch1、高48，动态宽度，原始timings保存全部shape。

本次图1 OCR85.06–88.55秒，图2 OCR49.25–49.87秒，主要耗时为识别网络：约40.37–79.24秒；检测约8.52–9.07秒。这里是x86_64宿主上的ARM64 native translation CPU成绩，**不能称手机速度、不能承诺用户会等待同样时间，也不能据此说移动端性能达标**。两图各2次只适合初步冷/热观察，不计算稳定性P50/P95；协议建议更多重复和真机分阶段分析。

7m16s是APK构建时间，与上述OCR时间无关。方向/裁剪后的OCR性能等待实际记录，不能把全图成绩当裁剪成绩。

## 10. 内存情况

状态：API 35基线的原生采样为 `verified_android`。采样间隔50ms，数字是OCR期间采样观测最高值；不是瞬时绝对峰值RSS，不是APK或模型文件大小。

| 实际运行 | 观测最高PSS（KiB / MiB） | 观测最高Java heap（MiB） | 观测最高native heap（MiB） | 样本数 |
| --- | ---: | ---: | ---: | ---: |
| 图1第一次 | 529,040 / 516.64 | 51.11 | 265.81 | 1,802 |
| 图1第二次 | 659,530 / 644.07 | 56.61 | 404.81 | 1,703 |
| 图2第一次 | 695,363 / 679.07 | 52.76 | 434.25 | 987 |
| 图2第二次 | 689,870 / 673.70 | 50.10 | 434.35 | 999 |

MiB按1024换算，原始字节/KB字段全部在native JSON和session中。PSS包含该Android进程的模型、UI和runtime等观测开销，不能把Java/native heap相加后当全进程总RAM，也不能把翻译宿主机器的RAM当App测量。

本次连续4次过程中PSS/native heap有增加，需要进一步研究缓存、模型workspace和生命周期；**仅这些采样不能证明内存泄漏或永久增长**。翻译层仿真环境不能代表ARM64手机内存。采样可能漏过短时尖峰；`dumpsys meminfo`另保留为一次快照，不能称绝对峰值。真机、长序列、后台恢复和关闭session后的释放情况未测。

## 11. 当前已知错误、限制和未测项目

| 项目 | 类型 | 实际状态与影响 |
| --- | --- | --- |
| 官方模型本地下载失败 | 构建环境，已解决 | Actions直接获取官方BOS，固定模型/config/字典摘要通过并可信取回；没有第三方替代、代理/TLS绕过或运行时下载 |
| Gradle发布配置/注册 | 原生配置，已验证 | library versionName/versionCode、autolinking类修复；真实release原生编译及API35实际调用均通过 |
| RN AAR本地重定向受限 / sdkmanager PATH | 构建环境/脚本，已解决release | Actions真实编译成功；SDK绝对路径发现修复。不等于所有构建机网络都畅通 |
| aapt2 minSdk字段误判 | 检查脚本，已验证修复 | 新APK实际完整检查通过；首次原始错误JSON未修改 |
| 无KVM模拟器 / KVM权限race | 测试环境 | 早期失败保留；后续KVM Android已启动并真实执行模型 |
| fixture MediaProvider别名路径 | helper，已实证修复 | canonical `/storage/emulated/0` 后两图成功索引 |
| SoLoader缺库 | 旧包打包/翻译环境兼容性，已实证修复 | 新包extractNativeLibs true、实际4库安装摘要一致，API35真实App/模型执行；旧4bf包失败记录不改 |
| API30 ARM translation SIGILL | 旧Android镜像执行兼容性 | 同一3dd包在API30失败；官方API35 bridge0.2.3完成4次基线。不能外推真机或所有版本 |
| Android15 PhotoPicker不暴露文件名 | helper，已实证修复 | `f113662`走实际系统picker路径，本地两图导入成功；没有往App增加测试后门 |
| 旋转按钮定位 | helper，本次仍待重测 | 4次OCR后“右转90°”匹配失败；`a0c85d5`已修复工具，但旋转/裁剪不能提前记通过 |
| OCR错字/漏字/行列混合 | 已观测模型/检测与图像问题 | 钠钙合行、%2、单位J丢失和小字错文原样保留；高confidence也可能错。尚无代表性准确率或食品业务成绩 |
| EXIF2–8 / 镜像 | 未测 | 两张样本仅缺失EXIF→有效1；源码支持不等于方向修复实测 |
| OCR速度和内存适用范围 | 限制 | 本次仅翻译层仿真数据，识别推理耗时较高，4次不足评稳定性；不代表ARM64手机 |
| 冷启动/生命周期/长序列 | 部分未测 | 一次首次离线模型加载及同进程重复通过；后台、强制停止重启、长期内存释放未完整验证 |
| UI框精度/全部confidence可读性 | 部分验证 | 实际原文、图像框和时间截图；JSON完整坐标与分数。未逐框标注IoU或逐块屏幕可读性评分 |
| 测试集/真机 | 限制/未测 | 两张归档照片，不是本轮新拍；多类别、反光、模糊、暗光及ARM64真机均不足 |
| 实验签名 | 分发限制 | 临时release-mode测试证书，非商店签名；不同构建可能需卸载旧包，卸载清除实验记录 |
| 食品、扫码、SQLite、AI | 本轮范围 | 只有必要独立模型/接口，没有开始Phase2，不作为识别fallback |

OCR与理解保持分离：rawText/blocks/confidence/原图和变换永远保留。没有在线兜底，没有用AI、食品数据库或人工目读覆盖错误数字；当前原文错误不会被包装成“已确认食品事实”。

## 12. 下一阶段建议与停止边界

本轮已证明“官方国产PaddleOCR在记录的真实Android仿真环境、完全离线条件下完成中文包装识别”。目前仍是 **Phase 1部分验收通过**：下一步先核查已在执行的同APK旋转/裁剪重测原始记录，不能因为已有4次基线就开始Phase2。

Phase1尚需：旋转往返与矩形裁剪后实际图/变换/框/OCR，EXIF多方向和镜像样本，至少一台ARM64真机首次离线使用及性能，更多有权使用的中国食品手机照片，后台/重启和长序列内存测量。现有错字、表格分行和高分误识别应作为后续图像/检测质量评估的输入，不靠修改原文掩盖。

只有用户确认Phase2后，才建议进入本地食品记录、营养表业务解析、用户确认/修改、SQLite和独立条码扫描。解析/修订记录引用OCR原始证据，不覆盖rawText，不用NRV%反推值充当照片原文。中国中央食品服务仍仅有未来接口，没有建设云服务、批量录库、药品、AI、提醒或完整主页。

Phase1最终结论需实际APK和各项Android执行证据共同确定。本报告中待测/部分通过的内容不标完成；本轮结束后停止，等待用户确认后续范围。

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
| API35实际离线4次基线与helper失败 | `docs/evidence/phase1/device-attempt-37779323597/session.json`、`build-identity.json`、`artifact-identity.json` |
| 实际全量rawText/每块几何/分数/测量 | 同目录 `photo-1-run-{1,2}-native.json`、`photo-2-run-{1,2}-native.json` 与对应原始 `record.json` |
| 实际UI图像框与原文展示 | 同目录 `photo-{1,2}-actual-{boxes,text}.png` |
| 实际原样processed PNG及原图关系 | `docs/evidence/phase1/actual-processed-images/` 与 `sources.json` |
| 4次真实导出的一致性复核 | `docs/evidence/phase1/device-attempt-37779323597/baseline-evidence-consistency-local.json` |
| 实际 resolved release 依赖原始报告 | `docs/evidence/phase1/release-dependencies-local-64808a5.txt` |
| 图片原字节、归属与真实覆盖范围 | `tests/fixtures/china-food/manifest.json`、`README.md`、两份 `.source.json` |
| Android 实测方法与证据要求 | `docs/TestProtocol.md` |
| 生产与构建供应链分开审计 | `docs/MainlandDependencyAudit.md` |

复核已推送修改范围：在新仓库运行 `git diff --name-status a3864c6 0008669`。当前APK、历史失败和4次基线原始记录均已提交保存；本报告更新等待统一提交。同APK后续旋转/裁剪重测需新的session，不能覆盖这些原始成功或失败证据。

<details>
<summary>已推送快照 0008669：实际 212 个路径（新增 211，修改 1，删除0）</summary>

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
A	docs/evidence/phase1/actual-processed-images/45b7133d873e7965306bd2caafa0752479617cd88d4857597fb203a9daf5e5ea.png
A	docs/evidence/phase1/actual-processed-images/ab0fa267a12b01474fad5dd95c315fc0fe6918b3b64d5cd08340bfead06c0c2a.png
A	docs/evidence/phase1/actual-processed-images/sources.json
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

本报告当前更新不改变原始JSON、实际图片或已有失败证据。后续重测结果单独保留，再按其真实结果更新结论。

</details>
