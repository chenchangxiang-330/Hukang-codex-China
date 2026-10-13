# Phase 3 条码闭环测试与证据

Phase 3 的自动化验收必须证明一次真实解码的完整状态迁移，而不是只调用
SQLite 查询函数：

```text
条码图像/相机解码 → 本地未命中 → 带条码草稿 → 人工确认保存
→ 再次解码同一条码 → 本地命中
```

## 可运行测试

- `npm test` 包含 `tests/barcode-phase3.test.mjs`：校验 EAN-13、EAN-8、
  UPC-A、UPC-E、校验位、前导零、未知格式，以及连续帧互斥和过期查询隔离。
- `python -m unittest discover -s tests -p 'test_*.py'` 包含
  `tests/test_phase3_evidence.py`：验证证据包拒绝手动输入、重复扫码重新 OCR、
  网络权限和未执行设备测试。
- `scripts/verify-phase3-evidence.py` 只接受设备执行器产生的明确证据，不会解码
  图片、查询宿主机数据库或生成成功记录。

## 设备证据包

证据包的 `session.json` 必须包含：

- `deviceExecutionVerified: true` 和 `offline: true`；
- APK 最终权限清单，且不包含 `INTERNET` 或 `ACCESS_NETWORK_STATE`；
- `barcodeChecks.firstScan`：`source` 为 `camera` 或 `image`，原始条码、格式、
  校验结果、规范化查询键，以及 `queryStatus: not_found`；
- `draftSaved` 和 `confirmedSaved`：相同食品 ID、相同查询键、保存状态和
  `immutableEvidence: true`；
- `barcodeChecks.repeatScan`：相同原始条码和查询键、`queryStatus: found`、
  相同食品 ID、`ocrRuns: 0`。

`source: image` 仅表示实际条码图像解码，不能作为物理相机覆盖验证。只有在真实
相机取景器中完成解码后，才使用：

```bash
python3 scripts/verify-phase3-evidence.py --session session.json --require-camera
```

未具备物理相机条件时，不得把图像解码结果描述为相机链路已验证。

测试条码可以是合成图像，但必须在证据和报告中标记为合成样本；真实食品包装图像
与生产数据库数据不能混入 APK 或生产食品库。

