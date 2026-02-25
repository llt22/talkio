# Talkio — Tauri v2 全面迁移方案

> 2026/02/25 讨论整理

---

## 一、背景

- Talkio 现有移动端基于 React Native (Expo)，已开源且有 12 star
- 用户反馈 RN 版聊天界面性能不理想（流式渲染跳动、Markdown 渲染性能）
- 经 Tauri v2 Mobile POC 验证，WebView + React + TailwindCSS 的流式聊天体验**显著优于 RN 版**
- 决定全面迁移到 Tauri v2，一套前端代码覆盖 5 个平台（macOS / Windows / Linux / iOS / Android）

## 二、POC 验证结论

- POC 项目位于 `/talkio-desktop/`（独立仓库）
- 已安装到安卓真机，用户反馈"非常丝滑"
- 关键优化经验：
  1. SSE 流式更新用 `requestAnimationFrame` 节流（每帧最多更新一次）
  2. Mermaid/HTML 延迟渲染（流式中显示代码，完成后才渲染图表）
  3. `flex-shrink-0` 固定头部和输入框，消息区独立滚动

## 三、技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| **应用框架** | Tauri v2 | 10MB 包体积、5 平台支持、Rust 安全模型 |
| **前端框架** | React + TypeScript | 和现有 RN 技术栈一致 |
| **样式** | TailwindCSS | RN 版用 NativeWind，className 可大量复用 |
| **状态管理** | zustand | 现有方案，直接复用 |
| **图标** | Lucide React | 轻量、风格统一 |
| **Markdown** | react-markdown + remark-gfm | Web 原生渲染，性能优于 RN 版 |
| **图表** | mermaid | 直接 SVG 渲染 |
| **存储** | @tauri-apps/plugin-sql (SQLite) | 和移动端 expo-sqlite 同构 |
| **KV 存储** | localStorage | 替代 MMKV |

## 四、设计参考

- **移动端**：参考微信移动版（底部 Tab + 全屏栈式导航）
- **桌面端**：参考微信桌面版（三栏布局）

### 桌面端布局（微信风格）

```
┌──────┬────────────┬──────────────────────────────┐
│      │            │                              │
│ 图标  │  内容面板   │        主区域                │
│ 导航  │            │                              │
│      │            │                              │
│ 💬   │  (根据左侧  │  (根据选中的对话/功能         │
│ 🤖   │   图标切换) │   显示对应内容)              │
│ 🔌   │            │                              │
│      │            │                              │
│      │            │                              │
│      │            │                              │
│ ⚙️   │            │                              │
│      │            │                              │
└──────┴────────────┴──────────────────────────────┘
 ~56px    ~260px            flex-1
```

图标栏对应：
- 💬 聊天 → 中间：对话列表，右边：聊天区
- 🤖 模型/专家 → 中间：模型列表，右边：模型详情
- 🔌 发现(Identity/MCP) → 中间：卡片列表，右边：编辑
- ⚙️ 设置 → 中间：设置菜单，右边：设置详情

### 移动端布局

```
底部 Tab (💬 🤖 🔌 ⚙️) → 全屏列表 → 点击进入全屏详情 → 返回按钮回列表
```

## 五、三层架构

```
┌──────────────────────────────────────────────┐
│  Layer 1: 业务逻辑（100% 共用）              │
│  types, services, stores, i18n, utils        │
├──────────────────────────────────────────────┤
│  Layer 2: 内容组件（80%+ 共用）              │
│  MarkdownRenderer, CodeBlock, MermaidRenderer │
│  HtmlPreview, Avatar, ReasoningBlock, Badge  │
├────────────────┬─────────────────────────────┤
│  Layer 3a:     │  Layer 3b:                  │
│  移动端交互壳   │  桌面端交互壳                │
│  - 全屏导航    │  - 三栏布局(微信风格)         │
│  - 底部Tab     │  - 左侧图标导航              │
│  - 触摸操作栏  │  - hover操作+右键菜单         │
│  - 虚拟键盘    │  - 快捷键+拖拽               │
│  - 返回按钮    │  - 无需返回，列表常驻          │
└────────────────┴─────────────────────────────┘
```

## 六、项目结构

```
talkio/
├── src/                        # Layer 1: 共享业务逻辑
│   ├── types/
│   ├── utils/
│   ├── services/               # api-client, chat/, mcp/, ai-provider
│   ├── stores/                 # zustand stores
│   ├── i18n/
│   └── constants/
│
├── web/                        # Tauri 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── shared/         # Layer 2: 共用内容组件
│   │   │   │   ├── MarkdownRenderer.tsx
│   │   │   │   ├── CodeBlock.tsx
│   │   │   │   ├── MermaidRenderer.tsx
│   │   │   │   ├── HtmlPreview.tsx
│   │   │   │   ├── Avatar.tsx
│   │   │   │   └── ReasoningBlock.tsx
│   │   │   │
│   │   │   ├── mobile/         # Layer 3a: 移动端交互壳
│   │   │   │   ├── MobileMessageBubble.tsx
│   │   │   │   ├── MobileChatView.tsx
│   │   │   │   ├── MobileChatInput.tsx
│   │   │   │   ├── MobileConvList.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   │
│   │   │   └── desktop/        # Layer 3b: 桌面端交互壳
│   │   │       ├── DesktopMessageBubble.tsx
│   │   │       ├── DesktopChatView.tsx
│   │   │       ├── DesktopChatInput.tsx
│   │   │       ├── DesktopSidebar.tsx
│   │   │       ├── DesktopIconNav.tsx
│   │   │       └── DesktopShortcuts.tsx
│   │   │
│   │   ├── pages/              # 页面组件
│   │   │   ├── settings/
│   │   │   ├── discover/
│   │   │   └── experts/
│   │   ├── hooks/
│   │   ├── storage/            # Tauri SQLite 存储实现
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   └── vite.config.ts
│
├── src-tauri/                  # Tauri Rust 配置
│   ├── src/lib.rs
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── gen/                    # 自动生成
│       ├── android/
│       └── ios/
│
├── app/                        # [旧] Expo Router（迁移完删除）
├── android/                    # [旧] RN Android（迁移完删除）
├── ios/                        # [旧] RN iOS（迁移完删除）
├── db/                         # [旧] drizzle schema（类型可复用）
└── package.json
```

## 七、交互差异对照

### 对话列表

| 操作 | 移动端 | 桌面端 |
|------|--------|--------|
| 删除 | 左滑显示删除按钮 | hover 显示 ⋯ → 菜单(删除/置顶/重命名) |
| 搜索 | 顶部搜索框 | 中间面板顶部搜索框 |
| 新建 | 右上角 + 按钮 | 中间面板顶部 + 按钮 |
| 置顶 | 暂无 | hover 菜单 |
| 右键 | 无 | 右键菜单（同 ⋯ 菜单） |

### 消息操作

| 操作 | 移动端 | 桌面端 |
|------|--------|--------|
| 复制 | 底部常驻操作栏 | hover 消息旁出现操作按钮 |
| 重新生成 | 底部常驻操作栏 | hover 按钮 |
| TTS | 底部常驻操作栏 | hover 按钮 |
| 删除 | 底部常驻操作栏 | 右键菜单 |
| 分享 | 底部常驻操作栏 | hover 按钮 |

### 输入框

| 功能 | 移动端 | 桌面端 |
|------|--------|--------|
| 发送 | 点击发送按钮 | Enter 发送，Shift+Enter 换行 |
| 图片 | 相册选择 | 拖拽 + 粘贴 + 文件选择器 |
| @提及 | 弹出选择器 | @后弹出下拉列表 |
| 快捷提示 | / 触发列表 | / 触发列表 + 键盘导航 |

## 八、原生模块替代方案

| RN/Expo 模块 | Tauri 替代 | 说明 |
|-------------|-----------|------|
| `expo-sqlite` | `@tauri-apps/plugin-sql` | SQLite |
| `react-native-mmkv` | `localStorage` | KV 存储 |
| `expo-clipboard` | `navigator.clipboard` | 剪贴板 |
| `expo-haptics` | Web Vibration API | 触觉反馈 |
| `expo-speech` | Web Speech Synthesis API | TTS |
| `expo-file-system` | `@tauri-apps/plugin-fs` | 文件系统 |
| `expo-sharing` | Web Share API + Tauri shell | 分享 |
| `expo-audio` | Web Audio API | STT 录音 |
| `expo-image-picker` | `<input type="file">` + 拖拽 | 图片选择 |
| `drizzle useLiveQuery` | 手动 query + zustand 订阅 | 响应式数据 |

## 九、桌面端独有功能

| 功能 | 实现方式 |
|------|---------|
| 全局快捷键 (Ctrl+N/K/W) | `@tauri-apps/plugin-global-shortcut` |
| 系统托盘 | `@tauri-apps/plugin-tray` |
| 拖拽文件 | HTML5 drag & drop |
| 多窗口 | Tauri multi-window API |
| 自动更新 | `@tauri-apps/plugin-updater` |
| 侧边栏缩放 | CSS resize / JS 拖拽 |
| 右键菜单 | `onContextMenu` + 自定义菜单组件 |

## 十、迁移阶段

### Phase 0: 初始化
- 在 talkio 仓库中初始化 Tauri v2 + Vite + React + TailwindCSS
- 配置 `web/` 目录和 `src-tauri/`
- 配置 Android / iOS 移动端构建

### Phase 1: 存储层
- `@tauri-apps/plugin-sql` 实现 SQLite CRUD
- `localStorage` 替代 MMKV
- 实现响应式数据 hooks（替代 drizzle useLiveQuery）

### Phase 2: 聊天核心
- 从 POC 移植并增强 MessageBubble（两端版本）
- 实现 ChatInput（两端版本）
- 流式 SSE 响应（已验证）
- Markdown / Mermaid / HTML 预览（已验证）

### Phase 3: 功能页面
- 对话列表（移动端全屏 / 桌面端侧边栏）
- 设置页面
- Provider 管理 + 编辑
- Identity / MCP 管理
- 模型列表

### Phase 4: 原生功能适配
- 剪贴板、TTS、文件系统、分享
- 图片选择（移动端相册 / 桌面端拖拽粘贴）
- STT 语音输入
- 备份导入导出

### Phase 5: 桌面端增强
- 微信风格三栏布局 + 图标导航
- 右键菜单
- 全局快捷键
- 拖拽文件到聊天
- 系统托盘

### Phase 6: 清理 + 发布
- 删除 RN 代码（app/, android/, ios/）
- 更新 README、CI/CD
- 构建多平台安装包
- 发布新版本

## 十一、构建命令

```bash
# 桌面端开发
npm run tauri dev

# Android 开发
npm run tauri android dev

# iOS 开发
npm run tauri ios dev

# 桌面端构建（macOS/Windows/Linux）
npm run tauri build

# 移动端构建
npm run tauri android build    # APK/AAB
npm run tauri ios build        # IPA
```

## 十二、关键决策记录

| 问题 | 决策 | 理由 |
|------|------|------|
| **数据迁移** | 不迁移，重新开始 | 刚发布不久，聊天记录重要度一般 |
| **版本号** | 跳大版本（2.0） | 标志技术栈切换 |
| **首发平台** | Android 优先 | 日常用 Android，iOS 代码完全共用但缺发布证书 |
| **iOS** | 同步开发，暂不上架 | 代码共用无需额外开发，仅缺 App Store 证书($99/年) |
| **桌面端优先级** | Android 先行，桌面端跟进 | |
| **局域网配置** | 去掉 | 将来通过桌面版导出导入到移动端替代 |
| **STT/群聊/MCP** | 全部迁移 | 除局域网配置外所有功能都要 |
| **分支策略** | 打 v1.x tag + 创建 v1 分支保存 RN 版，main 直接重构为 Tauri | 2.0 全新技术栈，混在一起会乱 |
| **开源社区** | 需要发 Discussion 通知 | 告知用户技术栈切换 |
| **CI/CD** | GitHub Actions（最佳实践） | Tauri 官方有 GitHub Actions 模板 |

## 十三、系统能力 Android/iOS 差异

> 90% 的系统能力无差异，写一次代码双端都能用。

### 完全一致（无需关心平台）

- SQLite (`@tauri-apps/plugin-sql`)
- 文件系统 (`@tauri-apps/plugin-fs`)
- 剪贴板 (`navigator.clipboard`)
- 通知 (`@tauri-apps/plugin-notification`，iOS 需授权)
- TTS (`speechSynthesis`，语音列表不同但功能一致)
- 分享 (`navigator.share()`)
- MCP 网络 (标准 `fetch`)

### 有差异（需要特殊处理，共 2 个）

| 能力 | Android | iOS | 解决方案 |
|------|---------|-----|---------|
| **触觉反馈** | `navigator.vibrate()` ✅ | ❌ 不支持 | 降级为不振动，或后续写 Rust plugin 调用 `UIImpactFeedbackGenerator` |
| **STT 录音** | `MediaRecorder` ✅ | ⚠️ WKWebView 麦克风限制 | 需实际测试，可能需要 Rust 桥接原生录音 API |

## 十四、MCP 代码迁移分析

> **结论：MCP 代码可直接复用，无需改动。**

| 文件 | 改动 | 原因 |
|------|------|------|
| `mcp-client.ts` | ❌ 不需要 | 纯 JS 业务逻辑（local + remote tool 执行） |
| `connection-manager.ts` | ❌ 不需要 | 用标准 `fetch`，无 RN 特有 API |
| `rn-streamable-http-transport.ts` | ⚠️ 改名 | 代码不变（纯 `fetch` + `ReadableStream`），文件名改为 `streamable-http-transport.ts` |
| `@modelcontextprotocol/sdk` | ❌ 不需要 | npm 包，浏览器兼容 |
| `built-in-tools.ts` | ❌ 不需要 | 纯 JS（获取时间等内置工具） |

MCP 整体属于 Layer 1 共享层，远程 MCP Server 在 Tauri 版中开箱即用。

### 内置工具 (built-in-tools.ts) 迁移

> 现有 3 个内置工具依赖 Expo 原生模块，需要替换。

| 工具 | RN 依赖 | Tauri 替代 | Android/iOS 差异 |
|------|---------|-----------|-----------------|
| **Get Current Time** | 纯 JS（Date, Intl） | ✅ 不需改动 | 无差异 |
| **Read Clipboard** | `expo-clipboard` | `navigator.clipboard.readText()` | 无差异 |
| **Create Reminder** | `expo-calendar` | ❌ **2.0 先去掉** | 依赖原生日历 API，后续可通过 Tauri plugin 或 .ics 文件重新加回 |

## 十五、技术原则

1. **优先使用成熟库** — Web 生态极其成熟，能用库的绝不自己实现
2. **最小改动原则** — 共享层代码尽量不改，只做必要的平台适配
3. **渐进式迁移** — 按 Phase 推进，每个阶段可独立验证
4. **遵循设计规范** — 所有 UI 遵循统一的设计令牌和交互规范（详见 `docs/design-system.md`）
5. **UI 组件库** — 使用 **shadcn/ui** 作为基础组件库，用自定义设计令牌覆盖默认主题

### 推荐库选型

| 功能 | 推荐库 | 理由 |
|------|--------|------|
| **路由** | `react-router-dom` v7 | Web 路由标准，支持嵌套/动态路由 |
| **Markdown** | `react-markdown` + `remark-gfm` | POC 已验证，性能好 |
| **代码高亮** | `shiki` 或 `highlight.js` | shiki 质量更高，highlight.js 更轻量 |
| **Mermaid** | `mermaid` | 官方库，POC 已验证 |
| **数学公式** | `katex` + `remark-math` + `rehype-katex` | LaTeX 渲染标准方案 |
| **动画** | `framer-motion` | React 动画库首选，页面切换/元素动画 |
| **Toast/通知** | `sonner` 或 `react-hot-toast` | 轻量美观 |
| **下拉菜单/右键菜单** | `@radix-ui/react-dropdown-menu` + `@radix-ui/react-context-menu` | 无样式、可访问性好、headless |
| **弹窗/对话框** | `@radix-ui/react-dialog` | 同上 |
| **虚拟列表** | `@tanstack/react-virtual` | 大列表性能优化 |
| **表单** | `react-hook-form` | 轻量表单管理 |
| **日期格式化** | `date-fns` | 轻量日期工具 |
| **国际化** | `i18next` + `react-i18next` | 现有方案可复用 |
| **图标** | `lucide-react` | POC 已用，轻量统一 |
| **HTTP** | 原生 `fetch` | 无需 axios |
| **SSE** | 原生 `fetch` + `ReadableStream` | POC 已验证 |

## 十六、风险和注意事项

1. **WebView 键盘体验** — POC 验证可接受，但需关注不同 Android 设备的差异
2. **iOS 暂缓上架** — 无开发者证书($99/年)，但代码共用、Simulator 可测试
3. **iOS 触觉/录音** — 2 个系统能力有差异，需降级处理或写 Rust plugin
4. **Tauri Mobile 成熟度** — 2024.10 发布，仍在快速迭代中
5. **开源社区影响** — 大幅重构需提前通知，在 GitHub Discussion 中说明迁移计划

---

*文档最后更新: 2026/02/25*
