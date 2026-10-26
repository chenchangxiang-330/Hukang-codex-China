# UI V1 实际 APK 检查证据

来自 GitHub Actions 40323157930，artifact 12650846950。`build-inspection-original.zip` 是原始下载字节，SHA-256：`9e7a7392aa933d2b971892a7dcd688347db865f4412e44c0f99f4a5dd38abf1b`，与 GitHub artifact digest 一致。

展开文件供阅读。`runtime-dependencies.txt` 仅去除 Gradle 输出的行尾空白以通过 Git whitespace 检查；原始完整日志保留于 ZIP。原始依赖日志 SHA-256：`be750c7654e6d325aad0714d03b5190da5d8f1597bcac1a69f7c108e204acbeb`。其它展开文件未修改。

这是 Actions 对实际 APK 的检查，不是设备执行证据。签名为短期测试签名，不能覆盖已归档的不同签名 0.3.3。完整状态见上级验收报告。
