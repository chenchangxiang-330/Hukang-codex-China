# Phase 1 验证进度

## 阶段 1：配置与应用契约（2026-10-08）

- 本地实际运行 Gradle 9.3.1 `help`：成功，1m 8s。修复了 Expo 57 library publication 所需的 `versionName` 和 `versionCode`。
- 实际运行 Expo Android autolinking：指向 `com.hukang.vision.HukangVisionModule`，与 Kotlin 类一致。
- TypeScript noEmit 通过，现有及新增契约测试 15/15 通过。
- 原生返回值验证覆盖当前图片/hash/尺寸、固定官方模型 SHA、原文/块一致性、有限坐标、confidence 与时间。零分数仍保留。
- 最终发行包仍需检查：模型尚未取得、release APK 尚未构建、Android OCR 尚未执行。上述检查不能替代设备验证。
- 两个旧仓库保持只读；没有 Phase 2 食品解析或数据库 UI。

构建日志保存在本地 `.build-tools/phase1-gradle-config.log`；此目录不提交。

## 阶段 2：官方模型实物校验（2026-10-08）

- GitHub Actions run `37737586793` 在 commit `304863e` 上，从官方 PaddlePaddle BOS 获取两个模型及原始 YAML；两个固定 ONNX SHA-256、配套配置及有序字典校验通过。
- 已下载该 run 的官方模型 artifact，ZIP 实测 18,625,900 bytes，SHA-256 为 `543a762c650c9fad885863321b02a9e7e6df1082c45541c3b56ad3af9696374a`，与 GitHub 返回的 artifact digest 一致。
- 本机通过已固定配置摘要的 `--bundle-dir` 导入，再次运行 `verify:assets` 和模型校验。检测模型 4,826,518 bytes，识别模型 16,534,782 bytes；原图标 SHA 不变。
- 原始官方获取证据保存在 `docs/evidence/phase1/official-model-acquisition-37737586793.json`。模型及配套配置已随 `6fda523` 提交并推送。
- YAML 字典 18,383 项，首项是 U+3000 全角空格；追加 ASCII 空格及 CTC blank 后对应识别模型实际 18,385 输出类别。静态模型形状核对不是 Android 推理结果。
- 首轮 Actions 后续构建因 `sdkmanager` 不在 PATH 失败；已在 `d4b2fcd` 修复绝对路径发现并推送。Release APK 和设备 OCR 等待后续实证，不用模型资产校验替代验收。
- 官方模型导入安全测试 5/5 通过，覆盖路径、链接、重复成员及过量解压数据；没有使用替代模型。

## 阶段 3：首次真实 Release 编译（2026-10-08）

- Actions run `37738623906` / commit `d4b2fcd202b8231691451f92840552435805a936` 的 `:app:assembleRelease` 实际成功，日志为 `BUILD SUCCESSFUL in 10m 50s`。`hukang-vision:verifyBundledOcrModels` 与 `hukang-vision:compileReleaseKotlin` 均在此次完整构建中执行。
- 实际生成 APK 94,746,723 bytes，SHA-256 为 `659a487d7c842824601f471285c73ffa4cb681eeddfd65c0416cdb2c502166ba`。这次 APK 未进入上传步骤，不能把检查报告当成已经交付的 APK 文件。
- 真实 `aapt2` 输出 minSdk 26、targetSdk 36、仅 ARM64，没有 INTERNET / ACCESS_NETWORK_STATE / CAMERA / RECORD_AUDIO。模型与两份 YAML SHA 匹配，APK v2 签名校验通过。
- 首次检查脚本只识别旧字段 `sdkVersion`，新版输出为 `minSdkVersion`，因此产生了唯一错误 `minSdk is not 26`。原始错误报告保持不变，修复已提交推送 `3ef4198`，等待新版完整检查及 APK 上传。
- 原始构建日志、最终 Manifest 和检查报告见 `docs/evidence/phase1/first-release-37738623906/`。本机无 KVM 的模拟器不稳定，未安装 App、未执行 OCR；设备验证转为 GitHub Actions KVM 作业，尚未宣称成功。
