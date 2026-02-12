export const APP_NAME = "Avatar";

export const DEFAULT_IDENTITY_PARAMS = {
  temperature: 0.7,
  topP: 0.9,
} as const;


export const IDENTITY_ICONS = [
  "code",
  "translate",
  "architecture",
  "security",
  "finance",
  "writing",
  "research",
  "marketing",
  "design",
  "general",
] as const;

export const PROVIDER_PRESETS: Record<
  string,
  { name: string; baseUrl: string; type: "official" | "aggregator" | "local" }
> = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    type: "official",
  },
  openai: {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    type: "official",
  },
  anthropic: {
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    type: "official",
  },
  google: {
    name: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    type: "official",
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    type: "aggregator",
  },
  groq: {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    type: "aggregator",
  },
  ollama: {
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    type: "local",
  },
};

export const QUICK_PROMPTS = [
  { label: "Translate", prompt: "Translate the following to English:" },
  { label: "Summarize", prompt: "Summarize the following concisely:" },
  { label: "Polish", prompt: "Polish and improve the following text:" },
  { label: "Explain", prompt: "Explain the following in simple terms:" },
  { label: "Code Review", prompt: "Review the following code for bugs and improvements:" },
] as const;

export const STORAGE_KEYS = {
  PROVIDERS: "providers",
  MODELS: "models",
  IDENTITIES: "identities",
  CONVERSATIONS: "conversations",
  MCP_TOOLS: "mcp_tools",
  SHORTCUTS: "shortcuts",
  SETTINGS: "settings",
} as const;

export const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  reasoning: { bg: "bg-tag-reasoning", text: "text-tag-reasoning-text" },
  vision: { bg: "bg-tag-vision", text: "text-tag-vision-text" },
  tools: { bg: "bg-tag-tools", text: "text-tag-tools-text" },
  coding: { bg: "bg-tag-coding", text: "text-tag-coding-text" },
  context: { bg: "bg-tag-context", text: "text-tag-context-text" },
  streaming: { bg: "bg-slate-100", text: "text-slate-600" },
};
