# 浏览器证据：隔离的模拟服务和 UI 测试

来源：UI 与业务源码 `3940c6daa284951511d1c8074c044aa5d58c2114`，CI 检查 [41299814392](https://github.com/chenchangxiang-330/Hukang-codex-China/actions/runs/41299814392)。

以下是共享 React Native 页面在 Chrome 中渲染的浏览器截图，**不是 Android 截图，也不是真实服务商实测**。

- `browser-confirmed-meal-nutrition.png`：模拟模型回复，经人工确认、份量调整后显示同一份营养汇总。浏览器存储为隔离内存适配器；真正 SQLite 另由 Node 与 Android 验收验证。
- `browser-package-candidate-mock.png`：包装候选来自模拟服务；人工修改与 AI 原始候选分离，确认仅用于食品库查找，不生成条码或营养。
- `browser-ai-settings-320.png`：320px 页面和遮盖的密钥输入。只使用明确的非秘密测试字符串，没有真实 API Key。
- `report.json`：7 组验证 / 10 次受控模型请求，无浏览器错误；不执行真实拍照、解码、OCR 或云端模型请求。

图片处理在浏览器边界使用测试替身。大图、方向、透明像素、元数据和本机文件生命周期必须以 Android 验收结果为准。

本组与最终 0.5.2 原生 APK 使用相同源码。完整浏览器验收附件 SHA-256：`1323e2f5e0c397da04856c2a9da15ae4966914df6af3d6941aeb98d6b7199946`，下载后已验证。
