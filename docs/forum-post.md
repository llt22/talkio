## v2.0 发布 — 从 React Native 迁移到 Tauri 2，新增桌面端

Talkio 2.0 完成了技术栈迁移：从 Expo + React Native 迁移到 **Tauri 2**，现在一套代码同时支持 **Windows / macOS / Linux / Android**。

为什么迁移？
- React Native 桥接机制在长对话、流式渲染场景下性能瓶颈明显
- Tauri 2 使用原生 WebView，Markdown / Mermaid / KaTeX 渲染更流畅
- 打包体积约 20MB，远小于 Electron（100MB+）
- 一套前端代码覆盖桌面和移动端，不用维护两套

**GitHub**: https://github.com/llt22/talkio 如果觉得有用，多多 star 谢谢

**下载**: https://github.com/llt22/talkio/releases（Windows / macOS / Linux / Android）

---

### 桌面端

![桌面端主界面](https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/desktop-main.png)

### 移动端

<p align="center">
<img src="https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-conversations.jpg" width="200">
<img src="https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-chat.jpg" width="200">
<img src="https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-group-chat.jpg" width="200">
</p>

<p align="center">
<img src="https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-auto-discuss.jpg" width="200">
<img src="https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-html-preview.jpg" width="200">
<img src="https://raw.githubusercontent.com/llt22/talkio/main/docs/screenshots/mobile-identities.jpg" width="200">
</p>

---

用了一圈 AI 聊天 App，有三个点一直不习惯，所以自己做了一个。

**1. "角色"比"助手"更清晰。** 助手这个叫法我一直不习惯，所以改为角色了。Talkio 用角色系统：苏格拉底、毒舌评论家、代码审查员，每个有自己的性格和说话方式。

**2. 交互参考微信。** 中国人最熟悉的聊天界面就是微信，没有学习成本，打开就会用。

**3. 为什么 AI 群聊不流行？** 这是我最不理解的。把多个 AI 拉进同一个群聊，让它们辩论、接龙、协作，深度讨论问题总能给我惊喜。

## 功能亮点

- 支持任何 OpenAI 兼容 API（DeepSeek / Claude / Gemini / Ollama…）
- **多模型群聊** — 把不同 AI 拉进同一个对话，各自扮演不同角色
- **托管讨论** — 让 AI 之间自动轮流发言，围绕话题展开讨论
- 流式输出、Markdown、代码高亮、Mermaid 图表、HTML 实时预览
- 深度推理（reasoning_content / `<think>` 标签）
- MCP 工具调用、语音输入、消息分支、数据备份
- 本地优先，数据不经过任何服务器

---

欢迎提意见和 Issue 👉 https://github.com/llt22/talkio/issues

## 题外话

全程 vibe coding，说实话虽然不手写代码，但是开发起来也挺费劲的，尤其是性能问题。
