# Hukang China

当前 `codex/nutrition-ui-v2` 开发版为 **0.5.8 / versionCode 19 · 暖杏餐桌**。首页左侧生活配图、右侧能量与四项营养，统一配色、连续曲率近似卡片和轻柔切页；保留各页滚动位置。AI 估算按中值显示“约”并保留原范围；未设目标隐藏目标文字和进度条，摄入数值保留；严格超过目标上限才满条变红。包名及 SQLite schema 8 不变。

保留个人资料自动保存、体检多图、目标草案独立确认、持久授权、营养表 API、餐食确认、食品库、独立库存和导出。当前 APK、同包 Android 验收、截图和安装边界见 [0.5.8 交付说明](docs/evidence/ui-058/README.md)；历史基线见 [0.5.7 交付](docs/evidence/ui-057/README.md)与 [0.5.6 交付](docs/evidence/ui-056/README.md)。当前仍为临时签名测试包；用户已确认本轮测试数据无需保留，可在签名不兼容时卸载旧测试版后全新安装，这不属于保留数据的覆盖升级。固定签名暂不配置，PR 保持草稿。

餐食照片和选填描述、营养表照片使用用户主动配置的 API，人工确认后保存到本机 SQLite；扫码查询已存食品、编辑资料、库存和导出可离线使用。未完成 AI 设置可以保存设置草稿、稍后继续。未知不当零，餐食 AI 结果保留估算属性。BiRefNet B 列实际检查点尚待核实，当前保存原图与封面任务，不执行或宣称自动抠图。

Hukang China 是面向中国大陆用户的本地优先 Android 食品记录应用。包装食品从扫码进入，命中本机食品库后可食用或入库；未命中时进入营养表拍摄/相册、API 读取与人工核对流程，也可直接识别营养表而不填条码。失败可重拍或重试，不自动切回本地 OCR。保存食品、确认食用与加入库存分别处理。

当前产品入口是 `src/app/index.tsx` → `src/features/simple/SimpleApp.tsx`，包含「今日 / 记录 / 食品库 / 我的」四个入口，库存位于食品库内。食品资料和库存分开保存，同一条码不会重复建立商品；库存按购买批次记录数量、单位和可选到期日。

UI V1 是独立分支 `codex/ui-v1` 上的历史基线，基于现有 React Native + Expo + TypeScript。设计规范见 [UI V1 Design](docs/UIV1Design.md)，历史检查、截图和安装包见 [UI V1 验收记录](docs/UIV1Acceptance.md)。

历史 UI V1 测试包为 **0.4.0 / versionCode 9**：[下载完整构建 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/40323157930/artifacts/12651485154)（解压获取完整 APK，约 60.84 MB；保留至 2026-11-09）。构建与检查通过，尚未进行本轮 Android 安装执行。测试证书与归档 0.3.3 不同，不能覆盖该旧签名包，有本地数据时请保留原安装。

营养演示只在独立开发预览中运行，正式页面没有记录时为空。AI 设置发送最小文字请求并验证模型响应，餐食调用同一份配置；本轮自动化用模拟服务验证，没有真实服务商密钥，不声称真实模型效果已经验收。

以下 0.3.3 是历史基线，设备结果不能直接作为 UI V1 的验收；历史构建身份和证据见 [简易版验收记录](docs/SimpleAppAcceptance.md)。

历史基线测试包为 **0.3.3 / versionCode 8**（ARM64，Android 8.0 及以上）。[下载完整构建 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38703696958/artifacts/11958565529)，解压获得 `hukang-0.3.3-arm64.apk`；这是保留 14 天的 Actions 产物，不是正式 Release。

已在断网 Android 模拟器完成图片条码解码、真实包装照片 OCR、人工修正、食品保存、重启、同商品两次入库及三个导出包检查。OPPO 实时镜头与历史安装升级仍未验证。当前临时签名不能保证覆盖已有 App；有本地数据时不要卸载。

## 本地能力

- CameraX 实时预览 + ZXing 本地解码，支持 EAN-13、EAN-8、UPC-A、UPC-E。
- 相册条码识别作为辅助入口；营养表流程不再包含手动条码表单。
- 既有 PP-OCRv5 模块、固定资源与历史 OCR 证据保留；0.5.6 营养表入口使用 API，不调用该离线识别模块。
- 拍照和相册营养表共用本地压缩，实际上传图片小于 4 MB；保留原计量基准、单位与未识别空值，结果可修改、重新拍摄后重试。原图、API 响应、人工修订分开保留。
- SQLite `user_version=8`，在 v7 上增量加入个人资料/目标草案、可复用餐食资料、封面任务及餐食库存；保留原有食品、证据、草稿、库存和独立饮食快照，不重置数据库。
- 「我的」可导出食品资料包或个人数据 ZIP；食品资料包默认不含照片和私人库存。文件只在本机生成，通过系统分享选择接收方，不自动上传；尚无 App 内一键恢复。

Release APK 声明 `INTERNET`，不声明 `ACCESS_NETWORK_STATE`；只有用户主动测试或调用 AI 才发送确认范围内的数据。首次发送说明服务地址、资料与可能费用，配置或范围变化需重新确认，验证成功的连接通过 Android Keystore 加密原子保存，密钥不进入普通数据库/日志/导出；删除会停用旧请求，重启恢复不自动测试。本地扫码不依赖 Google ML Kit、Google Play Services、Open Food Facts 或 Wikidata；营养表 API 仅使用用户当前验证过的连接。仓库归档测试图片保留来源与许可声明，不作为生产食品库或联网查询来源。

## 开发与验证

```sh
npm ci
npm run typecheck
npm test
npm run format:ui:check
npm run ui:test # 需要已安装 Chromium；共享 UI 的模拟 controller 测试
npm run verify:assets
cd android
./gradlew :app:assembleRelease
```

模型来源、版本、许可证和 SHA-256 见 [OcrModelManifest](docs/OcrModelManifest.md)。本机真机相机、OPPO Find X7 Ultra、跨版本签名升级和低照度/反光包装识别必须以实际设备证据为准；模拟器相册测试不能替代物理相机验收。

## 视觉资产

`assets/icon.png` 继承自只读参考仓库 `Hukang-codex/assets/icon.png`，未重绘。SHA-256：

```text
d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2
```

## 文档

- [0.5.8 暖杏餐桌与 Android 验收](docs/evidence/ui-058/README.md)
- [0.5.7 资料、目标与餐食确认](docs/evidence/ui-057/README.md)
- [0.5.6 直接录入、区间进度与 API 营养表](docs/evidence/ui-056/README.md)
- [11 月 3 日原生改版与验收](docs/Redesign1103.md)
- [0.5.3 界面精简、营养进度与交付](docs/UISimplification053.md)
- [真实饮食闭环与数据模型](docs/NutritionLoopV2.md)
- [简易版使用说明](docs/SimpleApp.md)
- [Architecture and phase boundaries](docs/Architecture.md)
- [Mainland dependency audit](docs/MainlandDependencyAudit.md)
- [数据库迁移](docs/DatabaseMigrations.md)
- [Android 签名与升级策略](docs/AndroidSigningAndUpgradePolicy.md)
- [OCR 模型清单](docs/OcrModelManifest.md)

`Hukang-codex` 和 `Hukang-deepseek` 是只读参考仓库。本项目的实验技术分支 `codex/mainland-v2` 保留，不在本次产品整合中删除。
