# 0.3.3 实际模拟器验收证据

- APK 构建源码：`13449a2c51825fa1eec4f7bb7bc963a9bdb85bc8`。
- 测试源码：`7e4c59678857e17410375d4f257d882dbaa4de07`；运行代码与 APK 源码完全一致。
- [成功设备运行](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38706597120)。
- [完整设备证据 ZIP](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/38706597120/artifacts/11958864204)：17,099,024 bytes，SHA-256 `ab37bbc6a9d483230be81744b2292fdba1f69963d28666958fcbfd14b07a2c47`。Actions 保留期 14 天。

本目录是原始产物的选取副本，图片未经重绘或修饰。`home.png`、`mine.png` 顶部的通知属于模拟器预装的 Messages / Personal Safety；禁用 Google Play Services 后这些应用弹出通知，不是 Hukang 的提示。GMS 保持禁用时实际完整流程通过。系统分享界面内显示其他应用候选，测试没有选定接收者或发送文件。

这里没有真实用户的库存或私人照片。`Test Milk`、品牌、规格和库存均为测试输入；条码图为合成图片，食品照片是仓库归档的真实包装营养侧照片，封面测试也复用同图，不是新拍正面。来源和 CC-BY-SA-3.0 声明见 [素材说明](../../../../tests/fixtures/china-food/README.md)。不将这些样例打包成生产食品库。

- `session.json`：逐步 UI、断网规则、OCR 测量与最终结果。
- `native-ocr/*.json`：真实原生 OCR 输出，保留识别错误、坐标、confidence 与计时。
- `initial-parsed.json`：SQLite 中的实际初始解析；整表候选不完整，未知没有猜填。
- `review-after-save.json` / `review-after-edit.json`：实际保存和再编辑的人工值。
- `database-summary.json`：从四个真实设备数据库快照独立读取的摘要和一致性校验。
- `actual-catalogue.zip` / `catalogue-data.json`：设备生成的默认资料包，不含库存或照片。
- `actual-catalogue-with-photos.zip`：设备生成的带照片资料包，JPEG 副本不含 EXIF；原证据文件未改。
- 个人数据 ZIP 和 SQLite 完整快照保留在完整设备 artifact 中；不能把个人导出当成可在 App 内一键恢复的备份。

本轮是 Android 15 x86_64 模拟器通过 ARM 转译安装真正 ARM64 Release APK 的验收，不是 OPPO、物理镜头或旧版本覆盖安装的证据。
