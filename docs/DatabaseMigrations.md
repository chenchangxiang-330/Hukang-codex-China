# Hukang China 数据库迁移说明

当前本地食品数据库版本为 `user_version=6`。

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

## v2 → v3（商品身份与营养证据分离）

v3 新增 `food_identity` 和 `food_identity_revisions`。这两个表通过
`food_id` 外键关联已有 `foods`，不会移动或重写 `food_evidence`、OCR 原文、
解析候选、营养人工核对或原有 `food_revisions`。

`food_identity` 保存商品身份的名称、品牌、规格、`draft`/
`pending_confirmation`/`confirmed` 状态、查询来源（`local`、
`mainland_service`、`user`、`package_ocr`）、来源记录标识、获取时间、数据
使用政策和用户确认时间。第三方查询结果应先保存为 `pending_confirmation`；
商品身份确认不会将营养标签记录自动标记为已确认。

每次身份创建、供应商结果、编辑或确认都会在 `food_identity_revisions` 留下一
份不可变 JSON 快照。保存身份采用单个 SQLite 事务，并带有 `updatedAt` 乐观
并发检查；旧编辑不能覆盖较新的身份。食品删除时由外键级联清理身份及身份历史。
已保存的营养记录仍通过原有 `foods.status` 和 `food_revisions` 管理，两种确认
状态相互独立。

## v3 → v4（营养表证据版本）

v4 新增 `food_evidence_versions`。迁移会把每条现有 `food_evidence` 以不可变的
`*-evidence-initial` 快照登记为当前版本，不删除或重写旧图片、OCR 原文和解析
结果。以后用户为同一商品拍摄新包装营养表时，新图片和 OCR JSON 写入该食品
专属的 `food-evidence/{foodId}/versions/{revisionId}` 目录；事务成功后才将该
版本标为当前版本，之前版本改为历史版本并仍可读取。事务失败会删除新版本目
录，保留原当前版本。`FoodScanRecord.evidenceHistory` 暴露历史快照，条码和商品
身份关联保持不变。

## v4 → v5（待补营养表身份）

v5 新增 `food_identity_pending`，只保存用户在本机确认过、但还没有第一张
营养标签的商品身份和已校验条码。它不是营养证据，也不会生成占位 OCR 图片或数值。
扫码优先返回完整食品记录；没有完整记录时才显示待补身份。营养表保存并绑定成功后，
应用删除该待补行；保存失败时保留它以便重试。

## v5 → v6（简易本地食品流程）

v6 在 v5 的基础上只做增量添加，保留所有食品、条码、商品身份、OCR 证据和修订
历史：

- `simple_product_photos`：保存食品封面照片及可选的包装 OCR 证据 JSON；照片仍由
  应用私有文件目录管理，表内保存的是本地资产描述。
- `simple_capture_drafts`：保存条码录入草稿、包装照片引用、营养照片引用和当前
  录入步骤。应用中断或重启后可继续同一草稿，不生成第二条食品记录。
- `simple_inventory`：保存独立的购买批次、正整数包装数量、单位、可选到期日和
  创建时间。库存通过 `food_id` 外键引用食品资料，不复制营养标签。

迁移在同一个 SQLite 事务中执行并设置 `PRAGMA user_version=6`。已有食品记录不会
被重建或清空；库存表使用 `ON DELETE RESTRICT` 防止删除仍被库存引用的食品。库存
写入使用调用方生成的幂等请求 ID，重复提交不会产生重复批次。若封面照片或草稿
清理失败，食品记录和草稿 ID 保留，后续重试不会静默创建另一条食品。


### 本轮迁移验证的证据边界

`tests/food-storage.test.mjs` 使用真实 SQLite 存储层构造带食品、条码、OCR
证据和两次人工修订的合成 v5 测试数据库，再打开 v6。测试比较原有食品、条码、
证据和修订内容逐字保持一致，并确认迁移后仍能编辑及增加修订。
这是可重复的 schema 回归，**不是用户历史 APK 的覆盖安装实验**。
真实跨版本安装仍取决于原签名私钥与设备数据，不能用重新生成的旧包替代。
