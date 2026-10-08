# Hukang China OCR 模型清单

## 固定组合

| 项目 | 固定值 |
| --- | --- |
| PaddleOCR Android 适配源码基线 | 官方 `v3.7.0` 的 `deploy/ppocr-android/ppocr-sdk` |
| 检测 | `PP-OCRv5_mobile_det_onnx` |
| 识别 | `PP-OCRv5_mobile_rec_onnx` |
| 运行时 | ONNX Runtime Android `1.21.1`，CPU execution provider |
| OpenCV Android 包 | `com.quickbirdstudios:opencv:4.5.3.0` |
| Android | `minSdk 26`，仅 `arm64-v8a` |
| 方向分类器 | 无；EXIF 方向修复＋用户手动旋转 |
| 运行时模型下载／联网 OCR | 禁止 |

选择固定官方版本的 Android 接口实现，但模型保持 PP-OCRv5 mobile。
官方文档标题中出现 v6 不表示本项目采用 v6 模型。

ONNX Runtime 和 OpenCV 是 `FOREIGN_OFFLINE_LIBRARY`，不改变模型来源。
模型来自 PaddlePaddle 官方发布。Paddle Lite／Paddle 原生 runtime 是未来
评估项，不是本阶段的前置条件。

## 来源、revision 与摘要

| 模型 | 官方 revision | 固定模型 SHA-256 |
| --- | --- | --- |
| Detector | `e6f4fa85f00e168c862bc462aebca69eef9b3d3d` | `a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d` |
| Recognizer | `ed152b8b495f84de93cda5709d768548a9127622` | `da72dc72ca4dc220df0dfde68c1dedc31c58d3e76a25871122e5056227d50092` |

来源：

- [Detector 官方模型仓库](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx)。
- [Recognizer 官方模型仓库](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_rec_onnx)。
- [固定 Android 部署文档](https://github.com/PaddlePaddle/PaddleOCR/blob/v3.7.0/docs/version3.x/inference_deployment/cross_platform/android_deployment.md)。
- [Detector 官方百度 BOS 归档](https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar)。
- [Recognizer 官方百度 BOS 归档](https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx_infer.tar)。

BOS URL 本身没有 commit revision，因此仅接受与上述固定摘要完全相同的
模型字节。`--source hf` 使用完整固定 revision 的下载路径，禁止浮动 `main`。
机器可读记录位于 `models/paddleocr/v5-mobile/manifest.json`。

## License 与打包路径

官方两份模型卡声明 **Apache-2.0**，PaddleOCR 源码同为 Apache-2.0。
许可正文与来源 notice 随模型目录保留。

| 内容 | App 内打包路径 |
| --- | --- |
| 检测模型 | `models/paddleocr/v5-mobile/detector.onnx` |
| 识别模型 | `models/paddleocr/v5-mobile/recognizer.onnx` |
| 原始检测配置 | `models/paddleocr/v5-mobile/detector.yml` |
| 原始识别配置及字典 | `models/paddleocr/v5-mobile/inference.yml` |
| 模型清单 | `models/paddleocr/v5-mobile/manifest.json` |
| 许可 | `models/paddleocr/v5-mobile/LICENSE-PaddleOCR.txt` |
| 来源说明 | `models/paddleocr/v5-mobile/NOTICE.md` |

这两份 ONNX 文件从官方归档中 `inference.onnx` 重命名，不转换模型、不量化，
不修改字典顺序、不以另一种模型替代。

## 输入与预处理

### Detector

- FP32 NCHW，batch 1，3 channels，H/W 动态；最长边缩放至 960，边长按 32 对齐。
- 通道顺序 **BGR**。
- `scale = 1/255`。
- `mean = [0.485, 0.456, 0.406]`，`std = [0.229, 0.224, 0.225]`。
- 逐通道 `(pixel / 255 - mean) / std`，再转 CHW。
- DBPostProcess：`thresh 0.3`、`box_thresh 0.6`、`max_candidates 1000`、
  `unclip_ratio 1.5`。

以上来自固定 PP-OCRv5 mobile 检测配置，不沿用 SDK 示例面向其他模型的
`limit_type=min / 64 / 4000` 默认设置。

### Recognizer

- FP32 NCHW，batch 1，3 channels，height **48**，width 动态。
- 保持裁切文字行长宽比，参考宽度 **320**，短行补到最小宽度 320。
- 通道顺序 **BGR**；修正官方 Android 示例中的 BGR→RGB 路径以匹配固定配置。
- 归一化 `(pixel / 255 - 0.5) / 0.5`；已归一化的 tensor 补零。
- 不增加独立 orientation classifier，不对低置信度文字调用 AI。

### Dictionary 与解码

字典为识别模型原始 `inference.yml` 中的
`PostProcess.character_dict`。必须保留原顺序及空项；不得借用旧字典或
从不匹配的其他模型生成字典。解码端按 Paddle 的规则仅在缺失时追加 U+0020
空格，CTC blank 对应输出 index 0。

`fetch-models.py` 实际解析完整官方 YAML 后记录 `characterCount`、
`effectiveCharacterCount`、`expectedOutputClasses`。Android 模块还必须
核对模型实际输出 classes 与字典长度，不能凭字符数估计通过。

## 获取、校验与构建门禁

以下命令仅在开发／构建机运行。脚本保留 inherited proxy 和 TLS 校验。

```sh
python -m pip install PyYAML==6.0.3
python scripts/fetch-models.py --source bos
python scripts/fetch-models.py --verify
node scripts/verify-assets.mjs
```

也可使用明确提供的官方归档文件，无网络读取：

```sh
python scripts/fetch-models.py --archive-dir /path/to/official-archives
```

获取脚本先验证两份模型固定 SHA-256 与两份配置，全部通过后才写入正式资产。
配置按原始字节保存并记录自己的 SHA-256。模型缺失、摘要不一致或字典缺失
均使资产校验失败，不能绕过校验构建“可运行”APK。

## 验证状态

当前模型字节尚未取得：受管工作区 inherited proxy 对百度 BOS 和 Hugging
Face 返回 CONNECT `403 Forbidden`。已确认官方 PaddleOCR v3.7.0 GitHub
release 仅提供源码归档，没有模型附件。没有绕过网络策略，没有放入占位模型。

因此表中的模型 SHA-256 当前为官方文件元数据核实的**预期摘要**，不是已经
对本机模型文件计算的摘要。manifest 的 `verification.status` 为
`not_downloaded`；取得真实文件并通过脚本后会改为 `verified_artifacts`。

即使取得模型并校验成功，也只代表资产身份、配置和字典通过校验。
真实 Android 的模型初始化、OCR 输出、时间、峰值内存以及食品实拍准确率
必须分别验收，不能由这些静态元数据推断为“已验证”。
