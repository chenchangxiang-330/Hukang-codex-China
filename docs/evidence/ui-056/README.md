# Hukang 0.5.6：直接录入、区间进度、API 营养表

基线：`543ff75cb54027ce8ed82faddc84bda53c6a28f4`，`codex/nutrition-ui-v2`。保留原有 0.5.5 改动，App 0.5.6 / versionCode 17，SQLite schema 8 不变。用户原有 `.DS_Store` 未提交，参考仓库未修改。

## 实际修改

- 新录入自动丢弃尚未落成食品的新建草稿；与自动保存串行，已丢弃 ID 拦截迟到写入。已保存食品的失败恢复草稿不删除。临时图片仅清理 App 自有目录下、没有任何持久数据引用的文件；相册原件不动。
- 首页与营养详情共用按日期累计的 `total`、个人目标和 `nutrientProgress`。区间用深蓝下限、浅蓝上限表示，不取中点。部分缺失显示“小计”并保留已知填充；其他营养素独立计算；没有目标或全部未知不生成百分比。
- 展开营养项直接显示食物贡献。目标来源、计算依据、估算和完整性说明集中至“我的 → 关于护康”。首页、记录、详情不再重复长计算过程。
- 营养表照片改走统一 `AiService.readNutritionLabel`，不调用本地 OCR、不自动降级。不要求条码；独立扫码和食品库查询仍保留。删除拍照流程的条码表单和 PaddleOCR 说明卡。
- 拍照和相册共用原图保留、本地上传副本处理；实际读取与 Base64 解码字节数均要求 **小于 4,000,000 bytes**，整个 UTF-8 请求另有 6 MB 上限。上传副本移除元数据，处理完清理。
- 表格保留每 100g / 每 100mL / 每份基准、实际营养项目和原单位。未知值可留空；基准未确定不能确认保存。点行编辑，重新拍摄可返回旧结果，只有落库后显示成功。已确认食品通过现有实际食用流程计入摄入，保存食品本身不计入。
- 原始 API 响应与人工核对值分开存储；沿用历史证据容器，并明确 `ocr.api` 与 `api-label-v1` 标识，不伪造文字框或本地 OCR 结果。旧记录无需迁移。
- 复用当前验证配置、系统安全存储、授权与统一取消/超时/防重机制。目的地址/模型切换使旧请求失效，失败不写假营养数据。没有新加后台发送、遥测、自动重试或密钥导出。

## 协议与验证边界

使用既有 OpenAI-compatible Chat Completions 图片消息（`image_url` + Base64 data URL）。沿用已核实的官方 DeepSeek `deepseek-flash` 和通义千问 `qwen3-vl-plus` 图片能力；其他配置如未在现有能力表中，显示不支持图片并提供设置入口。

官方依据（2026-11-08 核对）：[DeepSeek Vision](https://api-docs.deepseek.com/guides/vision/)、[通义千问视觉理解](https://help.aliyun.com/zh/model-studio/vision)。服务商可能收费；本轮没有服务商测试密钥，**未宣称真实服务识别精度已经验证**。

本地已通过：TypeScript、155 个 Node 测试、29 个 Python 测试、格式检查、固定资源校验。测试包含真实本机 HTTPS 模拟服务收取图片请求、结构化表格/空值、无条码 SQLite 保存、单位与份量换算、草稿清理范围、配置切换/删除、认证/权限/配额/限流/超时/取消/格式错误。模拟服务不是服务商实测。

浏览器验证使用共享 React Native 界面和隔离适配器：UI V1 35 项、营养 V2 18 项，以及 AI 浏览器回归通过；包括重新拍摄后，旧结果仍展示对应的识别原图。这些不是 Android 截图或相机验收。

## Android 测试包

- 构建：[42469106924，attempt 2](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/42469106924)，成功。第一次在下载 Kotlin 编译依赖时遇到 HTTP 504；重试成功。
- [下载构建 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/42469106924/artifacts/13614247870)，解压取 `hukang-0.5.6-arm64.apk`，产物保留至 2026-11-22。不是正式 Release。
- APK 源码：`1fb7a8f8974d1c4513725a698777194408da8a03`。
- 版本：0.5.6 / versionCode 17；包名 `com.hukang.china`；ARM64；Android 8.0 及以上。
- APK 大小：61,092,825 bytes。完整 APK 已下载，本地重新计算 SHA-256 与 CI 一致。

```text
SHA-256: 1d837b51d74951fdd3f07108e6b1993d625f57ceaadcf217b50ffe4aab80d07e
```

签名检查通过，但本次使用临时测试证书。新证书指纹 `1304a4c0706d0f49d4a2fbd99ce1d8c860d6decc6e3045962fa183a9ebd8015e`，归档 0.5.5 为 `ae5c1982ee6f8d7df5e6ea80bf18aa8e9823e05d85abda05808426076313816e`；两者不同，没有签名轮换链，**不能覆盖该归档 0.5.5**。未读取用户手机实际安装证书。见 [签名比较](signature-comparison.json)、[APK 检查](apk-inspection.json) 和 [本地独立核验](local-apk-verification.json)。

安装步骤：下载并解压，在没有旧版安装的独立 ARM64 测试设备上打开 APK，按 Android 提示允许该文件来源安装，完成后启动护康。已有护康和本地数据的手机请保留原安装，**不要卸载、清数据或改包名绕过签名问题**；需取得原签名配置后才能提供兼容覆盖包。

## 页面与设备证据

浏览器证据：[验证记录](browser-evidence.json)、[表格结果页（隔离模拟数据）](browser-label-table-MOCK.png)、[区间进度（隔离模拟数据）](browser-range-progress-MOCK.png)。这些图片不是 Android 渲染。

同版 APK 已在 Android 15 / API 35 模拟器安装成功（x86_64 系统的 ARM64 原生桥接，1080×1920）。[大图处理验收](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/42474342359) 通过：共享图片处理器将 18,621,487 bytes 测试原图处理为 1,774,859 bytes 上传副本，移除副本元数据、保留原图，重启可恢复草稿，饮食记录仍为 0。[原始报告](android-image-processing.json)。该测试未向真实服务商发送照片。

[饮食闭环与连接存储](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/42474337573) 通过：目标草案应用、Keystore 连接恢复与删除、网络失败保留旧连接，以及半份/一份预览、确认食用、份量编辑、移动日期与餐次、删除、库存独立累计。隔离测试的蛋白质预览从 50g 变为 54.25g / 58.5g；确认前数据库不变，保存后只增加一次。[原始报告](android-flows-report.json)。

[离线回归](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/42474339843) 通过：关闭网络后的相册条码解码、食品库查询、营养表字段编辑与保存、未知钠保持空值、分批入库与减少库存、三种导出、证据文件哈希，以及同一 APK 覆盖安装数据保留、旧 v6 数据库增量迁移至 v8。这里的表格成功结果是**仅注入全新模拟器的模拟结果**，不是服务商实际识别；真实 HTTPS 图片传输在 Node 模拟服务测试中验证。同一 APK 重装不证明与旧签名包兼容。[原始报告](android-offline-report.json)。

页面组在 [42475540642](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/42475540642) **6 项全部通过**：空状态与四项导航、相机拒绝/授权/拍照返回、320dp 与 150% 字体及键盘、手势安全区、直接开始与旧草稿清理、确定数值及区间实际填充。区间的下限、上限和底轨像素分别为 RGB(150,202,233)、(192,223,241)、(230,237,242)；空状态的四条轨道均无伪造填充。[原始报告](android-ui-report.json)。

首次页面组因 Android 合并可访问名称和读数，与测试的整串匹配不符而失败。修正仅在测试脚本，改为按原生控件 ID 定位并验证空轨道像素；复验使用**同一个 APK**，没有重打包或更换数据来掩盖问题。测试源码为 `cbcdd07a36731e9935d1770ecbba9ad74171232b`，工作流确认与 APK 源码之间没有运行时代码差异。四组通过结果与图片 SHA-256 见 [证据索引](evidence-index.json)。

以下均为上述 **同版 Android 模拟器原生截图**，原始图片未修改。带摄入量和营养表的图片使用隔离测试数据，不写入交付 APK；无数据页面保持真实空状态。

| 页面 | 证据 |
| --- | --- |
| 今日空状态 | [Android 截图](android-today-empty.png) |
| 记录空状态 | [Android 截图](android-diary-empty.png) |
| 食品库空状态 | [Android 截图](android-library-empty.png) |
| 我的 | [Android 截图](android-mine-empty.png) |
| 摄入范围与实际填充 | [Android 截图 · 隔离记录](android-range-progress-isolated.png) |
| 营养详情展开贡献 | [Android 截图 · 隔离记录](android-range-detail-expanded-isolated.png) |
| 修改份量后详情同步 | [Android 截图 · 隔离记录](android-nutrition-updated-isolated.png) |
| 营养表直接入口，无 API 配置 | [Android 截图](android-label-direct-no-api.png) |
| 营养表结果与空值 | [Android 截图 · 注入模拟结果](android-api-label-table-MOCK.png) |
| 营养表字段修改 | [Android 截图 · 注入模拟结果](android-api-label-edit-MOCK.png) |
| 小屏大字体与键盘 | [Android 截图](android-320-font150-keyboard.png) |

## 尚未验收

- 无服务商测试密钥，未完成真实服务图片识别准确度和收费调用实测；不能把模拟结果截图作为真实模型识别证明。
- 无实体 Android 设备，未验真实镜头、反光/模糊包装、OPPO 等具体设备兼容性；模拟器相机使用虚拟场景。
- 新旧签名不同，未交付可覆盖归档 0.5.5 的包；保留原 App 与数据，不能通过卸载或清库解决。
- 本轮没有新增或宣称完成自动抠图；保留此前范围。

[手机验收清单](PHONE-CHECK.md) 提供后续实际设备步骤。
