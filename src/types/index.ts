export type ProviderType = "openai" | "anthropic" | "gemini" | "azure-openai";
export type ProviderStatus = "connected" | "disconnected" | "error" | "pending";
export type ConversationType = "single" | "group";
export type MessageRole = "user" | "assistant" | "system" | "tool";
export type McpToolType = "local" | "remote";
export type McpToolScope = "global" | "identity-bound" | "ad-hoc";

export interface CustomHeader {
  name: string;
  value: string;
}

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  apiVersion?: string;
  customHeaders: CustomHeader[];
  enabled: boolean;
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

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "auto";

export interface IdentityParams {
  temperature: number;
  topP: number;
  reasoningEffort?: ReasoningEffort;
}

export interface Identity {
  id: string;
  name: string;
  icon: string;
  systemPrompt: string;
  params: IdentityParams;
  mcpToolIds: string[];
  mcpServerIds?: string[];
  createdAt: string;
}

// Persisted MCP server configuration
export interface McpServer {
  id: string;
  name: string;
  url: string;
  customHeaders?: CustomHeader[];
  enabled: boolean;
}

// Legacy tool interface — still used for built-in tools
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
  builtIn?: boolean;
  schema: McpToolSchema | null;
  customHeaders?: CustomHeader[];
}

export interface McpToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// Runtime tool definition discovered from an MCP server
export interface DiscoveredTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConversationParticipant {
  id: string;
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

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export enum MessageStatus {
  PENDING = "pending",
  STREAMING = "streaming",
  SUCCESS = "success",
  ERROR = "error",
  PAUSED = "paused",
}

export enum MessageBlockType {
  MAIN_TEXT = "main_text",
  THINKING = "thinking",
  TOOL = "tool",
  IMAGE = "image",
  ERROR = "error",
}

export enum MessageBlockStatus {
  PENDING = "pending",
  STREAMING = "streaming",
  SUCCESS = "success",
  ERROR = "error",
}

export interface MessageBlock {
  id: string;
  messageId: string;
  type: MessageBlockType;
  content: string;
  status: MessageBlockStatus;
  metadata: Record<string, unknown> | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  senderModelId: string | null;
  senderName: string | null;
  identityId: string | null;
  participantId: string | null;
  content: string;
  images: string[];
  generatedImages: string[];
  reasoningContent: string | null;
  reasoningDuration: number | null;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  branchId: string | null;
  parentMessageId: string | null;
  /** @deprecated Use status instead */
  isStreaming: boolean;
  status: MessageStatus;
  errorMessage: string | null;
  tokenUsage: TokenUsage | null;
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

export interface ChatApiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatApiMessage {
  role: MessageRole;
  content: string | ChatApiContentPart[];
  name?: string;
  tool_calls?: ChatApiToolCall[];
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
  [key: string]: unknown;
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

export interface ConversationFilter {
  type: "all" | "experts" | "work" | "creatives";
}
