# Talkio

**Multiple AI models chatting together, right on your phone.**

Talkio is a local-first mobile AI chat app. It's not just another ChatGPT client — you can pull multiple AI models into the same group chat, assign them different personas, and watch them debate, collaborate, or play word games together.

[中文](README.md) · English

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/chat-list.jpg" width="180" alt="Chat List" />
  <img src="docs/screenshots/group-chat.jpg" width="180" alt="Group Chat" />
  <img src="docs/screenshots/personas.jpg" width="180" alt="Personas" />
  <img src="docs/screenshots/models.jpg" width="180" alt="Models" />
  <img src="docs/screenshots/settings.jpg" width="180" alt="Settings" />
</p>

<p align="center">
  <em>Chat List · Multi-AI Group Chat · Personas · Model Browser · Settings</em>
</p>

<p align="center">
  <img src="docs/screenshots/html-preview-streaming.jpg" width="180" alt="HTML Streaming Card" />
  <img src="docs/screenshots/html-preview-rendered.jpg" width="180" alt="HTML Preview" />
</p>

<p align="center">
  <em>HTML Live Streaming Card · HTML Rendered Preview</em>
</p>

---

## Core Features

### 🎭 Group Chat — Multiple AIs in One Conversation

Unlike traditional one-on-one chat, Talkio supports **multi-model group chat**:

- Pull GPT-4o, Claude, DeepSeek into the same conversation
- Each participant can have a different **Persona** with its own system prompt and parameters
- AIs see each other's messages, think independently, and won't simply agree
- Use **@mentions** to direct a specific model, or let everyone take turns

### 🧠 Persona System

Create roles for AI: translator, code reviewer, debate opponent, word game player…

- Custom system prompts
- Independent Temperature and Top-P controls
- Reasoning effort adjustment
- One model can play different roles in different conversations

### 🔧 MCP Tool Calling

Connect to remote tool servers via [Model Context Protocol](https://modelcontextprotocol.io/):

- Calendar, location, reminders, and other system capabilities
- Custom tool servers
- AI automatically decides when to invoke tools

### 🔒 Local-First

- All data stored on-device (SQLite + MMKV encrypted)
- No cloud services, no data collection
- API keys encrypted locally, never leave your device

---

## More Features

- **Multi-Provider** — OpenAI / Anthropic / DeepSeek / Groq / Ollama and any OpenAI-compatible API
- **Streaming Output** — Real-time rendering with Markdown / syntax highlighting / Mermaid diagrams / HTML preview
- **Deep Reasoning** — Supports reasoning_content and `<think>` tags from DeepSeek, Qwen, etc.
- **Voice Input** — Built-in speech-to-text
- **Message Branching** — Regenerate replies with automatic branch history management
- **Dark Mode** — Follows system theme, CSS variable driven
- **Data Backup** — Export JSON, migrate across devices
- **Web Config** — Configure providers from your computer's browser via LAN (pairing code auth)
- **Bilingual** — 中文 / English

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 · React Native 0.81 · React 19 |
| Routing | expo-router (file-system routing) |
| State | Zustand |
| Database | expo-sqlite · Drizzle ORM |
| Styling | NativeWind v4 (TailwindCSS · CSS variable dark mode) |
| AI | Vercel AI SDK v6 (`ai` · `@ai-sdk/openai`) |
| Tools | @modelcontextprotocol/sdk |
| Storage | react-native-mmkv (encrypted) · expo-secure-store |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- Android Studio or Xcode (device / simulator)
- JDK 17 (Android builds)

### Install & Run

```bash
npm install
npx expo prebuild
npm start

# Android
npm run android

# iOS
npm run ios
```

### Production Build

```bash
# Local Android APK
npx expo run:android --variant release

# EAS Cloud Build
eas build --platform android --profile production
```

---

## Project Structure

```
talkio/
├── app/                    # Pages (expo-router file-system routing)
│   ├── (tabs)/
│   │   ├── chats/          # Conversation list
│   │   ├── experts/        # Model browser
│   │   ├── discover/       # Personas + MCP tool management
│   │   └── settings/       # Settings
│   └── chat/[id].tsx       # Chat detail (single + group)
├── src/
│   ├── components/         # UI components
│   ├── services/           # Business logic (chat / MCP / config server)
│   ├── stores/             # Zustand state management
│   ├── storage/            # Persistence (MMKV / SQLite / batch writer)
│   ├── hooks/              # React Hooks
│   ├── i18n/               # Internationalization
│   └── types/              # TypeScript types
├── db/                     # Drizzle database schema
├── modules/                # Custom native modules
└── plugins/                # Expo config plugins
```

---

## Privacy

- **Local-First** — Conversations, settings, API keys all stored on-device
- **No Server** — No cloud services, no user data collection
- **AI Requests** — Chat messages are sent to your configured AI provider, required for AI functionality
- **LAN Config** — Web config runs on local network only, one-time pairing code auth

## License

[MIT](LICENSE)
