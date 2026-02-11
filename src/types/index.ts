export type ProviderType = "official" | "aggregator" | "local";
export type ProviderStatus = "connected" | "disconnected" | "error" | "pending";
export type ConversationType = "single" | "group";
export type MessageRole = "user" | "assistant" | "system";
export type McpToolType = "local" | "remote";
export type McpToolScope = "global" | "identity-bound" | "ad-hoc";

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  status: ProviderStatus;
  createdAt: string;
}

export interface ModelCapabilities {
  vision: boolean;
  toolCall: boolean;
  reasoning: boolean;
  streaming: boolean;
}

export interface Model {
  id: string;
  providerId: string;
  modelId: string;
  displayName: string;
  avatar: string | null;
  capabilities: ModelCapabilities;
  capabilitiesVerified: boolean;
  maxContextLength: number;
  enabled: boolean;
}

export interface IdentityParams {
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface Identity {
  id: string;
  name: string;
  icon: string;
  systemPrompt: string;
  params: IdentityParams;
  mcpToolIds: string[];
  createdAt: string;
}

export interface McpTool {
  id: string;
  name: string;
  type: McpToolType;
  scope: McpToolScope;
  description: string;
  endpoint: string | null;
  nativeModule: string | null;
  permissions: string[];
  enabled: boolean;
  schema: McpToolSchema | null;
}

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ConversationParticipant {
  modelId: string;
  identityId: string | null;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string;
  participants: ConversationParticipant[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  senderModelId: string | null;
  senderName: string | null;
  identityId: string | null;
  content: string;
  reasoningContent: string | null;
  reasoningDuration: number | null;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  branchId: string | null;
  parentMessageId: string | null;
  isStreaming: boolean;
  createdAt: string;
}

export interface Shortcut {
  id: string;
  displayName: string;
  modelId: string;
  identityId: string;
  pinned: boolean;
  createdAt: string;
}

export interface ChatApiMessage {
  role: MessageRole;
  content: string | ChatApiContentPart[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export type ChatApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatApiRequest {
  model: string;
  messages: ChatApiMessage[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: ChatApiToolDef[];
}

export interface ChatApiToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatApiChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    reasoning_content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string;
}

export interface ChatApiResponse {
  id: string;
  choices: ChatApiChoice[];
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface StreamDelta {
  role?: string;
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
  }>;
}

export interface ConversationFilter {
  type: "all" | "experts" | "work" | "creatives";
}
