# Talkio — 让多个 AI 在手机上群聊

用了一圈 AI 聊天 App，有三个点一直不舒服，所以自己做了一个。

**1. "角色"比"助手"更清晰。** 你不会说"让助手帮我下棋"，你会说"跟棋手下棋"。Talkio 用角色系统：苏格拉底、毒舌评论家、代码审查员，每个有自己的性格和说话方式。

**2. 交互参考微信。** 中国人最熟悉的聊天界面就是微信，没有学习成本，打开就会用。

**3. 为什么没人做群聊？** 这是我最不理解的。现实中有微信群、有圆桌讨论，到了 AI 这里就只能一对一？Talkio 可以把 GPT-4o、Claude、DeepSeek 拉进同一个群，每个绑不同角色，AI 之间能看到彼此发言，独立思考不会互相附和。用 @提及 指定谁回答，或让所有人轮流说。

<p align="center">
  <img src="https://github.com/llt22/talkio/raw/main/docs/screenshots/chat-list.jpg" width="200" />
  <img src="https://github.com/llt22/talkio/raw/main/docs/screenshots/group-chat.jpg" width="200" />
  <img src="https://github.com/llt22/talkio/raw/main/docs/screenshots/personas.jpg" width="200" />
</p>

<p align="center">
  <img src="https://github.com/llt22/talkio/raw/main/docs/screenshots/html-preview-streaming.jpg" width="200" />
  <img src="https://github.com/llt22/talkio/raw/main/docs/screenshots/html-preview-rendered.jpg" width="200" />
</p>
<p align="center"><em>HTML 实时编写卡片 · 渲染预览</em></p>

## 其他

- 支持任何 OpenAI 兼容 API（DeepSeek / Claude / Gemini / Ollama…）
- 流式输出、Markdown、代码高亮、深度推理（reasoning_content）
- MCP 工具调用、语音输入、消息分支、数据备份
- 本地优先，数据不经过任何服务器
- 开源 MIT

**GitHub**: https://github.com/llt22/talkio
**APK 下载**: https://github.com/llt22/talkio/releases

---

v0.1.0，肯定有很多不足，欢迎提意见和 Issue 👉 https://github.com/llt22/talkio/issues

目前只有 Android，iOS 后续跟上。
