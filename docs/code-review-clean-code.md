# Talkio 2.0 Web 代码 Review — Clean Code / KISS 分析报告

> 2026/02/25 Review

已审查 `web/src/` 下全部 38 个业务文件，结合 `docs/design-system.md` 和 `docs/tauri-migration-plan.md` 中的设计原则进行分析。

---

## 🔴 高优先级（5 项）

### 1. `generateId()` 重复定义 4 次

**位置**：
- `stores/chat-store.ts:27`
- `stores/provider-store.ts:9`
- `stores/identity-store.ts:25`
- `stores/mcp-store.ts:10`
- `pages/settings/ModelsPage.tsx:28`

**问题**：同一函数 `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)` 复制粘贴了 5 次。

**建议**：提取到 `web/src/lib/utils.ts` 或 `src/utils/`，单一来源。

---

### 2. Avatar 颜色 / Initials 计算逻辑重复 4 次

**位置**：
- `components/shared/ChatView.tsx:229-234`（AI 消息头像）
- `components/mobile/MobileLayout.tsx:616-621`（对话列表项）
- `pages/settings/ModelsPage.tsx:138-143`（模型列表）
- `components/desktop/DesktopLayout.tsx:455`（群聊参与者 initials）

**问题**：`AVATAR_COLORS` 数组 + hash 计算 + initials 解析逻辑完全相同，分散在 4 个文件中。

**建议**：提取为工具函数：
```ts
// lib/avatar.ts
function getAvatarProps(name: string): { color: string; initials: string }
```

---

### 3. `chat-store.ts` 的 `sendMessage` 是 ~500 行巨型函数

**位置**：`stores/chat-store.ts:106-597`

**问题**：
- 违反单一职责原则（SRP）
- 内嵌 4 个子函数：`resolveTargetParticipants`、`buildGroupRoster`、`buildApiMessagesForParticipant`、`generateForParticipant`
- SSE 流解析 + rAF flush 代码几乎**复制粘贴了两遍**（主 SSE: line 366-420，tool response SSE: line 507-535）
- 难以单元测试

**建议**：
- 提取 `parseSSEStream(reader, callbacks)` 通用函数，消除两份 SSE 解析代码
- 提取 `buildApiMessages()` 到 `services/chat-api.ts`
- `generateForParticipant()` 拆为独立函数

---

### 4. `provider-store.ts` 中 Model 归一化逻辑重复

**位置**：
- `stores/provider-store.ts:52-76`（`loadInitial()`）
- `stores/provider-store.ts:189-213`（`loadFromStorage()`）

**问题**：两处的 Model 归一化映射代码完全相同（legacy caps 处理、默认值填充）。

**建议**：提取 `normalizeModel(raw: any): Model` 函数，两处复用。

---

### 5. Export (Markdown 导出) 逻辑重复

**位置**：
- `components/desktop/DesktopLayout.tsx:371-394`（`handleExport`）
- `components/mobile/MobileLayout.tsx:212-237`（`handleExport`）

**问题**：几乎一模一样的 Markdown 生成 + Blob 下载逻辑。

**建议**：提取为 `services/export.ts`：
```ts
function exportConversationAsMarkdown(conv: Conversation, messages: Message[], t: TFunction): void
```

---

## 🟡 中优先级（6 项）

### 6. `headersForProvider()` 构建逻辑分散重复

**位置**：
- `stores/chat-store.ts:240-251`
- `stores/provider-store.ts:221-228`
- `stores/provider-store.ts:301-309`

**建议**：提取为 `buildProviderHeaders(provider: Provider): Record<string, string>`。

---

### 7. `DesktopChatPanel` 与 `MobileChatDetail` 大量重复（~70%）

**位置**：
- `components/desktop/DesktopLayout.tsx:334-519`
- `components/mobile/MobileLayout.tsx:122-401`

**重复内容**：
- 8 个相同的 `useChatStore` selector
- 5 个相同的 state（showIdentityPanel, showParticipants, showModelPicker, modelPickerMode, isExporting）
- 相同的 `handleModelPickerSelect` callback
- 相同的 identity panel 渲染逻辑

这违反了 `design-system.md` 第五节的原则：**"调用方不关心平台，组件内部自动适配"**。

**建议**：
- 提取 `useChatPanelState(conversationId)` custom hook
- 共享 `IdentityPanel` 组件

---

### 8. `useDatabase.ts` DB 变更广播效率问题

**位置**：`hooks/useDatabase.ts:15-17`

**问题**：`notifyDbChange()` 触发所有 listener 重新查询，无论数据是否相关。消息多了以后性能瓶颈。

**建议**：加入 channel 机制：
```ts
notifyDbChange("conversations")
notifyDbChange("messages", convId)
```

---

### 9. `database.ts` In-Memory fallback 手写 SQL 解析器过于复杂

**位置**：`storage/database.ts:26-157`（130+ 行）

**问题**：正则匹配 WHERE/SET/ORDER/LIMIT 的手写 SQL 解析器，仅用于 dev 浏览器预览。不是 KISS。

**建议**：考虑用 `sql.js`（SQLite WASM）替代，减少维护负担。

---

### 10. 图标库混用：Lucide + react-icons/io5

**现状**：
- Desktop 组件 → `lucide-react`
- Mobile 组件 → `react-icons/io5`
- Shared 组件 → 两者都有

`tauri-migration-plan.md` 技术选型明确指定图标库为 **Lucide React**。

**建议**：统一为 Lucide，移除 `react-icons` 依赖。

---

### 11. 硬编码颜色值未遵循设计令牌

**示例**：
- `ChatView.tsx:220` — `color="#ef4444"`
- `ChatInput.tsx:150` — `color="#6b7280"`, `"#8E8E93"`
- `MermaidRenderer.tsx:46` — `bg-red-50`, `text-red-600`
- `HtmlPreview.tsx:94` — `text-gray-900`
- `SettingsPage.tsx:48` — `active:bg-black/5`

`design-system.md` 定义了 `--color-error`、`--color-text-secondary` 等变量。

**建议**：用 CSS 变量替代，保持主题一致性和暗色模式兼容。

---

## 🟢 低优先级（5 项）

### 12. `talkio-tauri.code-workspace` 误放在组件目录

**位置**：`web/src/components/desktop/talkio-tauri.code-workspace`

IDE 配置文件不应在 `src/components/` 下。应移到项目根目录或加入 `.gitignore`。

---

### 13. `confirm()` 原生弹窗不符合设计规范

**位置**：多处使用浏览器原生 `confirm()`

`design-system.md` 第四节要求使用统一的 `ConfirmDialog` 组件，不是原生弹窗。

---

### 14. Vision probe 逻辑有误

**位置**：`stores/provider-store.ts:325`

```ts
caps.vision = visionRes.ok || visionRes.status === 400;
```

400 = Bad Request 不应被视为"支持 vision"。400 可能是其他原因（API key 无效、参数格式错误等）。

---

### 15. `regenerateMessage` 存在 bug

**位置**：`stores/chat-store.ts:607-626`

删除旧 assistant 消息后调用 `sendMessage(prevUserMsg.content)`，但 `sendMessage` 会创建**新的 user message**，导致用户消息重复。应只重新生成 assistant 回复。

---

### 16. `MobileLayout.tsx` 模块级可变变量

**位置**：`components/mobile/MobileLayout.tsx:70`

```ts
let _lastActiveTab: MobileTab = "chats";
```

模块级可变变量在 HMR 时不会重置，且在 SSR 场景共享状态。可用 `sessionStorage` 或 zustand 替代。

---

## ✅ 做得好的地方

- **三层架构**清晰（`src/types` → `shared/` → `desktop/` + `mobile/`），和文档一致
- **rAF 节流**流式渲染（POC 验证过的优化保留了）
- **Mermaid / HTML 延迟渲染**策略正确
- **zustand** store 设计合理，selector 粒度适当
- **TypeScript 类型**从 `src/types` 共享，Layer 1 架构落地
- **kv-store.ts** 极简且有 prefix 隔离
- **MCP 服务**代码干净，连接管理和 tool 发现逻辑清晰
- **备份 / 恢复**功能简洁完整

---

## 汇总

| 类别 | 数量 | 核心问题 |
|------|------|---------|
| 🔴 高优 | 5 | 重复代码（generateId×5, avatar×4, export×2, model归一化×2）、巨型函数 |
| 🟡 中优 | 6 | Desktop/Mobile 重复逻辑、图标库混用、硬编码颜色、DB 广播效率 |
| 🟢 低优 | 5 | confirm()、probe bug、regenerate bug、杂项 |

**最大 KISS 违反**：大量复制粘贴，尤其 Desktop/Mobile 之间。与 design-system.md "组件内部自动适配" 原则矛盾。

**最大 Clean Code 违反**：`chat-store.ts` 的 `sendMessage` ~500 行，SSE 解析逻辑复制粘贴两遍。

---

*文档生成: 2026/02/25*
