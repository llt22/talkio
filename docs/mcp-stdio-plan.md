# MCP Stdio 支持方案

## 背景

当前 Talkio 仅支持 HTTP 模式的 MCP 服务器，用户需要手动启动 MCP server 并填入 URL。
生态中绝大多数 MCP server（文件系统、GitHub、数据库、浏览器等）都是 **Stdio 模式**，
这也是 Claude Desktop、Cursor、Windsurf 等桌面端连接 MCP 的主要方式。

支持 Stdio = 解锁几乎所有现有的 MCP 工具生态。

## 目标

- 桌面端（Tauri）支持 Stdio 类型的 MCP server
- 用户只需配置 `command`、`args`、`env`，Talkio 自动启动并管理子进程
- 移动端（Android）保持仅 HTTP 模式

## 典型使用场景

| MCP Server | 命令 | 能力 |
|-----------|------|------|
| 文件系统 | `npx -y @modelcontextprotocol/server-filesystem ~/Documents` | AI 读写本地文件 |
| GitHub | `npx -y @modelcontextprotocol/server-github` | AI 操作 GitHub 仓库 |
| SQLite | `npx -y @modelcontextprotocol/server-sqlite ~/data.db` | AI 查询本地数据库 |
| Playwright | `npx -y @playwright/mcp` | AI 控制浏览器 |

## 技术方案

### 1. Tauri 后端（Rust）

需要一个 Tauri Command 来管理 MCP 子进程：

```rust
// src-tauri/src/mcp_stdio.rs

/// 启动 MCP stdio 子进程
/// - spawn 子进程（command + args + env）
/// - 通过 stdin/stdout 进行 JSON-RPC 通信
/// - 返回 session ID 供前端后续调用

#[tauri::command]
async fn mcp_stdio_start(command: String, args: Vec<String>, env: HashMap<String, String>) -> Result<String, String>

/// 向 stdio 子进程发送 JSON-RPC 消息并返回响应
#[tauri::command]
async fn mcp_stdio_send(session_id: String, message: String) -> Result<String, String>

/// 关闭 stdio 子进程
#[tauri::command]
async fn mcp_stdio_stop(session_id: String) -> Result<(), String>
```

关键点：
- 使用 `tokio::process::Command` spawn 子进程
- 用 `Arc<Mutex<HashMap<String, Child>>>` 管理多个 session
- stdin 写入 JSON-RPC 消息（以 `\n` 分隔）
- stdout 读取 JSON-RPC 响应
- 进程生命周期跟随 app，app 退出时清理所有子进程

### 2. 前端 Transport 层

创建 `StdioClientTransport`，实现 MCP SDK 的 `Transport` 接口：

```typescript
// src/services/mcp/stdio-transport.ts

import { invoke } from "@tauri-apps/api/core";

export class TauriStdioTransport implements Transport {
  private sessionId: string | null = null;

  constructor(private command: string, private args: string[], private env?: Record<string, string>) {}

  async start() {
    this.sessionId = await invoke("mcp_stdio_start", {
      command: this.command,
      args: this.args,
      env: this.env ?? {},
    });
  }

  async send(message: JSONRPCMessage) {
    const response = await invoke("mcp_stdio_send", {
      sessionId: this.sessionId,
      message: JSON.stringify(message),
    });
    // parse response and call this.onmessage
  }

  async close() {
    if (this.sessionId) {
      await invoke("mcp_stdio_stop", { sessionId: this.sessionId });
    }
  }
}
```

### 3. 连接管理器扩展

修改 `connection-manager.ts`，根据 server 类型选择 Transport：

```typescript
private async connect(conn: ManagedConnection): Promise<void> {
  let transport: Transport;

  if (conn.server.type === "stdio") {
    transport = new TauriStdioTransport(
      conn.server.command!,
      conn.server.args ?? [],
      conn.server.env,
    );
  } else {
    transport = new StreamableHTTPClientTransport(conn.server.url, {
      requestInit: buildRequestInit(conn.server.customHeaders),
    });
  }

  const client = new Client({ name: "talkio-web", version: "2.0.0" }, { capabilities: {} });
  await client.connect(transport);
  // ...
}
```

### 4. 数据模型扩展

```typescript
// types/index.ts — McpServer 增加字段
export interface McpServer {
  id: string;
  name: string;
  type: "http" | "stdio";     // 新增
  // HTTP 模式
  url: string;
  customHeaders?: CustomHeader[];
  // Stdio 模式（桌面端）
  command?: string;            // 新增
  args?: string[];             // 新增
  env?: Record<string, string>; // 新增
  enabled: boolean;
  disabledTools?: string[];
  lastToolCount?: number;
}
```

### 5. UI 改动

MCP 设置页面增加 server 类型选择：
- **HTTP**：现有的 URL + Headers 表单
- **Stdio**：Command + Args + Env 表单（仅桌面端显示）

## 参考

- LobeChat MCP Client: `lobe-chat/src/libs/mcp/client.ts`
- LobeChat MCP Types: `lobe-chat/src/libs/mcp/types.ts`
- MCP SDK Stdio Transport: `@modelcontextprotocol/sdk/client/stdio.js`
- Tauri Command API: https://v2.tauri.app/develop/calling-rust/

## LobeChat vs Talkio MCP 对比

### LobeChat 有而 Talkio 缺少的
- Stdio 传输（本地命令行 MCP server）
- OAuth 2.1 认证
- MCP Resources / Prompts 支持
- 预检命令（preCheckStdioCommand）
- 结构化错误类型（MCPError + errorCode）
- 工具调用超时控制（MCP_TOOL_TIMEOUT）

### Talkio 的优势
- 自定义 StreamableHTTP Transport（Tauri native fetch 绕过 CORS）
- 带 TTL 缓存的连接池
- 按 Identity 过滤工具（mcpServerIds + mcpToolIds）
- 禁用特定工具（disabledTools）
- 内置工具 + MCP 工具统一调用链

## 优先级

1. **P0**: Stdio 基础支持（Rust 后端 + Transport + UI）
2. **P1**: 结构化错误处理
3. **P1**: 工具调用超时控制
4. **P2**: OAuth 认证
5. **P3**: Resources / Prompts 支持
