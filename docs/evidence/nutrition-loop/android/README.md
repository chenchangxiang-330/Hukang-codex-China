# 真实 Android 验收证据（0.5.2）

这里的 PNG 均来自实际安装 APK 后的 `adb screencap`，没有用浏览器画面替代或修饰截图。环境是隔离 Android API 35 Google APIs 模拟器，x86_64 系统通过 ARM64 转译运行本次 ARM64 包；不是实体手机。字体由系统 `font_scale` 设置，320 / 390 dp 由系统显示密度设置。

APK 与验收源码均为 `3940c6daa284951511d1c8074c044aa5d58c2114`，APK SHA-256 为 `90c0a148842a76861b65941401d5a9e3dc2a40b6e9fd2e7b95b8270c851f15ca`。验收先核对完整 APK 哈希，并拒绝验收源码与 APK 源码之间的运行时代码差异。后续证据文档提交不改变 APK。

[最终验收 41300861910](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41300861910)的六组任务全部通过。完整附件已下载并逐一核对 ZIP 哈希，见 [附件来源](artifact-provenance.json)；各截图目录含原始报告、源码和 PNG 哈希。

## 页面、字号、导航、键盘与饮食记录

[UI 原始报告](ui/session.json)的八项检查全部通过：四项导航与真实空页面；营养展开/收起及所选日期；320 / 390 dp 和系统字体 1.0 / 1.5；手势安全区、Dock 点击范围与滚动到底；三次键盘显示/隐藏；相机拒绝/允许与两个入口拍照返回；原生 HTTPS 网络失败与清除配置；真实 SQLite 饮食及目标保存。

隔离输入的一餐以 600 kcal / 份记录半份，三个页面显示 300 kcal；改为一份后显示 600。另核对已知 0 和未知值、名称/日期/餐次修改、重启保留、取消删除与确认删除、提交标识保留、库存不变和个人目标持久化。全部通过正常 App 界面操作并读取实际 SQLite 验证，未使用演示适配器。

| 场景 | 原始 Android 截图 |
| --- | --- |
| 真实空页面、奶白纸感、天空蓝、玻璃 Dock | [今天](ui/android-today-390-empty.png)、[记录](ui/android-diary-390-empty.png)、[营养详情](ui/android-nutrition-390-empty.png) |
| 四项导航其余页面 | [食品库](ui/android-library-390-empty.png)、[我的](ui/android-mine-390-empty.png) |
| 320 dp / 系统字体 1.5 | [今天](ui/android-today-320-font150-empty.png)、[记录](ui/android-diary-320-font150-empty.png)、[营养详情](ui/android-nutrition-320-font150-empty.png)、[滚动到底](ui/android-nutrition-scroll-end-320-font150.png) |
| 安全区与键盘 | [手势导航](ui/android-today-gesture-safe-area.png)、[记录滚动](ui/android-diary-scroll-end-gesture-safe-area.png)、[键盘输入](ui/android-capture-keyboard.png) |
| 两个拍一拍入口 | [餐食估算](ui/android-capture-meal-empty.png)、[包装食品](ui/android-capture-package-empty.png) |
| 原生相机 | [拒绝权限](ui/android-camera-permission-denied.png)、[模拟器虚拟镜头](ui/android-system-camera-virtual-scene.png)、[餐食拍照后](ui/android-captured-meal-original-photo.png)、[包装拍照后](ui/android-captured-package-original-photo.png) |
| 条码实时预览 | [扫描画面](ui/android-live-barcode-scanner.png)，不代表实体条码实测 |
| 隔离测试的真实记录 | [确认保存](ui/android-isolated-confirmed-diet-save.png)、[大字体首页](ui/android-isolated-today-diet-320-large-font.png)、[编辑后营养](ui/android-isolated-nutrition-diet.png) |
| 原生网络错误与清除 | [失败反馈](ui/android-ai-native-network-failure.png)、[已清除配置](ui/android-ai-cleared.png)，只用非秘密测试字符串与测试域名 |

## 原离线功能与旧数据库

[离线原始报告](offline/session.json)的 14 条流程通过。在 IPv4/IPv6 出站阻断下，执行图片条码解码、草稿重启、真实本机 OCR、旋转裁剪后重新 OCR、五项数值/单位/NRV/基准人工核对、条码命中复用旧食品、分次购买库存及消耗、食品小数修改且证据不变、三类 ZIP 导出与原图哈希保留。

另通过同 APK 的 `install -r` 保留全部表，以及保留旧业务数据构造的隔离 v6 数据库迁移至 v7。此结果不证明旧版跨签名升级。

截图：[人工核对](offline/review.png)、[库存](offline/inventory.png)、[原生个人资料导出面板](offline/actual-personal-with-photos-share-sheet.png)。只打开面板检查，没有向联系人发送。

## 本机照片处理、持久保存和导出

| 场景 | 结果与证据 |
| --- | --- |
| 大 JPEG、EXIF 方向 6 | 18,621,507 字节 / 4000×3000 → 1,774,859 字节 / 1500×2000，去除 EXIF，原图哈希不变。[报告](image-large/session.json)、[预览](image-large/android-02-ai-large-preview.png) |
| 独立饮食照片 | 保存持久副本、哈希一致；无食品库商品时仍能导出包含照片的 ZIP；可移植路径和清单正确；重启删除记录后仅清理自己照片。[真实导出面板](image-large/android-isolated-diet-export-share-sheet.png) |
| 透明 PNG | 输出 1200×800 白底 JPEG / 9,835 字节，清除后缓存删除。[报告](image-transparent/session.json)、[预览](image-transparent/android-03-ai-transparent-preview.png) |
| 不支持的 GIF | 清晰错误、失败缓存清理、选图取消可恢复。[报告](image-gif/session.json)、[反馈](image-gif/android-04-ai-unsupported-feedback.png) |
| 超限原图 | 50,000,001 字节 JPEG 在解码前拒绝，原图保留。[报告](image-oversize/session.json)、[反馈](image-oversize/android-05-ai-oversize-feedback.png) |

四组图片场景各使用全新模拟器：先核对系统图库仅有该测试文件的名称、路径及字节数，再选择唯一照片，不依赖文件排列、不修改图库时间、不删除其他图库内容。图片是隔离的噪声 JPEG、透明 PNG 与异常格式，不代表食物识别效果；这些流程未发送 AI 请求。

## 修复的原生回归

0.5.0 的 [照片复制失败现场](regression/android-050-copy-before-fix.png)与 [原因](regression/photo-copy-regression.json)单独保留：Expo 文件复制是异步操作，现等待完成并核对文件后才提交数据库，延迟与失败回归通过。

0.5.1 的 [饮食照片导出失败现场](regression/android-051-export-before-fix.png)与 [原因](regression/export-path-regression.json)单独保留：原生 ZIP 路径白名单缺少新照片目录，0.5.2 已补齐，并保留目录穿越、扩展名与重复路径限制。[原生单元测试日志](native-unit-tests.txt)及上述最终大图流程均通过。历史失败截图没有作为最终成功截图使用。

## 数据和能力边界

空页面截图在插入测试数据之前采集。带 `isolated` 的画面在全新模拟器中通过正常界面手动录入并写入 SQLite，没有给用户数据库填演示记录。

[浏览器证据](../browser/README.md)使用共享组件、隔离内存存储及模拟服务，另行标明。真实服务商、实体镜头与实物条码、厂商系统、全部相册格式及低内存机型尚未实测。原生解码进行中的点击取消仍需手机复核，已验证的桥接迟到结果清理与系统选图取消不等同于所有解码取消场景。

安装限制、最终包身份和手机步骤见 [Android 交付说明](../../../NutritionLoopAndroidDelivery.md)。原签名不可获得，保留数据覆盖旧版仍受阻；不卸载、清库或改变包名绕过。
