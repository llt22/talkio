import type { ApiFormat } from "../../types";
import type { ProviderAdapter } from "./types";
import { ChatCompletionsAdapter } from "./chat-completions";
import { ResponsesAdapter } from "./responses";

const chatCompletionsAdapter = new ChatCompletionsAdapter();
const responsesAdapter = new ResponsesAdapter();

/** Get the appropriate adapter for a provider's API format */
export function getAdapter(apiFormat?: ApiFormat): ProviderAdapter {
  return apiFormat === "responses" ? responsesAdapter : chatCompletionsAdapter;
}

export type { ProviderAdapter, StreamDelta, StreamChatParams, StreamChatResult, ChatParams, ProbeParams, ProbeResult } from "./types";
