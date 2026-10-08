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
配置按原始字节保存、记录 SHA-256；完整字典按原始顺序保留，并计算有序字典
摘要。独立来源摘要锁位于 models/paddleocr/v5-mobile/source-lock.json。
已有配置 SHA 后，后续官方下载也必须满足固定摘要。脚本同时校验官方 URL、
revision 和输出路径，不接受通过修改 manifest 更换源。任何缺失或不符都失败。

首次配置 SHA 只能由直接访问官方 HTTPS 地址的构建取得。配置锁为空时，
离线 archive/bundle 导入明确失败；不能让上传者提供的清单自证“官方”。
导入不采用上传包内的 manifest/source-lock 作为信任根，而是使用已审核提交的
仓库来源锁。tar 逐成员读取，限制压缩前后大小及成员数量，拒绝路径穿越、
绝对路径、链接、特殊文件和重复模型／配置，不解包任意文件路径。

## GitHub Actions 获取与构建

.github/workflows/phase1-release.yml 在 codex/mainland-v2 push 或人工 dispatch
时运行，使用 GitHub 官方 runner 上正常的官方 HTTPS 下载。这不修改受管
工作区的代理或网络策略，也不是 App 运行时网络链路。

1. 从官方百度 BOS 取得归档；失败时仅尝试官方 PaddlePaddle Hugging Face
   固定 revision。两路均校验已知模型 SHA；均失败则停止，不创建占位资产。
2. 两模型与原始 YAML 校验后，立即上传 verified-official-models-<commit SHA>，
   不等 Android 构建结束。
3. Artifact 包含模型、原始 YAML、license/notice、manifest、source-lock，
   以及官方 URL、实际摘要、GitHub repository/commit/run ID/attempt 的 receipt。
4. 接着运行项目检查、ARM64 release 构建，对实际 APK 的 Manifest、模型、
   ABI、签名和离线 JS bundle 检查。APK／日志单独上传为 build artifact。

首次 artifact 取回时，先核对它来自本仓库已审核 commit 对应的 Actions run，
且获取步骤成功；逐模型核对固定 SHA，再审核该 run 产生的 YAML SHA 并提交
仓库来源锁。陌生 ZIP、同名文件或某人提供的 digest 不构成可信来源。
Artifact 自动保留期为 14 天，成功后应及时保存重要构建证据。

已锁配置后，从该可信 artifact 的模型目录离线导入：

    python scripts/fetch-models.py --bundle-dir /path/to/artifact/models/paddleocr/v5-mobile
    python scripts/fetch-models.py --verify

自行上传的官方 BOS tar，必须从上方列出的官方地址原样下载、保留获取来源，
使用现有 source-lock 校验：

    python scripts/fetch-models.py --archive-dir /path/to/official-archives

### 可信人工上传的具体步骤

1. 在能够正常访问官方模型发布地址的开发机上，打开上方 PaddlePaddle 官方
   仓库固定 revision，下载原始模型和 inference.yml；或者下载上方两个官方
   BOS tar。不得从搜索结果中的镜像、论坛附件、APK 或个人仓库获取。
2. 上传保留原文件的两份 tar，或保留两个官方模型各自文件夹的完整原始文件。
   同时记录下载 URL、固定 revision、下载时间。不要把两份同名 inference.onnx
   或 inference.yml 放进一个文件夹后覆盖，也不要编辑 YAML／解压后重导出 ONNX。
3. 通过用户明确提供的附件，或本仓库已经审核 Actions run 的 artifact 传递。
   GitHub Actions artifact 是开发供应链资料，不是 App 首次启动下载路径。
4. 使用仓库已有固定模型 SHA 与独立配置 SHA 锁核对实际字节。上传者提供的
   SHA 清单仅为传输辅助；脚本不会拿它代替仓库的期望值。
5. 首次 YAML 配置锁仍为空时，人工上传不自动放行。需先有直接访问官方源
   的可信构建 receipt，并审核该 run/commit 与官方 YAML 摘要，再提交来源锁。
6. 所有摘要、配对配置和字典验证通过后，构建机离线导入；任何不符都拒绝，
   不会自动改期望摘要来“修复”导入。

仓库权限用户可以在 GitHub Actions 页面打开对应 run，下载
verified-official-models-<commit SHA>。用 GitHub CLI 正常认证下载也可：

    gh run download <RUN_ID> --repo chenchangxiang-330/Hukang-codex-China \
      --name verified-official-models-<COMMIT_SHA> --dir <LOCAL_ARTIFACT_DIR>

下载前核对 Actions run 的 commit 与工作流源码；下载后核对 receipt 的
repository、GITHUB_SHA、run ID，以及两模型已固定摘要。不要绕过当前环境的
proxy／TLS 校验去获取被网络策略拒绝的地址。

不会接受第三方 APK 提取的模型、第三方镜像、修改／重导出的 ONNX、重新生成
的字典或“尺寸看起来一样”的替代文件。

Actions 使用临时实验签名生成 **release-mode OCR Lab APK**。它不是正式商店
签名，不上传私钥；新证书的构建可能需要卸载旧实验 APK 才能安装，卸载会清掉
实验记录。正式签名管理属于之后单独安排的发布工作。

## 验证状态

**已实际验证：** [GitHub Actions run 37737586793](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/37737586793)，
对应已审核提交 304863e，已从 PaddlePaddle 官方百度 BOS 取得两份原始归档。
两模型 SHA-256 与上方固定值一致；原始 YAML、字典检查、TypeScript、15 项 Node
测试和资产验证通过。首轮 run 随后在 SDK 步骤因 sdkmanager 不在 PATH 失败，
没有生成 APK。这次失败不否定已经单独完成的官方资产验证。

| 原始配置 | 官方获取后实际 SHA-256 |
| --- | --- |
| detector.yml | `98069072e1b6b37d727fd9d9f11725faa46d6ea0de012f2ed26caea011c37699` |
| inference.yml | `5dfeb2777f6d0db8177d8128a8acfcf6e6276dc4ac73ea3bf0dc06d6a5e85d8e` |

字典原始条目数 **18,383**，第一个条目是 **U+3000 全角空格**，并非空字符串。
配置 SHA 已固定到 source-lock.json。可信 artifact ID 11531893631，ZIP
18,625,900 bytes，平台报告的 artifact SHA-256 为
`543a762c650c9fad885863321b02a9e7e6df1082c45541c3b56ad3af9696374a`。

**本地资产也已实际验证：** 根代理通过可信文件附件工具取得上述 Actions
artifact，核对 ZIP 摘要，再按仓库固定来源锁严格导入官方 ONNX、两份原始 YAML
及完整字典。本地模型约 21.36 MB，脚本校验及 verify:assets 通过；manifest
状态现在是 verified_artifacts。取得模型未绕过受管代理，没有第三方镜像、
APK 提取、占位模型或修改字典。

**尚未验证：** 首轮 Actions 未产出 APK；真实 Android 模型初始化、离线 OCR、
原文／框／confidence、时间和峰值内存需在实际设备或模拟器上另行执行。
本文件不因资产校验通过而标记这些设备功能已完成。

即使取得模型并校验成功，也只代表资产身份、配置和字典通过校验。
真实 Android 的模型初始化、OCR 输出、时间、峰值内存以及食品实拍准确率
必须分别验收，不能由这些静态元数据推断为“已验证”。
