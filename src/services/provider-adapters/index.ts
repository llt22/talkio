import type { ApiFormat } from "../../types";
import type { ProviderAdapter } from "./types";
import { ChatCompletionsAdapter } from "./chat-completions";
import { ResponsesAdapter } from "./responses";
import { AnthropicMessagesAdapter } from "./anthropic-messages";
import { GeminiAdapter } from "./gemini";

const chatCompletionsAdapter = new ChatCompletionsAdapter();
const responsesAdapter = new ResponsesAdapter();
const anthropicMessagesAdapter = new AnthropicMessagesAdapter();
const geminiAdapter = new GeminiAdapter();

/** Get the appropriate adapter for a provider's API format */
export function getAdapter(apiFormat?: ApiFormat): ProviderAdapter {
  if (apiFormat === "responses") return responsesAdapter;
  if (apiFormat === "anthropic-messages") return anthropicMessagesAdapter;
  if (apiFormat === "gemini-generate-content") return geminiAdapter;
  return chatCompletionsAdapter;
}

export type {
  ProviderAdapter,
  StreamDelta,
  StreamChatParams,
  StreamChatResult,
  ChatParams,
  ProbeParams,
  ProbeResult,
} from "./types";
