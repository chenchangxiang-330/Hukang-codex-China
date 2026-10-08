# 中国食品包装 OCR 测试输入

这里只保存两张已存在、可识别为实物中文包装照片的归档测试输入。图片从只读 `Hukang-codex` 选择性复制，没有变换、重新压缩或重命名为新拍摄记录。复制前后 SHA-256 一致，见 `manifest.json`。

| 输入 | 来源归属 | 原图摘要 | 可见场景 |
| --- | --- | --- | --- |
| `6937003117814.jpg` | smoothie-app / Open Food Facts | `a5b53b885d8b464ac2adb3dfd3ab0e928ba5d10a9873e7fd421ea23080156af3` | 中文营养表、弯曲包装、低对比、小字 |
| `6923644266066.jpg` | macrofactor / Open Food Facts | `dc87cc54d0a8a4a547d642f46ffb5ab2cbbaa677e2d8316dd4934690332d7103` | 特仑苏包装、配料和营养表、倾斜、小字、复杂背景 |

两张图的拍摄设备、拍摄地点及拍摄时间未知；它们不是本轮新拍的手机照片。两 SKU 远不足以覆盖用户要求的食品类别和成像条件。

## 来源、许可与使用范围

- smoothie-app：[原商品页面](https://world.openfoodfacts.org/product/6937003117814)，[原图链接](https://images.openfoodfacts.org/images/products/693/700/311/7814/nutrition_zh.8.full.jpg)。
- macrofactor：[原商品页面](https://world.openfoodfacts.org/product/6923644266066)，[原图链接](https://images.openfoodfacts.org/images/products/692/364/426/6066/nutrition_zh.15.full.jpg)。
- 归档来源元数据声明图片许可为 [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)，来源条款：[Open Food Facts terms](https://world.openfoodfacts.org/terms-of-use)。图片保持原样。图片许可不受项目代码许可证替代；商标权不因此获得额外授权。派生图片需保留归属、相同许可和变换说明。
- `.source.json` 原样保留了旧归档来源说明和人工目读真值。人工文字是核验参考，**不能作为 OCR 输入或实际 OCR 输出**。
- 没有迁移旧项目的 ML Kit 执行记录，也没有将旧识别结果算作 PaddleOCR 成绩。
- 这些 URL 仅是开发测试素材的出处记录，不是运行时请求。两张 JPEG 不打包为商品数据库，不导入 OFF 商品营养字段，不接入 OFF API，不作为 `ChinaFoodRepository` 数据源。

## 真实运行记录

当前只有测试输入，没有 Hukang China 在 Android 上的 OCR 执行结果。`manifest.json` 的 `not_run` 不代表 OCR 失败或零准确率。

实际执行要求见 `docs/TestProtocol.md`。每次运行必须保存原图、处理图、真实导出的 JSON、运行设备和 APK 身份，不能手工填写模型识别文字。未运行的输入不产生识别准确率。

真实倾斜照片与合成旋转照片应单独统计。如果以后加入旋转/缩放变体，必须标记 `synthetic: true`、父图摘要和具体变换，不能增加“新实拍样本”数量。
