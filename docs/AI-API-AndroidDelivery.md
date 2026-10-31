# Hukang 0.4.1 AI API Android 测试包

## 下载与包身份

- [下载 APK 与校验资料 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41214772131/artifacts/13048116010)，登录 GitHub 后下载，解压取得 `hukang-0.4.1-arm64.apk`。产物保留至 **2026-11-14 23:35（北京时间）**。
- [成功构建 41214772131](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41214772131)。源码：[58e8070c7e38b4893f8d346eb70d768000798a8d](https://github.com/chenchangxiang-330/Hukang-codex-China/commit/58e8070c7e38b4893f8d346eb70d768000798a8d)。
- 版本 **0.4.1（versionCode 10）**，包名 `com.hukang.china`；ARM64，最低 Android 8（API 26）。文件大小 **60,959,617 字节**。
- APK SHA-256：`d232217607b5a27342d489fe3180a7ec1233980cb8e6858938c8a591ca5fae7e`。
- 签名证书 SHA-256：`dc046c6ff30bb7223175d4f40a4ae23244a103cf621e43ae3f8cadf6a7d9cc9e`。实际为临时测试签名，v2 签名有效，没有 v3 / v3.1 轮换链。

已独立下载完整 APK，核对 ZIP 内该条目的 CRC、APK SHA-256，以及 APK v2 签名块内证书 DER 指纹，与云端 `apksigner` 一致。完整 ZIP 大文件下载超时后，改为只分段下载 APK 条目，因此没有声称独立复算完整 ZIP 的哈希。[本地核验](evidence/ai-api/android/local-file-verification.json) · [APK 构建检查](evidence/ai-api/android/apk-inspection.json) · [最终 Manifest](evidence/ai-api/android/final-manifest.txt)。

## 保留数据的安装说明

**本包不能覆盖已归档的五份旧测试包。** 包括 UI V1、最初 UI V2、日期修复、首次键盘修复和已交付的 0.4.0（9）；证书均不同，且无旧签名轮换链。[完整签名对照](evidence/ai-api/android/signing-comparison.json)。用户手机当前安装证书尚未读取，不能声称手机升级已通过。

1. 如果手机已有护康及本地资料，保留现有 App，不卸载、不清除数据。现有导出文件不能自动导入恢复，不能以已导出为理由卸载。
2. 本次 APK 请在尚未安装护康的独立 ARM64 测试设备验证。下载 ZIP、解压 APK，传入测试设备，在文件管理器中打开安装；按系统提示为该文件管理器授权安装应用，结束后可以关闭授权。
3. 已安装同一签名且版本号兼容时，系统才允许保留数据覆盖；出现签名冲突应停止安装。旧安装的后续升级需要使用对应原签名重新构建，签名材料只放入受保护的发布配置，不放聊天或源码。

本轮未更换包名、卸载用户 App、清空用户数据或读取私有签名材料。

## 验证范围

API 协议、22 项新增测试、本地 HTTPS 模拟服务与浏览器交互见 [AI API V2](AI-API-V2.md)。108 项 Node、28 项 Python、类型 / 格式 / 离线资源检查通过；浏览器和 Android 证据分别归档。

[Android 验收 41215968187](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41215968187) 两组均成功，安装与检查的是上述同一份 APK、同一源码。

| 范围 | 实际结果 |
| --- | --- |
| 原生界面 | 七组通过：今天 / 记录 / 营养详情、四项导航、日期与展开、320/390dp、系统字号 1.5、Dock / 滚动 / 手势安全区、三次键盘开合、相机权限与双入口拍照返回 |
| 原生 AI | 网络模块实际加载，使用保留的 `.invalid` 测试域名与无效非秘密测试字符串，验证网络失败提示；清除配置后餐食请求被拒绝；未写入正式饮食记录。不是有效密钥的真实模型实测 |
| 离线业务 | 飞行模式并阻断 IPv4 / IPv6 出站后，14 项流程通过：图片条码解码、草稿恢复、实际本地 OCR、旋转裁剪重识别、人工核对与食品保存、两次入库、消耗、修改与修订、三种真实 ZIP 导出、原图与 OCR 证据保持 |
| 数据保留 | 同一 APK `install -r` 重装成功，数据库全部表和原图保持。这个结果不代表旧签名版本可覆盖升级 |

设备为 Android 15 / API 35 Pixel 2 模拟器，支持 ARM64 翻译；不是实体 OPPO / 小米等手机。相机使用系统相机的模拟场景，实物镜头扫码、中文输入法、TalkBack、厂商系统及旧 Android 尚未实测。UI 组始终为真实空饮食数据；离线组仅在临时测试设备通过原有业务手动录入 Test Milk 食品和库存，没有填入演示饮食。

[原生 UI 报告](evidence/ai-api/android/ui/session.json) · [离线业务报告](evidence/ai-api/android/offline/session.json) · [原生截图索引](evidence/ai-api/android/README.md)。原生 UI 组共 43 张原始截图，本仓库精选归档；完整证据：[UI ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41215968187/artifacts/13048278422)、[离线 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41215968187/artifacts/13048283811)。

没有真实 API Key，真实服务商的文字 / 图片响应和计费未实测。不能把模拟服务的成功视为真实服务商验证成功。包装外观 AI、自动抠图、全天饮食分析及真实饮食存储本轮未接入。

## 手机验收

- “我的 → AI 服务设置”填写服务地址、密钥、模型，核对发送说明并主动测试。成功须显示实际接口、请求 / 响应模型及回复；错误密钥、错误模型、网络失败须有原因。
- “拍一拍 → 餐食估算”只填文字即可调用；新配置应在下一次估算生效。检查 AI 估算标记、未知营养、份量换算和仅预览状态。
- 只有支持的官方视觉模型且勾选发送照片时才上传所选 JPEG / PNG；其他配置应提示文字估算，不假称识别照片。
- 取消、超时、切后台、更换地址 / 模型、清除配置后，不能自动重试或恢复旧请求。清除配置后必须重新填写密钥；取消不代表服务商未计费。
- 关闭网络回归扫码、离线 OCR、人工核对、食品保存、库存和导出。另验实体镜头、实物条码、中文输入法、厂商系统、省电策略及实际手机字体 / 安全区。
