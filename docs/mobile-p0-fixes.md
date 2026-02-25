# Talkio 2.0 — Mobile 优先 P0 修复记录

> 2026/02/25

## 背景与目标

本次改动以 **移动端优先** 为原则，优先保证：

- 移动端聊天主链路可用（创建会话 -> 发送 -> SSE 流式渲染）
- Provider 误配置不再导致“静默失败”
- MCP 从“仅配置 UI”升级为“可连接、可发现 tools、可执行 tools”的最小闭环
- 备份/恢复的范围明确（避免误解）

## 变更摘要

### 1) MCP：连接 + 发现 tools + 执行 tool_calls（最小闭环）

新增文件：

- `web/src/services/mcp/streamable-http-transport.ts`
- `web/src/services/mcp/connection-manager.ts`
- `web/src/services/mcp/index.ts`

接入点：

- `web/src/App.tsx`
  - 在 MCP servers 变化时触发 `refreshMcpConnections()`
  - 自动连接 enabled servers，并拉取 tools 写入 `mcp-store`

- `web/src/stores/chat-store.ts`
  - 发起聊天请求时合并 tools：`内置 tools + MCP tools`
  - 收到 `tool_calls` 后：优先执行内置工具；如果不是内置工具则走 MCP 远程执行

说明：

- MCP 的 tools 发现来自 MCP SDK `client.listTools()`
- 工具执行来自 MCP SDK `client.callTool()`

### 2) Provider 类型一致性（避免移动端误配置）

变更文件：

- `web/src/stores/chat-store.ts`

策略：

- 当前聊天请求实现为 OpenAI-compatible `/chat/completions` SSE
- 当 `provider.type !== "openai"` 时，直接写入一条 `MessageStatus.ERROR` 的 assistant 消息
- 文案明确提示“暂不支持该 provider type，需要用 OpenAI-compatible provider”

### 3) 移动端导出 Markdown 修复

变更文件：

- `web/src/components/mobile/MobileLayout.tsx`

修复点：

- 导出 Markdown 的 `<summary>` 模板中多了一个 `}`，已移除

### 4) 备份范围明确

变更文件：

- `web/src/services/backup.ts`

策略：

- 导出 JSON 新增字段：`scope: "config"`
- 表示当前备份仅包含：
  - `providers`
  - `models`
  - `identities`
  - `mcpServers`
- 不包含 SQLite 中的 `conversations/messages/message_blocks`

## 如何验证（移动端优先）

### A. 移动端 UI（窄屏浏览器模拟）

1. 打开：`http://localhost:1420/`
2. 将窗口缩窄（或使用 DevTools device toolbar）进入移动端布局

### B. MCP 验证

1. 进入：`Discover -> Tools`
2. 添加 MCP server（URL 为你的 MCP endpoint）并启用
3. 观察：
   - 连接状态（connected / error）
   - tools 列表是否出现
4. 在聊天中让模型触发 tool call（前提：所选模型/服务端支持 tools）

### C. Provider 类型一致性验证

1. 在 Settings 配置 provider
2. 若 provider.type 选择非 openai（anthropic/gemini/azure-openai）
3. 进入聊天发送消息，应该直接出现错误消息（而不是长时间无响应）

### D. 备份验证

1. Settings -> Export Backup
2. 打开导出的 JSON
3. 确认存在：
   - `version: "2.0"`
   - `scope: "config"`

## 后续待办（按优先级）

- P0: MCP 页面显示更准确的连接状态与错误原因（例如超时/鉴权/网络）
- P0: Provider 适配实现（真正支持 anthropic/gemini/azure-openai，而不是报错）
- P1: 备份升级为包含 SQLite 聊天记录（导出/导入 conversations/messages/blocks）
- P1: 将 MCP 相关共享逻辑回收至 Layer 1（`src/services/*`）以减少重复实现
