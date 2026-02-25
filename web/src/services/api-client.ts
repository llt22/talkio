import type {
  ChatApiRequest,
  ChatApiResponse,
  Provider,
  ProviderType,
} from "../types";

export class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private apiVersion?: string;
  private providerType: ProviderType;
  private customHeaders: Record<string, string>;

  constructor(provider: Provider) {
    this.baseUrl = provider.baseUrl.replace(/\/+$/, "");
    this.apiKey = provider.apiKey;
    this.apiVersion = provider.apiVersion;
    this.providerType = provider.type;
    this.customHeaders = {};
    for (const h of provider.customHeaders ?? []) {
      if (h.name && h.value) this.customHeaders[h.name] = h.value;
    }
  }

  async listModels(): Promise<Array<{ id: string; object: string }>> {
    if (this.providerType === "gemini") return this.listModelsGemini();
    // Anthropic, OpenAI, Azure all use /models endpoint
    const response = await this.fetchWithRetry(this.getUrl("/models"), {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.data ?? [];
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }

  async chat(request: ChatApiRequest): Promise<ChatApiResponse> {
    if (this.providerType === "anthropic") return this.chatAnthropic(request);
    if (this.providerType === "gemini") return this.chatGemini(request);
    const response = await this.fetchWithRetry(this.getUrl("/chat/completions"), {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ ...request, stream: false }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }
    return response.json();
  }

  // ── Anthropic Implementation ──

  private async chatAnthropic(request: ChatApiRequest): Promise<ChatApiResponse> {
    const body = this.toAnthropicBody(request);
    body.stream = false;
    const response = await this.fetchWithRetry(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return this.fromAnthropicResponse(data);
  }

  private toAnthropicBody(request: ChatApiRequest): Record<string, unknown> {
    let system: string | undefined;
    const messages: Array<{ role: string; content: unknown }> = [];

    for (const msg of request.messages) {
      if (msg.role === "system") {
        system = typeof msg.content === "string" ? msg.content : "";
        continue;
      }
      let content: unknown;
      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          if (part.type === "image_url") {
            const url = part.image_url?.url ?? "";
            const m = url.match(/^data:([^;]+);base64,(.+)$/);
            if (m) return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
            return { type: "image", source: { type: "url", url } };
          }
          return part;
        });
      }
      // Merge consecutive same-role messages (Anthropic requirement)
      if (messages.length > 0 && messages[messages.length - 1].role === msg.role) {
        const prev = messages[messages.length - 1];
        const toArr = (c: unknown) => typeof c === "string" ? [{ type: "text", text: c }] : (c as unknown[]);
        prev.content = [...toArr(prev.content), ...toArr(content)];
      } else {
        messages.push({ role: msg.role, content });
      }
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.max_tokens ?? 4096,
    };
    if (system) body.system = system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.top_p !== undefined) body.top_p = request.top_p;
    if (request.tools) {
      body.tools = request.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }
    // Pass through thinking param for extended thinking
    if ((request as any).thinking) body.thinking = (request as any).thinking;
    return body;
  }

  private fromAnthropicResponse(data: any): ChatApiResponse {
    let content = "";
    let reasoningContent: string | null = null;
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
    for (const block of data.content ?? []) {
      if (block.type === "text") content += block.text;
      else if (block.type === "thinking") reasoningContent = (reasoningContent ?? "") + block.thinking;
      else if (block.type === "tool_use") {
        toolCalls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input) } });
      }
    }
    return {
      id: data.id,
      choices: [{ index: 0, message: { role: "assistant", content, reasoning_content: reasoningContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined }, finish_reason: data.stop_reason === "end_turn" ? "stop" : (data.stop_reason ?? "stop") }],
      model: data.model,
      usage: data.usage ? { prompt_tokens: data.usage.input_tokens ?? 0, completion_tokens: data.usage.output_tokens ?? 0, total_tokens: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0) } : undefined,
    };
  }

  // ── Gemini Implementation ──

  private async listModelsGemini(): Promise<Array<{ id: string; object: string }>> {
    const url = `${this.baseUrl}/models?key=${this.apiKey}`;
    const response = await this.fetchWithRetry(url, { headers: { ...this.customHeaders, "x-goog-api-key": this.apiKey } });
    if (!response.ok) throw new Error(`Failed to list models: ${response.status}`);
    const data = await response.json();
    return (data.models ?? []).map((m: any) => ({
      id: m.name?.replace("models/", "") ?? m.name,
      object: "model",
    }));
  }

  private async chatGemini(request: ChatApiRequest): Promise<ChatApiResponse> {
    const body = this.toGeminiBody(request);
    const url = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`;
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.customHeaders, "x-goog-api-key": this.apiKey },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return this.fromGeminiResponse(data);
  }

  private toGeminiBody(request: ChatApiRequest): Record<string, unknown> {
    const contents: Array<{ role: string; parts: unknown[] }> = [];
    let systemInstruction: { parts: Array<{ text: string }> } | undefined;

    for (const msg of request.messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: typeof msg.content === "string" ? msg.content : "" }] };
        continue;
      }
      const role = msg.role === "assistant" ? "model" : "user";
      const parts: unknown[] = [];
      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "text") parts.push({ text: part.text });
          else if (part.type === "image_url") {
            const url = part.image_url?.url ?? "";
            const m = url.match(/^data:([^;]+);base64,(.+)$/);
            if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
          }
        }
      }
      // Merge consecutive same-role
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts.push(...parts);
      } else {
        contents.push({ role, parts });
      }
    }

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    const genConfig: Record<string, unknown> = {};
    if (request.temperature !== undefined) genConfig.temperature = request.temperature;
    if (request.top_p !== undefined) genConfig.topP = request.top_p;
    if (request.max_tokens !== undefined) genConfig.maxOutputTokens = request.max_tokens;
    // Map reasoning_effort to Gemini's thinkingConfig
    if ((request as any).reasoning_effort) {
      const budgetMap: Record<string, number> = { low: 1024, medium: 8192, high: 24576 };
      genConfig.thinkingConfig = { thinkingBudget: budgetMap[(request as any).reasoning_effort] ?? 8192 };
    }
    if (Object.keys(genConfig).length > 0) body.generationConfig = genConfig;
    if (request.tools) {
      body.tools = [{ functionDeclarations: request.tools.map((t) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
    }
    return body;
  }

  private fromGeminiResponse(data: any): ChatApiResponse {
    const candidate = data.candidates?.[0];
    let content = "";
    let reasoningContent: string | null = null;
    const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
    for (const part of candidate?.content?.parts ?? []) {
      if (part.thought === true && part.text !== undefined) {
        reasoningContent = (reasoningContent ?? "") + part.text;
      } else if (part.text !== undefined) {
        content += part.text;
      }
      if (part.functionCall) toolCalls.push({ id: part.functionCall.name, type: "function", function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) } });
    }
    return {
      id: data.id ?? "gemini",
      choices: [{ index: 0, message: { role: "assistant", content, reasoning_content: reasoningContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined }, finish_reason: candidate?.finishReason === "STOP" ? "stop" : (candidate?.finishReason ?? "stop") }],
      model: data.modelVersion ?? "gemini",
      usage: data.usageMetadata ? { prompt_tokens: data.usageMetadata.promptTokenCount ?? 0, completion_tokens: data.usageMetadata.candidatesTokenCount ?? 0, total_tokens: data.usageMetadata.totalTokenCount ?? 0 } : undefined,
    };
  }

  // ── Speech-to-Text ──

  async transcribeAudio(audioUri: string, language?: string, sttModel?: string): Promise<string> {
    const formData = new FormData();
    const ext = audioUri.split(".").pop() ?? "m4a";
    const mimeMap: Record<string, string> = {
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      wav: "audio/wav",
      webm: "audio/webm",
      mp3: "audio/mpeg",
      ogg: "audio/ogg",
    };
    formData.append("file", {
      uri: audioUri,
      name: `recording.${ext}`,
      type: mimeMap[ext] ?? "audio/mp4",
    } as unknown as Blob);
    const defaultModel = this.baseUrl.includes("groq.com")
      ? "whisper-large-v3-turbo"
      : "whisper-1";
    formData.append("model", sttModel || defaultModel);
    if (language) formData.append("language", language);

    const headers: Record<string, string> = {};
    if (this.providerType === "anthropic") {
      headers["x-api-key"] = this.apiKey;
    } else if (this.providerType === "azure-openai") {
      headers["api-key"] = this.apiKey;
    } else if (this.providerType !== "gemini") {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    for (const [k, v] of Object.entries(this.customHeaders)) {
      headers[k] = v;
    }

    const url = this.getUrl("/audio/transcriptions");
    const response = await this.fetchWithRetry(url, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Transcription failed: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.text ?? "";
  }

  // ── Probe Methods ──

  async probeVision(modelId: string): Promise<boolean> {
    try {
      const response = await this.chat({
        model: modelId,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
                },
              },
              { type: "text", text: "What color is this pixel?" },
            ],
          },
        ],
        stream: false,
        max_tokens: 50,
      });
      return !!response.choices?.[0]?.message?.content;
    } catch {
      return false;
    }
  }

  async probeToolCall(modelId: string): Promise<boolean> {
    try {
      const response = await this.chat({
        model: modelId,
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        stream: false,
        max_tokens: 200,
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get current weather for a location",
              parameters: {
                type: "object",
                properties: { location: { type: "string", description: "City name" } },
                required: ["location"],
              },
            },
          },
        ],
      });
      return !!response.choices?.[0]?.message?.tool_calls?.length;
    } catch {
      return false;
    }
  }

  async probeReasoning(modelId: string): Promise<boolean> {
    try {
      const response = await this.chat({
        model: modelId,
        messages: [{ role: "user", content: "What is 2+2?" }],
        stream: false,
        max_tokens: 100,
      });
      return !!response.choices?.[0]?.message?.reasoning_content;
    } catch {
      return false;
    }
  }

  private async fetchWithRetry(
    input: string,
    init?: RequestInit,
    maxRetries = 2,
  ): Promise<Response> {
    const retryableStatus = new Set([429, 500, 502, 503, 504]);
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(input, init);
        if (response.ok || !retryableStatus.has(response.status) || attempt === maxRetries) {
          return response;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries) throw err;
      }
      // Exponential back-off: 500ms, 1500ms
      await new Promise((r) => setTimeout(r, 500 * Math.pow(3, attempt)));
    }
    throw lastError;
  }

  private getHeaders(): Record<string, string> {
    const base: Record<string, string> = { "Content-Type": "application/json" };
    switch (this.providerType) {
      case "anthropic":
        base["x-api-key"] = this.apiKey;
        base["anthropic-version"] = "2023-06-01";
        break;
      case "azure-openai":
        base["api-key"] = this.apiKey;
        break;
      case "gemini":
        // Gemini uses key as query param, no auth header needed
        break;
      default:
        if (this.apiKey) base["Authorization"] = `Bearer ${this.apiKey}`;
        break;
    }
    return { ...base, ...this.customHeaders };
  }

  private getUrl(path: string): string {
    let url = `${this.baseUrl}${path}`;
    if (this.apiVersion) {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}api-version=${this.apiVersion}`;
    }
    return url;
  }
}
