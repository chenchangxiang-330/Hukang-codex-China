# 护康 Hukang · 本地简易版

面向中国大陆食品包装的 Android App：**拍一拍 → 扫条码 → 拍包装 → 拍营养表 → 核对保存 → 加入库存**。

`main` 已整合 `codex/mainland-v2` 的国产 PaddleOCR、条码校验、营养表解析和 SQLite 技术。入口不再是 OCR Lab。界面采用浅色背景、青绿色按钮与「今日 / 库存 / 我的」底部导航，保留 Hukang 原版图标。

## 当前交付：0.3.0

| 项目 | 结果 |
| --- | --- |
| applicationId | `com.hukang.china` |
| versionName / versionCode | `0.3.0` / `5` |
| Android / ABI | Android 8.0 起（minSdk 26），`arm64-v8a` |
| APK 大小 | `60,760,380` bytes |
| APK 对应源码 | `eeebb89a550de261286123fda4ade45e3c3c4dff` |
| 设备测试代码 | `c0f60e2b078fa94ec9be0e0ba8e4ee1d097d1d6d` |
| Release | [构建 38540651611](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38540651611) 成功 |
| Android 设备流程 | [验收 38542266555](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38542266555) 成功；模拟器，不是 OPPO 真机 |
| 完整安装包 | [下载构建产物](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38540651611/artifacts/11882678038)，解压后安装 `hukang-0.3.0-arm64.apk` |

APK 文件 SHA-256（不是 artifact ZIP 哈希）：

```text
c3035a12840efe73cdac3d7b5b8fa7f824bd24a831143d9451b158c43e2fc566
```

**安装提醒：本包使用临时测试签名，不保证覆盖先前安装的实验版。已有数据时不要默认卸载旧 App。稳定签名配置和真实历史版本升级尚未完成。**

完整边界、签名指纹和实测结果见 [0.3.0 交付核对](docs/SimpleAppAcceptance.md)。后续仅文档和设备测试的提交不改变上述 APK 的运行代码。

## 怎么使用

### 第一次录入

1. 在「今日」点击「拍一拍」。应用内 CameraX 取景，ZXing 本地解码；也支持相册识别或手动输入作为辅助。
2. 条码已在本机食品库时，直接打开商品；未收录时进入包装采集。
3. 拍摄或导入商品包装正面，填写商品名；可从国产 OCR 的文字候选中选择并校对。
4. 继续拍摄或导入营养表，对照照片核对计量基准、数值、单位及 NRV%。不确定数值不自动猜测。
5. 确认保存食品，然后选择是否「加入我的库存」，填写本次购入数量、单位和可选到期日。

### 再次购买同款

再次扫描同一条码，直接找到已有食品，不重复 OCR、不重复建立商品资料。用户确认后增加一条购入库存。商品资料与每次购买分开保存；移除库存不删除食品档案。

「今日」展示本地食品和库存概况，不将买入或用掉的包装数量伪装成营养摄入，也不生成未经配置的个人营养目标。

## 数据只在本机

- 本版只查询本地食品库，不调用国内或国外商品 API。
- Release Manifest 不包含 `INTERNET` 或 `ACCESS_NETWORK_STATE`。
- 国产 PP-OCRv5 mobile 检测与识别模型随安装包提供，首次启动也不下载模型。
- ONNX Runtime、OpenCV、ZXing 为本地基础库；没有云 OCR、在线 AI 或运行期遥测。
- 本版 schema v6，商品、营养证据、修订、封面、未完成草稿和库存持久保存；旧数据库采用增量迁移。

## 我的 → 导出与分享

**食品资料包**用于朋友向开发者提供待汇总食品资料：仅导出已人工确认的食品，包含条码和营养标签；不包含购买数量、到期日、设备标识或原始 OCR。照片默认不导出，可由用户主动开启包装与营养表照片；分享前仍应检查照片内容。

**个人数据（含库存）**用于用户自行保管或交由开发者处理：包含个人食品、库存和 OCR / 修订资料。不要把这种文件误当作仅供共享的食品资料包。

ZIP 在本机生成，通过系统分享由用户选择接收人或保存位置，不自动上传。数据使用 `data.json`、`files.json` 和可选图片表达，图片记录哈希。资料包不是官方营养数据库；不同朋友提交同条码不同标签时仍需人工复核，不能静默覆盖。

**当前没有 App 内导入还原或中央共享数据库；导出不等于一键恢复备份。**

## 已有证据与限制

本轮构建包含 TypeScript 检查、67/67 JavaScript 测试、Python 检查和 APK 检查。Android 模拟器实际完成：相册条码解码、包装及营养照片导入、本地 OCR、人工修正保存、库存 2 瓶再加 1 瓶、重启后再次命中且商品仍只有 1 条、食品资料 ZIP 生成。

实际设备流程使用合成 EAN-13 条码图和真实牛奶包装照片；商品名与营养修正由自动化 UI 操作人工输入，不计为 OCR 准确率。物理镜头连续扫码、OPPO Find X7 Ultra 本轮表现、不同相机条件、长期内存稳定性、带照片导出的实机回归及历史 APK 覆盖升级仍待验证。

## 开发

```sh
npm ci
npm run typecheck
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
npm run verify:assets
```

Android 构建需要固定的模型、Android SDK / NDK 和签名配置，以 `.github/workflows/simple-app-release.yml` 为当前 main 构建入口。旧 Phase 1/2 文档和工作流保留作为历史，不代表当前产品状态。

- [界面、数据模型和导出说明](docs/SimpleApp.md)
- [本轮实际验收与安装限制](docs/SimpleAppAcceptance.md)
- [签名与升级策略](docs/AndroidSigningAndUpgradePolicy.md)
- [模型清单](docs/OcrModelManifest.md)

`codex/mainland-v2` 保留为技术分支，`backup/main-before-simple-app-20261014` 保留原 main 基线。`Hukang-codex` 与 `Hukang-deepseek` 只读，不在其中修改、提交或删除文件。
