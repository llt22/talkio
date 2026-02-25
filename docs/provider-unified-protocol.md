# Talkio 2.0 — Provider「统一协议（OpenAI-compatible）」最佳实践说明

> 2026/02/25

## 这句话在 Talkio 里到底是什么意思？

Talkio 2.0 当前的聊天实现（`web/src/stores/chat-store.ts`）是基于 **OpenAI Chat Completions** 风格：

- `POST {baseUrl}/chat/completions`
- `stream: true`，服务端以 **SSE**（`data: {...}`）流式返回
- 增量字段主要解析：
  - `delta.content`
  - `delta.reasoning_content`（可选）
  - `delta.tool_calls`（可选）

因此，“统一协议”指的是：

- Talkio 前端 **只实现这一套 OpenAI-compatible 的请求/鉴权/流式解析/工具调用格式**
- 你想用 Anthropic / Gemini / Azure OpenAI 等厂商时，不在前端分别写多套协议
- 而是通过 **网关/兼容层（Gateway）**把它们转换成 OpenAI-compatible

这样做的好处：

- 前端逻辑最少、bug 最少（尤其是 SSE 解析、tools、reasoning、多模型）
- 后续做 Mobile（WebView）/ Desktop（Tauri）都能复用同一套核心
- 符合项目原则：**能用成熟方案就不用自己手写协议栈**

## 什么叫 OpenAI-compatible？（Talkio 需要哪些能力）

你填的 `baseUrl` 对 Talkio 来说，需要至少满足：

- **列模型**：`GET {baseUrl}/models`
- **聊天**：`POST {baseUrl}/chat/completions`
- **流式**：支持 SSE `text/event-stream`

可选但强烈建议：

- **Tools**：返回 `tool_calls`，并支持 tool messages 的后续对话
- **Reasoning**：部分服务会返回 `reasoning_content`（Talkio 会展示推理块）

## 推荐路线（从“最省事”到“最灵活”）

### 1) 直接用 OpenAI-compatible 服务（最省事）

适合：

- OpenAI
- DeepSeek（OpenAI-compatible）
- Groq（OpenAI-compatible）
- Ollama（本地 OpenAI-compatible）
- 以及任何你自建的 OpenAI-compatible 后端

你在 Talkio 的 Provider 里：

- `type`: OpenAI Compatible
- `baseUrl`: 例如 `https://api.openai.com/v1`
- `apiKey`: 对应厂商 key

### 2) 用 OpenRouter（推荐给“想用很多模型但不想折腾”的场景）

OpenRouter 对外提供 OpenAI-compatible API。

- `baseUrl`: `https://openrouter.ai/api/v1`
- `apiKey`: OpenRouter 的 key
- `modelId`: OpenRouter 的模型 ID（通常形如 `anthropic/claude-...`、`google/gemini-...` 等）

优点：

- Talkio 仍然只写一套 OpenAI-compatible 协议
- 但你可以在模型列表里选择 Anthropic/Gemini 等供应商模型

### 3) 自建 LiteLLM 作为网关（推荐给“要接 Azure/私有模型/统一鉴权/可观测性”的场景）

LiteLLM 可以把多家厂商（Anthropic/Gemini/Azure 等）统一成 OpenAI-compatible。

- Talkio 侧 Provider：
  - `type`: OpenAI Compatible
  - `baseUrl`: `http(s)://<你的-litellm-host>:4000/v1`（以你实际部署为准）
  - `apiKey`: LiteLLM 的 key（如你开启了鉴权）

优点：

- 你可以把“厂商差异”全部放在网关层解决
- Talkio 前端保持稳定
- 对移动端最友好（减少各种 edge cases）

## Anthropic / Gemini / Azure OpenAI 为什么不建议前端原生直连？

因为它们在以下方面通常与 OpenAI-compatible 存在差异：

- **鉴权头**（如 Azure 常用 `api-key` 而不是 `Authorization: Bearer ...`）
- **请求路径/参数**（Azure often 与 deployment + api-version 强绑定）
- **流式格式**（不同厂商的 SSE/增量字段差异很大）
- **tools / function calling** 的细节差异

如果 Talkio 前端原生直连每家，就会出现：

- 需要实现多套请求与流式解析
- 多处分支逻辑导致维护成本与 bug 风险指数级上升

## Talkio 里 UI 改动（为什么你现在看不到 anthropic/gemini/azure-openai 的 type 了）

由于我们选择“统一协议”，Talkio 会在配置页将 Provider 类型收敛为 **OpenAI Compatible**，避免误配置导致“配置成功但聊天必失败”。

如果你要使用 Anthropic/Gemini/Azure 的模型：

- 推荐通过 OpenRouter 或 LiteLLM，把它们转换成 OpenAI-compatible 再接入 Talkio。

## 你要我下一步做什么？

- 若你准备使用 OpenRouter：我可以帮你把 **OpenRouter 的推荐模型预设**补进 presets（仍然保持 openai-compatible）。
- 若你准备自建 LiteLLM：你给我你希望接入的厂商（Anthropic/Gemini/Azure/DeepSeek/Ollama），我可以帮你写一份 **LiteLLM 配置模板**（不包含密钥）。
