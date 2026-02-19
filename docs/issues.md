# 待修复问题清单

> 更新日期：2026-02-18

---

## P0 - 已修复

| 问题 | 文件 | 修复方式 |
|------|------|----------|
| HtmlPreview 动态测高导致列表滚动跳顶 | `HtmlPreview.tsx` | 移除 MutationObserver，固定高度 400px |
| HtmlPreview 预览加载慢（2秒等待） | `HtmlPreview.tsx` | codeStable 等待缩短至 500ms；手动切 tab 跳过占位态 |
| WebView 始终挂载浪费资源 | `HtmlPreview.tsx` | 改为条件渲染（懒加载） |

---

## P1 - 待修复（真实问题）

### 1. 进入对话页面卡顿（问题 A）

- **位置**：`app/chat/[id].tsx` 第 64-73 行
- **根因**：`InteractionManager.runAfterInteractions` 延迟数据加载，用户感知白屏
- **方案**：移除 `InteractionManager`，立即调用 `setCurrentConversation(id)`
- **注意**：返回时 `setCurrentConversation(null)` 需要延迟执行（避免阻塞导航动画），但要加 ID 守卫防止竞态：
  ```ts
  return () => {
    const myId = id;
    setTimeout(() => {
      if (useChatStore.getState().currentConversationId === myId) {
        setCurrentConversation(null);
      }
    }, 100);
  };
  ```

### 2. `rowToMessage` 中使用 `any` 类型

- **位置**：`src/storage/database.ts` 第 83-99 行
- **根因**：`(row as any).images`、`(row as any).generatedImages`、`(row as any).reasoningDuration`
- **方案**：定义 `MessageRow` 接口替换 `any`，使用 `safeJsonParse` 统一处理 JSON 字段

### 3. 全局 AbortController 竞态风险

- **位置**：`src/stores/chat-store.ts` 第 33-35 行
- **根因**：`currentAbortController` 是全局单例，多个并发请求会互相覆盖
- **方案**：改为 `Map<requestId, AbortController>` 管理，或至少在新请求前 abort 旧的

---

## P2 - 长期改进（低优先级）

| 问题 | 位置 | 建议 |
|------|------|------|
| `ChatInput.tsx` 组件过大（359 行） | `ChatInput.tsx` | 拆分语音、图片、@提及为子组件 |
| 缺少错误边界 | `app/_layout.tsx` | 添加 `ErrorBoundary` 防止白屏崩溃 |
| 缺少单元测试 | 全局 | 核心逻辑（chat-service、api-client）添加测试 |
| 消息分页加载 | `chat-store.ts` + `database.ts` | 取最新 N 条 + 上拉加载更多 |

---

## 已排除（不需要修复）

| 建议 | 排除原因 |
|------|----------|
| 降级 React 19 → 18 | 项目已稳定运行，React 19 + Expo 54 官方支持 |
| 证书固定（Certificate Pinning） | 过度安全措施，增加维护成本 |
| API Key 改用 SecureStore | MMKV 加密存储已足够，SecureStore 有性能开销 |
| 添加 E2E 测试（Detox/Maestro） | 当前阶段优先级低 |
| 性能监控（Sentry） | 当前阶段优先级低 |
