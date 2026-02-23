## What's New

### 🔧 MCP 架构重构
- 连接管理器（connection-manager）新增工具缓存 TTL（5 分钟自动刷新）、连接状态查询、错误分类
- 合并 mcp-client.ts 冗余代码（250→121 行），远程工具执行统一委托给 connection-manager
- 新增工具粒度控制：McpServer 支持 `disabledTools` 字段，可按工具名禁用特定工具

### 🔌 MCP 连接验证体验优化
- **Switch 开启即验证**：列表页开启 MCP 服务器时自动测试连接，成功才启用，失败保持关闭
- **保存即测试**：添加/编辑服务器保存后自动验证连接，弹窗显示工具列表或错误信息
- **JSON 导入默认关闭**：导入的服务器默认 `enabled: false`，需手动开启验证连接
- **工具数量显示**：验证成功后列表页显示 `N tools`，一目了然
- **不再自动禁用**：连接失败不会自动关闭服务器，由用户自行决定

### 🛠️ 内置工具精简
移除 6 个低频内置工具（设备信息、定位、打开链接、亮度调节、分享文本、天气查询），保留 3 个核心工具：
- `get_current_time` — 获取当前时间
- `read_clipboard` — 读取剪贴板
- `create_reminder` — 创建提醒

同步卸载 5 个不再使用的 Expo 依赖（expo-battery、expo-network、expo-location、expo-linking、expo-brightness）。

### 🤖 工具调用稳定性修复
- 修复多轮工具调用后对话中断的问题：AI SDK `stepCountIs` 从 3 提升至 20（默认值），确保模型有足够步数完成搜索等复杂工具调用并生成最终回复
- 修复无 Identity 时工具不可用的问题：无角色绑定时 fallback 到全局工具 + 全局启用的 MCP 服务器

### 🎨 UI 改进
- 工具调用卡片样式统一：与"思考过程"区块保持一致的背景、圆角、图标风格
- 验证中 Switch 替换为 loading 转圈，防止重复操作

---

**Full Changelog**: https://github.com/llt22/talkio/compare/v0.3.0...v0.4.0
