/**
 * chat-service.ts — Re-exports from modular chat/ directory.
 *
 * The actual implementation is split into:
 *   chat/message-builder.ts      — resolveTargetParticipants, buildApiMessages
 *   chat/tool-executor.ts        — buildTools, executeToolCalls
 *   chat/generate-response-v2.ts — generateResponseV2 (AI SDK streamText)
 *   chat/ai-sdk-converter.ts     — toModelMessages, toAiSdkTools
 */

export { resolveTargetParticipants, buildApiMessages } from "./chat/message-builder";
export { buildTools, executeToolCalls } from "./chat/tool-executor";
export { generateResponseV2 } from "./chat/generate-response-v2";
