# Hukang 0.5.2 Android 交付与验收

本轮在 `codex/nutrition-ui-v2` 继续，草稿 PR：<https://github.com/chenchangxiang-330/Hukang-codex-China/pull/1>。没有合并，没有改动 `Hukang-codex` 参考仓库，原有未跟踪 `.DS_Store` 保留。

## 已实现

- 拍一拍的文字/照片餐食估算 → 人工核对名称、营养、日期、餐次和份量 → 明确确认 → 本机 SQLite 饮食记录。没有 API 时可手动记录，未知营养保持未知。
- 记录编辑、二次确认删除、重新打开后的持久化、今天/记录/营养详情同步、个人目标持久化；饮食不会自动扣库存。
- 独立食物与照片快照、唯一提交操作与事务、迁移失败回滚及可恢复照片清理。食品库后续变化不改写历史。
- 包装正面识别只产生待核对的名称/品牌候选；记录原始候选与人工改动。优先扫码/查库，原离线 OCR 与人工营养核对继续保留。
- Android 本机图片采样、方向修正、白底透明合成、移除元数据，上传副本不超过 4,000,000 字节；处理预览、取消、重选和清理。相册原图、OCR 证据、上传缓存和已保存饮食照片相互独立。

协议、字段、迁移和图片约束见 [实现说明](NutritionLoopV2.md)。

首次测试建议先走「拍一拍 → 餐食估算 → 手动记录这一餐」，填写名称、营养和份量，确认后查看今天、记录和今日营养；退出重开，再修改或删除该条测试记录。此路径不需要 API Key。需要估算时，在「我的 → AI 服务设置」选择预设、临时填写自己的密钥并主动检查连接，回到餐食入口输入文字或选择图片、确认发送内容后调用。包装食品从另一入口开始，优先扫码、查库与离线营养表核对。

| 修改位置 | 实际变化 |
| --- | --- |
| `nutrition-v2/CaptureScreen.tsx`、`FoodEditor.tsx` | 本机选图预处理、餐食预览、人工改营养/份量、异步确认保存和重复点击防护 |
| `nutrition-v2/Screens.tsx`、`simple/SimpleApp.tsx` | 今天/记录/详情共享真实数据，记录编辑与删除，目标持久化，保存与错误状态 |
| `nutrition-v2/PackageAssistant.tsx`、`simple/CaptureScreens.tsx` | 两条入口共用包装候选识别；原始候选与用户改动分开；保留扫码和 OCR |
| `services/nutrition/*`、`nutrition-v2/model.ts` | SQLite 仓库、共享适配器、显式快照校验、份量/来源/区间和独立照片生命周期 |
| `infrastructure/food/sqliteFoodStore.ts`、`simple/store.ts`、`simple/Export.ts` | v7 增量迁移、包装确认来源、个人资料导出新数据；食品分享继续隔离个人数据 |
| `services/ai/*`、原生 `HukangAiModule` / `UploadImageProcessor` | 统一餐食与包装协议、严格响应校验、字节上限、离线图像处理与文件清理 |

## 自动验证

- TypeScript 检查、**124 项 Node 测试**通过，包含真实 SQLite、v6 → v7 迁移失败回滚、幂等与事务、历史快照、未知/0/区间、单位换算、照片清理及本地 HTTPS 模拟服务。
- 最新检查 [41299814392](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41299814392)，测试源码 `3940c6daa284951511d1c8074c044aa5d58c2114`；包含图片取消、迟到结果清理、错误反馈，以及 Expo 异步照片复制成功/失败回归。
- 原生 `:hukang-barcode:testReleaseUnitTest` 通过，包含原条码测试及新增饮食照片路径、非法 ZIP 路径回归。[任务日志摘录](evidence/nutrition-loop/android/native-unit-tests.txt)。
- **29 项 Python 测试**通过（包含现代照片选择器的隔离匹配）；图片资产、UI 格式和差异检查通过。浏览器回归为 **34 项旧 UI + 25 项营养 UI + 7 组 AI/包装交互**，最后一组共 10 次受控模拟模型请求。
- [浏览器截图与报告](evidence/nutrition-loop/browser/README.md)使用共享 React Native 页面、隔离内存存储及模拟服务。它们不代表 Android 图片解码、真实 SQLite 或真实服务商验证。
- 最终 0.5.2 的 Android 离线验收 [41300861910](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41300861910)通过：14 条完整业务流程、同 APK 重装保留全部表，以及隔离模拟器中的 v6 → v7 迁移保留旧表。IPv4/IPv6 出站均阻断；原模型实际执行 OCR，旋转裁剪后重跑、五项人工核对、库存与三类 ZIP 导出均完成。[原始报告](evidence/nutrition-loop/android/offline/session.json)，验收与 APK 源码均为 `3940c6daa284951511d1c8074c044aa5d58c2114`。
- 最终 0.5.2 原生验收 [41300861910](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41300861910)：六组全部通过。UI 八项覆盖三页与四项导航、展开日期、大字体、安全区、键盘、两条相机入口、原生网络错误，以及真实饮食/目标的保存、编辑、重启和删除。[真实 Android 截图与完整边界](evidence/nutrition-loop/android/README.md)。

## 图片的实际原生验收

全部使用最终 APK、隔离 Android API 35 模拟器和本机真实图片处理，没有调用 AI：

| 输入 | 实际结果 | 证据 |
| --- | --- | --- |
| 18,621,507 字节 JPEG，4000×3000，EXIF 方向 6 | 输出 1500×2000、1,774,859 字节；EXIF 移除；原图哈希不变 | [大图原始报告](evidence/nutrition-loop/android/image-large/session.json) |
| 透明 PNG | 转成 1200×800 白底 JPEG，9,835 字节；显式清除后临时副本消失 | [透明图报告](evidence/nutrition-loop/android/image-transparent/session.json) |
| GIF | 明确提示格式无法处理，没有发送请求；失败缓存清理；取消选图可恢复 | [GIF 报告](evidence/nutrition-loop/android/image-gif/session.json) |
| 50,000,001 字节 JPEG | 解码前拒绝超过本机原图限制，保留原图并清理失败缓存 | [过大原图报告](evidence/nutrition-loop/android/image-oversize/session.json) |

大图还通过了真实饮食照片保存、独立持久副本哈希、无食品库商品时的个人 ZIP 导出、相对路径与清单哈希、重启后删除记录仅清理自己照片的检查。[真实 Android 导出面板](evidence/nutrition-loop/android/image-large/android-isolated-diet-export-share-sheet.png)只打开验证，没有发送给联系人。

## APK 下载与身份

0.5.2 包含原生实测发现的照片异步复制与饮食照片 ZIP 路径修复，并统一原生版本与构建附件命名。旧包及版本校验失败的构建均不作为交付包。

- [下载完整构建附件（含 APK）](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41299810218/artifacts/13080948427)，需要有权限的 GitHub 账号；附件保留至 2026-11-15，解压后使用 `hukang-0.5.2-arm64.apk`。
- [构建与检查](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41299810218)：成功；源码 `3940c6daa284951511d1c8074c044aa5d58c2114`。
- 版本 **0.5.2 / versionCode 13**；包名 **com.hukang.china**；ARM64；最低 Android 8.0 / API 26。
- APK 大小 **61,017,705 字节**；SHA-256：`90c0a148842a76861b65941401d5a9e3dc2a40b6e9fd2e7b95b8270c851f15ca`。
- 签名证书 SHA-256：`22e093da8f0f0fdc4786febbbf897c60b75a5b8fa265e687461bf1d9703fa7b4`。CI `apksigner` 验证通过（v2）；本机另从完整 APK 重新计算文件哈希、提取证书并交叉核对。
- [包检查](evidence/nutrition-loop/android/apk-inspection.json)、[本机复核](evidence/nutrition-loop/android/local-verification.json)、[签名比较](evidence/nutrition-loop/android/signing-comparison.json)。本机下载了完整 APK 字节，没有声称下载/校验包含其他构建材料的整个大 ZIP。

## 安装前必须核对签名

本仓库当前没有配置持续使用的发布签名，历史临时签名的私钥不可获得。新包仍使用测试签名，实际证书与已归档的 6 个旧包（包括 0.4.0 和 0.4.1）均不同，且没有签名轮换证明，因此不能覆盖这些旧版安装。未读取用户手机当前安装证书；保留数据升级处于阻塞状态，需要原签名私钥重新签包。

不要卸载原 App、清除数据或修改包名绕过冲突。个人导出可以保留一份资料副本，但目前没有 App 内导入恢复，不能把导出当成可以放心卸载的依据。

安装仅适用于尚未安装护康的测试设备，或已核对签名兼容的设备：下载并解压构建附件，核对 APK SHA-256，在系统文件管理器打开 APK，按需允许该文件管理器安装未知应用。命令行可使用 `adb install -r hukang-0.5.2-arm64.apk`；出现签名冲突或版本不兼容时停止，保留现有 App 和数据。

## 手机手动验收清单

1. 在保留旧数据的前提下核对签名与版本；进入今天、记录、营养详情、食品库、我的，检查真实空数据或原有记录，没有演示记录。
2. 系统大字体、显示缩放、手势导航和三键导航下滚动；打开键盘输入，检查返回按钮、确认按钮、玻璃 Dock 和系统安全区。
3. 手动记录一餐：输入营养基准、名称、日期、餐次和半份；确认前不应写入，快速重复点击不能重复保存。退出重开，检查三个页面同步；编辑份量/日期/餐次/营养，再取消删除、确认删除。
4. 使用每 100g、每 100mL 和每份食品分别记录；无密度数据时不要接受 g/mL 猜测换算。检查 kJ 换算、未知与已知 0、AI 区间、糖与添加糖、目标未设置的显示。
5. 在 App 内临时填写自己的 API 配置，确认显示的实际地址、模型和发送内容后测试；不要通过聊天或截图分享密钥。文字成功后再主动测试餐食图片与包装正面。检查取消、错误反馈、清除配置及切换模型。
6. 两个拍一拍入口分别拒绝/允许相机权限，拍照、返回、相册重选；使用大 JPEG、带旋转信息照片、透明 PNG，以及手机支持的 HEIC/WebP。预览处理结果，取消/清除后不应留下当前临时副本；原图仍可打开。
7. AI 餐食结果须标明估算与不确定性，人工确认后才保存。包装候选必须人工核对，不应自动生成条码/营养或把同名食品当作同款。
8. 断网检查真实条码扫描、离线 OCR、旋转/裁剪、五项人工营养核对、食品保存与修改、库存增减及导出。修改或删除食品库内容后，历史饮食快照和独立照片保持可用。
9. 保存个人参考目标后重开 App；检查目标仍在，未设置的项目不出现通用 2000 kcal。导出个人资料含饮食与目标，食品资料分享不含个人饮食、库存或密钥。

## 未完成的实测与功能边界

没有真实服务商测试密钥，本轮不索取或展示密钥。真实服务商的文字/图像识别效果、模型权限、费用和地域网络仍需用户在 App 内主动实测。云端 Android 模拟器不能替代实体手机镜头、厂商系统、低内存机型和全部图片格式测试。原生解码进行中的按钮取消与极端内存压力仍需手机复核；已覆盖桥接取消/迟到结果与系统选图取消，不能将这些当作所有原生解码取消场景均已实测。

自动抠图、云端同步、社交、长期趋势、饮水记录与导入恢复未扩展。已有本地饮食数据可导出，但不承诺跨签名升级。真实 Android 截图、浏览器模拟服务截图和隔离测试中手动录入的记录分别标注，不给用户数据库填演示记录。
