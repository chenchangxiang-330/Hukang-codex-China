# Phase 1 验证进度

以下按验证里程碑记录各步骤发生时的历史状态；早期“尚未取得/构建”的记录不覆盖后续结果。里程碑编号不是产品 Phase 编号，所有工作仍限于 Phase 0 + Phase 1，未开始 Phase 2。总体验收与当前已知问题见 [Phase1AcceptanceReport.md](Phase1AcceptanceReport.md)。

## 验证里程碑 1：配置与应用契约（2026-10-08）

- 本地实际运行 Gradle 9.3.1 `help`：成功，1m 8s。修复了 Expo 57 library publication 所需的 `versionName` 和 `versionCode`。
- 实际运行 Expo Android autolinking：指向 `com.hukang.vision.HukangVisionModule`，与 Kotlin 类一致。
- TypeScript noEmit 通过，现有及新增契约测试 15/15 通过。
- 原生返回值验证覆盖当前图片/hash/尺寸、固定官方模型 SHA、原文/块一致性、有限坐标、confidence 与时间。零分数仍保留。
- 最终发行包仍需检查：模型尚未取得、release APK 尚未构建、Android OCR 尚未执行。上述检查不能替代设备验证。
- 两个旧仓库保持只读；没有 Phase 2 食品解析或数据库 UI。

构建日志保存在本地 `.build-tools/phase1-gradle-config.log`；此目录不提交。

## 验证里程碑 2：官方模型实物校验（2026-10-08）

- GitHub Actions run `37737586793` 在 commit `304863e` 上，从官方 PaddlePaddle BOS 获取两个模型及原始 YAML；两个固定 ONNX SHA-256、配套配置及有序字典校验通过。
- 已下载该 run 的官方模型 artifact，ZIP 实测 18,625,900 bytes，SHA-256 为 `543a762c650c9fad885863321b02a9e7e6df1082c45541c3b56ad3af9696374a`，与 GitHub 返回的 artifact digest 一致。
- 本机通过已固定配置摘要的 `--bundle-dir` 导入，再次运行 `verify:assets` 和模型校验。检测模型 4,826,518 bytes，识别模型 16,534,782 bytes；原图标 SHA 不变。
- 原始官方获取证据保存在 `docs/evidence/phase1/official-model-acquisition-37737586793.json`。模型及配套配置已随 `6fda523` 提交并推送。
- YAML 字典 18,383 项，首项是 U+3000 全角空格；追加 ASCII 空格及 CTC blank 后对应识别模型实际 18,385 输出类别。静态模型形状核对不是 Android 推理结果。
- 首轮 Actions 后续构建因 `sdkmanager` 不在 PATH 失败；已在 `d4b2fcd` 修复绝对路径发现并推送。Release APK 和设备 OCR 等待后续实证，不用模型资产校验替代验收。
- 官方模型导入安全测试 5/5 通过，覆盖路径、链接、重复成员及过量解压数据；没有使用替代模型。

## 验证里程碑 3：首次真实 Release 编译（2026-10-08）

- Actions run `37738623906` / commit `d4b2fcd202b8231691451f92840552435805a936` 的 `:app:assembleRelease` 实际成功，日志为 `BUILD SUCCESSFUL in 10m 50s`。`hukang-vision:verifyBundledOcrModels` 与 `hukang-vision:compileReleaseKotlin` 均在此次完整构建中执行。
- 实际生成 APK 94,746,723 bytes，SHA-256 为 `659a487d7c842824601f471285c73ffa4cb681eeddfd65c0416cdb2c502166ba`。这次 APK 未进入上传步骤，不能把检查报告当成已经交付的 APK 文件。
- 真实 `aapt2` 输出 minSdk 26、targetSdk 36、仅 ARM64，没有 INTERNET / ACCESS_NETWORK_STATE / CAMERA / RECORD_AUDIO。模型与两份 YAML SHA 匹配，APK v2 签名校验通过。
- 首次检查脚本只识别旧字段 `sdkVersion`，新版输出为 `minSdkVersion`，因此产生了唯一错误 `minSdk is not 26`。原始错误报告保持不变，修复已提交推送 `3ef4198`，等待新版完整检查及 APK 上传。
- 原始构建日志、最终 Manifest 和检查报告见 `docs/evidence/phase1/first-release-37738623906/`。本机无 KVM 的模拟器不稳定，未安装 App、未执行 OCR；设备验证转为 GitHub Actions KVM 作业，尚未宣称成功。

## 验证里程碑 4：实际 APK 交付与独立复核（2026-10-08）

- [Actions run 37740050254](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37740050254) / 源码 `3ef41988b322713e0d734344cf5a62820525ed1d` 的 release 编译、完整 APK 检查、上传均成功；Gradle 实际耗时 10m 45s。
- 该次实际 APK 为 **94,746,723 bytes**，SHA-256 为 **`4bf12e9ef26e8d9c91f7ad775f222eac2f2d3adca05787ccc306619c22d324d3`**。它与里程碑 3 中未上传的 `659a…` 包不同，不混用摘要。
- [完整 APK artifact 11534180523](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37740050254/artifacts/11534180523) 上传成功；本地通过可信分片 artifact 核对来源、分片摘要和整体摘要后重组，实际文件是 `artifacts/hukang-china-phase1-arm64-release.apk`。
- 本地再次执行 APK 检查，`errors: []`；实际 final Manifest 没有 INTERNET / ACCESS_NETWORK_STATE，minSdk 26、targetSdk 36，仅 ARM64；模型和原始 YAML 摘要一致，APK v2 签名通过。签名为临时实验签名。
- 原始小型证据见 [release-37740050254](evidence/phase1/release-37740050254/)。**构建和静态检查通过不能替代设备启动/OCR。** 此包随后在下述翻译层模拟器中实际启动失败。

## 验证里程碑 5：真实 Android 安装与两次失败记录（2026-10-08）

- `68beb10` 修复测试 runner 的 KVM 权限异步竞态。[run 37773783460](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37773783460) 实际启动 Android 11 / API 30，使用 `sdk_gphone_x86_64` + 官方 `libndk_translation.so`，成功安装上述 ARM64-only APK。
- 原始 session 保存了 APK 摘要、设备属性、翻译库摘要、GMS/GSF/Photos 实际 disabled-user 状态、飞行模式 1 / Wi-Fi 0，以及 IPv4/IPv6 OUTPUT 默认 DROP 前后记录。这些是环境/安装实证，不是离线 OCR 实证。
- 第一次 run 在 App 启动前，因 MediaProvider 不接受 `/sdcard` 别名路径而失败，`runs=[]`。原始记录见 [device-attempt-37773783460](evidence/phase1/device-attempt-37773783460/)，不是 App 或模型识别失败。
- `64808a5` 改用 `/storage/emulated/0`。随后 [run 37774801831](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37774801831) 已实际证明两张 fixture 成功索引，并实际尝试离线启动同一个 `4bf12e9e…` APK。
- 第二次 run 的 UI 按钮超时由真实启动崩溃引起：logcat 为 `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`。DirectApkSoSource 选择 APK 的 `lib/x86_64`，ARM64 native 目录未解出库；App 尚未进入 JS 页面或原生 OCR，`runs=[]`。原始 session 和注明源 SHA/行号的崩溃截取见 [device-attempt-37774801831](evidence/phase1/device-attempt-37774801831/)。
- 当前没有 Android OCR 原文、框、confidence、推理时长或 OCR 内存成绩；没有用人工真值补充输出。ARM64 真机未执行，不能把翻译层环境的崩溃外推为所有手机失败，也不能称手机兼容性已通过。

## 验证里程碑 6：native 库打包修复和新包门禁（2026-10-08，等待实际结果）

- `a0a491a` 已提交推送正常的 `useLegacyPackaging=true` 配置，目标是让 Android 安装时解出 APK 内现有 ARM64 native libraries，避免依赖翻译环境的直接 APK ABI 选择。没有增加 x86 ABI、替换官方模型、伪装设备属性或引入在线兜底。
- `339a669` 已提交推送严格门禁：对新 APK 的实际 `extractNativeLibs`、必须存在的 ARM64 native libraries 和打包方式检查；设备安装后逐库核对实际解出文件与 APK 内文件摘要。门禁代码存在不代表已经观察到新包安装通过。
- 新测试脚本准备走生产 UI 执行 4 次全图基线 OCR、旋转往返后 OCR 和矩形裁剪后 OCR，共 6 次真实运行；这是拟执行路径，不是已产生的 6 份成绩。
- 当前权威重新构建是 [run 37776005573](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573)，build source `339a669`。记录本里程碑时正在编译，**新 APK 大小、SHA、最终 Manifest、成功启动和 OCR 结果均待实际产物**，不能用旧 `4bf12e9e…` 包数据代填。
- 历史已交付包仍是里程碑 4 的 `3ef4198` / `4bf12e9e…`，在上述模拟器中的启动失败已经保存；修复源码不会追溯改变它的身份或测试结论。

## 验证里程碑 7：实际 release 依赖图核验（2026-10-08）

- 本地实际运行 `:app:dependencies --configuration releaseRuntimeClasspath`：exit 0，`BUILD SUCCESSFUL in 1m`；200 个不同 resolved Maven coordinates，无 `FAILED` 或 unresolved `(n)` 节点。
- 原始报告 [release-dependencies-local-64808a5.txt](evidence/phase1/release-dependencies-local-64808a5.txt) 为 94,037 bytes，SHA-256 `d57d33e056827d4fc66d759ad4bd70526f1e115cfd43b44b55f6ecd022131dd0`。审计详情见 [MainlandDependencyAudit.md](MainlandDependencyAudit.md)。
- 所检查依赖图没有 Google Play Services、ML Kit、Firebase、在线 OCR/AI 和遥测 SDK coordinates。普通 Google/AndroidX 工具类不是联网服务；React Native 标准 HTTP 基础代码不等于已经配置生产海外服务。
- 该结果是依赖元数据解析和清单核验，不是重新编译 APK、二进制全部下载、网络抓包或设备推理成绩。当前生产 `FOREIGN_NETWORK_SERVICE` 配置数量仍为 0。

## 验证里程碑 8：重新构建的 APK 实物及安装校验（2026-10-08）

- `339a669` 的 [release run 37776005573](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37776005573) 实际 `BUILD SUCCESSFUL in 7m 16s`。新 APK **58,709,659 bytes**，SHA-256 **`3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`**；这是当前交付包，替代历史包用于后续验收。
- 已下载可信 artifact 分片并独立核对整体摘要，实际本地文件 `artifacts/hukang-china-phase1-arm64-release.apk`。本地 APK 检查 `errors: []`，实际 Manifest 没有 INTERNET / ACCESS_NETWORK_STATE；minSdk 26、targetSdk 36，仅 ARM64，`extractNativeLibs=true`，固定模型和配置摘要匹配，v2 签名通过。证据见 [release-37776005573](evidence/phase1/release-37776005573/)。
- 随后的实际设备安装中，四个核心 native libraries 解出文件均与 APK 字节摘要一致。API 30 的启动却在 Hermes 合法 ARM 指令 `fcvtzu d0,d0` 触发翻译库 0.2.2 的 SIGILL；该 run 未运行 OCR。原始失败与实际反汇编见 [device-attempt-37776005573](evidence/phase1/device-attempt-37776005573/)。
- 设备测试转用官方 API 35 Google APIs 镜像的 ARM64 translation 0.2.3；没有修改 APK / 模型 / 设备 ABI。新版环境实际成功启动 App。ARM64 真机及 Android 26 兼容性仍未执行。

## 验证里程碑 9：四次实际离线中文 OCR（2026-10-08）

- [device run 37779323597](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37779323597) 使用当前 `339a669` / `3dd6e764…` APK，测试脚本 `f113662`。首次启动前 IPv4 / IPv6 OUTPUT 默认 DROP、飞行模式 1、Wi-Fi 0、GMS / GSF / Photos 实际禁用；通过生产相册选择 UI 导入两张归档食品实拍照片。
- 真实保存了四次 OCR：牛奶包装每次 39 块，OCR 88,554 / 85,057 ms；零食营养表每次 21 块，OCR 49,251 / 49,870 ms。首次模型加载 1,393 ms，后续加载 0 ms。每块原文、坐标、confidence、图片 / 模型 hash、计时和采样内存均由 Android 原生代码实际产生，App JS 实际导出。
- 完整下载 artifact ZIP 30,991,029 bytes，摘要与 GitHub digest 一致；本地四份导出的图片及结果一致性检查全部通过。原始 JSON、截图、网络策略和失败状态已提交推送，见 [device-attempt-37779323597](evidence/phase1/device-attempt-37779323597/)。
- 原文保留“%2”“钠钙”“2075千焦(k)”等实际识别或阅读顺序问题；未人工修正、未解析食品营养。confidence 不是准确率。模拟器 ARM 翻译耗时和 50 ms 采样内存不能代表手机性能或绝对峰值。
- 整体 run 为 failure：后续旋转测试脚本向错误方向滚动，未找到“右转 90°”；`processingChecks=[]`，不能把四次 OCR 成功写成全部 Phase 1 通过。`a0c85d5` 已修复测试脚本滚动方向并推送，复测 [run 37781340401](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401) 尚在执行。

## 验证里程碑 10：同一 APK 的六次离线 OCR 和旋转 / 裁剪实证（2026-10-08）

- 上述 [run 37781340401](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401) 实际 **success**，session 为 `verified_android_emulated`，6 次 OCR 和 3 个实际图像操作检查通过。没有重编译待测 APK，继续使用当前 `339a669` / `3dd6e764…` 包。
- 两张照片各 2 次全图 OCR；额外实际右转 / 左转往返后识别 39 块，裁剪 10/10/80/80 后识别 33 块。往返 PNG 字节摘要与旋转前一致；实际裁剪为 1024×1360、矩阵平移 (-128,-170)。OCR 48,382–86,121 ms，首次外层模型加载 1,384 ms；均为官方 ARM 翻译层仿真成绩。
- 实际六份 JS 导出的原图 / 处理图摘要及模型 / OCR 字段在 CI 一致性校验全部通过。可信小型 artifact 下载后 ZIP 摘要一致；本地再次核对六份记录和保留的真实 PNG，不声称下载了超过 32 MiB 工具限额的完整 artifact。
- 完整 JSON、网络规则、原始日志选段、截图与处理图身份已保留，见 [device-37781340401](evidence/phase1/device-37781340401/)。裁剪后有实际新错误 `860%28`，不覆盖旧原文、不把裁剪效果说成全面改善。
- 当前达成本轮核心技术验证：官方国产模型在记录的 Android 环境完全离线运行，并实际经过生产相册 / 原生桥 / 旋转 / 裁剪 / JS 保存链路。ARM64 真机、Android 26、EXIF 2–8、长期内存及代表性准确率仍未验证；两张归档照片不能替代完整真实食品测试集。停留 Phase 1，不进入 Phase 2。
