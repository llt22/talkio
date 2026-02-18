# 聊天性能 — 未解决的问题

> 更新：2026-02-18

---

## 🔴 问题 A：进入对话页面卡顿（Release 版也存在）

**现象**：从对话列表点击进入对话时有明显卡顿，消息越多越明显，20 条以内也能感知。

**文件**：`app/chat/[id].tsx`、`src/stores/chat-store.ts`

**已尝试**：
- `InteractionManager.runAfterInteractions` 延迟加载（已提交，效果不明显）

**可能根因**：
1. `LegendList` 首屏渲染时每条助手消息触发 `MarkdownRenderer` 完整 AST 解析
2. `rowToMessage` 每条消息 4 次 `JSON.parse`
3. `LegendList` 的 `recycleItems` + `maintainScrollAtEnd` 布局计算量大

**排查建议**：
- React DevTools Profiler 定位耗时组件
- 消息分页加载（初始只加载最近 N 条）
- `MarkdownRenderer` 懒渲染（进入视口才解析）

---

## 🔴 问题 B：点击 WebView 预览区域后列表滚动到顶部

**现象**：触摸 HtmlPreview 的 WebView 预览内容区域，消息列表突然滚动到顶部。
（补充：仅首次出现，比如第一次代码写完后首次点击、或从列表重新进入该会话后的首次点击；后续点击不再复现）

**文件**：`src/components/common/HtmlPreview.tsx`、`app/chat/[id].tsx`

**根因推断（更精确）**：
1. HtmlPreview 首次从占位态切换到 WebView 时，WebView 的内容高度/布局会在短时间内多次 settle。
2. 若组件同时存在“动态测高 -> setState 改变 item 高度”的链路，LegendList 在 `recycleItems`/`maintainScrollAtEnd` 组合下更容易出现滚动位置被重算/重置。
3. 由于这是“首次 mount + 首次高度稳定”阶段的问题，因此呈现为“只在首次点击/首次进入时出现”。

**修复动作（2026-02-18，待回归）**：
- HtmlPreview 改为固定高度（不再动态测高/不再 `onMessage` 更新高度）
- 移除 WebView 内注入的 `MutationObserver -> postMessage(height)`

**回归验证要点**：
- Android：首次进入会话后，首次点击 Preview 区域不应再跳到顶部
- Android：代码流式结束后切到 Preview，不应再出现明显等待/白块闪烁

---

## 🟠 问题 C：HtmlPreview 预览加载慢

**现象**：切换到 Preview 标签后等待较长时间才显示。

**文件**：`src/components/common/HtmlPreview.tsx`

**根因（补充）**：
1. 人为延迟：组件内部存在 debounce（此前为 800ms）与占位态逻辑，导致切到 Preview 后短时间只能看到占位 UI。
2. WebView 首次初始化本身较重（即使无 CDN）。
3. 远程依赖：WebView 若加载远程 `https://cdn.tailwindcss.com`（~300KB），会进一步放大首次等待。

**修复动作（2026-02-18，待回归）**：
- 移除 tailwind CDN
- debounce 从 800ms 缩短到 120ms
- WebView `source` memo 化，避免无谓重载
