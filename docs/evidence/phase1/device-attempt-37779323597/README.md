# 实际离线 Android OCR：四次基线成功，后续 UI 测试失败

GitHub Actions [run 37779323597](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37779323597) 在 Android 15 / API 35 Google APIs x86_64 模拟器中，通过官方 `libndk_translation.so` 0.2.3 执行原始 ARM64 Release APK。APK 来源为 `339a669`，设备测试脚本为 `f113662`，APK SHA-256 为 `3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`。

首次启动 App 前关闭 Wi-Fi / 移动数据，启用飞行模式，IPv4 / IPv6 OUTPUT 策略设为 DROP，并禁用模拟器中已安装的 Google Play Services、GSF、Google Photos。最终 Manifest 没有 INTERNET。两张归档的中国食品实拍照片各执行两次，四次均由 APK 中的官方 PaddleOCR 模型产生实际输出。原文中的错字和表格阅读顺序问题原样保留；没有人工转录、AI 或营养解析。

| 实际运行 | 文字块 | 模型加载 ms | OCR ms | total ms | 50 ms 采样最高 PSS KiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| photo-1-run-1 | 39 | 1393 | 88554 | 90133 | 529040 |
| photo-1-run-2 | 39 | 0 | 85057 | 85164 | 659530 |
| photo-2-run-1 | 21 | 0 | 49251 | 49434 | 695363 |
| photo-2-run-2 | 21 | 0 | 49870 | 50013 | 689870 |

`*-native.json` 为原生输出，包含完整原文、每块 boundingBox / polygon / confidence、模型 hash、图片 hash、变换矩阵及计时。`photo-*-run-*/record.json` 为实际 App JS 保存的记录。原始图片在 `tests/fixtures/china-food/`；原始和处理后图片的实际导出文件保存在完整设备 artifact 中。四次导出在本地运行 `scripts/validate-ocr-evidence.mjs` 后全部通过图片 hash、原文、坐标和模型记录的一致性检查（`baseline-evidence-consistency-local.json`）。此检查本身只验证记录一致性；执行来源由工作流和下载 artifact 的身份记录共同说明。

工作流整体为 failure：四次 OCR 之后，旋转测试的脚本未找到“右转 90°”按钮，`processingChecks` 为空。本目录保留这个真实失败，不标为完整 Phase 1 验收通过。没有 ARM64 真机测试，没有 EXIF 2–8 测试，没有绝对内存峰值或准确率基准。模拟器 ARM 翻译耗时不能代表手机性能。

完整原始设备文件：[artifact 11551632136](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37779323597/artifacts/11551632136)，ZIP 30,991,029 bytes，下载后独立核对 SHA-256 `a99ffb24e05548bc1c681ca208cbc29e2e093a61ede7777f53dce9395d96963b`。GitHub artifact 保留期 14 天；本目录的原始 JSON、截图和失败状态持续保存在 Git。
