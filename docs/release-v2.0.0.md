# Talkio v2.0.0

**从 React Native 迁移到 Tauri 2 — 新增桌面端，全平台覆盖**

Talkio 2.0 完成了底层技术栈迁移，从 Expo + React Native 迁移到 **Tauri 2**，一套代码同时支持桌面端和移动端。

## 🚀 重大变更

### 技术栈迁移：React Native → Tauri 2

- **前端**：React Native → React 19 + Vite（标准 Web 技术栈）
- **运行时**：Hermes → 原生 WebView
- **后端**：Expo Modules → Rust（Tauri 2）
- **数据库**：AsyncStorage / MMKV → SQLite（tauri-plugin-sql）
- **样式**：StyleSheet → TailwindCSS v4 + shadcn/ui

### 新增桌面端

首次支持桌面平台，与移动端共享同一套前端代码：

- **Windows** x64（`.msi` / `.exe`）
- **macOS** Apple Silicon（`.dmg`）
- **macOS** Intel（`.dmg`）
- **Linux** x64（`.AppImage` / `.deb`）

## ✨ 新功能

- **桌面端自适应布局** — 侧边栏 + 主聊天区双栏布局
- **HTML 实时预览** — AI 生成的 HTML/CSS/JS 代码可直接预览和全屏查看
- **Mermaid 图表渲染** — 流程图、时序图、类图等实时渲染
- **KaTeX 数学公式** — LaTeX 数学公式渲染
- **托管讨论** — 让多个 AI 自动轮流发言，围绕话题展开讨论
- **MCP 工具调用** — 通过 Model Context Protocol 连接外部工具
- **消息分支** — 重新生成回复，自动管理分支历史
- **语音输入** — 支持语音转文字输入

## 🐛 修复与优化

- 流式渲染性能大幅提升（告别 RN 桥接瓶颈）
- Android 状态栏深色文字适配
- 对话列表长按删除 + 右键菜单
- 滚动到底部浮动按钮（桌面 + 移动端统一风格）
- 消息气泡桌面端最大宽度限制（640px）
- 数据库多列排序支持

## 📦 下载

| 平台 | 文件 |
|------|------|
| Windows x64 | `.msi` / `.exe` |
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Linux x64 | `.AppImage` / `.deb` |
| Android | `.apk` |

## 📱 截图

### 桌面端

![桌面端](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/desktop-main.png)

### 移动端

| 对话列表 | AI 聊天 | 群聊 |
|---------|---------|------|
| ![](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-conversations.jpg) | ![](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-chat.jpg) | ![](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-group-chat.jpg) |

| 托管讨论 | HTML 预览 | 角色 |
|---------|-----------|------|
| ![](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-auto-discuss.jpg) | ![](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-html-preview.jpg) | ![](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-identities.jpg) |

---

**完整代码**: https://github.com/llt22/talkio
