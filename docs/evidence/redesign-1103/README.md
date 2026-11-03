# 0.5.4 最终交付证据

APK 与截图源码：`2216421eaac34144bf3892c0cfae37a110eafbaa`，App 0.5.4 / versionCode 15，SQLite 8。后续提交只归档文档和验收材料，不改变该 APK。

[修改清单、安装方法与手机验收清单](../../Redesign1103.md) · [APK 下载](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41684222473/artifacts/13254689637) · [检查构建](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41684237283)

## Android 原生渲染与验收

32 张 PNG 均由安装实际 APK 的 Android 15 / API 35 模拟器直接截屏，未拼接、重绘或美化。模拟器为 x86_64，使用 ARM64 转译运行 ARM64 APK；不是实体手机。`ui-*-empty.png` 保持真实空数据。`flows-*` 使用全新隔离模拟器的 TEST 食品/个人资料/安全存储夹具，`offline-*` 使用公开营养表照片与测试条码，均未向用户数据写入示例记录。

每张截图的 SHA-256、源码和 APK 指纹见 [android/files.json](android/files.json)，七组归档指纹和运行来源见 [android/acceptance.json](android/acceptance.json)。所有七组材料 ZIP 已下载并独立校验完整 SHA-256。

| 验收组 | 实际结果与证据 | 范围 |
| --- | --- | --- |
| UI | [通过](android/ui-session.json) | 四项导航、空数据、展开返回、双入口、相机拒绝/授权、虚拟场景拍摄删除、320dp/150% 字体/键盘、手势安全区 |
| 资料/连接/食用 | [通过](android/flows-session.json) | 草稿/手改目标确认、Keystore 加密跨进程恢复、实际界面删除、网络失败保留旧配置、半份/整份预测、保存/修改份量/日期/餐次/时刻/删除、餐食库存独立 |
| 离线 | [通过](android/offline-session.json) | 屏蔽外网后条码图片解码、本地 OCR、旋转裁剪/人工核对、食品保存复扫、批次库存、三种导出、同包重装保留数据库与旧 v6→v8 迁移 |
| 大图 | [通过](android/image-large-session.json) | 原图 18,621,487 字节保持原样；上传副本 1,774,859 字节，去元数据、草稿重启恢复 |
| 透明图 | [通过](android/image-transparent-session.json) | 输入透明 PNG 原图与上传副本隔离；这是输入处理测试，没有执行抠图模型 |
| GIF | [通过](android/image-gif-session.json) | 不支持格式的错误反馈、返回重选与取消 |
| 超限图片 | [通过](android/image-oversize-session.json) | 超限错误、重新选择与取消，未新增饮食 |

主运行 [41686823162](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41686823162) 的六组通过；GIF 首次在安装 Android Emulator 时出现 `ZipFile unknown archive`，App 尚未启动，因此主运行仍标为失败。只重跑 GIF，使用同一 APK 的 [41687576897](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41687576897) 通过。详见 [final-run-retry.json](final-run-retry.json)。此前发现和修复保留在 [首轮](first-attempt-findings.json) / [第二轮](second-attempt-findings.json)，旧截图没有冒充最终 APK。

### 页面截图

| 页面或状态 | 原始 Android 截图 |
| --- | --- |
| 今日，真实空数据 | [打开](android/ui-android-today-empty.png) |
| 记录 / 食品库 / 我的，真实空数据 | [记录](android/ui-android-diary-empty.png) · [食品库](android/ui-android-library-empty.png) · [我的](android/ui-android-mine-empty.png) |
| 营养详情 / 矿物质展开 | [详情](android/ui-android-nutrition-empty.png) · [展开](android/ui-android-mineral-detail.png) |
| 拍一拍双入口 / 一个选填文字框 | [双入口](android/ui-android-two-entries.png) · [餐食](android/ui-android-meal-single-input.png) |
| 模拟器相机拍摄，非实体镜头 | [原图返回](android/ui-android-camera-meal-original.png) |
| 320dp / 150% 字体 / 键盘 / 手势安全区 | [大字体](android/ui-android-320-font150-empty.png) · [键盘](android/ui-android-320-font150-keyboard.png) · [安全区](android/ui-android-today-gesture-safe-area.png) |
| 资料保存 / 目标草案及确认（隔离夹具） | [资料](android/flows-android-profile-saved.png) · [草案](android/flows-android-target-draft.png) · [确认](android/flows-android-target-confirmed.png) |
| 连接恢复 / 网络失败 / 删除（测试配置） | [恢复](android/flows-android-encrypted-connection-restored-MOCK.png) · [失败保留旧连接](android/flows-android-native-network-failure-old-connection-retained.png) · [删除](android/flows-android-connection-deleted.png) |
| 半份 / 整份预测（隔离 TEST 食品） | [50 + 4.25 → 54.25g](android/flows-android-half-portion-prediction.png) · [50 + 8.5 → 58.5g](android/flows-android-whole-portion-prediction.png) |
| 保存后进度 / 修改后营养 / 独立库存（隔离 TEST 食品） | [四条进度](android/flows-android-four-progress-isolated.png) · [详情同步](android/flows-android-nutrition-updated-isolated.png) · [库存](android/flows-android-meal-inventory-isolated.png) |
| 离线 OCR / 裁剪 / 人工核对键盘 | [OCR](android/offline-ocr-review-before-corrections.png) · [裁剪](android/offline-crop-selected.png) · [人工核对](android/offline-review-fat-keyboard.png) |
| 离线库存与实际导出（隔离测试） | [库存](android/offline-inventory.png) · [Android 分享面板](android/offline-actual-personal-with-photos-share-sheet.png) |

公开营养表照片来自 [Open Food Facts](https://world.openfoodfacts.org/product/6923644266066)，上传者 macrofactor，CC-BY-SA-3.0；截图中用于本地 OCR/人工核对，测试名称与条码为隔离夹具。原图来源、指纹、裁剪及旋转记录见离线报告。

## 浏览器预览：与 Android 分开

[browser](browser) 内 9 张截图来自共享 React Native 组件的浏览器预览，原生接口有替身，不能用于证明 Android 相机、Keystore、SQLite 或 OCR。均为相同源码 `2216421`；[材料指纹](browser/ci-archive.json)、[截图清单](browser/files.json)、[34 项共享界面](browser/offline-report.json)、[8 项营养界面](browser/nutrition-report.json)、[模拟 HTTP AI 流程](browser/ai-report.json)。

领域与存储验证：143 项 Node、29 项 Python、TypeScript、UI 格式、OCR 资产哈希通过。v7→v8 迁移、重复操作/迟到草稿、未知值和 g/mL 基准、目标草案过期、连接切换/删除及错误分类由这些检查覆盖。

## 尚未验收或尚未接入

- 没有真实服务商密钥；真实收费 API、营养推荐质量和照片识别准确率未实测。模拟 HTTP 有成功/失败响应，Android Keystore 使用测试探针；两种证据不等同于真实服务。
- 实体设备、实时镜头条码解码、OPPO 兼容性、发热与性能未测。模拟器虚拟场景已完成相机权限和拍照返回，但不能代表实体相机质量。
- 离线 OCR 在该转译模拟器记录约 69–73 秒和较高内存；这只是该环境测量，不能作为真机体验或 BiRefNet 性能承诺。
- B 列实际 BiRefNet 检查点/实验身份仍缺失。当前完成原图、封面引用和任务基础；模型下载、取消下载、完整性校验、本地推理、透明贴纸效果及白盘保留未接入。模型任务测试是状态与版本约束测试，没有用假模型冒充推理。
- [签名比对](android/signing-comparison.json) 显示本包与已交付旧包不同，不能覆盖旧 0.5.3/0.5.2。旧签名升级和用户手机数据迁移未验收；同包重装保留数据不能替代旧签名升级。保留旧 App，用独立测试设备安装，不卸载、不清库、不改包名绕过。

当前仅草稿 PR 与测试包，没有合并或正式发布。
