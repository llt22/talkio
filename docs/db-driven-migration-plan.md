# Talkio DB 驱动架构迁移计划

> 参考 cherry-studio-app 的最佳实践，将 talkio 从 zustand 内存驱动迁移到 DB 驱动架构

## 当前架构 vs 目标架构

### 当前架构（zustand 内存驱动）

```
用户发送消息 → chat-service.ts
  → insertMessage(DB) + setState({ messages: [...] })  // 双写
  → streaming: flushUI → setState({ streamingMessage })  // 只在内存
  → 结束: dbUpdateMessage(DB) + setState({ messages, streamingMessage: null })  // 双写
```

**问题：**
- 双 truth（zustand + SQLite），需手动同步
- streamingMessage 在内存中，崩溃丢失
- 整条消息作为一个对象更新，无法细粒度渲染
- 需要手动管理 streaming→settled 过渡

### 目标架构（DB 驱动）

```
用户发送消息 → chat-service.ts
  → db.insert(message) + db.insert(placeholderBlock)
  → streaming: throttledBlockUpdate(DB)  // 只写 DB
  → 结束: db.update(block.status = SUCCESS)
  → UI: useLiveQuery 自动响应所有 DB 变化
```

**优势：**
- 单一 truth（SQLite）
- 崩溃恢复
- Block 级别细粒度更新
- 无 streaming→settled 过渡
- 多组件自动共享数据

## 关键差异对照

| 组件 | talkio 当前 | cherry-studio-app | 迁移目标 |
|------|------------|-------------------|----------|
| 状态管理 | zustand store | Redux + useLiveQuery | zustand（保留）+ useLiveQuery |
| 消息读取 | `useChatStore(s => s.messages)` | `useLiveQuery(messagesQuery)` | `useLiveQuery` |
| 消息写入 | `setState + db.insert` | `db.insert`（只写 DB） | 只写 DB |
| Streaming | `setState({ streamingMessage })` | `db.update(block.content)` | `db.update(message.content)` |
| 消息模型 | 扁平 Message（content/reasoning/tools 都在一个对象） | Message + MessageBlock[] | 先保持扁平，后续可拆 Block |
| DB 库 | drizzle-orm/expo-sqlite | drizzle-orm/expo-sqlite | 相同（已有） |

## 分阶段迁移计划

### 阶段 0：准备工作（风险最低）

**目标：** 启用 `useLiveQuery` 的前提条件

1. **启用 SQLite change listener**
   - 当前：`db/index.ts` 没有 `enableChangeListener`
   - 目标：`SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true })`
   - 这是 `useLiveQuery` 工作的前提

2. **验证 drizzle-orm 版本支持 `useLiveQuery`**
   - 检查 `package.json` 中 `drizzle-orm` 版本
   - `useLiveQuery` 需要 `drizzle-orm/expo-sqlite` 导出

**改动范围：** 1 个文件（`db/index.ts`），零功能变化

---

### 阶段 1：消息读取迁移（中等风险）

**目标：** 用 `useLiveQuery` 替代 zustand 的消息读取

1. **创建 `useMessages` hook**
   ```typescript
   // src/hooks/useMessages.ts
   import { useLiveQuery } from "drizzle-orm/expo-sqlite";
   
   export function useMessages(conversationId: string, branchId?: string | null) {
     const query = db
       .select()
       .from(messages)
       .where(and(
         eq(messages.conversationId, conversationId),
         branchId ? eq(messages.branchId, branchId) : isNull(messages.branchId)
       ))
       .orderBy(asc(messages.createdAt));
     
     const { data: rawMessages } = useLiveQuery(query, [conversationId, branchId]);
     
     return useMemo(() => 
       rawMessages?.map(rowToMessage) ?? [],
       [rawMessages]
     );
   }
   ```

2. **修改 `[id].tsx`**
   - 替换 `useChatStore(s => s.messages)` → `useMessages(id, activeBranchId)`
   - 删除 `loadMessages`、`loadMoreMessages` 的手动调用
   - `useLiveQuery` 自动响应 DB 变化，不需要手动加载

3. **保留 zustand 用于非消息状态**
   - `isGenerating`、`currentConversationId`、`_abortController` 等仍用 zustand
   - 消息相关的 zustand state（`messages`、`streamingMessage`、`hasMoreMessages`）逐步废弃

**改动范围：** 新增 1 个 hook，修改 `[id].tsx`、`chat-store.ts`

**回滚策略：** 保留旧的 zustand 消息读取代码（注释掉），随时可切回

---

### 阶段 2：Streaming 写入迁移（高风险，核心改动）

**目标：** streaming 内容直接写 DB，不再用 `streamingMessage` 内存状态

1. **修改 `chat-service.ts` 的 `generateResponse`**
   
   当前流程：
   ```
   创建 assistantMsg → setState({ streamingMessage: assistantMsg })
   每次 chunk → 累积 content → flushUI → setState({ streamingMessage: updated })
   结束 → dbUpdateMessage → setState({ messages: [..., finalMsg], streamingMessage: null })
   ```
   
   目标流程：
   ```
   创建 assistantMsg → db.insert(assistantMsg, { isStreaming: true })
   每次 chunk → 累积 content → throttled db.update(content)  // useLiveQuery 自动触发 UI
   结束 → db.update({ isStreaming: false, content: finalContent })
   ```

2. **节流策略**
   - 保持 ~120ms 的 DB 写入节流（与当前 flushUI 一致）
   - `useLiveQuery` 会在每次 DB 变化后自动触发 re-render
   - 不需要 MessageBubble 的二次节流（已删除）

3. **废弃 `streamingMessage` 状态**
   - `useLiveQuery` 返回的消息列表已包含 streaming 消息
   - streaming 消息通过 `isStreaming: true` 标识
   - 不再需要 `useMemo` 合并 streaming 到 data 数组

**改动范围：** `chat-service.ts`（核心）、`chat-store.ts`（删除 streamingMessage）、`[id].tsx`（简化）

**风险点：**
- DB 写入频率（120ms）是否会导致性能问题？
  - cherry-studio-app 验证了这个频率是可行的
  - SQLite WAL 模式下写入性能很好
- `useLiveQuery` 的响应延迟？
  - expo-sqlite 的 change listener 是同步的，延迟极小

---

### 阶段 3：消息写入迁移（中等风险）

**目标：** 所有消息写入只走 DB，zustand 不再存储消息

1. **修改 `sendMessage`**
   ```
   当前：db.insert + setState({ messages: [..., userMsg] })
   目标：db.insert（useLiveQuery 自动更新 UI）
   ```

2. **修改 `deleteMessageById`**
   ```
   当前：db.delete + setState({ messages: filtered })
   目标：db.delete（useLiveQuery 自动更新 UI）
   ```

3. **修改 `clearConversationMessages`**
   ```
   当前：db.clear + setState({ messages: [] })
   目标：db.clear（useLiveQuery 自动更新 UI）
   ```

4. **修改 `regenerateMessage`、`branchFromMessage`、`switchBranch`**
   - 同样模式：只写 DB，UI 自动响应

5. **清理 `chat-store.ts`**
   - 删除 `messages: Message[]` 状态
   - 删除 `streamingMessage: Message | null` 状态
   - 删除 `hasMoreMessages`、`isLoadingMore` 状态
   - 删除 `loadMessages`、`loadMoreMessages`、`commitStreamingMessage`
   - 保留：`conversations`、`currentConversationId`、`isGenerating`、`_abortController`

**改动范围：** `chat-store.ts`（大幅精简）、`chat-service.ts`

---

### 阶段 4：会话列表迁移（低风险）

**目标：** 会话列表也用 `useLiveQuery`

1. **创建 `useConversations` hook**
   ```typescript
   export function useConversations() {
     const query = db
       .select()
       .from(conversations)
       .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
     
     const { data } = useLiveQuery(query);
     return useMemo(() => data?.map(rowToConversation) ?? [], [data]);
   }
   ```

2. **修改会话列表页面**
   - 替换 `useChatStore(s => s.conversations)` → `useConversations()`

3. **清理 `chat-store.ts`**
   - 删除 `conversations: Conversation[]` 状态
   - 删除 `loadConversations`

**改动范围：** 新增 1 个 hook，修改会话列表页面、`chat-store.ts`

---

### 阶段 5（可选）：Block 模型拆分

**目标：** 将消息内容拆分为独立的 Block，实现细粒度更新

这是 cherry-studio-app 的完整架构，但对 talkio 来说是可选的：
- 如果不拆 Block，streaming 时每次更新整条消息的 content 字段
- 如果拆 Block，可以独立更新 thinking/text/tool/image 各部分

**建议：** 先完成阶段 0-4，观察性能。如果 markdown 渲染仍是瓶颈，再考虑 Block 拆分。

## 实施顺序建议

```
阶段 0（准备）→ 阶段 1（读取）→ 阶段 3（写入）→ 阶段 2（streaming）→ 阶段 4（会话）
```

注意：建议先做阶段 3（普通写入）再做阶段 2（streaming），因为普通写入更简单，可以先验证 `useLiveQuery` 的可靠性。

## 预估工作量

| 阶段 | 工作量 | 风险 | 可独立发布 |
|------|--------|------|-----------|
| 阶段 0 | 0.5h | 极低 | ✅ |
| 阶段 1 | 2-3h | 中 | ✅ |
| 阶段 3 | 2-3h | 中 | ✅（依赖阶段 1） |
| 阶段 2 | 4-6h | 高 | ✅（依赖阶段 1） |
| 阶段 4 | 1-2h | 低 | ✅ |
| 阶段 5 | 8-12h | 高 | ✅（独立） |
| **总计** | **~18-27h** | | |

## 注意事项

1. **分页加载**：`useLiveQuery` 默认加载全部数据。对于长对话，需要考虑虚拟化或分页。LegendList 已经做了虚拟化，所以 DB 返回全部消息、LegendList 只渲染可见部分，这是可行的。

2. **WAL 模式**：确保 SQLite 使用 WAL 模式以支持并发读写。当前代码没有显式设置，建议添加 `PRAGMA journal_mode = WAL`。

3. **向后兼容**：每个阶段都应该可以独立发布和回滚。保留旧代码（注释）直到新方案稳定。

4. **测试重点**：
   - streaming 过程中的滚动平滑度
   - 长对话（1000+ 消息）的性能
   - 快速切换会话时的数据一致性
   - app 后台/前台切换时的状态恢复
