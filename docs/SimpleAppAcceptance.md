# Hukang 中国大陆版：main 简易成品验收记录

> 0.3.3 已完成 ARM64 Release 构建、APK 静态检查及 Android 模拟器离线业务闭环；物理镜头、OPPO 和用户旧安装覆盖升级仍未验证。0.3.2 的裁剪缺陷及早期选图失败证据继续保留，不作为本次最终交付包。

记录日期：2026-10-15（北京时间）。本文件对应本轮本地简易版收尾；它不是正式发行公告。
构建和设备证据均绑定下述源码与 APK。设备成功结果只覆盖本文明确执行的路径，不能套用到
其他设备、相机实拍或历史安装升级。

## 交付身份

| 项目 | 本轮记录 |
| --- | --- |
| 分支 | `main`；`codex/mainland-v2` 保留为参考分支 |
| 本轮构建源码 SHA | `13449a2c51825fa1eec4f7bb7bc963a9bdb85bc8` |
| Android 构建运行地址 | [38703696958](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38703696958)，成功（ARM64 编译 11 分 13 秒，原生条码测试步骤 37 秒） |
| Android 设备测试运行地址 | [38706597120](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38706597120)，通过；测试源码 `7e4c59678857e17410375d4f257d882dbaa4de07`，运行 APK 源码仍为 `13449a2` |
| 完整设备证据 | [设备 artifact](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38706597120/artifacts/11958864204)，ZIP 17,099,024 字节，SHA-256 `ab37bbc6a9d483230be81744b2292fdba1f69963d28666958fcbfd14b07a2c47` |
| 完整 APK 下载入口 | [完整构建 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38703696958/artifacts/11958565529)，解压得到单个完整 `hukang-0.3.3-arm64.apk` |
| applicationId | `com.hukang.china`（最终 APK 已核验） |
| versionName / versionCode | `0.3.3` / `8`（最终 APK 已核验） |
| APK 实际字节数 | 60,786,768 字节（约 57.97 MiB） |
| APK 文件 SHA-256 | `558cd121be83c25c514b3fc304f6133a8eac39ba5d1ee2e2962930a6bdc48a3b` |
| Artifact ZIP 摘要 | `5cca81f6851942a668c85fe6ce4e0f8cd27dd6cb251f42a74a6d36bad1a6a601`；ZIP 为 95,265,228 字节 |
| 签名模式、证书 SHA-256 指纹 | `ephemeral-test` 临时测试签名；`10801899cf694fa6ca5d75ace622d0ed7e682e2a150a4175832e21026c31593e` |
| 与用户现有安装覆盖兼容性 | 未验证；需要比对用户已安装 APK 的证书和版本 |

Actions artifact 是构建产物，不能称为已发布的正式 Release；本轮没有商店发行。
当前工作流产物保留期为 14 天，交付链接需在有效期内下载。
本轮 APK 检查记录为 [apk-inspection.json](evidence/simple-0.3.3/build/apk-inspection.json)，
其 `errors` 为空、ABI 仅 `arm64-v8a`。构建检查在设备运行前生成，保留
`deviceExecutionVerified: false`；随后同一 APK 的独立
[设备记录](evidence/simple-0.3.3/device-passed/session.json) 为 `status: passed`、
`deviceExecutionVerified: true`，两者职责和生成时间不同，不改写原始证据。

## 已实现的用户流程

- 「今日 / 库存 / 我的」导航和原版图标；今日主操作为「拍一拍」，显示真实食品和库存情况，
  不生成个人营养目标或“今日摄入”。
- 原生 CameraX 取景、ZXing 本地条码解码、补光、权限提示、生命周期释放、重复帧控制；
  支持 EAN-13、EAN-8、UPC-A、UPC-E。多条码冲突要求重新对准单个条码；相册与手动输入为辅助入口。
- 本机命中后打开原商品，不重新 OCR、不自动增加库存；未命中后沿同一草稿完成包装、名称/品牌/规格、
  营养照片、PaddleOCR、人工核对和保存。
- 营养照片方向修复、手动旋转、矩形裁剪与重新识别；保留原始图像和不可变 OCR，修改数值、单位、
  NRV%、计量基准另存为人工核对值。缺失数值不自动填充。
- SQLite 持久草稿、食品、条码、封面、证据、修订和独立库存；食品保存后封面事务失败可按同一 ID 恢复，
  不静默重复建档。底层和失败恢复支持新营养证据版本，不能覆盖旧证据。
- 每次购买独立入库，可减少数量或移除本次库存；库存存在时阻止直接删除食品。不同单位分别统计，
  不把移除包装数当作饮食摄入。
- 本机生成食品资料包或个人数据 ZIP，经系统分享由用户决定接收方；没有自动上传、在线商品查询、云 OCR
  或 AI 兜底。没有 App 内导入还原功能。

这些是源码中已接通的功能。“已实现”不等于真实物理镜头、所有设备或所有包装已验证。

## 已在开发主机实际执行

2026-10-15 对收尾工作区执行：

| 检查 | 结果 | 能证明与不能证明的范围 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | TypeScript 类型检查；不能证明 Android 运行 |
| `npm test` | 75 / 75 通过 | 条码规则、坐标解析、SQLite 事务/历史、草稿恢复、库存、导出白名单等主机测试；0.3.3 构建内同样通过，见 [tests.txt](evidence/simple-0.3.3/build/tests.txt) |
| `python3 -B -m unittest discover -s tests -p 'test_*.py'` | 26 / 26 通过 | 原 APK 构建为 21 项；后续增加 5 项选图选择器测试，见 [检查 38706597490](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38706597490)。测试修订没有更改 APK 运行代码 |
| `npm run verify:assets` | 通过 | 本地原图标、固定模型及配置哈希验证；0.3.3 APK 内模型哈希也已核验 |
| 原生条码解码本地 JVM 测试 | 8 / 8 通过 | 合成条码的纯解码路径；0.3.3 CI `:hukang-barcode:testReleaseUnitTest` 实际执行成功（37 秒，日志未列数量），物理镜头仍待验证 |

食品资料包测试验证：不包含库存、购买记录、本机路径和原始 OCR；保留前导零、规格和资料版本；
旧服务商身份没有明确再分发许可时不进入共享资料包。个人导出路径转换测试验证不修改源证据，
OCR 文字即使以 `file://` 开头也不被误当路径改写。

草稿恢复测试验证：封面保存失败后重试仍使用原食品；保留用户新修正；重拍产生证据修订；
不能将另一个条码绑定到该恢复记录。裁剪测试覆盖预览留白、反向拖动、边界及无效区域。

运行代码检查对应冻结的 APK 源码；后续选图测试修订的源码和运行另列。不能将新增 Python 测试
数量倒填到先前 APK 构建日志。

## 条码格式与固定资产

| 格式 | 本地解码/规则测试 | 本轮 Android 业务闭环 |
| --- | --- | --- |
| EAN-13 | 本地 JVM 合成图与 JS 校验通过 | 已执行合成图相册原生解码 → 未命中补录 → 保存 → 再次解码命中；非物理镜头 |
| EAN-8 | 本地 JVM 合成图与 JS 校验通过 | 未单独执行 |
| UPC-A | 本地 JVM 合成图、前导零与等价键测试通过 | 未单独执行 |
| UPC-E | 本地 JVM 合成图、明确格式的展开规则测试通过 | 未单独执行 |

原图标 SHA-256 为 `d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2`，未重新设计。
最终 APK 内 PP-OCRv5 mobile 检测模型 SHA-256：
`a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d`；识别模型：
`da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092`。
模型配置哈希、字典及本地库记录见检查 JSON 与 [模型清单](OcrModelManifest.md)。

## 数据库升级与签名边界

本地数据库仍为 `hukang-china-food.db`，当前 schema 为 v6，按增量迁移增加草稿、封面和库存表。
详见 [数据库迁移说明](DatabaseMigrations.md) 与 [签名升级策略](AndroidSigningAndUpgradePolicy.md)。

`tests/food-storage.test.mjs` 的 v5 → v6 测试使用**合成旧 schema 数据库**：先建立食品和修订，再移除
v6 新表并设置版本 5，执行真实迁移函数。测试比较迁移前后食品、OCR、证据版本和修订快照，
并确认迁移后仍可编辑。它验证迁移逻辑，**不是用户手机历史 APK 的覆盖升级证据**；
文件系统适配器在该测试中被替代，不能由此证明真实旧照片均可读取。

尚未验证本轮 APK 能覆盖用户此前 OPPO 安装。必须同时满足同一 applicationId、兼容证书、
更高 versionCode，再实际比较升级前后的食品、图片哈希和修订历史。不能重新制作一个“旧包”
冒充用户历史安装，也不能默认通过卸载清数据解决签名不匹配。
本轮 0.3.3 与下述历史 0.3.2 的证书指纹已知不同，不能把此包作为该 0.3.2 安装的覆盖升级包。
用户手机实际已装版本仍须单独比对；保留旧 App 和本地数据，不因新包签名不同而默认卸载。

稳定签名由管理员安全配置以下 GitHub Actions Secrets：
`HUKANG_RELEASE_KEYSTORE_B64`、`HUKANG_RELEASE_STORE_PASSWORD`、
`HUKANG_RELEASE_KEY_ALIAS`、`HUKANG_RELEASE_KEY_PASSWORD`。具体配置和密钥恢复边界见
[签名升级策略的一次性配置](AndroidSigningAndUpgradePolicy.md#当前交付与一次性配置)。
不向聊天、源码、日志或 artifact 提供私钥。新建稳定密钥不自动兼容旧临时签名。

## 0.3.2 历史构建与失败记录：非最终交付

历史构建 [38698585390](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38698585390)
使用运行源码 `2299c3ec0e746e305beb5259dc6151fbb0a47d75`，输出 0.3.2 / versionCode 7。
历史 APK SHA-256 为 `202fc0e9efeef966d26a96abdde666d8d03bec605976643d2fb675e7590b28d7`，
临时证书指纹为 `46e645fc8bd12979f3d2f59d997b24ff63d7ed9533e87b7219f192930f3bdd94`。
其测试脚本单独修订到 `733a0575bcbc1504cc272ee535a71a79ea0fc5a1`，当时工作流比较了
`src`、原生模块、Android、资产和依赖配置，确认测试提交未改变运行代码，重测复用同一历史 APK。

此前 [38700209326](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38700209326)
的两次实际失败均保留：第一次是 App 启动前 Pixel Launcher ANR 弹窗遮挡，见
[截图与记录](evidence/simple-0.3.2/device-attempt1/session.json)；第二次在包装导入后输入名称失败，
[记录](evidence/simple-0.3.2/device-attempt2/session.json)显示输入框未获得编辑焦点、随后回到首页。
日志没有 Hukang ANR/闪退，但第二次的精确导航触发点未被现有截图捕获，不能据此认定整段产品流程正常。
测试脚本增加照片完成/稳定布局等待、输入焦点断言；仅对已识别的 Launcher 弹窗保存证据后关闭，
不忽略 Hukang 异常或未知弹窗。后续结果必须另行记录。

[38701771515](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38701771515)
重测实际通过了相册条码解码、包装输入、草稿重启和首次离线 OCR；
随后裁剪拖动受到页面滚动干扰，得到 59×78 小区域，重识别为空。此为需修复的运行时问题，
未继续宣称保存/库存/导出通过。见 [失败记录](evidence/simple-0.3.2/crop-failure/session.json)、
[实际裁剪截图](evidence/simple-0.3.2/crop-failure/crop-selected.png) 和
[首次原生 OCR](evidence/simple-0.3.2/crop-failure/original-ocr.json)。
第一次识别 total 92,434 ms、modelLoad 1,914 ms、OCR 90,389 ms，采样峰值 PSS 541,922 KiB，
仅为 x86_64 模拟器 ARM 转译的实测，不能推断 OPPO 性能。


## 0.3.3 选图失败历史与重测边界

首次运行错误为 `UI not found: 00-barcode`。脚本从 Photo Picker 进入 DocumentsUI 后仍使用通用菜单分支，随后退出选图；失败截图还记录了模拟器 Google 应用的无关通知。见 [实际记录](evidence/simple-0.3.3/device-attempt1/session.json) 与 [截图](evidence/simple-0.3.3/device-attempt1/failure.png)。后续修订测试选图分支并增加回归，复用同一 APK，没有通过重建 App 改变被测二进制。

此前设备运行 [38705352189](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38705352189)
首次运行在选择条码图片时失败，未进入 OCR 与保存闭环。`workflow_run` 实际 checkout 为 APK 源码 `13449a2`；运行页显示的 head `09649e0`
仅为后续文档提交，不能将其误称为 APK 的运行源码。此前 0.3.2 的部分成功和失败均不替代新包验收。

## 0.3.3 Android 模拟器实际通过的流程

[运行 38706597120](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38706597120)
在 API 35 / Android 15 x86_64 模拟器通过 ARM 转译安装并执行上表的完整 ARM64 APK。
设备指纹为 `google/sdk_gphone64_x86_64/emu64xa:15/AE3A.240806.043/12960925:userdebug/dev-keys`。
测试源码为 `7e4c59678857e17410375d4f257d882dbaa4de07`，APK 源码、文件哈希和证书保持不变；
工作流检查了测试提交与 APK 源码之间的运行文件差异。归档
[session.json](evidence/simple-0.3.3/device-passed/session.json) 的 14 项 `verifiedFlow` 全部实际通过，
但 `physicalCameraVerified` 仍为 `false`。

| 路径 | 本轮状态 / 所需证据 |
| --- | --- |
| 图像条码解码 → 未命中 → 包装/营养表 → 保存 | 已通过；EAN-13 合成条码由原生模块解码，保存 1 条食品；不是实时镜头验证 |
| 草稿保存 → 强制停止 → 重启继续 | 已通过；同一草稿 ID、条码、包装照片及 `250 mL` 规格保留 |
| 本地 PaddleOCR 原始输出及坐标 | 已通过；两份原生 JSON 分别保留 39 / 40 个文字块、坐标、confidence 和原文 |
| 旋转、矩形裁剪、重新 OCR | 已通过右转 90°、左转 90°及触摸裁剪；实际裁剪范围 `(3,2)–(1277,1698)`，输出 **1274×1696**，无有效选区时禁止应用 |
| 五项数值、单位、NRV%、每 100 mL 保存 | 已通过 UI 输入和 SQLite 对照；是人工核对结果，不计入 OCR 自动准确率 |
| 故意选错钠单位后改回 mg 再保存 | 已通过；手动先选 g 再改 mg，最终保存 58 mg；不宣称这是模型原本识错 |
| 再次图像解码 → 原商品 → 不运行 OCR | 已通过；仍为同一食品，原生 OCR 结果文件没有增加 |
| 分别加入 2 瓶、1 瓶，再减少/移除 | 已通过；中间为 1 商品、2 库存批次、3 瓶；减少/移除后剩 1 批次、1 瓶 |
| 编辑规格和小数值仍保留原始证据 | 已通过；规格改为 `250 mL checked`、蛋白质由 `3.6` 改为 `3.60`，保留 2 条修订，原始 OCR/初始解析及图像哈希不变 |
| 默认食品资料包不含库存、照片 | 已实际生成并检查 ZIP；只有 `data.json`、`files.json`，不包含私人库存 |
| 个人导出包含照片、OCR 和修订清单 | 已实际生成并检查 ZIP；图片、当前/源 OCR、初始解析及修订文件存在，清单字节数和 SHA-256 全部吻合 |
| **食品资料包开启照片**与 EXIF 移除 | 已独立检查包含 2 张 JPEG，导出副本无 EXIF；不是以个人导出代替 |
| 导出不修改原始图像 | 已在导出前后核对原图字节哈希；原始图片不变 |
| OPPO 镜头、补光、权限拒绝、后台恢复、多条码 | **未验证**；需要真机操作 |
| 用户原有安装覆盖升级、长期稳定性 | **未验证** |

设备运行实际设置飞行模式、关闭 Wi-Fi/移动数据，并以 `OUTPUT -j DROP` 阻断 IPv4/IPv6 输出；
规则保存在 session 中。GMS、GSF、Photos 等模拟器预装包已禁用，离线闭环仍通过。
0.3.3 APK 已核验 INTERNET 和 ACCESS_NETWORK_STATE 均不存在、JS/模型随包、模型哈希正确；
本轮解析的运行依赖未发现 Google 服务或 ML Kit。静态证据见
[检查 JSON](evidence/simple-0.3.3/build/apk-inspection.json)、
[Manifest](evidence/simple-0.3.3/build/final-manifest.txt) 和
[运行依赖图](evidence/simple-0.3.3/build/runtime-dependencies.txt)。这些检查不等于设备闭环通过。
实际权限为 CAMERA、VIBRATE、仅 Android 12L 及以下的 READ/WRITE_EXTERNAL_STORAGE，及应用私有动态接收器权限。

数据库终态为 1 食品、1 条码关联、1 份当前证据、1 份证据版本、2 条人工修订、1 张包装封面、
1 条库存及 0 条未完成草稿；保存后的重启与再次命中均已执行。见
[数据库摘要](evidence/simple-0.3.3/device-passed/database-summary.json)，各阶段 SQLite integrity 均为 `ok`、
外键异常为 0。这仍不等于用户旧安装的覆盖升级测试。

### 实际 OCR、解析候选与人工核对

首次完整原图的 [原生 OCR](evidence/simple-0.3.3/device-passed/native-ocr/7cfd639b-cc8e-4667-91db-27e1085cda11.json)
和旋转/裁剪后的 [原生 OCR](evidence/simple-0.3.3/device-passed/native-ocr/11cc80ff-d154-46d5-9873-7d4f5e24ce2a.json)
均为设备真实输出。裁剪后仍有 `钠钙` 合并行和 `0860%2%` 粘连 NRV%；解析保存
`completeCandidateTable: false`，没有把部分字段成功写成整表自动识别成功。

| 项目 | 裁剪后初始解析 | 人工核对后保存（每 100 mL） |
| --- | --- | --- |
| 能量 | 309 kJ；NRV 4% 候选 | 309 kJ；4% |
| 蛋白质 | 3.6 g；NRV 缺失 | 3.6 g；6%，编辑测试后为 3.60 g |
| 脂肪 | 4.4 g；NRV 原文 `0860%2%` 待确认 | 4.4 g；7% |
| 碳水化合物 | 5.0 g；NRV 缺失 | 5.0 g；2% |
| 钠 | `钠钙` 无独立行，数值和 NRV 保持未知 | 58 mg；3% |

这证明不确定结果可以通过人工确认完成保存，不证明本样本自动整表解析已成功。原始 OCR、
初始解析和人工值分别保留；测试脚本对照数据库验证，而非把人工目读值写成 OCR 输出。
可以直接对照 [初始解析](evidence/simple-0.3.3/device-passed/initial-parsed.json)、
[首次人工保存](evidence/simple-0.3.3/device-passed/review-after-save.json) 和
[后续人工编辑](evidence/simple-0.3.3/device-passed/review-after-edit.json)。

### 模拟器性能记录

| 本地 OCR 运行 | 模型加载 `modelLoadMs` | 检测推理 | 文字识别推理 | OCR 管线 | 总耗时 | 采样最大 PSS |
| --- | --- | --- | --- | --- | --- | --- |
| 原图 1280×1700 | 1,593 ms | 5,271 ms | 44,024 ms | 49,880 ms | **51,584 ms** | **533,870 KiB** |
| 裁剪图 1274×1696 | 0 ms（复用） | 4,741 ms | 40,874 ms | 46,175 ms | **46,271 ms** | **674,343 KiB** |

原生记录首次 `modelColdLoadMs` 为 1,235 ms，图片解码分别为 35 / 69 ms；PSS 采样间隔 50 ms，
采样数分别为 1,032 / 925。以上是 x86_64 模拟器上的 ARM 转译数据，**不是 OPPO 耗时**。
PSS 为采样观测最大值，不是真实物理设备峰值；两次调用不构成长时间稳定性或无泄漏证明。
Phase 1 用户反馈“不到 5 秒”不能转用为本轮性能结果。

### 实际界面证据

| 页面/步骤 | 原始截图 |
| --- | --- |
| 今日 / 我的 | [今日](evidence/simple-0.3.3/device-passed/home.png)、[我的](evidence/simple-0.3.3/device-passed/mine.png) |
| 库存 | [首次加入 2 瓶](evidence/simple-0.3.3/device-passed/inventory.png) |
| 草稿重启恢复 | [继续录入](evidence/simple-0.3.3/device-passed/draft-resumed.png) |
| OCR 与图像调整 | [首次 OCR 后](evidence/simple-0.3.3/device-passed/ocr-review-before-corrections.png)、[实际裁剪选区](evidence/simple-0.3.3/device-passed/crop-selected.png) |
| 核对与保存后编辑 | [人工核对](evidence/simple-0.3.3/device-passed/review.png)、[编辑后商品](evidence/simple-0.3.3/device-passed/edited-product.png) |
| 系统分享入口 | [默认资料包](evidence/simple-0.3.3/device-passed/actual-catalogue-share-sheet.png)、[附照片资料包](evidence/simple-0.3.3/device-passed/actual-catalogue-with-photos-share-sheet.png) |

截图保持原样，没有修图。今日/我的顶部可见模拟器 Messages / Personal Safety 等系统预装应用发出的
“Enable Google Play services”通知，非 Hukang 提示；GMS 确已禁用，不能由该通知推断 Hukang 依赖 GMS。
分享面板出现 Gmail/Drive 等系统候选，但测试没有选择接收方或发送文件；已验证生成 ZIP 和打开系统
分享入口，**没有声称外部接收端发送成功**。

## 测试素材与输出的归属

- 营养表输入为仓库已归档的真实包装图片 `tests/fixtures/china-food/6923644266066.jpg`，
  SHA-256 为 `dc87cc54d0a8a4a547d642f46ffb5ab2cbbaa677e2d8316dd4934690332d7103`。
  来源：macrofactor / Open Food Facts，归档声明 CC BY-SA 3.0；出处和许可见
  [素材 README](../tests/fixtures/china-food/README.md) 与
  [来源元数据](../tests/fixtures/china-food/6923644266066.source.json)。
- 这是**归档营养侧包装照片**，不是本轮新拍手机照片；脚本把同一图片也用于封面输入，
  不能算作已验证真实正面包装拍摄。拍摄设备、地点和时间未知。
- 条码 PNG 由测试脚本合成，用来验证原生解码与业务闭环；不是物理镜头实扫照片。
- 测试身份 `Test Milk` / `Test Brand` / `250 mL` 为人工测试输入，不代表 OCR 自动识别出的身份。
  五项营养值使用图片人工目读参考进行 UI 修正；真实 OCR JSON 必须另外保留。
- 归档素材来自开发测试输入；App 不访问 Open Food Facts、不导入其商品数据、不打包测试食品库。
  来源声明不构成运行时依赖。不得将测试数据宣传为生产商品覆盖。

## 导出格式与已知限制

食品资料包的 `data.json` 使用 `hukang-food-catalogue` / schemaVersion 1，包含确认食品的条码、
名称、品牌、规格、营养、用户确认状态和资料版本；`images` 为可选相对路径，默认无照片。
个人数据为 `hukang-personal-export` / schemaVersion 1，另含库存、草稿、OCR、人工修订以及
包装证据。`files.json` 列出每个附加文件的路径、字节数和 SHA-256。

可选图片在本机打包。食品资料照片副本重新编码去除 EXIF，原始证据不修改；个人数据可包含
原始图片，因此分享对象和照片内容需由用户检查。当前只有导出，没有 App 内一键恢复。
原生导出限制单文件 64 MiB、最多 4,000 个附加文件；大库内存和超大批量导出尚未做压力测试。
已保存商品在简易界面可修改文字和营养值，但尚未提供替换整张营养表照片的入口；既有底层证据版本能力保留。

本次 App 实际生成的无私人库存示例为
[默认资料包 JSON](evidence/simple-0.3.3/device-passed/catalogue-data.json)，直接从实际 ZIP 提取，
不是手写 JSON。名称、品牌、规格为上述人工测试数据，不能当作真实商品身份查询结果。

| 实际导出 | 字节数 | SHA-256 / 检查范围 |
| --- | --- | --- |
| [默认食品资料包](evidence/simple-0.3.3/device-passed/actual-catalogue.zip) | 1,252 | `5406a4868bec39137064a723cc82e4c8c7a5481e57a8c36de8dceb2c47c80f40`；无照片、库存或购买数据 |
| [附照片食品资料包](evidence/simple-0.3.3/device-passed/actual-catalogue-with-photos.zip) | 842,683 | `3537567d6842eb5531268e0eb800e3ae56746f3a81315b0a8a295ebef13e79db`；2 张导出 JPEG 无 EXIF，资产哈希正确 |
| 个人数据包（完整设备 artifact 内） | 4,500,137 | `acc5bf78ef8d48e951cb44e0f8ec8e0668130049bd759696f2c7a11237e80cc0`；1 食品、1 库存、2 条修订、照片和 OCR/解析文件完整 |

这些包只含测试采集数据。个人导出的原始照片保持原字节及可能存在的元数据，只有食品资料包
照片副本执行 EXIF 移除；两类导出不能混淆。本轮验证了文件生成和分享面板，未验证接收端传输。

仍未覆盖的边界：物理相机及 OPPO、其他条码格式的 Android 业务闭环、每 100 g/每份的设备录入、
多食品/多标签长期使用、真实旧 APK 升级、故意中断写入后的设备恢复、删除食品级联、
包含未完成草稿/包装 OCR/多版本证据历史的个人导出。对应主机测试或底层能力不能替代这些设备结果。

## OPPO Find X7 Ultra 简短验收

1. 先核对 APK 大小、SHA-256、版本和证书。已有数据时不要卸载；证书不匹配就停止覆盖安装并保留旧 App。
2. 断网启动，从「今日」点击「拍一拍」。测试权限拒绝/再授权、补光、退出重进、切后台恢复；对准单个真实食品条码。
3. 首次未收录时拍正面和营养表，填写名称、品牌、规格；旋转/裁剪后识别，逐项核对五项数值、单位、NRV% 和计量基准。
   将一个单位故意改错再修正，确认保存，加入 2 瓶/盒/袋。
4. 强制停止后重开，再扫同款，应直接进入同一食品且不再 OCR；再加入 1 件相同单位，食品仍只有 1 条、库存总数为 3。
5. 编辑一个小数值、减少/移除库存，检查其他食品和原始证据未变。另开一条草稿后退出重启，确认照片及步骤仍可继续。
6. 「我的」先导出默认食品资料包，检查无库存；再分别测试带照片食品资料包和个人数据包的保存/分享，检查相对路径及照片。
7. 记录失败步骤、APK 版本、截图、设备 Android 版本及可测耗时；不要上传私钥或未经检查的私人照片。

本轮停止在本地食品采集、库存和分享闭环，不自动新增云服务、账号、药品或营养建议。
