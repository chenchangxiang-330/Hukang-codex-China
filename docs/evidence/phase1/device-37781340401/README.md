# 最终实际 Android 离线 OCR 技术验证

[GitHub Actions run 37781340401](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401)，job `113324913574`，实际结论 **success**。测试工具 source `a0c85d544ed2bccea225ead8a4e063acccadb764`，App source `339a66991af93c488e1f1426a3f240edd82fc3ca`；同一 ARM64 Release APK SHA-256 `3dd6e764695374bdf5a94d89dba6d228b1fce5a4ce79a048c84a5465ffe0a12e`，58,709,659 bytes。

实际设备环境：Android 15 / API 35 Google APIs x86_64 模拟器，通过官方 `libndk_translation.so` 0.2.3 执行 APK 原始 ARM64 native code，不是 ARM64 手机。首次启动之前飞行模式 1、Wi-Fi 0、IPv4 / IPv6 OUTPUT DROP，已安装的 GMS / GSF / Google Photos 被禁用。最终 APK 不含 INTERNET。模型始终来自 APK，没有网络下载、在线 OCR、AI 或食品查询。

`session.json` 为原始完整执行记录；`*-native.json` 是真实原生输出，`*/record.json` 是 App 实际 JS 导出。原文中的错字、串行和漏字符保留不变。`evidence-consistency.json` 为 CI 对六份实际导出的原图 / 处理图字节、模型摘要、结果字段的一致性检查。`device-job-excerpt.txt` 仅为带原始时间戳的日志选段。

| 实际运行 | 块数 | modelLoad ms | OCR ms | total ms | 50 ms 采样最高 PSS KiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| photo-1-run-1 | 39 | 1384 | 86121 | 87641 | 529067 |
| photo-1-run-2 | 39 | 0 | 84178 | 84259 | 657407 |
| photo-2-run-1 | 21 | 0 | 48382 | 48536 | 687791 |
| photo-2-run-2 | 21 | 0 | 48695 | 48848 | 693719 |
| processing-roundtrip-run | 39 | 0 | 83652 | 83778 | 711565 |
| processing-crop-run | 33 | 0 | 73272 | 73344 | 718063 |

通过生产 UI 实际右转 90° 后为 1700×1280；左转 90° 回到 1280×1700，PNG 字节摘要与旋转前相同，并重新 OCR。10/10/80/80 百分比裁剪实际矩形 (128,170)–(1152,1530)，图像 1024×1360、矩阵平移 (-128,-170)，并重新 OCR。单独右转 90° 的 OCR 没有运行；没有独立精确像素比较或 EXIF 2–8 执行。

下载并独立校验的是 [small artifact 11552408564](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401/artifacts/11552408564)：15,116,060 bytes，ZIP SHA-256 `d6a5e6529c8fbf3804aa28692bb4285ceee3e0ccac0bf06a032cfa7c5ae50805`。它包含全部六份原生 / JS JSON、CI 校验结果、处理图和截图。完整 [artifact 11553038552](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37781340401/artifacts/11553038552) 为 48,957,940 bytes、GitHub digest `54ae589b9176d88a54b2b5db04d10bab6559817469e5ed025fb6d6c3fc1a8e10`；超出当前文件下载工具 32 MiB 限制，未下载其全部原始存储和 logcat，不声称已本地检查完整 ZIP。附件保留 14 天。

本地另外核对六份原文 / boxes / 模型记录、fixture 摘要，以及实际保留 PNG 的字节摘要和四张处理图的 PNG 尺寸，结果在 `local-record-and-retained-image-check.json`。牛奶、旋转、裁剪 PNG 取自本次 small artifact；零食 PNG 取自先前已下载完整 artifact `37779323597` 的原始导出，摘要与本次相同。所有实际 PNG 按内容 hash 保存在 [actual-processed-images](../actual-processed-images/)；原始 JPEG 在 `tests/fixtures/china-food/`。没有重建图片或改写 JSON 的运行时路径。Kotlin Float JSON 短小数与 JS Number 小数表示略有不同，检查的是同一 Float32 位值，实际置信度未被业务修改。

本轮证明此仿真环境的本地国产模型、生产原生桥和图像流程可用。采样 PSS 最高 718,063 KiB（701.23 MiB）不是绝对峰值；时间不是手机成绩。只使用两张归档实拍照片，没有代表性准确率、ARM64 真机、EXIF 多方向、长时稳定性或完整 Phase 1 产品验收结论；未开始 Phase 2。
