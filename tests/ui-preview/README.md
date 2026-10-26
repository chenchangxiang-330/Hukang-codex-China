# Hukang UI V1：共享 React Native 页面预览

此入口只用于界面测试。它直接渲染生产的 `SimpleAppView`、公共组件和页面，构建时以测试专用 alias 替换原生 controller、SQLite 动作及相机视图。`src/app` 不导入本目录；APK 不使用这些模拟实现。

```sh
npm ci
npm run ui:preview
# http://127.0.0.1:4173/?scenario=empty
npm run ui:test
```

浏览器测试使用系统 `/usr/bin/chromium`；可用 `CHROMIUM_PATH` 指定其它已安装的 Chromium。输出位于 `artifacts/ui-v1/`，包含截图及 `report.json`。

每张截图持续显示“UI 预览 · 模拟数据仅在内存中 · 非设备扫码 / OCR”。场景支持：`empty`、`filled`、`diary`、`library`、`stock`、`mine`、`scan`、`denied`、`package`、`nutrition`、`review`、`product`、`add-stock`、`ai-settings`、`about`、`profile`、`loading`、`error`。

验证范围：

- 真实公共组件、导航、表单、空状态、错误状态和加载状态渲染。
- 实际每日演示的日期隔离、增加/修改/删除及结束清空。
- 实际 AI 设置表单本地校验、密钥遮蔽和离页清除；网络请求观测必须为空。
- 食品搜索、确认状态筛选和清除；对生产采集/人工核对/入库页面的回调操作。
- 390px 与 320px 可见页面的横向溢出检查。
- 放大文字截图使用浏览器文字尺寸近似，不冒充 Android 系统字体缩放验证。

不验证：Android 相机权限、CameraX/ZXing 条码解码、PaddleOCR 推理、SQLite、实际导出/系统分享或设备升级。预览中的相册、保存及库存仅操作内存模拟数据，不能作为业务正确性或原生端验收。真实业务层由现有回归测试保护，设备验证另行记录。

原版 Logo 使用仓库原始资源，未重绘。包装图复用 [中国食品归档测试素材](../fixtures/china-food/README.md) 的 `6923644266066.jpg`（macrofactor / Open Food Facts，CC-BY-SA-3.0）；只用于测试，不导入生产食品库、不发出该来源的网络查询。商品名、品牌、条码场景、库存及营养值均为明确标识的 UI 样例，不代表 OCR 或服务商本轮返回结果。
