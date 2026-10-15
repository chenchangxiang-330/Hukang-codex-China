# Hukang 中国大陆版：main 简易成品验收记录

> 0.3.3 修复版已完成 ARM64 Release 构建和 APK 静态检查，设备验收仍在运行，不能宣布整条流程通过。0.3.2 的裁剪缺陷与失败证据保留在历史记录中，不作为本次最终交付包。

记录日期：2026-10-15（北京时间）。本文件对应本轮本地简易版收尾；它不是正式发行公告。
下列“待填写”项尚未取得本轮构建或设备证据，不代表通过。构建、设备测试完成后须用同一
源码提交及 APK 的实际记录更新，不能套用旧版本成功结果。

## 交付身份

| 项目 | 本轮记录 |
| --- | --- |
| 分支 | `main`；`codex/mainland-v2` 保留为参考分支 |
| 本轮构建源码 SHA | `13449a2c51825fa1eec4f7bb7bc963a9bdb85bc8` |
| Android 构建运行地址 | [38703696958](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38703696958)，成功（ARM64 编译 11 分 13 秒，原生条码测试步骤 37 秒） |
| Android 设备测试运行地址 | [38705352189](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38705352189)，进行中；实际 checkout 为 `13449a2`，尚无通过结论 |
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
其 `errors` 为空、ABI 仅 `arm64-v8a`；其中 `deviceExecutionVerified: false` 不表示设备已通过。

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
| `python3 -B -m unittest discover -s tests -p 'test_*.py'` | 21 / 21 通过 | 模型获取校验、设备证据规则、UI 选择器等；不等于已执行设备 UI |
| `npm run verify:assets` | 通过 | 本地原图标、固定模型及配置哈希验证；0.3.3 APK 内模型哈希也已核验 |
| 原生条码解码本地 JVM 测试 | 8 / 8 通过 | 合成条码的纯解码路径；0.3.3 CI `:hukang-barcode:testReleaseUnitTest` 实际执行成功（37 秒，日志未列数量），物理镜头仍待验证 |

食品资料包测试验证：不包含库存、购买记录、本机路径和原始 OCR；保留前导零、规格和资料版本；
旧服务商身份没有明确再分发许可时不进入共享资料包。个人导出路径转换测试验证不修改源证据，
OCR 文字即使以 `file://` 开头也不被误当路径改写。

草稿恢复测试验证：封面保存失败后重试仍使用原食品；保留用户新修正；重拍产生证据修订；
不能将另一个条码绑定到该恢复记录。裁剪测试覆盖预览留白、反向拖动、边界及无效区域。

上述主机检查对应本轮冻结的运行源码。若之后代码变化，应以最终构建产物 `tests.txt` 为准。

## 条码格式与固定资产

| 格式 | 本地解码/规则测试 | 本轮 Android 业务闭环 |
| --- | --- | --- |
| EAN-13 | 本地 JVM 合成图与 JS 校验通过 | 合成图经相册原生解码，等待本轮设备结果 |
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


## 0.3.3 Android 设备验收：等待实际结果

本轮设备运行 [38705352189](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38705352189)
仍在进行。`workflow_run` 实际 checkout 为 APK 源码 `13449a2`；运行页显示的 head `09649e0`
仅为后续文档提交，不能将其误称为 APK 的运行源码。此前 0.3.2 的部分成功和失败均不替代新包验收。

`tests/device/simple-device.py` 计划在 API 35 x86_64 模拟器通过 ARM 转译安装完整
ARM64 Release APK。脚本存在不代表已通过；本轮最终状态、失败位置、截图和 `session.json`
须从上表的实际设备运行填写。模拟器不能替代 OPPO 物理镜头。

| 路径 | 本轮状态 / 所需证据 |
| --- | --- |
| 图像条码解码 → 未命中 → 包装/营养表 → 保存 | 待本轮设备结果；相册图像解码不能称为实时镜头通过 |
| 草稿保存 → 强制停止 → 重启继续 | 待本轮设备结果，比较草稿 ID、照片、条码、规格 |
| 本地 PaddleOCR 原始输出及坐标 | 待本轮原生结果 JSON；不得用人工值替代 |
| 旋转、矩形裁剪、重新 OCR | 待 UI 实际操作、原图/处理图及哈希证据 |
| 五项数值、单位、NRV%、每 100 mL 保存 | 待 UI 和 SQLite 对照；脚本人工输入，不计入 OCR 准确率 |
| 故意选错钠单位后改回 mg 再保存 | 待本轮设备结果；这是人工制造的核对场景，不宣称模型原本识错 |
| 再次图像解码 → 原商品 → 不运行 OCR | 待本轮设备结果，比较食品数量及原生 OCR 文件数 |
| 分别加入 2 瓶、1 瓶，再减少/移除 | 待本轮设备结果，比较商品 1 条、库存批次及数量 |
| 编辑规格和小数值仍保留原始证据 | 待 UI、修订与原始 JSON/hash 对照 |
| 默认食品资料包不含库存、照片 | 待实际 ZIP 和系统分享截图 |
| 个人导出包含照片、OCR 和修订清单 | 待实际 ZIP 条目、字节数及 SHA-256 验证 |
| **食品资料包开启照片**与 EXIF 移除 | 已加入独立 ZIP/JPEG 元数据检查，待设备执行；不能用个人照片导出代替 |
| OPPO 镜头、补光、权限拒绝、后台恢复、多条码 | **未验证**；需要真机操作 |
| 用户原有安装覆盖升级、长期稳定性 | **未验证** |

设备脚本会设置飞行模式、关闭 Wi-Fi/移动数据，并阻断 IPv4/IPv6 输出；保存相应规则。
0.3.3 APK 已核验 INTERNET 和 ACCESS_NETWORK_STATE 均不存在、JS/模型随包、模型哈希正确；
本轮解析的运行依赖未发现 Google 服务或 ML Kit。静态证据见
[检查 JSON](evidence/simple-0.3.3/build/apk-inspection.json)、
[Manifest](evidence/simple-0.3.3/build/final-manifest.txt) 和
[运行依赖图](evidence/simple-0.3.3/build/runtime-dependencies.txt)。这些检查不等于设备闭环通过。
实际权限为 CAMERA、VIBRATE、仅 Android 12L 及以下的 READ/WRITE_EXTERNAL_STORAGE，及应用私有动态接收器权限。

性能以本轮原生 OCR 的 `modelLoadMs`、`ocrMs`、`totalMs`、分阶段和内存字段为准，待填写实际数据。
采样 PSS/RSS 不等于真实峰值；未观测到 OOM 也不能证明峰值安全。模拟器数据与 OPPO 数据分开记录。
Phase 1 用户反馈“不到 5 秒”不能转用为本轮性能结果。

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

`tests/simple-export.test.mjs`、`tests/simple-app.test.mjs` 提供无真实个人信息的合成导出样例与断言；
实际系统分享 ZIP 和界面截图待设备 artifact，不用手写样例冒充运行产物。

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
