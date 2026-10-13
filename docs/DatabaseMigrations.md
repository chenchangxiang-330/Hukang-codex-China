# Hukang China 数据库迁移说明

当前本地食品数据库版本为 `user_version=2`。

## v1 → v2

Phase 2.1 的 `foods`、`food_evidence`、`food_revisions` 和
`food_file_cleanup` 表保持原样。启动时如果发现 `user_version=1`，应用在
SQLite 事务中只创建 `food_barcodes` 表、索引，并将版本设置为 2；不会删除、
重建或重置已有食品、OCR 原文、图片证据、人工修订记录或确认状态。

`food_barcodes` 保存：

- 原始条码字符串（`raw_value`，保留前导零）
- 扫描格式（EAN-13、EAN-8、UPC-A、UPC-E）
- 14 位规范化查询键（`lookup_key`，唯一）
- 校验结果（`validation_status=valid`；未通过校验的条码不会入库）
- 获取方式（`camera`、`image`、`manual`）
- 读取时间

食品删除通过外键级联删除条码关联；条码不会残留并再次命中已删除食品。
同一查询键已经属于其他食品时，绑定操作失败并保留原关联，不静默覆盖。

## 开发版本兼容修复

曾有短暂的 Phase 3 开发数据库使用 `user_version=2` 但缺少
`validation_status`。启动时会检测该列并执行一次附加 `ALTER TABLE`，默认值
为 `valid`；不会重建表或改写食品数据。未来 schema 变更必须递增版本并提供
同样的显式迁移和旧数据回读测试。

## 覆盖升级要求

应用 ID 固定为 `com.hukang.china`。正式升级必须使用同一受保护签名密钥、
递增 `versionCode`，通过 `adb install -r` 验证旧食品、证据、修订和条码均可
读取。临时实验室证书只能用于隔离测试，不能证明对用户现有安装的覆盖升级。
