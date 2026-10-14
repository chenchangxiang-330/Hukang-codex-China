# 护康 0.3.0 本地简易版 · 交付核对

核对日期：2026-10-14。本报告记录已存在的 main 构建及其设备执行证据，不把文档提交称为新的 APK 构建，也不把模拟器测试称为 OPPO 真机验收。

## 1. 源码与构建对应关系

- 主开发与交付分支：`main`。
- APK 实际构建源码：`eeebb89a550de261286123fda4ade45e3c3c4dff`。
- 设备测试源码：`c0f60e2b078fa94ec9be0e0ba8e4ee1d097d1d6d`。
- 两者差异只有新增 `.github/workflows/simple-app-device.yml` 和 `tests/device/simple-device.py`，不改变 App 运行代码。
- 构建 run `38540651611` 由提交 `9e0b9b07aabd1650518da56fdd81e75ed01f6de8` 触发；该工作流执行一次性已审阅整合并提交 `eeebb89`，所以 artifact 中 `source-commit.txt` 才是实际 APK 源码标识，不能仅用触发 SHA 代替。
- 技术分支 `codex/mainland-v2` 保留在 `6f86b1317aa4c2d560ca99365ca2f21fa5f27933`。原 main 备份为 `backup/main-before-simple-app-20261014`。本次核对没有修改两个旧仓库。

构建：[38540651611](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38540651611)

构建产物：[11882678038](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38540651611/artifacts/11882678038)

设备执行：[38542266555](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38542266555)

设备证据：[11882664726](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38542266555/artifacts/11882664726)

这些是 Actions 构建产物，不是正式应用商店发行；产物有保留期限。

## 2. 实际 APK 身份

已下载、解压实际构建 artifact，重新计算 APK 文件 SHA-256，并与 `apk-inspection.json` 和设备 `session.json` 对照，三者相同。

| 项目 | 值 |
| --- | --- |
| APK | `hukang-0.3.0-arm64.apk` |
| applicationId | `com.hukang.china` |
| versionName / versionCode | `0.3.0` / `5` |
| minSdk / ABI | `26` / `arm64-v8a` |
| 文件大小 | `60,760,380` bytes，约 60.76 MB / 57.95 MiB |
| APK SHA-256 | `c3035a12840efe73cdac3d7b5b8fa7f824bd24a831143d9451b158c43e2fc566` |
| Artifact ZIP SHA-256 | `a473c4d01c643857b863ed3569b033319963de5321e17d9b8dcae21dff4c7ab6` |
| 签名证书 SHA-256 | `4541c54941eb35940d9e18714052efe5a316503668debd024d171ff4d936c6c6` |
| 证书 DN | `CN=Hukang 0.3.0 Test, OU=Local App, O=Hukang, C=CN` |

证书和完整签名验证结论来自构建中的 `apksigner` 输出：v2 验证通过，1 个 signer。下载核对环境重新计算了文件哈希，没有在本地重复运行 Android 安装或完整 `apksigner` 验证。

构建标记：`ephemeral-test; cannot promise an in-place update of previous installs`。

**该包不能承诺覆盖旧实验版。没有历史私钥时，新建稳定密钥不能自动兼容旧证书。用户有旧数据时不要直接卸载；当前导出也不提供 App 内一键还原。**

## 3. 离线与模型

构建内最终 Manifest 检查不含 `INTERNET`、`ACCESS_NETWORK_STATE`、`RECORD_AUDIO`。相机、API 32 以下图片存储、振动及内部 receiver 权限单独保留。

模型仍打包在 APK 中：

- detector SHA-256：`a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d`
- recognizer SHA-256：`da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092`
- 原版图标 SHA-256：`d02fb58e0b5cf4617cf84f61a26e9d7dc5419a224e5ab12b173d096bea5ff4c2`

本版主入口只使用本地食品、库存和导出，不调用实验分支中的国内 Provider。用户在系统分享面板选择其他 App 发送资料属于主动分享，不是 Hukang 后台上传。

## 4. 实际执行了什么

Release job 成功；构建中 TypeScript 检查通过，JavaScript 测试为 67 passed / 0 failed，Python 检查和模型资产检查均通过。设备工作流 `device` job 成功。

设备是 Android 15 / API 35 x86_64 模拟器，通过 ARM64 translation 执行真实 ARM64 release APK。不是 OPPO Find X7 Ultra。

设备证据 `session.json`：

- `status: passed`
- `deviceExecutionVerified: true`
- `physicalCameraVerified: false`
- 同时记录了 APK hash、源提交、52 个 UI 操作步骤及截图。

断网环境：飞行模式、Wi-Fi 和蜂窝数据关闭，IPv4 和 IPv6 OUTPUT 链头插入 DROP 规则；Google Play Services 等测试包禁用。部分截图顶部有模拟器中其他系统应用要求开启 Play Services 的通知，它们不是 Hukang 的联网要求。

实际流程：

1. 通过「拍一拍」打开扫码页面。
2. 从相册选择合成 EAN-13 图片，原生 ZXing 解码并进入本地未收录流程。
3. 导入真实牛奶包装照片作为包装和营养表测试输入，UI 人工填写 `Test Milk` 和 `Test Brand`。
4. 实际运行本地 PaddleOCR，保留 native OCR JSON。
5. 通过 UI 修正计量基准、营养数值、单位和 NRV，再确认保存。
6. 加入 2 瓶库存，强行停止 App 并取出实际 SQLite 快照。
7. 重启 App，再次从相册解码同一条码，命中已有商品，没有新增 OCR run。
8. 再加入 1 瓶，重新读取数据库。
9. 在「我的」生成食品资料包，进入系统分享面板，取得 App 实际生成的 ZIP 并检查结构。

实际数据库结果：

| 快照 | 商品数 | 库存记录 | 数量合计 | schema |
| --- | --- | --- | --- | --- |
| `after-stock.db` | 1 | 1 条：2 瓶 | 2 | 6 |
| `final.db` | 1 | 2 条：2 瓶 + 1 瓶 | 3 | 6 |

这里验证了商品与库存分离、同商品再次入库不复制商品、强行停止重开后的本地数据保持。不能由一组样本推出所有格式或包装均可稳定识别。

## 5. 导出核对

实际从设备取得的 `actual-catalogue.zip` 包含 `data.json` 和 `files.json`。

- format：`hukang-food-catalogue`
- schemaVersion：1
- products：1 条已确认商品，包含条码、每 100mL 标签与人工确认营养值。
- 不含 inventory 字段、不含个人购买数量和到期日、不含原始 OCR 文本。
- 本次 `photosIncluded: false`，`files.json` 为 `[]`；与照片默认关闭一致。
- ZIP 来自 App 运行时导出，不是验收脚本另行生成的食品资料。

食品资料包可以供朋友主动提交待汇总资料，但并未实现中央共享服务、自动合并、第三方数据授权或全国性食品覆盖。

个人数据导出、含照片导出与元数据去除逻辑已经实现；本次设备流程只实测了默认不含照片的食品资料包。不能将它扩大描述成所有导出选项和第三方接收 App 都已测试。

## 6. 未验证与保留限制

- OPPO Find X7 Ultra 本轮真机：未执行。
- CameraX 取景、ZXing 连续帧识别、补光灯已经实现，但物理镜头读取真实包装：未验证。当前自动化成功用的是相册解码。
- 包装正面与营养表使用了同一张真实包装测试照片，不代表两次真实拍摄已验证。
- 商品名和营养字段经 UI 人工修正，不计入自动识别准确率。
- 多设备、反光、模糊、连续长时间识别与真实内存稳定性：未验证。
- 系统分享面板已打开；实际发送到微信、邮件或文件应用的接收端：未验证。
- 含照片分享、个人完整导出、App 内导入还原：前两项未完成设备回归，后者尚未实现。
- 历史安装包覆盖升级与稳定签名配置：未完成。
- 不支持云端商品查询和全国共享食品数据库；本轮明确只查本机。

## 7. OPPO 手动验收

先检查安装签名限制，避免删除旧数据。在可安全安装的测试环境中：关闭网络，扫描真实包装条码，依次拍包装和营养表，核对并保存，加入库存；强行停止重开，再扫描同条码并再次入库，确认商品不重复。最后在「我的」导出食品资料包，分别检查不含照片及主动开启照片的结果。异常时保留版本、页面、错误提示及是否发生于相机还是相册入口。
