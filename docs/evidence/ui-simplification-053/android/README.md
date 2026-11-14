# Android 原生渲染与验收（0.5.3）

以下是实际安装 release APK 后，由 Android `screencap` 直接获得的画面，未重绘或填入生产演示数据。运行环境为隔离的 Android 15 / API 35 Google APIs 模拟器，x86_64 主机执行 ARM64 APK；不是实体手机，也不是浏览器。

- APK 源码：`328a2dca96d3df104ec484522ea686e63b88e39c`；SHA-256：`2fb4689cd26d404f59294176c6fa5840ff83368f84a847b50c1d9bcd1888872e`。
- [完整验收 41424250653](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41424250653)，测试脚本 `ccde792be991cf134954c1000471b1c4a41905ef`，离线与四组图片通过，UI 前七项通过。
- UI 第八项在大字体切换份量输入框时未取得焦点而停止，失败的 [原始报告](ui/session.json) 与 [原始画面](ui/real-diet-local-storage-failure.png) 保留。脚本现最多三次重新取得焦点，再发送输入；不放宽保存数值、数据库与同步断言。
- [受影响流程重测 41427435706](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41427435706)，脚本 `d6c65398db241ae1592c4bc94af96665d140a634`。复用同一 APK，运行时代码差异检查通过；拍照与真实饮食闭环均通过，[报告](flows/session.json)确认保存、重启、个人目标、三页同步、份量/名称/日期/餐次修改和删除。本次输入均一次取得焦点，未触发补充等待。

上述两次运行合计完成八项 UI 场景；没有将首次运行标为全部通过。[附件来源与完整 ZIP 哈希](artifacts.json)已独立复核。

## 真实空页面

截图在新模拟器尚无饮食记录时取得。之后的手动保存仅在该一次性模拟器中执行，不写入用户手机、生产食品库或默认种子数据。

| 页面 | 真实 Android 截图 |
| --- | --- |
| 今天，无记录 | [390dp](ui/android-today-390-empty.png) |
| 饮食记录，无记录 | [390dp](ui/android-diary-390-empty.png) |
| 今日营养，默认折叠 | [390dp](ui/android-nutrition-390-empty.png) |
| 展开营养与记录日期传递 | [蛋白质](ui/android-nutrition-protein-empty.png) · [碳水](ui/android-nutrition-carbohydrate-empty.png) · [所选日期](ui/android-nutrition-from-selected-diary-date.png) |
| 我的，四项列表 | [查看](ui/android-mine-390-empty.png) |
| 拍一拍，两个主入口 | [查看](ui/android-capture-meal-empty.png) |
| 包装食品 | [查看](ui/android-capture-package-empty.png) |
| 今天，320dp / 系统字体 150% | [查看](ui/android-today-320-font150-empty.png) |
| 记录，320dp / 系统字体 150% | [查看](ui/android-diary-320-font150-empty.png) |
| 营养详情，320dp / 系统字体 150% | [查看](ui/android-nutrition-320-font150-empty.png) |
| 营养详情底部可滚动到达 | [查看](ui/android-nutrition-scroll-end-320-font150.png) |
| 键盘与输入框 | [查看](ui/android-capture-keyboard.png) |
| 手势导航与 Dock | [查看](ui/android-today-gesture-safe-area.png) |

## 隔离录入与设备交互

| 验证 | 截图与说明 |
| --- | --- |
| 个人目标 100g，按 0.5 份计算约 50g 蛋白质 | [一半进度](ui/android-isolated-protein-half-target.png)，仅隔离测试手动输入；100g 不是默认目标，估算属性保留 |
| 保存饮食后的小屏大字体 | [查看](ui/android-isolated-today-diet-320-large-font.png) |
| 修改份量后同步营养详情 | [查看](flows/android-isolated-nutrition-diet.png) |
| 修改日期/餐次后的反馈 | [320dp / 字体 150%](flows/android-isolated-date-save-feedback.png)，反馈位于对应按钮旁，不需要再滚回顶部 |
| 相机权限拒绝与允许 | [拒绝提示](ui/android-camera-permission-denied.png) · [系统权限](ui/android-camera-permission-request.png) |
| 系统相机拍照 | [模拟器虚拟场景](ui/android-system-camera-virtual-scene.png) · [餐食照片](ui/android-captured-meal-original-photo.png) · [包装照片](ui/android-captured-package-original-photo.png) |
| 条码实时预览 | [查看](ui/android-live-barcode-scanner.png)，不声称已在实体镜头解码 |
| AI 原生网络错误与清除配置 | [网络失败](ui/android-ai-native-network-failure.png) · [清除后阻止调用](ui/android-ai-clear-prevents-meal-call.png)，仅保留域名与非密钥测试值 |
| 真实本机 OCR 与人工核对 | [原识别结果](offline/ocr-review-before-corrections.png) · [核对](offline/review.png) |
| 食品、库存与导出 | [保存食品](offline/saved-processed.png) · [库存](offline/inventory.png) · [系统分享](offline/actual-personal-with-photos-share-sheet.png) |

## 已通过的离线与图片检查

[离线报告](offline/session.json) 记录十四条业务流程：相册条码解码、草稿恢复、真实包装照片本地 OCR、旋转裁剪后 OCR、五项营养及单位/NRV/基准保存、人工单位纠正、条码再次命中、两次独立入库、消耗/移除库存、修改保留证据与修订、三类 ZIP 导出与照片字节核对。同 APK `install -r` 后全部表保持不变；隔离的 v6 数据迁移到 v7 后旧表保留。这些不代表跨签名覆盖 0.5.2 成功。

四组图片在各自新模拟器通过：[大照片](image-large/session.json)、[透明 PNG](image-transparent/session.json)、[GIF 拒绝](image-gif/session.json)、[超过 50MB 拒绝](image-oversize/session.json)。保留原图，产生独立上传副本；饮食持久照片保存、导出、删除只清理自己拥有的副本，取消选图可继续操作。没有 AI 网络请求。

## 限制

没有连接实体手机或真实服务商密钥。实体镜头/实物条码、不同厂商系统、真实模型与网络、低内存和所有相册格式尚未实测。原生截图不能证明这些场景通过。

APK 与 0.5.2 签名不同，不能覆盖旧包。不要卸载或清库；安装要求和手机清单见 [交付文档](../../../UISimplification053.md)。[浏览器证据单独标明](../browser/README.md)。
