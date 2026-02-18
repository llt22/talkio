# Avatar

一款本地优先的 AI 聊天助手，支持多模型、多身份、MCP 工具调用，数据完全存储在设备上。

## 功能

- **多 Provider 接入** — 支持 OpenAI / Anthropic / DeepSeek / Groq / Ollama 等任何 OpenAI 兼容 API
- **多模型切换** — 按 Provider 浏览和启用模型，一键新建对话
- **身份（Persona）** — 自定义系统提示词、参数（温度 / Top-P），为不同场景创建专属 AI 角色
- **MCP 工具** — 通过 Model Context Protocol 连接远程工具服务器，让 AI 调用日历、位置、提醒等能力
- **流式输出** — 实时流式渲染 AI 回复，支持 Markdown / 代码高亮 / Mermaid 图表 / HTML 预览
- **语音输入** — 内置录音转文字
- **消息分支** — 对同一条消息重新生成，自动管理分支历史
- **数据备份 / 恢复** — 导出 JSON 备份文件，跨设备迁移
- **网页配置** — 在电脑浏览器上通过局域网配置 Provider（带配对码安全认证）
- **双语** — 中文 / English

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Expo SDK 54 + React Native 0.81 + React 19 |
| 路由 | expo-router (文件系统路由) |
| 状态管理 | Zustand |
| 数据库 | expo-sqlite + Drizzle ORM |
| 样式 | NativeWind (TailwindCSS) |
| AI SDK | Vercel AI SDK (`ai` + `@ai-sdk/openai`) |
| 工具协议 | @modelcontextprotocol/sdk |
| 存储 | react-native-mmkv (加密) + AsyncStorage (降级) |

## 快速开始

### 前置条件

- Node.js ≥ 18
- Android Studio 或 Xcode（真机 / 模拟器）
- JDK 17（Android 构建）

### 安装与运行

```bash
# 安装依赖
npm install

# 生成原生项目
npx expo prebuild

# 启动开发服务器
npm start

# 运行到 Android
npm run android

# 运行到 iOS
npm run ios
```

### 生产构建

```bash
# 本地 Android APK
npx expo run:android --variant release

# 使用 EAS 构建
eas build --platform android --profile production
```

## 项目结构

```
avatar/
├── app/                    # 页面（expo-router 文件系统路由）
│   ├── (tabs)/
│   │   ├── chats/          # 对话列表 + 聊天页
│   │   ├── experts/        # 模型浏览
│   │   ├── discover/       # 身份 + MCP 工具管理
│   │   └── settings/       # 设置（Provider / 同步 / 隐私 / 网页配置）
│   └── chat/[id].tsx       # 单个对话页
├── src/
│   ├── components/         # UI 组件
│   ├── services/           # 业务逻辑（API 客户端 / 聊天 / MCP / 配置服务器）
│   ├── stores/             # Zustand 状态管理
│   ├── storage/            # 持久化（MMKV / SQLite）
│   ├── i18n/               # 国际化
│   └── types/              # TypeScript 类型
├── db/                     # Drizzle 数据库 schema
├── modules/                # 自定义原生模块（expo-ip）
├── plugins/                # Expo config 插件
└── docs/                   # 文档与审计报告
```

## 数据与隐私

- **本地优先**：所有对话、设置、API Key 存储在设备本地（SQLite + MMKV 加密存储）
- **无服务器**：Avatar 不运行任何云端服务，不收集用户数据
- **AI 请求**：聊天消息会发送到你配置的 AI Provider（OpenAI / Anthropic 等），这是 AI 功能正常运行的必要条件
- **局域网配置**：网页配置服务仅在本地网络运行，使用一次性配对码认证，关闭页面后服务自动停止

## 许可证

[MIT](LICENSE)
