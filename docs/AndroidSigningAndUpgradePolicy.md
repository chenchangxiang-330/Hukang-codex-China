# Android 签名与本地数据升级策略

Phase 3 的 release APK 必须区分实验签名和稳定发布签名。条码关联使用数据库
增量迁移，不能用重装或清库规避签名/升级问题。

## 签名规则

- 稳定签名使用 GitHub Actions Secrets：
  `HUKANG_RELEASE_KEYSTORE_B64`、`HUKANG_RELEASE_STORE_PASSWORD`、
  `HUKANG_RELEASE_KEY_ALIAS`、`HUKANG_RELEASE_KEY_PASSWORD`。
- CI 只在 `$RUNNER_TEMP` 解码 keystore，构建结束后不上传 keystore、密码或
  `GITHUB_ENV` 文件。私钥不能进入 Git、APK artifact、日志或截图。
- `android/app/build.gradle` 只有在四个受保护变量同时存在时才启用稳定签名。
  没有 Secrets 时可以生成短期实验签名，但该 APK 明确不能作为升级包。
- 包名 `com.hukang.china` 必须保持不变。每次可安装升级递增 `versionCode`，并
  在 release artifact 中记录 APK SHA-256 和签名证书指纹。

## 覆盖安装验收

同一证书签名的升级使用：

```text
adb install -r hukang-china-phase3-arm64-release.apk
```

验收必须比较安装前后的 `foods`、`food_evidence`、`food_revisions` 行数、内容、
OCR 原文、图片 SHA-256 和 revision 历史。Phase 3 设备脚本
`scripts/run-android-food-flow.py` 在保存待确认食品后执行同签名 `install -r`，
并重新读取 SQLite。

不同证书的覆盖安装必须失败并报告签名不匹配；禁止通过卸载 App 来“修复”测试。卸载
会删除应用私有 SQLite 和图片证据，这不属于升级路径。

## 数据库安全

- 数据库文件名固定为 `hukang-china-food.db`。
- 当前 schema 为 `user_version=6`。未知版本会拒绝打开且不修改现有数据库；v1
  到 v2 新增 `food_barcodes`，v3 分离商品身份，v4 保存不可变营养证据版本，v5
  保存待补营养表的身份草稿，v6 增加 `simple_product_photos`、
  `simple_capture_drafts` 和 `simple_inventory`。所有增量迁移均保留食品、条码、
  OCR 证据、身份和修订历史。这里的
  数据库 schema 版本与设备证据 JSON 的 `schemaVersion` 独立，不能混用。
- 未来 schema 必须提供显式迁移和迁移前备份测试，不能依赖 SQLite 自动重建。
- `allowBackup=false` 保持开启，避免系统备份恢复造成未审计的数据覆盖。

当前 CI 若未配置稳定 Secrets，只能验证实验 APK 的应用行为和同一 APK 的 `install -r`；
不能把该包当作正式发布签名，也不能声称跨版本、跨构建覆盖安装已完成。
