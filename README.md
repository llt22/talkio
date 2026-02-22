# Talkio

**让多个 AI 在你的手机上同时对话。**

Talkio 是一款本地优先的移动端 AI 聊天应用。它不只是又一个 ChatGPT 客户端——你可以把多个 AI 模型拉进同一个群聊，让它们各自扮演不同角色，围绕同一个话题展开讨论、辩论、接龙。

> *A local-first mobile AI chat app. Pull multiple AI models into the same group chat, assign them different personas, and watch them debate, collaborate, or play word games together.*

---

## 核心特色

### 🎭 群聊 — 多 AI 同时对话

不同于传统的一对一聊天，Talkio 支持**多模型群聊**：

- 把 GPT-4o、Claude、DeepSeek 拉进同一个对话
- 每个参与者可以绑定不同的**身份（Persona）**，拥有独立的系统提示词和参数
- AI 之间能看到彼此的发言，独立思考，不会简单附和
- 用 **@提及** 指定某个模型回答，或让所有人轮流发言

### 🧠 身份系统

为 AI 创建角色：翻译官、代码审查员、辩论对手、成语接龙玩家……

- 自定义系统提示词
- 独立调节温度（Temperature）和 Top-P
- 推理力度控制（Reasoning Effort）
- 一个模型可以在不同对话中扮演不同角色

### 🔧 MCP 工具调用

通过 [Model Context Protocol](https://modelcontextprotocol.io/) 连接远程工具服务器：

- 日历、位置、提醒等系统能力
- 自定义工具服务器
- AI 自动决定何时调用工具

### 🔒 本地优先

- 所有数据存储在设备本地（SQLite + MMKV 加密）
- 不运行任何云端服务，不收集用户数据
- API Key 加密存储，永远不离开你的设备

---

## 更多功能

- **多 Provider** — OpenAI / Anthropic / DeepSeek / Groq / Ollama 等任何 OpenAI 兼容 API
- **流式输出** — 实时渲染，支持 Markdown / 代码高亮 / Mermaid 图表 / HTML 预览
- **深度推理** — 支持 DeepSeek、Qwen 等模型的 reasoning_content 和 `<think>` 标签
- **语音输入** — 内置录音转文字
- **消息分支** — 重新生成回复，自动管理分支历史
- **暗色模式** — 跟随系统主题，CSS 变量驱动
- **数据备份** — 导出 JSON，跨设备迁移
- **网页配置** — 电脑浏览器通过局域网配置 Provider（配对码认证）
- **双语** — 中文 / English

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Expo SDK 54 · React Native 0.81 · React 19 |
| 路由 | expo-router（文件系统路由） |
| 状态管理 | Zustand |
| 数据库 | expo-sqlite · Drizzle ORM |
| 样式 | NativeWind v4（TailwindCSS · CSS 变量暗色模式） |
| AI | Vercel AI SDK v6（`ai` · `@ai-sdk/openai`） |
| 工具协议 | @modelcontextprotocol/sdk |
| 存储 | react-native-mmkv（加密）· expo-secure-store |

---

## 快速开始

### 前置条件

- Node.js ≥ 18
- Android Studio 或 Xcode（真机 / 模拟器）
- JDK 17（Android 构建）

### 安装与运行

```bash
npm install
npx expo prebuild
npm start

# Android
npm run android

# iOS
npm run ios
```

### 生产构建

```bash
# 本地 Android APK
npx expo run:android --variant release

# EAS 云构建
eas build --platform android --profile production
```

---

## 项目结构

```
talkio/
├── app/                    # 页面（expo-router 文件系统路由）
│   ├── (tabs)/
│   │   ├── chats/          # 对话列表
│   │   ├── experts/        # 模型浏览
│   │   ├── discover/       # 身份 + MCP 工具管理
│   │   └── settings/       # 设置
│   └── chat/[id].tsx       # 聊天详情页（单聊 + 群聊）
├── src/
│   ├── components/         # UI 组件
│   ├── services/           # 业务逻辑（聊天 / MCP / 配置服务器）
│   ├── stores/             # Zustand 状态管理
│   ├── storage/            # 持久化（MMKV / SQLite / 批量写入）
│   ├── hooks/              # React Hooks
│   ├── i18n/               # 国际化
│   └── types/              # TypeScript 类型
├── db/                     # Drizzle 数据库 schema
├── modules/                # 自定义原生模块
└── plugins/                # Expo config 插件
```

---

## 隐私

- **本地优先** — 对话、设置、API Key 全部存储在设备本地
- **无服务器** — 不运行云端服务，不收集任何用户数据
- **AI 请求** — 聊天消息发送到你配置的 AI Provider，这是 AI 功能运行的必要条件
- **局域网配置** — 网页配置仅在本地网络运行，一次性配对码认证

## 许可证

[MIT](LICENSE)
