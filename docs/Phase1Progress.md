# Phase 1 验证进度

## 阶段 1：配置与应用契约（2026-10-08）

- 本地实际运行 Gradle 9.3.1 `help`：成功，1m 8s。修复了 Expo 57 library publication 所需的 `versionName` 和 `versionCode`。
- 实际运行 Expo Android autolinking：指向 `com.hukang.vision.HukangVisionModule`，与 Kotlin 类一致。
- TypeScript noEmit 通过，现有及新增契约测试 14/14 通过。
- 原生返回值验证覆盖当前图片/hash/尺寸、固定官方模型 SHA、原文/块一致性、有限坐标、confidence 与时间。零分数仍保留。
- 最终发行包仍需检查：模型尚未取得、release APK 尚未构建、Android OCR 尚未执行。上述检查不能替代设备验证。
- 两个旧仓库保持只读；没有 Phase 2 食品解析或数据库 UI。

构建日志保存在本地 `.build-tools/phase1-gradle-config.log`；此目录不提交。
