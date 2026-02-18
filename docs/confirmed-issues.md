# 经代码验证的确认问题清单

> 基于 `PROJECT_REVIEW.md` 和 `docs/code-review-report.md` 两份审核报告，逐项对照源码验证后，筛选出**确实存在且值得修复**的问题。

---

## P0 - 建议尽快修复 ✅ 已全部完成

### 1. Drizzle Schema 与 Raw SQL 类型不一致 ✅

**文件**: `db/schema.ts` 第 35 行 vs `src/storage/database.ts` 第 35 行

Drizzle schema 定义 `reasoningDuration` 为 `integer`：
```typescript
// db/schema.ts:35
reasoningDuration: integer("reasoningDuration"),
```

但 `initDatabase()` 手动建表时定义为 `REAL`：
```sql
-- src/storage/database.ts:35
reasoningDuration REAL,
```

**影响**: 类型不一致可能导致 Drizzle ORM 推断的 TypeScript 类型与实际 SQLite 存储类型不匹配，这也是 `rowToMessage` 中需要 `(row as any).reasoningDuration` 的根因之一。

**修复方案**: 将 `db/schema.ts` 中的类型改为 `real`，与实际 SQL 保持一致：
```typescript
reasoningDuration: real("reasoningDuration"),
```

---

### 2. `rowToMessage` 中的 `as any` 类型断言 ✅

**文件**: `src/storage/database.ts` 第 92-95 行

```typescript
images: JSON.parse((row as any).images || "[]"),
generatedImages: safeJsonParse((row as any).generatedImages, []),
reasoningDuration: (row as any).reasoningDuration ?? null,
```

**根因**: `images`、`generatedImages`、`reasoningDuration` 字段已存在于 `db/schema.ts` 中，理论上 `$inferSelect` 应该能推断出这些字段。`as any` 可能是历史遗留（字段后来才加入 schema）。修复 P0-1 后应重新检查是否仍需 `as any`，如果 Drizzle 推断正确则直接移除。

---

### 3. 全局 AbortController 管理 ✅

**文件**: `src/stores/chat-store.ts` 第 57-58 行

```typescript
let loadSequence = 0;
let currentAbortController: AbortController | null = null;
```

**问题**:
- 模块级全局变量，组件卸载时不会自动清理
- 只能追踪一个请求，`sendMessage` 和 `regenerateMessage` 共享同一个变量
- 如果用户快速连续操作，旧 controller 会被直接覆盖（虽然 `finally` 块会置空）

**严重程度**: 中等。当前实现在单次对话场景下能正常工作（`isGenerating` 状态会阻止并发发送），但如果未来支持并发请求，这里会成为隐患。

**修复方案**: 至少将 AbortController 作为 store 状态的一部分管理，而非裸全局变量，便于调试和追踪。

---

## P1 - 短期改进

### 4. 缺少单元测试（暂跳过）

**现状**: 项目无任何测试文件，也未配置测试框架。

**建议**: 至少为核心逻辑添加测试：
- `capability-detector.ts` — 纯函数，最容易测试
- `resolveTargetModels()` — 核心路由逻辑
- `rowToMessage()` / `rowToConversation()` — 数据转换

---

### 5. ChatInput 组件体积偏大（暂跳过，结构尚清晰）

**文件**: `src/components/chat/ChatInput.tsx`（333 行）

**建议**: 将语音录制、图片选择、@提及选择器等拆分为独立子组件，提升可维护性。优先级不高，但随着功能增加会越来越难维护。

---

### 6. API 请求重试机制 ✅

**文件**: `src/services/api-client.ts`

**现状**: 所有 API 请求无重试逻辑。网络波动时直接失败。

**建议**: 对非流式请求（`listModels`、`chat`、`transcribeAudio`）添加简单的指数退避重试（2-3 次）。流式请求不建议重试（用户体验不好）。

---

## P2 - 长期改进

### 7. MMKV 加密方案可进一步增强

**现状**: MMKV 使用自生成的 UUID 作为加密密钥，密钥本身存储在另一个**未加密**的 MMKV 实例中（`avatar-keychain`）。

**评估**: 这提供了基本的数据保护（磁盘上的数据是加密的），但加密密钥和加密数据在同一设备上以明文存储，对物理访问攻击的防护有限。如果需要更强的安全性，可考虑使用 iOS Keychain / Android Keystore 存储加密密钥。

---

### 8. 消息搜索使用 LIKE 查询

**文件**: `src/storage/database.ts` 第 219 行

```typescript
.where(like(messages.content, `%${query}%`))
```

**影响**: 大量消息时 `LIKE '%xxx%'` 性能较差，且不支持中文分词。

**建议**: 未来可考虑使用 SQLite FTS5 全文搜索索引。

---

## 两份 Review 文档中的错误声明（无需修复，仅标记）

以下是 review 文档中不正确或有误导的结论，**不应按其建议操作**：

| 文档 | 错误声明 | 实际情况 |
|------|---------|---------|
| `PROJECT_REVIEW.md` | React 19 需降级到 18.x（🔴 高风险） | Expo SDK 54 + RN 0.81 官方支持 React 19，降级会破坏项目 |
| `PROJECT_REVIEW.md` | `@types/react` 需降级到 ~18.3.0 | 与 React 19 匹配，无需降级 |
| `PROJECT_REVIEW.md` | chat-store.ts 行号 33-35 | 实际在第 57-58 行 |
| `PROJECT_REVIEW.md` | database.ts 行号 64-70 | 实际在第 92-95 行 |
| `PROJECT_REVIEW.md` | FlashList 建议添加 `getItemLayout` | FlashList 没有此 API，那是 FlatList 的 |
| `PROJECT_REVIEW.md` | api-client.ts 有"空 catch 块" | 实际 catch 块是有意为之的探测方法和 JSON 容错 |
| `code-review-report.md` | Schema 中 `real("reasoning_duration")` | 实际是 `integer("reasoningDuration")`（camelCase） |
| `code-review-report.md` | Schema 中 `integer("is_streaming")` | 实际是 `integer("isStreaming")`（camelCase） |
| `code-review-report.md` | "建议添加请求取消支持 (AbortController)" | `streamChat()` 已支持 `signal?: AbortSignal` |
| `code-review-report.md` | ChatInput 359 行 | 实际 333 行 |
| `code-review-report.md` | "API Key 加密存储"列为高优先级 | MMKV 已使用加密存储，只是密钥管理可增强 |

---

*验证日期：2026-02-18*
*修复日期：2026-02-19*
