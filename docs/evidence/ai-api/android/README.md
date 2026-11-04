# 0.4.1 实际 Android 验收证据

这组截图来自实际安装 `58e8070` APK 的 Android 15 / API 35 模拟器，未经编辑。UI 组正式饮食数据为空；离线组在独立临时设备通过原有流程录入测试食品，不是用户手机资料。浏览器模拟 API 截图在 [另一个目录](../browser/)。

| 画面 | 原始 Android 截图 |
| --- | --- |
| 今天、玻璃 Dock | [今天](ui/android-today-390-empty.png) |
| 记录、营养详情 | [记录](ui/android-diary-390-empty.png) · [营养详情](ui/android-nutrition-390-empty.png) |
| 320dp / 字号 1.5 | [今天](ui/android-today-320-font150-empty.png) · [记录](ui/android-diary-320-font150-empty.png) · [详情](ui/android-nutrition-320-font150-empty.png) |
| AI 设置、密钥遮盖 | [设置页中部](ui/android-ai-native-network-failure.png)（完整网络错误文本见同名 XML，页面可继续下滚） |
| 清除配置 | [清除反馈](ui/android-ai-cleared.png) · [旧配置停止使用](ui/android-ai-clear-prevents-meal-call.png) |
| 键盘、相机 | [描述输入](ui/android-capture-keyboard.png) · [权限拒绝](ui/android-camera-permission-denied.png) · [餐食相机](ui/android-captured-meal-original-photo.png) · [包装相机](ui/android-captured-package-original-photo.png) |
| 实际断网业务 | [人工核对](offline/review.png) · [库存](offline/inventory.png) · [编辑食品](offline/edited-product.png) · [真实 ZIP 系统分享](offline/actual-personal-with-photos-share-sheet.png) |

[UI 结果与来源](ui/session.json) · [UI 文件哈希](ui/source.json) · [离线结果](offline/session.json) · [离线文件及导出校验](offline/source.json)。

AI 原生测试只验证网络模块、失败反馈和清除配置；未使用真实服务商密钥，不代表已完成真实模型文字或图片实测。没有将浏览器模拟响应放入 Android 正式饮食记录。

[APK、签名与安装说明](../../../AI-API-AndroidDelivery.md)。构建时发现的 Expo 模块版本信息缺失已在 `58e8070` 修复；只有成功构建 41214772131 的 APK 用于这次验收。
