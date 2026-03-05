import type { SseUsage } from "../openai-chat-sse";

/** Normalized delta emitted by SSE consumers — protocol-agnostic */
export interface StreamDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

/** Parameters for a streaming chat request */
export interface StreamChatParams {
  baseUrl: string;
  headers: Record<string, string>;
  modelId: string;
  messages: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }>;
  identity?: any;
  reasoningEffort?: string;
  toolDefs?: any[];
  signal: AbortSignal;
  onDelta: (delta: StreamDelta) => void;
}

/** Result of a streaming chat request */
export interface StreamChatResult {
  usage: SseUsage | null;
}

/** Parameters for a non-streaming chat request (e.g. compression) */
export interface ChatParams {
  baseUrl: string;
  headers: Record<string, string>;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/** Parameters for probing model capabilities */
export interface ProbeParams {
  baseUrl: string;
  headers: Record<string, string>;
  modelId: string;
}

/** Model capabilities result */
export interface ProbeResult {
  vision: boolean;
  toolCall: boolean;
  reasoning: boolean;
  streaming: boolean;
}

/**
 * ProviderAdapter — abstracts protocol differences between API formats.
 *
 * Each adapter encapsulates:
 * - Request body construction
 * - SSE stream consumption
 * - Response parsing
 * - Capability probing
 */
export interface ProviderAdapter {
  /** Streaming chat — the primary generation path */
  streamChat(params: StreamChatParams): Promise<StreamChatResult>;

  /** Non-streaming chat — used for context compression */
  chat(params: ChatParams): Promise<string>;

  /** Probe model capabilities (vision, tool call, reasoning) */
  probeCapabilities(params: ProbeParams): Promise<ProbeResult>;
}
