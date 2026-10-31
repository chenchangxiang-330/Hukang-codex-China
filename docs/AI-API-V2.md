# Hukang AI 设置与餐食估算 API（0.4.1 / 10）

本轮把 AI 设置与餐食估算接到同一个运行时服务。原来的奶白天空蓝界面、离线扫码 / OCR / 人工核对 / 食品库 / 库存 / 导出保留。饮食存储仍未接入：AI 结果只预览，正式首页和记录页保持真实空数据。

## 支持的协议与配置

支持 HTTPS、Bearer API Key、非流式 Chat Completions JSON。不是 Responses、Anthropic Messages 或任意厂商的原生协议，也不做接口探测或自动重试。

| 服务选择 | Base URL 示例 | 最终请求路径 | 本轮图片开放范围 |
| --- | --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` 或其 `/v1` 形式 | `/chat/completions` 或 `/v1/chat/completions` | 官方 `deepseek-flash` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1`；也接受官方地域 / Workspace 地址 | 保留 `/compatible-mode/v1` 后追加 `/chat/completions` | 官方 `qwen3-vl-plus` |
| 自定义兼容服务 | 用户自己的 HTTPS API 根地址或完整前缀 | 根地址默认 `/v1/chat/completions`；已有前缀保留；完整接口不再追加 | 暂只开放文字 |

禁止 HTTP、URL 内账号密码、查询参数和片段、重复 `/v1/v1`。官方服务选择只接受官方域名及路径，代理需选择自定义；千问的密钥地域须和服务地址一致。切换地址或服务商清除旧密钥；切换模型使测试结果和确认状态失效，下一次调用使用新配置。

连接测试先校验格式，确认发送内容和可能的费用，再发送一句“请只回复 OK”。只有成功 HTTP 状态、有效 assistant 内容、模型名和完整结束标记才显示成功，同时展示实际地址、请求 / 响应模型与时间。测试不是视觉能力证明，也不能保证下一次请求仍成功。

2026-10-31 核对的官方文档：

- [DeepSeek 接口介绍](https://api-docs.deepseek.com/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[视觉输入](https://api-docs.deepseek.com/guides/vision/)。对当前官方模型禁用思考，避免最小测试只得到推理中间内容。
- [千问兼容接口与地域地址](https://help.aliyun.com/en/model-studio/compatibility-of-openai-with-dashscope)、[Qwen-VL 协议](https://help.aliyun.com/en/model-studio/qwen-vl-compatible-with-openai)、[图像格式](https://help.aliyun.com/en/model-studio/vision)、[非流式与思考参数](https://help.aliyun.com/en/model-studio/qwen-api-via-openai-chat-completions)。`enable_thinking` 位于 HTTP JSON 顶层。

## 资料、密钥和网络边界

- 设置页与餐食页共享 `src/services/ai/runtime.ts` 的单例；两页不自行拼接 API 请求。协议、校验、错误归类和生命周期集中在 `src/services/ai/`。
- API Key 只在当前应用进程内存中暂存；不提供“记住密钥”。输入始终遮盖，返回设置页不重新显示；不写入 SQLite、普通存储、日志、导出或图片。清除配置会取消在途请求并使旧结果失效。换页可临时共用；进程结束需重新填写。
- 只有主动点击测试 / 估算才请求。第一次及配置改变后需确认目的地址、资料范围、可能费用。进入后台取消等待，不自动恢复请求。
- 文字估算只发送本次描述和营养结构提示，不上传历史、食品库或库存。选择照片本身不会上传；只有已核实视觉模型、单独勾选发送照片后才读入 JPEG / PNG（最大 4 MB）并按 `image_url` data URI 协议发送。其他模型提示只支持文字。没有自动抠图。
- Android 新增小型 `hukang-ai` Expo 模块，使用系统 HTTPS 证书校验、禁用跳转、固定长度 POST、响应大小上限、主动取消与超时；不重试收费请求，不把底层异常或供应商错误正文写入日志 / UI。
- `app.json`、源 Manifest、`withOfflineAndroid`、APK 检查和当前设备 CI 一致允许 INTERNET，同时禁止明文流量。仍禁用 OTA、Google 模型下载、联网 OCR 与无关权限。历史 Phase 3 的无网络二进制证据校验继续按旧合同执行，未改写历史验收。
- 连接 30 秒、餐食 60 秒超时；全局并发一项。取消、超时不等于服务商未处理或未计费；UI 明确提示，无自动重试。

## 结果与错误

餐食响应要求结构化 JSON；无效 / 截断 / 空响应不会成为成功结果。营养值保留单位、估算区间和不确定性，未提供的项目保持未知而非 0，糖和宏量营养不重复累计。实际份量可在页面换算预览；正式记录按钮显示“饮食存储未接入 · 仅预览”并禁用。开发演示适配器与生产 API 完全分开。

错误区分：网络或 TLS 失败、密钥 / 地域错误、余额配额不足、权限不足、限流、模型不存在、图片不支持 / 格式或大小不符、异常模型响应、服务端故障、跳转、超时、取消与配置失效。供应商原始错误内容不展示，避免泄漏密钥。

## 已执行验证与边界

- TypeScript、格式检查、离线资产检查通过。
- 108 项 Node 测试通过（含 22 项新增 API 测试）；28 项 Python 回归通过。覆盖 URL、共享配置、切换 / 清除、并发、取消、超时、错误分类、未知值、估算区间、图片显式选择与密钥脱敏。
- 临时本地 HTTPS 模拟服务完成真实 TLS 往返：最小文字测试、餐食 JSON、401 认证失败。测试 CA 仅交给子测试进程，生产证书校验未放宽。
- 三组浏览器测试通过：原 UI V1 34 项、营养 UI V2 25 项、新 API 联动 5 组 / 9 次受控请求。检查模型切换、份量、清除配置、失败和取消；320px 页面渲染。浏览器相机 / 本地数据是测试替身，API 回复由模拟服务提供。
- 浏览器证据：[连接设置](evidence/ai-api/browser/browser-settings-mock-success.png)、[餐食预览](evidence/ai-api/browser/browser-meal-mock-preview.png)、[报告](evidence/ai-api/browser/report.json)。这些不是 Android 截图，也不表示真实服务商验证成功。
- 本轮未使用真实 API Key；真实服务商文字 / 图片响应、计费和手机网络尚未实测。没有向用户索取或在聊天中展示密钥。
- Android 新模块已被 Expo 自动发现；新的实际 APK、签名对照和设备回归结果另见本轮交付记录，不能用浏览器结果代替。

## 手机手动验收

1. 保留已有 App 和本地资料。先核对安装包签名；不同签名不能覆盖，不要卸载。安装说明以本轮包交付记录为准。
2. “我的 → AI 服务设置”：填自己的 HTTPS 地址、密钥、模型；阅读发送说明后勾选，点击测试。确认实际接口与模型匹配、收到有效回复；无效密钥不能显示已连接。
3. 回“拍一拍 → 餐食估算”，仅填文字也能请求；检查“AI 估算”、未知营养与份量预览，没有已保存提示。修改模型再估算应使用新模型。
4. 支持的视觉模型：选餐食照片，不勾选时只发文字；勾选后才发送当前照片。不支持图片或图片过大时明确报错。
5. 测试请求期间取消、切到后台、切换配置、清除密钥；不能自动重试或继续使用旧结果。取消后服务商仍可能已计费。
6. 关闭网络后回归扫码、离线 OCR、人工核对、食品保存、库存、导出；AI 应报网络失败，其余功能继续可用。
