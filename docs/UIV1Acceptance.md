# Hukang UI V1 验收记录

日期：2026-10-26。用户已确认在现有 **React Native + Expo + TypeScript** 工程实现 UI V1，不创建 Flutter 项目。

本轮只扩展 UI、导航和界面接口。每日饮食存储及真实 AI 服务尚未接入；现有食品建档、人工核对、库存和导出继续调用原有业务实现。页面存在不等于已在 Android 真机完成业务验收。

## 版本与范围

- 开发分支：`codex/ui-v1`。未合并 `main`。
- 起点：`c81bc2b4ad4288e9825e39645c24b8bb7ab469e4`。
- 设计系统提交：`a31d718`。
- UI 与测试源提交：`095bb67903b30f4acb4706d686601701dd669416`。
- 目标安装包：0.4.0 / versionCode 9，`com.hukang.china`，minSdk 26，ARM64。
- 两个旧仓库只读；`codex/mainland-v2` 未改动。
- 数据库仍为 schema 6。`src/domain`、`src/application`、`src/infrastructure`、`modules`、原图标和模型未修改；`useSimpleApp.ts` 只扩充 Tab/Screen 类型。

本轮保护范围和两个旧仓库只读状态见 [scope-audit.json](evidence/ui-v1/scope-audit.json)。

图标 `assets/icon.png` 实际 SHA-256：`d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2`，与原始资源一致。

## 已实现

| 页面/模块 | UI V1 行为 | 接口边界 |
| --- | --- | --- |
| 今日 | 品牌页头、拍一拍、营养摘要、最近食品、新用户引导 | 食品与库存是真实本地接口；饮食摘要显示未知，不编造摄入数据 |
| 扫码 | 取景提示、补光、权限说明、未识别/失败状态、手动入口 | 复用既有 CameraX/ZXing 与控制器 |
| 商品建档 | 包装→营养照片→人工核对，持续显示商品/条码/步骤 | 原图片导入、拍摄、旋转、裁剪、OCR、保存回调不变 |
| 核对 | 单位/基准/NRV 表单、照片对照、原始 OCR 展示 | 仍由原领域校验与保存逻辑决定可保存性 |
| 商品详情 | 本地图片、名称条码、原单位营养摘要、完整表、库存入口 | 不自动把 kJ 改成 kcal，不推算未知值 |
| 食品库 | 资料/库存分开、名称品牌搜索、确认状态筛选、空结果 | 使用现有食品和库存数据；不改变表结构 |
| 每日记录 | 日期导航、四餐、营养汇总、增删改交互、AI 入口 | 默认未接入；用户主动开启演示后仅在当前页面内存操作，离页丢弃 |
| 我的 | 本机用户、统计、既有导出、AI 设置、关于 | 真实导出仍调用原接口；本机昵称展示不持久化、不构建账号 |
| AI 设置 | 服务商、HTTPS Base URL、遮蔽 Key、模型、本地检查结果 | 不连接供应商、不存密钥、不伪造分析；离页/退后台清除临时密钥 |
| 公共设计 | 柔白/绿色/暖色数据、tokens、卡片/标题/空状态/状态标记、四项底部导航 | 原生组件与系统字体，无远程字体或图标依赖 |

设计规范及公共 API 见 [UIV1Design.md](UIV1Design.md)。

## 实际检查结果

| 检查 | 结果与边界 |
| --- | --- |
| TypeScript `npm run typecheck` | 通过 |
| 现有 + 新增 Node 测试 `npm test` | 79/79 通过（原 75 项 + 4 项 UI 状态/接口测试） |
| Python 测试 `python3 -B -m unittest discover -s tests -p 'test_*.py'` | 26/26 通过 |
| Prettier `npm run format:ui:check` | 通过，限定 UI 与预览工具范围，不格式化整个仓库 |
| `_layout.tsx` 与新增状态测试额外 Prettier check | 通过 |
| `git diff --check` | 通过 |
| `npm run ui:test` | 34 项通过、23 张实际浏览器截图、0 页面错误、0 外部请求 |
| Flutter format / analyze / test | 不适用：仓库没有 Flutter 工程；已按用户确认改用 RN 工具链，未声称运行 Flutter 命令 |

浏览器使用生产共享 `SimpleAppView` 与真实页面组件，但原生 controller/相机/SQLite 替换为**明确标注的测试模拟实现**。验证了导航、日期切换、演示记录增改删、清空、AI 本地配置校验/遮蔽/离页清空、食品筛选，以及采集/核对/入库页面的回调。不能用它证明实际条码解码、OCR、SQLite 保存或系统分享。

390px 的 18 个状态、320px 的 11 个页面在当前可见区域无横向溢出。产品详情另有文字放大近似检查；它不是 Android 系统字体缩放，也不是整页所有滚动位置的无障碍审计。Android 键盘、TalkBack、安全区和物理设备字体仍需设备检查。

截图、来源说明与完整报告：[浏览器证据](evidence/ui-v1/browser/README.md)。

## Android 构建

实际成功运行：[Actions 40323157930](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/40323157930)，源码 `095bb67903b30f4acb4706d686601701dd669416`，分支 `codex/ui-v1`。Gradle ARM64 `assembleRelease` 成功，原生 ZXing 合成条码 JVM 单测、运行期依赖审计、APK 检查全部通过。原生编译约 11 分 47 秒。后续提交只归档文档/证据，不改变本次已构建源码。

[下载完整构建 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/40323157930/artifacts/12651485154)，解压可得完整 `hukang-0.4.0-arm64.apk`；不是需要拼接的分片，也不是公开正式 Release。Actions artifact 保留至 **2026-11-09**，可能需要登录 GitHub。ZIP 包含源码和证据，约 99.90 MB；其中 APK 为 **60,841,504 bytes / 60.84 MB / 58.02 MiB**。

| 身份 | 实际值 |
| --- | --- |
| applicationId | `com.hukang.china` |
| versionName / versionCode | `0.4.0` / `9` |
| ABI / minSdk | `arm64-v8a` / `26` |
| APK SHA-256 | `ee8b0b9a20596c9040c4ecec3cb589d1397ba8fbde6c41f0bd7955c144804d8a` |
| 签名证书 SHA-256 | `4a168283c32a524592c95e16bd6907c31c986c0605941760a71689db8ca317f5` |
| 签名模式 | `ephemeral-test`，非稳定发行签名 |
| APK 检查错误 | `[]` |

Actions 对实际 APK 的检查确认：JS bundle、固定 PP-OCRv5 detector/recognizer、配置和字典随包提供；模型 SHA-256 与原清单一致；无 `INTERNET`、`ACCESS_NETWORK_STATE`、`RECORD_AUDIO` 权限；保留相机权限，旧 Android 图片访问权限带 maxSdkVersion 32；依赖审计未发现 ML Kit、Firebase、GMS。原始证据见 [apk-inspection.json](evidence/ui-v1/build/apk-inspection.json)、[Manifest](evidence/ui-v1/build/final-manifest.txt)、[官方模型获取记录](evidence/ui-v1/build/official-model-acquisition.json) 和 [依赖树](evidence/ui-v1/build/runtime-dependencies.txt)。本机核对了小型检查 artifact 的 SHA-256、源码提交和内容，未将 CI 检查说成本机设备运行。

**本轮没有实际安装执行 0.4.0 APK**；没有 Android 模拟器/物理手机的本轮运行证据。浏览器不执行原生相机、OCR 或 SQLite。最终无网络权限和源码审计是本轮实际结果，但不应称为新 APK 已完成断网设备全流程。

覆盖安装限制：归档 0.3.3 的证书为 `10801899cf694fa6ca5d75ace622d0ed7e682e2a150a4175832e21026c31593e`，与本包不同，虽然 applicationId 相同且 versionCode 递增，**本包不能覆盖该归档旧签名包**。这是一致的证书比较结论，不是已在用户手机尝试升级。请保留已有安装和数据；可在独立测试设备/测试环境新装验证 UI，不默认要求卸载。稳定升级仍需要原来匹配的安全签名或另行规划迁移，参见 [签名与升级策略](AndroidSigningAndUpgradePolicy.md)。


## 未接入与未验证

- 每日饮食真实持久化、食品份量换算和真实摄入统计；现有库存数量不当作食用数量。
- AI 网络请求、真实连接测试、密钥安全存储、每日分析。界面提供接口边界，没有自动调用付费服务。
- 账号/云同步与昵称持久化。
- 本轮 APK 的 OPPO Find X7 Ultra 物理相机、键盘遮挡、后台恢复、连续 OCR、系统分享与覆盖升级。历史 0.3.3 模拟器/Phase 1 主观速度不是 UI V1 验收证据。
- 食品库缩略图复用现有 `stockCovers`；没有当前库存的食品可能显示名称首字占位，详情仍走原有包装图读取。
- 当前页演示记录与 AI 配置离开即清除，界面已说明，不能作为真实保存功能使用。

## 修改文件分组

- `src/ui/{tokens,components}.tsx/ts`：设计 tokens 与通用组件；具体文件为 `tokens.ts`、`components.tsx`。
- `src/features/simple/{SimpleApp,HomeScreens,HomeScreenStyles,ScanScreen,CaptureScreens,ProductScreens,ui}.tsx/ts`：现有页面视觉与导航；`useSimpleApp.ts` 仅扩充类型，`src/app/_layout.tsx` 复用颜色。
- `src/features/ui-v1/{contracts,DiaryScreen,AiSettingsScreen,SupportScreens}.ts/tsx`：界面接口与尚未连接的功能页。
- `tests/ui-v1-state.test.mjs`、`tests/ui-preview/`、`tests/ui-v1-browser.mjs`、`scripts/ui-preview.mjs`：状态测试与隔离共享 UI 浏览器测试。
- `package.json` / lock：仅新增开发工具依赖，版本 0.4.0；`app.json` / `android/app/build.gradle` 只递增版本，包名/权限不变。
- `.github/workflows/simple-app-release.yml`：允许独立 UI 分支构建，按分支隔离并发，产物名称改为 0.4.0；签名策略未改变。
- 本文、设计文档、README/架构/依赖审计与截图：更新实际边界和验证证据。

完整文件差异可用 `git diff --name-only c81bc2b...codex/ui-v1` 核实。

## 建议设备验收

1. 先核对已有安装的签名与本包签名，保留原本地数据，不以卸载解决签名冲突。
2. 冷启动检查原 Logo、四项底部导航、首次使用空状态和系统大字体。
3. 拍一拍：拒绝/允许权限、进入后台返回、补光、扫描已有及未录入条码。
4. 未收录商品拍包装和营养表，旋转/裁剪、离线 OCR，修正单位和数值后保存；确认原文未改写。
5. 食品库查找、详情、库存增减、退出重启、既有导出；检查食品资料与库存未混合。
6. 每日记录默认显示未接入；主动体验演示后操作四餐，离页返回应清空，不影响食品库。
7. AI 设置输入非真实测试内容，检查错误提示、遮蔽、离页清空，不应产生服务请求。

本轮到 UI V1 为止，不扩展数据库、真实 AI、饮食业务或云服务。
