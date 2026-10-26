# Hukang UI V1 设计与实现说明

本文记录 `codex/ui-v1` 的 React Native UI 实现。沿用已有 Expo Router、React Native、TypeScript 工程；没有创建 Flutter 工程，没有改写数据库、领域模型、条码解码或 PaddleOCR 引擎。这里说明代码现状和设计边界，不代表 Android 真机验收结果。

## 1. 视觉基础

设计目标是轻盈、可信赖、适合持续使用的中文食品管理界面。页面使用柔白底色、白色卡片、克制的绿色主操作和暖色提示，保留原始 `assets/icon.png` 品牌资产。没有生成新 Logo、添加渐变、下载字体或引入图标网络服务。

统一定义位于 [`src/ui/tokens.ts`](../src/ui/tokens.ts)，导出 `colors` 和 `tokens`。

| Token | 实际值 | 用途 |
| --- | --- | --- |
| `background` | `#F7F8F5` | 页面底色 |
| `surface` | `#FFFFFF` | 卡片、输入表面 |
| `brand` / `brandPressed` | `#286B52` / `#1C513E` | 主操作及按压状态 |
| `brandSoft` | `#E8F0E9` | 轻量品牌背景 |
| `ink` / `muted` | `#20332A` / `#617068` | 正文、次要说明 |
| `line` | `#DFE6DD` | 分隔线和边框 |
| `warm` / `warmAccent` / `warmSoft` | `#965D2F` / `#B87945` / `#F8EDE0` | 暖色文字、强调色、提示背景 |
| `danger` / `dangerSoft` | `#A73F38` / `#FFF0ED` | 错误和删除提示 |
| `neutralSoft` | `#EFF2EC` | 中性状态背景 |

`warm` 用于需要清晰阅读的暖色文字；`warmAccent` 保留为较浅的装饰强调色。状态始终配有文字，不能只通过颜色表达确认、错误或演示状态。

- 间距：`4 / 8 / 12 / 16 / 20 / 24 / 32`，对应 `xs` 至 `xxxl`。
- 圆角：`12 / 18 / 24`，状态胶囊使用 `999`。
- 字号／行高：展示 `32/42`、页标题 `28/38`、区标题 `20/29`、副标题 `17/26`、正文 `16/25`、辅助说明 `13/21`、标签 `14/22`。
- 控件最小触控尺寸 `48`，输入框最小高度 `52`，内容最大宽度 `680`。
- 使用系统字体，不指定外部字体；保持 React Native 文本默认字体缩放行为。

页面局部样式仍可定义必要的相机框、表格行或图像布局，公共色彩和基础控件优先使用 tokens。此轮没有为统一样式去格式化或重写整个仓库。

## 2. 可复用组件

[`src/ui/components.tsx`](../src/ui/components.tsx) 提供以下组件。`tone` 类型为 `brand | neutral | warning | danger`。

| 组件 | Props | 作用 |
| --- | --- | --- |
| `PageIntro` | `title`, `eyebrow?`, `description?`, `trailing?` | 页面标题、说明和可选侧边内容 |
| `SectionHeading` | `title`, `description?`, `action?` | 区块标题与操作 |
| `StatusPill` | `label`, `tone?` | 明确可读的状态，默认 `neutral` |
| `EmptyState` | `title`, `description`, `action?` | 无记录、搜索无结果等空状态 |
| `StatTile` | `label`, `value`, `unit?`, `tone?` | 统计数字，默认 `brand` |
| `Surface` | `children`, `style?` | 统一卡片容器 |
| `Divider` | 无 | 卡片内分隔线 |

`title`、`label`、`description` 为字符串；`trailing`、`action`、`children` 为 `ReactNode`；`StatTile.value` 接收字符串或数字，未知值可明确显示 `—`。

[`src/features/simple/ui.tsx`](../src/features/simple/ui.tsx) 保留既有 `C`、`S`、`Button`、`Field`、`Choices`、`Check` 导出和旧调用方式，减少页面改造对已有流程的影响。

- `C` 将原有 `bg / teal / pale / red` 等名称映射到新色板；既有 `S` 样式键保留。
- `Button` 提供主／次样式、按压与禁用状态。
- `Field` 保留 `numeric` 等旧参数，增加可选 `hint`、`error`、`secureTextEntry`、`editable`、`keyboardType`、`autoCapitalize`；显示焦点边框、错误文案和禁用状态。
- `Choices` 提供可换行的选择项和选中状态，可通过 `accessibilityPrefix` 区分营养单位等重复标签。
- `Check` 使用明确的复选框角色和 checked 状态。

## 3. 页面与导航

入口为 [`SimpleApp.tsx`](../src/features/simple/SimpleApp.tsx)。`SimpleApp` 仍调用原有 `useSimpleApp()`，`SimpleAppView` 接收这个 controller 并负责界面渲染。底部导航为「今日」「记录」「食品库」「我的」；「食品库」内部区分商品资料和库存，原有 `stock` tab 映射为食品库导航选中态。

| 页面 | 实现文件 | 实际交互与边界 |
| --- | --- | --- |
| 今日 | `src/features/simple/HomeScreens.tsx` | 拍一拍、恢复已有草稿、最近食品及本机食品／库存摘要；未接入真实饮食记录时营养摄入显示未知，不把库存当摄入 |
| 扫码 | `src/features/simple/ScanScreen.tsx` | 复用原生预览、补光、重新扫描、图片解码和手动输入；增加取景说明、权限提示及系统设置入口 |
| 包装／营养表／核对 | `src/features/simple/CaptureScreens.tsx` | 三步说明、持续显示商品上下文、现有拍照／相册／调整图像／OCR、逐字段人工核对、原文折叠展示和保存草稿 |
| 商品详情／加入库存 | `src/features/simple/ProductScreens.tsx` | 本地图片、名称、条码、实际营养列和确认状态；编辑、数量调节、加入库存及原有删除确认 |
| 食品库／库存 | `src/features/simple/HomeScreens.tsx` | 名称／品牌搜索、确认状态筛选、资料与库存切换；库存单位分别统计，不合并为饮食总量 |
| 每日记录 | `src/features/ui-v1/DiaryScreen.tsx` | 日期、四个餐次、营养汇总和演示编辑；真实饮食持久化尚未连接 |
| 我的 | `src/features/simple/HomeScreens.tsx` | 本机访客、现有导出操作、AI 设置和关于入口 |
| 用户／关于 | `src/features/ui-v1/SupportScreens.tsx` | 本机资料边界、原版图标、应用版本及功能状态说明 |
| AI 设置 | `src/features/ui-v1/AiSettingsScreen.tsx` | 服务商、HTTPS Base URL、临时 Key、模型名称、本地格式校验；无真实网络连接 |

扫码未命中、商品打开、草稿建立与保存仍由已有 controller 处理。新增页面没有建立第二套路由或食品数据库。页面切换滚动回顶部；原有 `back` 逻辑、草稿保留、`task` 忙碌保护和异步 generation 防护继续保留。界面返回按钮回到当前主导航所在页面，不构建额外嵌套历史栈。

## 4. 与已有业务的复用边界

[`useSimpleApp.ts`](../src/features/simple/useSimpleApp.ts) 本轮仅扩充 `Tab`、`Screen` 类型，增加记录、AI 设置、用户与关于的界面状态。照片操作、OCR 调用、数据校验、确认保存、导出和库存事务继续使用原有实现。

- 未更改 `src/domain`、`src/application`、`src/infrastructure`、原生 `modules`、食品存储与数据库 schema。
- 未更改模型文件、模型选择、OCR 预处理和识别方式、条码规范化或原生解码逻辑。
- 复用 `NutritionImageEditor`，营养核对仍分别修改 amount、unit、NRV%、计量基准及每份说明；`draft.nutrition.ocr.rawText` 仅展示，不被人工确认值覆盖。
- 商品营养摘要显示已存数值及原单位，不猜测缺失值，也不把能量单位静默换算。
- 拍摄页、扫码页继续调用 controller 原有处理函数。扫码组件仅在扫码页渲染，原生预览 `active` 继续依赖前台、无忙碌任务和当前扫码状态。
- 导出继续由用户主动操作；AI 临时配置和饮食演示不加入食品或库存导出。

## 5. 每日记录：显式选择的界面演示

UI V1 没有真实饮食记录数据库，也没有以购买或库存变化推断进食。

初始进入「记录」时显示「饮食存储尚未接入」。只有用户点击「体验记录演示」后，才加入标记为 `source: "ui_demo"` 的示例早餐，并允许添加、修改和删除演示餐食。演示期间持续显示「演示模式 · 非真实饮食」，按钮和记录也带有演示说明。

这些条目只保留在 `DiaryScreen` 的 React 页面状态，不调用食品库或库存存储接口。结束演示会清除条目；切换主导航或进入 AI 页面导致记录页卸载时，演示状态也会清除。没有演示记录自动恢复能力。

[`contracts.ts`](../src/features/ui-v1/contracts.ts) 中 `DiaryRepository` 只有预留接口，没有数据库 adapter。日期按本地日历初始化，日期输入校验真实日历日期。数值允许留空，未知保存为 `null`；只有当天所有记录的某一营养项都已知时才显示该项合计，否则显示 `—`，不把部分已知数据伪装成完整摄入。

## 6. AI：临时配置与未接入接口

AI 设置页展示自定义、DeepSeek、通义千问选项。这些是配置预览选项，不代表已接入、已开通或已经支付服务。

- 所有配置只存于当前页面 React 状态；API Key 使用遮挡输入。
- 页面卸载后不保留配置；App 进入非 active 状态时主动清除临时 Key。这里是状态清理，不声称对 JavaScript 内存执行安全擦除。
- 不写 SQLite、AsyncStorage、安全存储、日志、导出文件或构建配置。
- 「检查连接配置」只执行本地格式校验：HTTPS URL、无 URL 凭据／查询参数／片段、有效临时 Key、模型名称。通过后仍明确显示「尚未接入，未执行联网测试」。
- `AiAnalysisGateway` 为接口边界；当前唯一 `UnavailableAiGateway` 返回 `unavailable`，分析调用明确失败，不产生虚构分析。
- 没有真实请求客户端，没有发送照片、OCR 原文、营养数据或 Key，也没有增加运行时网络依赖。

未来真实接入需要另行确定授权、网络与密钥处理方式；不能直接把本页临时配置当作已经完成的生产 AI 集成。本轮不改变已有 Release 网络权限约束。

## 7. 无障碍与小屏布局

- 页面和区块标题使用 header 角色；按钮、主导航、单选项、复选框明确标注角色及 selected／checked／disabled 状态。
- 输入框提供可读标签，公共组件可提供错误／提示说明；动态错误和状态使用 live region。全局忙碌期间保留任务遮罩并将底层内容从无障碍浏览隐藏，防止误操作。
- 公共按钮与选择项以至少 `48` 的触控高度为基础，输入使用最小高度而非固定单行文字高度。
- 主内容为可滚动布局，采用最大宽度、可换行标题／操作／筛选标签、弹性卡片及无强制单行截断的文字。营养核对行可调整布局，长文案保留滚动空间。
- 未关闭系统字体缩放；输入焦点、按压、禁用及错误具有可见反馈。辅助说明不依靠颜色或无意义图标表达。
- 外层使用 SafeAreaView；表单保留键盘避让、点击处理与拖动收起键盘支持。Android 原生键盘、手势导航和字体缩放的最终行为仍需设备检查。

测试预览覆盖小屏与放大字体布局，但 React Native Web 的 CSS 字体放大不能等同于 Android 系统字体缩放。不能以浏览器截图代替 TalkBack、实际相机、软键盘或 OPPO 真机验收。

## 8. 已知界面限制与验证边界

1. 食品库和最近食品缩略图使用 controller 的 `stockCovers`。现有 `refresh()` 仅为当前库存商品加载该映射，因此从未加入库存或已没有库存的食品，即便有包装照片，列表也可能显示名称首字占位。商品详情仍通过既有 `cover` 加载图片。本轮保留此边界，没有为了列表缩略图改动存储或读取流程。
2. 首页营养摄入没有真实数据源，显示未知及未接入提示；每日记录为主动启用的短期界面演示。它们不构成饮食管理持久化功能。
3. AI 只有界面、格式校验和接口抽象。没有联网连接测试、可复用的 Key 存储或真实分析结果。
4. 食品资料和库存使用原有业务能力；本轮没有实现账号、云同步、食品库批量导入、营养评分或医疗建议。

[`scripts/ui-preview.mjs`](../scripts/ui-preview.mjs)、[`tests/ui-preview`](../tests/ui-preview)、[`tests/ui-v1-browser.mjs`](../tests/ui-v1-browser.mjs) 为独立的开发预览与浏览器测试。它们复用实际 `SimpleAppView`，同时显式替换 controller、原生模块和示例数据；预览状态与截图均不能证明真实条码、OCR 或 SQLite 执行成功。模拟数据不接入生产入口。

相关检查入口为 `npm run typecheck`、`npm test`、`npm run format:ui:check`、`npm run ui:test` 和现有资源／APK 审计脚本。具体执行结果、截图、构建产物和设备状态由本轮交付报告记录；本文不将测试脚本存在或界面可点击写成原生实测通过。
