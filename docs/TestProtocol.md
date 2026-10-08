# Phase 1 Android OCR 实证测试协议

## 证据边界

本文件是可执行的验收流程，不是 Android 执行结果。源码检查、TypeScript 检查、JVM 测试及 APK 构建均不能证明手机端模型已运行。

当前归档测试输入只有两张实物中文包装照片，见 `tests/fixtures/china-food/manifest.json`。它们来自已许可的旧归档，不是本轮新拍，拍摄设备及地点未知。不得把旧 ML Kit 结果迁移为 PaddleOCR 结果。

在未取得 Hukang China 的真实 Android 导出前，识别文字、准确率、模型加载时间、OCR 时间和 Android 内存必须记为 `not_run` / 未测量，不填零，不填写人工真值，不将理论估计写成实测。

## 1. 构建与静态验收

在新仓库执行，不修改两个只读旧仓库：

```sh
npm run typecheck
npm test
node scripts/verify-fixtures.mjs
npm run verify:assets
npm run verify:apk -- artifacts/<实际release文件名>.apk
```

模型不存在或摘要不符应阻断 release 构建；不能用占位空模型、联网补下载或其他引擎兜底。记录以下实际信息：

- Git commit、构建工具版本、APK SHA-256 和 APK 字节数。
- 实际 APK 包含的 detector/recognizer 文件摘要、字典配置及版本。
- 最终二进制 Manifest 的 minSdk 和 permissions；不能只检查 app.json 或源 Manifest。
- 最终 APK native libs 仅含 `arm64-v8a`。
- 生产 `android.permission.INTERNET` 应不存在；若存在，先定位 manifest-merger 来源并修复。不能把未调用的网络 SDK 当作合格依赖。

即便以上通过，也仅称“构建及静态检查通过”，还不能称“Android 离线 OCR 已验证”。

## 2. 测试设备与安装

需要真实 ARM64 Android 8.0+ 手机，或能够运行该 ARM64 APK 的 Android 环境。x86_64 模拟器不能当作 ARM64 原生库执行证据；翻译层支持也必须实际核实。

记录设备型号、Android/API、ABI、RAM、是否存在 Google Play Services、设备／模拟器类型及电源状态。无 Google Play Services 的独立设备需单独验证，不能从不使用其 API 推断已经实测。

ADB 示例（设备连接后运行）：

```sh
adb devices -l
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.cpu.abilist
adb install -r artifacts/<实际release文件名>.apk
adb shell mkdir -p /sdcard/Pictures/HukangOcrLab
adb push tests/fixtures/china-food/6937003117814.jpg /sdcard/Pictures/HukangOcrLab/
adb push tests/fixtures/china-food/6923644266066.jpg /sdcard/Pictures/HukangOcrLab/
```

图片若未被系统相册索引，使用设备文件管理器或系统文件选择器将其加入可选照片，不把“照片未出现在 picker”记为模型识别错误。

## 3. 完全离线运行

安装完成、第一次打开 App 前手动打开飞行模式并关闭 Wi-Fi，记录状态。运行时不连 Metro，不启用开发服务器，不下载模型。不清理用户原有记录以获得“冷启动成绩”。

1. 打开 release App，确认继承的 Hukang 图标和 `OCR Lab`。
2. 相册选择原始 JPEG，全图识别；不先裁剪掩盖全图失败。
3. 保存 native 原始结果以及原图、实际处理图。
4. 对同一张图片在同一进程重复至少 5 次，分别保留冷／热记录，不只选择最好结果。
5. 若需局部裁剪，再单独执行并保留完整裁剪变换及处理图摘要；不能与原图成绩混合。
6. 全图或局部失败均保存错误代码、可复现步骤、源图摘要及日志；不切换在线 OCR。
7. 后台／前台及强制停止后重新打开再试；记录是否重新初始化模型。

离线证据包括无 INTERNET 的最终 APK、首次离线启动及实际模型执行记录。仅“代码没有 fetch”或“手机当时连的是国内网络”不能证明此项。可额外通过系统网络统计或抓包观测验证；抓包可能漏流量，其方法及局限需记录。

## 4. 每次 OCR 的原始记录

UI 将真实 native 返回保存为 `record.json`，同时保留原图和 processed 图。JSON 中应包含：

- 源图和实际处理图 SHA-256、像素尺寸、EXIF 方向及变换矩阵。
- 实际 detector/recognizer 摘要、模型／引擎版本。
- `rawText` 与各块 text；原文不能由人工转录、parser 或 LLM 替换。
- 各块 polygon、boundingBox、recognizer confidence 和 page。
- 模型加载、OCR、总耗时；子阶段耗时若可得也保留。
- native 采样内存字段及单位。

分享或复制原图、处理图及 JSON 到电脑同一目录。release App 不可依赖 `adb run-as` 提取私有文件：非 debuggable APK 通常拒绝该命令。使用 App 提供的系统分享按钮，并保留对应的三个文件。

```sh
node scripts/validate-ocr-evidence.mjs artifacts/device-runs/<run-id>/record.json
```

脚本验证两个图片文件摘要、模型身份、原文／块一致性、几何和测量字段。它只校验证据格式和一致性，**不能认证设备执行真实性、离线状态或识别准确率**。无参数仅返回 `not_run`，不会生成 OCR 输出。

补充 `session.md` 记录 APK 摘要、设备、测试者、网络状态、操作顺序、时间和失败记录。截图／录屏可辅助证明实际 UI 与框展示，但不能替代原始 JSON。

## 5. Phase 1 图像质量与几何检查

按每张图逐项目视核对：

| 检查 | 通过依据 |
| --- | --- |
| 中文商品包装 | 实际中文 decoder 文本与照片相符，保留错误与遗漏 |
| 配料表 | 逐字对照实际输出，不用商品数据库值补全 |
| 营养表 | 只对照原文与框，Phase 1 不评分业务营养字段 |
| 小字 | 对照实际单位、小数点和百分号；记录漏检、错字 |
| 倾斜 | 使用真实倾斜照片，查看检测四边形和识别文本 |
| 框位置 | contain 缩放、letterbox、旋转和裁剪后仍覆盖对应文字 |
| Confidence | 展示 recognizer 原始分数，不能称为校准准确概率 |
| EXIF | 1–8 方向及镜像需要独立设备测试；样本缺失标未测 |
| 手动旋转／裁剪 | 变换前后图像及矩形、源图摘要保留；不能覆盖原图 |

当前两图覆盖配料／营养表、小字、倾斜和曲面的一部分；不是完整商品正面、完整条码及多类别验收集。还需用户或团队提供有权使用的牛奶、酸奶、饮料、面包、方便面、零食、调味品原始手机照片，补充反光、模糊、暗光等情况。不得把网络图片标成本轮手机拍摄。

合成旋转／缩放可用于变换测试，但必须注明父图摘要、操作及 `synthetic`，不能增加实拍覆盖数量。人工真值可作为独立评分参考，不能注入模型执行链。

## 6. 速度与内存

分别报告 `modelLoadMs`、`ocrMs`、`totalMs` 的冷／热值，不把 host Python 推理当作 Android 速度。至少 5 次重复只适合初步范围，稳定性评价需更大次数；缺少执行时不计算 P50／P95。

Native 的采样 PSS 是“采样观测到的最高 PSS”，不是绝对峰值 RSS。记录采样间隔、采样窗口与方法；采样可能漏过短暂尖峰。Java/native heap 各字段分开，不能相加后称总 RAM。

设备侧辅助快照（进程运行时）：

```sh
adb shell dumpsys meminfo <实际applicationId>
adb shell dumpsys package <实际applicationId>
```

这一次 `dumpsys meminfo` 是快照，不是峰值。若设备不允许采集，报告“未测量”，不使用模型文件大小作为内存测量。

### 可复现的 ADB 证据采集

交互运行后可使用仓库工具采集原始设备信息、网络设置、包信息、内存快照、截图及 logcat：

```sh
python3 scripts/android-device-evidence.py \
  --serial <adb序列号> \
  --apk artifacts/<实际release文件名>.apk \
  --output artifacts/device-runs/<实际会话目录>
```

只有支持 `adb root` 的测试设备，可以先开启 root 后增加 `--pull-private`，直接拉取原生 `files/ocr-lab` 和 Expo `files/ocr-evidence`。这不修改 APK 的 debuggable 属性、不增加生产测试 Activity，也不要求真实用户手机 root。普通手机继续使用 App 的主动分享功能。

工具不安装 App、不设置离线、不运行 OCR、不生成识别文本或准确率；所有执行和失败仍需写入会话记录。采集时的网络状态仅是快照，不能替代首次离线启动证据。

如果使用 ARM64 native translation 的 x86_64 模拟器，必须记录 `ro.product.cpu.abilist`、`ro.dalvik.vm.native.bridge`、翻译库身份、宿主加速状态，以及实际安装的 APK 摘要。实际成功执行可证明该 Android 仿真环境运行了 ARM64 库；它不能替代 ARM64 真机兼容性和性能测量，也不能称为原生 ARM64 模拟器。

在已经正常启动、支持 `adb root` 的测试模拟器上，可自动走生产 UI 的相册导入和识别路径：

```sh
python3 scripts/run-android-ocr-lab.py \
  --serial emulator-5554 \
  --apk artifacts/build/hukang-china-phase1-arm64-release.apk \
  --output artifacts/device-evidence \
  --repeats 2 --run-timeout 300
node scripts/validate-ocr-evidence.mjs artifacts/device-evidence/photo-*-run-*/record.json
```

脚本实际核对安装包仅含 ARM64 原生库、模型摘要、设备 ABI／翻译库、安装后 `primaryCpuAbi`；在首次启动前设置飞行模式及关闭 Wi-Fi、禁用已安装的 GMS／GSF／Photos，再通过系统相册选择两张归档 JPEG。每次必须生成新的 native JSON 以及 JS 导出的原图、处理图和记录，实际源图摘要应与输入一致。识别空文本、图库未索引、UI 元素缺失、原生错误或导出失败均退出非零，不生成替代 OCR 文字。

运行前可在测试模拟器设置 IPv4／IPv6 OUTPUT DROP；脚本记录实际 iptables 规则，但本身不修改防火墙。工作流应验证 ADB 通道仍可用，并在失败时保存系统日志与 tombstone。两图各两次只提供初步冷／热记录，不满足五次性能统计或真机稳定性验收。`session.json`、实际原始输出、截图和 APK 身份才是结果；脚本存在或 Actions 作业配置存在均不能算运行通过。

## 7. 验收报告状态

每项使用以下状态，证据文件必须可对应：

- `verified_static`：真实文件、依赖、摘要或 APK 检查。
- `verified_host_test`：主机测试／JVM 算法验证，不是 Android OCR。
- `verified_android`：实际 Android 模型执行及导出证据。
- `not_run`：尚无实际执行，不算准确率分母。
- `error`：确实尝试后失败，保存原始错误，不隐藏为未运行。

Phase 1 功能代码与 release APK 能构建，但若无 Android 实证，报告必须明确“运行验收未完成”，不能称全部 Phase 1 已验收。停止在 Phase 0+1，不继续食品 UI、营养 parser、云服务、AI、药品或 Phase 2。
