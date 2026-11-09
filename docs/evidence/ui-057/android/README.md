# Android 原生截图

以下为已安装 **0.5.7 / code 18 ARM64 APK** 的 Android 15 模拟器原始截图，不是浏览器预览、设计图或实体手机截图。APK SHA-256 为 `027ad64c8a4dbac4997a703c0a827b30b12e21b1eca2ce357592c52bbbcb2089`，源码 `f705f120f238f0152470d104e268c7f107ad1270`。模拟器通过原生桥运行 ARM64；不能据此推断实体手机性能。

## 无饮食记录的界面

- [首次个人资料](android-first-setup-empty.png)：真实空字段；未写入截图中的私人资料。
- [今日](android-today-empty.png)、[记录](android-diary-empty.png)、[食品库](android-library-empty.png)、[我的](android-mine-empty.png)、[营养详情](android-nutrition-empty.png)。
- [拍一拍两个入口](android-two-entries.png)。
- [餐食拍摄预览](android-camera-meal-original.png)：相机拍摄的是模拟器虚拟场景，仅验证权限、拍照与返回，不是餐食识别效果。

## 可读性与原有功能

- [320dp / 150% 字体](android-320-font150-empty.png)、[同配置输入键盘](android-320-font150-keyboard.png)。输入框在键盘上方；内容允许滚动，主操作与 Dock 不重叠。
- [记录页末尾与手势安全区](android-diary-scroll-end-gesture-safe-area.png)。
- [区间进度](android-range-progress-isolated.png)、[展开营养详情](android-range-detail-expanded-isolated.png)：**隔离测试夹具**，不是用户真实摄入。像素检查分别验证区间下界填充、上界填充与底轨；不以中值冒充精确值。

## 本轮资料与餐食流程（隔离测试数据）

- [系统相册一次选两张](android-health-system-multiselect-2.png)、[多张体检照片](android-profile-two-photos.png)、[单张预览](android-health-photo-preview.png)、[重启后保留](android-health-photos-after-restart.png)。图片为合成测试页；先选两张、追加第一张、删除第二张，因此最后两张缩略图内容相同。此组未配置 API，只显示必要的短提示和设置入口；已授权时隐藏该入口的行为另由共享 UI 与授权测试验证。
- [独立目标草案](android-goal-draft-isolated.png)、[确认应用后](android-goal-applied-isolated.png)。示例 100g 来自测试夹具，**不是默认个人目标**，也不是模型实际推荐。
- [餐食营养直接展示](android-meal-direct-nutrients-isolated.png)、[修改日期时间并确认](android-meal-time-save-isolated.png)、[保存成功](android-meal-saved-isolated.png)。结果来自隔离模拟响应；实际执行营养修改、1 份保存、防重复和后续份量编辑。
- [授权在重启后恢复](android-encrypted-connection-restored-MOCK.png)、[删除连接](android-connection-deleted.png)。无真实密钥或服务商请求。

每张图旁保留同名 XML，来自同次 Android 无障碍树。8 份 `*-session.json` 记录 APK 哈希、用例与设备信息；`native-acceptance.json` 关联云端任务及产物哈希，`screenshots-sha256.json` 登记未编辑截图的哈希。图片和测试营养数据仅存在于一次性模拟器，没有注入正式 App 初始数据。
