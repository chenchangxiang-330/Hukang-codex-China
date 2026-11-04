# 0.5.5 四项营养条验收

源码 `5da1f5fe8bd6241b87d31a1734f80c261f8f2ab5`，App 0.5.5 / versionCode 16，SQLite 8。本次修复首页和营养详情在空记录、未设目标及数据不完整时隐藏整个营养槽的问题；没有更改营养累计、AI 或存储逻辑。

[修复说明与使用路径](../../NutrientBars055.md) · [下载最终 APK 材料](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41756668066/artifacts/13289605890) · [最终 APK 构建 41756668066](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41756668066)

## 原生 Android

最终 [验收运行 41758887353](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41758887353) 的五项检查全部通过：[实际报告](android/ui-session.json)。四条空槽、四项导航、相机拒绝后授权与返回、320dp/150% 字体/键盘、手势安全区、隔离 TEST 数据的四条填充已在同一 APK 执行。主按钮实际边界 `[55,1377,1025,1516]`，Dock 项顶部 1635，默认密度 443dpi；按钮高度约 50dp，完整可见。

先前候选源码 `43ca507` 的 UI/数据同步自动化通过，但目视发现主按钮被裁切，结果保留在 [initial-findings.json](initial-findings.json)；不将自动化通过等同于该候选完成视觉验收。最终原生截图均来自 `5da1f5f`，不复用候选或旧 0.5.4 图片。

截图均为实际安装 ARM64 APK 的 Android API 35 模拟器直接截屏，使用 x86_64/ARM64 转译；未重绘或美化，不代表实体设备。

| 状态 | Android 原始截图 |
| --- | --- |
| 真实空数据，四条底槽 | [首页](android/ui-android-today-empty.png) |
| 营养详情与展开 | [详情](android/ui-android-nutrition-empty.png) · [钠展开](android/ui-android-mineral-detail.png) |
| 保留的记录页与双拍摄入口 | [记录](android/ui-android-diary-empty.png) · [拍一拍](android/ui-android-two-entries.png) |
| 小屏、大字体和键盘 | [320dp / 150%](android/ui-android-320-font150-empty.png) · [键盘](android/ui-android-320-font150-keyboard.png) |
| 手势导航安全区 | [首页](android/ui-android-today-gesture-safe-area.png) |
| 四条实际填充（隔离 TEST 食品） | [蛋白质 50g / 测试目标 100g；能量/脂肪为区间，纤维为目标](android/ui-android-four-progress-isolated.png) |

先完成真实空页、相机、大字体/键盘和手势安全区检查，再在新建的隔离模拟器内加入明确 TEST 食品/目标，仅用于最后一张填充截图；不会写入用户正式 App。每张截图指纹见 [android/files.json](android/files.json)，完整运行来源及材料 ZIP 指纹见 [acceptance.json](acceptance.json)。

## 浏览器预览

[18 项渲染检查报告](browser/report.json)，原生接口使用替身，AI 使用模拟服务，不代表 Android。包含：无记录但有目标、未设目标、部分缺失、全部未知、估算范围、50/100、确认 0、超过目标和估算单值；检查底槽存在、填充宽度、未知状态没有假百分比，以及短屏主按钮未被 Dock 遮挡。

[空页](browser/browser-home-empty.png) · [50/100 填充](browser/browser-progress-protein-confirmed.png) · [部分缺失](browser/browser-progress-protein-partial.png) · [未设目标](browser/browser-progress-protein-unset.png) · [范围估算](browser/browser-progress-protein-range.png) · [超目标](browser/browser-progress-protein-exceeded.png) · [320dp 空页](browser/browser-320-empty.png) · [390dp 短屏主按钮](browser/browser-390-short-primary-visible.png)。截图哈希见 [browser/files.json](browser/files.json)。浏览器 CI 运行 [41756674170](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41756674170)，完整材料 ZIP 已下载并核对 SHA-256。

## APK 身份与安装

解压构建 ZIP，仅选择 `hukang-0.5.5-arm64.apk`。`secure-storage-probe.apk` 是验收探针，手机不需要安装。

- 源码：`5da1f5fe8bd6241b87d31a1734f80c261f8f2ab5`，0.5.5（16），包名 `com.hukang.china`，ARM64，Android API 26+。
- APK：61,088,169 字节；SHA-256 `5e0926951647d2224d04183860c0872c7f06e7eca9f32125e2fc4273f8828a36`。
- 证书 SHA-256：`ae5c1982ee6f8d7df5e6ea80bf18aa8e9823e05d85abda05808426076313816e`。CI apksigner 通过；本机完整 APK 及证书复核结果见 [local-verification.json](android/local-verification.json)。外层 ZIP 按需读取 APK 和元数据，没有声称独立校验整个外层 ZIP。
- GitHub 登录后可下载，材料保留至北京时间 2026-11-18 10:04:49。

**与已交付 0.5.4、0.5.3、0.5.2 和前一候选包签名不同，不能覆盖这些版本。** 保留原有 App 和本地数据。[证书比对](android/signing-comparison.json)。使用未安装护康的独立测试设备或隔离模拟器，允许该下载来源安装后打开 App APK；若系统拒绝升级则停止，不卸载、不清库、不改包名绕过。未读取用户手机的实际证书，旧签名升级仍未验收。

## 范围

143 项 Node、29 项 Python、TypeScript、格式、OCR 资产哈希通过。本次没有重新执行无关的四组图片压力和完整离线 OCR 设备流程；此前 0.5.4 的验收仍明确标为历史基线。真实服务商效果、实体手机/OPPO、BiRefNet 实际推理和透明贴纸继续待验收。草稿 PR 保持，不合并、不正式发布。
