# 0.5.8 Android 原生验收

这些图片来自安装了 0.5.8 / code 19 ARM64 APK 的 Android 15 模拟器，不是 HTML 原型或实体手机截图。所有成功用例使用同一 APK，文件指纹与测试提交见 [native-acceptance.json](native-acceptance.json)。截图未编辑，哈希见 [screenshots-sha256.json](screenshots-sha256.json)。

- [空白首页](android-today-empty.png)：五项真实空数据，左侧为明确标注的生活配图。
- [320dp / 150% 字体](android-320-font150-empty.png)、[键盘](android-320-font150-keyboard.png)。
- [估算中值](android-range-progress-isolated.png)、[原范围详情](android-range-detail-expanded-isolated.png)、[摄入存在但未设目标](android-known-intake-no-target-isolated.png)。
- [等于上限](android-target-equal-isolated.png)、[超过上限](android-target-above-isolated.png)：五项进度像素均核验，数据仅来自隔离测试夹具。
- [拍一拍两个入口](android-two-entries.png)、[虚拟相机照片](android-camera-meal-original.png)。相机只验证模拟器权限与拍照往返。
- [餐食结果](android-meal-direct-nutrients-isolated.png)、[时间与保存](android-meal-time-save-isolated.png)、[保存完成](android-meal-saved-isolated.png)。营养数据来自明确的模拟响应，不是服务商实际识别效果。

各 `*-session.json` 保留原始通过报告。食品、库存、个人资料与体检图片均为测试数据，不写入安装包初始数据库。API 授权使用模拟连接；真实服务、实体镜头、具体手机安装和分享仍需手机验证。

完整原始报告、截图、XML、日志和测试数据库另存项目 `交付/Hukang-0.5.8/验收原始记录/`；这里选取常用截图。首轮失败现场保存在上级 `initial-failures/`，后续修复没有降低保存、防重复或输入可见性断言。

- [资料自动保存](android-profile-autosaved.png)、[多图保留](android-health-photos-after-restart.png)、[目标草案](android-goal-draft-isolated.png)、[确认应用](android-goal-applied-isolated.png)。
- [独立库存](android-offline-inventory.png)、[库存扣减](android-offline-inventory-reduced.png)、[个人导出分享面板](android-offline-actual-personal-with-photos-share-sheet.png)。系统分享面板打开不代表已发送到某个接收方。
