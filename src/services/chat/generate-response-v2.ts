/**
 * generate-response-v2.ts — AI SDK powered response generation.
 *
 * Replaces the manual SSE parsing in generate-response.ts with
 * Vercel AI SDK v6's streamText. Key improvements:
 * - No manual SSE line parsing
 * - Reasoning support via raw SSE extraction + <think> tag parsing + native reasoning-delta
 * - Unified provider interface (OpenAI, Anthropic, Gemini, Azure)
 * - Automatic tool call handling via stepCountIs()
 */

import { streamText, generateText, stepCountIs } from "ai";
import type {
  Conversation,
  Message,
  ChatApiToolDef,
  Identity,
} from "../../types";
import { MessageStatus, MessageBlockType, MessageBlockStatus } from "../../types";
import { generateId } from "../../utils/id";
import {
  insertMessage,
  updateMessage as dbUpdateMessage,
  updateConversation as dbUpdateConversation,
  getRecentMessages as dbGetRecentMessages,
  insertBlock,
  updateBlock as dbUpdateBlock,
} from "../../storage/database";
import { batchUpdateMessage, flushBatchUpdates } from "../../storage/batch-writer";
import { batchUpdateBlock, flushBlockBatchUpdates } from "../../storage/block-batch-writer";
import { useProviderStore } from "../../stores/provider-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useChatStore } from "../../stores/chat-store";
import { logger } from "../logger";
import { createLanguageModel } from "../ai-provider";
import { buildApiMessages } from "./message-builder";
import { buildTools } from "./tool-executor";
import { toModelMessages, toAiSdkTools } from "./ai-sdk-converter";

const log = logger.withContext("ChatServiceV2");

export async function generateResponseV2(
  conversationId: string,
  modelId: string,
  conv: Conversation,
  signal?: AbortSignal,
): Promise<void> {
  const providerStore = useProviderStore.getState();
  const identityStore = useIdentityStore.getState();
  const chatStore = useChatStore.getState();

  const model = providerStore.getModelById(modelId);
  if (!model) {
    log.warn(`Model not found: ${modelId}`);
    return;
  }

  const provider = providerStore.getProviderById(model.providerId);
  if (!provider) {
    log.warn(`Provider not found: ${model.providerId}`);
    return;
  }

  const participant = conv.participants.find((p) => p.modelId === modelId);
  const identity: Identity | undefined = participant?.identityId
    ? identityStore.getIdentityById(participant.identityId)
    : undefined;

  // Read messages from DB (single source of truth)
  const dbMessages = await dbGetRecentMessages(conversationId, chatStore.activeBranchId, 100);
  const apiMessages = await buildApiMessages(dbMessages, modelId, identity);

  // Create assistant message FIRST so loading animation appears immediately
  const assistantMsg: Message = {
    id: generateId(),
    conversationId,
    role: "assistant",
    senderModelId: modelId,
    senderName: model.displayName,
    identityId: identity?.id ?? null,
    content: "",
    images: [],
    generatedImages: [],
    reasoningContent: null,
    reasoningDuration: null,
    toolCalls: [],
    toolResults: [],
    branchId: chatStore.activeBranchId,
    parentMessageId: null,
    isStreaming: true,
    status: MessageStatus.STREAMING,
    errorMessage: null,
    createdAt: new Date().toISOString(),
  };

  await insertMessage(assistantMsg);

  // Create initial MAIN_TEXT block
  const mainTextBlockId = generateId();
  let thinkingBlockId: string | null = null;
  await insertBlock({
    id: mainTextBlockId,
    messageId: assistantMsg.id,
    type: MessageBlockType.MAIN_TEXT,
    content: "",
    status: MessageBlockStatus.STREAMING,
    metadata: null,
    sortOrder: 1,
    createdAt: assistantMsg.createdAt,
    updatedAt: null,
  });

  // Discover tools AFTER showing loading animation
  log.info(`[v2] Building tools for ${model.displayName}...`);
  let toolDefs: ChatApiToolDef[] = [];
  try {
    toolDefs = await buildTools(model, identity);
  } catch (err) {
    log.warn(`[v2] buildTools failed: ${err instanceof Error ? err.message : err}`);
  }
  log.info(`[v2] Tools ready: ${toolDefs.length} tools`);

  // Helper: always mark message as done, never throws
  const finishMessage = async (finalContent: string) => {
    try {
      await dbUpdateMessage(assistantMsg.id, { content: finalContent, isStreaming: false });
    } catch (e) {
      log.error(`DB update failed: ${e}`);
    }
  };

  try {
    // Create AI SDK language model
    const languageModel = createLanguageModel(provider, model.modelId);

    // Convert messages and tools to AI SDK format
    const sdkMessages = toModelMessages(apiMessages);
    const sdkTools = toolDefs.length > 0 ? toAiSdkTools(toolDefs) : undefined;

    // Build provider-specific options
    const effort = identity?.params.reasoningEffort ?? "auto";
    const isOModel = /\b(o1|o3|o4)\b/.test(model.modelId.toLowerCase());
    const mid = model.modelId.toLowerCase();
    const maxTemp = (mid.includes("claude") || mid.includes("gemini")) ? 1 : 2;
    let temperature = identity?.params.temperature;
    if (temperature !== undefined) {
      temperature = Math.min(Math.max(temperature, 0), maxTemp);
    }

    // Build providerOptions to enable reasoning/thinking per provider
    const providerOptions: Record<string, Record<string, unknown>> = {};
    const supportsReasoning = model.capabilities?.reasoning;

    if (supportsReasoning && effort !== "none") {
      if (provider.type === "anthropic") {
        const budgetMap: Record<string, number> = { low: 4096, medium: 8192, high: 16384, auto: 8192 };
        providerOptions.anthropic = {
          thinking: { type: "enabled", budgetTokens: budgetMap[effort] ?? 8192 },
        };
      } else if (provider.type === "gemini") {
        const levelMap: Record<string, string> = { low: "low", medium: "medium", high: "high", auto: "medium" };
        providerOptions.google = {
          thinkingConfig: { thinkingLevel: levelMap[effort] ?? "medium" },
        };
      } else {
        // OpenAI and OpenAI-compatible (o1/o3/o4, DeepSeek, etc.)
        providerOptions.openai = {
          reasoningEffort: effort === "auto" ? "medium" : effort,
        };
      }
    }

    log.info(`[v2] Starting streamText for ${model.modelId}, reasoning=${supportsReasoning}, effort=${effort}, providerType=${provider.type}, providerOptions=${JSON.stringify(providerOptions)}`);

    const result = streamText({
      model: languageModel,
      messages: sdkMessages,
      tools: sdkTools,
      temperature: isOModel ? undefined : temperature,
      topP: isOModel ? undefined : identity?.params.topP,
      abortSignal: signal,
      providerOptions: providerOptions as any,
      // Let AI SDK handle up to 3 steps (tool call rounds) automatically
      stopWhen: toolDefs.length > 0 ? stepCountIs(3) : stepCountIs(1),
      // Enable raw chunks so we can extract reasoning_content from SSE
      // that AI SDK's @ai-sdk/openai doesn't natively parse
      includeRawChunks: true,
    });

    // Some OpenAI-compatible providers (DeepSeek, Hunyuan) embed reasoning
    // inside <think>...</think> tags in the text content instead of using
    // the native reasoning stream. We detect and parse these inline.
    let inThinkTag = false;

    // Stream processing with throttled UI updates
    const contentChunks: string[] = [];
    const reasoningChunks: string[] = [];
    let contentLen = 0;
    let reasoningLen = 0;
    let chunkCount = 0;
    let uiDirty = false;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const UI_THROTTLE_MS = 120;

    const flushUI = () => {
      flushTimer = null;
      if (!uiDirty) return;
      uiDirty = false;

      const joinedContent = contentChunks.join("");
      const joinedReasoning = reasoningChunks.join("");

      batchUpdateMessage(assistantMsg.id, {
        content: joinedContent,
        reasoningContent: joinedReasoning || null,
      });

      batchUpdateBlock(mainTextBlockId, {
        content: joinedContent,
        status: MessageBlockStatus.STREAMING,
      });

      if (joinedReasoning) {
        if (!thinkingBlockId) {
          thinkingBlockId = generateId();
          insertBlock({
            id: thinkingBlockId,
            messageId: assistantMsg.id,
            type: MessageBlockType.THINKING,
            content: joinedReasoning,
            status: MessageBlockStatus.STREAMING,
            metadata: null,
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: null,
          }).catch((e) => log.error(`Insert thinking block failed: ${e}`));
        } else {
          batchUpdateBlock(thinkingBlockId, {
            content: joinedReasoning,
            status: MessageBlockStatus.STREAMING,
          });
        }
      }
    };

    const scheduleFlush = () => {
      uiDirty = true;
      if (!flushTimer) flushTimer = setTimeout(flushUI, UI_THROTTLE_MS);
    };

    // Process the stream using AI SDK's structured parts
    for await (const part of result.fullStream) {
      chunkCount++;
      if (chunkCount === 1) log.info(`[v2] First chunk received`);

      switch (part.type) {
        case "text-delta": {
          // Handle <think>...</think> tags from OpenAI-compatible providers
          let chunk = part.text;
          while (chunk) {
            if (inThinkTag) {
              const closeIdx = chunk.indexOf("</think>");
              if (closeIdx !== -1) {
                const rPart = chunk.slice(0, closeIdx);
                reasoningChunks.push(rPart);
                reasoningLen += rPart.length;
                chunk = chunk.slice(closeIdx + 8);
                inThinkTag = false;
              } else {
                reasoningChunks.push(chunk);
                reasoningLen += chunk.length;
                chunk = "";
              }
            } else {
              const openIdx = chunk.indexOf("<think>");
              if (openIdx !== -1) {
                const cPart = chunk.slice(0, openIdx);
                if (cPart) {
                  contentChunks.push(cPart);
                  contentLen += cPart.length;
                }
                chunk = chunk.slice(openIdx + 7);
                inThinkTag = true;
              } else {
                contentChunks.push(chunk);
                contentLen += chunk.length;
                chunk = "";
              }
            }
          }
          scheduleFlush();
          break;
        }
        case "reasoning-delta": {
          // Native reasoning from providers that support it (Anthropic, OpenAI o-series)
          reasoningChunks.push(part.text);
          reasoningLen += part.text.length;
          scheduleFlush();
          break;
        }
        case "tool-call": {
          log.info(`[v2] Tool call: ${part.toolName}`);
          break;
        }
        case "tool-result": {
          log.info(`[v2] Tool result for: ${part.toolName}`);
          break;
        }
        case "raw": {
          // Extract reasoning_content from raw SSE chunks for OpenAI-compatible
          // providers (DeepSeek, etc.) that send reasoning in a separate field
          try {
            const raw = part.rawValue as any;
            // OpenAI chat completions SSE format: { choices: [{ delta: { reasoning_content } }] }
            const rc = raw?.choices?.[0]?.delta?.reasoning_content;
            if (rc && typeof rc === "string") {
              reasoningChunks.push(rc);
              reasoningLen += rc.length;
              scheduleFlush();
            }
          } catch { /* ignore malformed raw chunks */ }
          break;
        }
        case "error": {
          log.error(`[v2] Stream error part: ${part.error}`);
          break;
        }
      }
    }

    // Final flush
    if (flushTimer) clearTimeout(flushTimer);
    if (uiDirty) flushUI();

    // Build final content from our collected chunks.
    // We use our own chunks instead of result.text because:
    // 1. <think> tags are stripped from contentChunks (result.text includes them)
    // 2. reasoningChunks captures both native reasoning-delta AND <think> tag content
    const nativeReasoning = await result.reasoning;
    const nativeReasoningText = nativeReasoning?.map((r: any) => {
      if (r.type === "text") return r.text;
      if (typeof r === "string") return r;
      return "";
    }).join("") || "";

    // Merge: prefer our collected reasoning (includes <think> tags), fall back to native
    const collectedReasoning = reasoningChunks.join("");
    const content = contentChunks.join("") || await result.text;
    const reasoningContent = collectedReasoning || nativeReasoningText || null;

    // Get tool calls and results from the final result
    const finalToolCalls = (await result.toolCalls).map((tc: any) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      arguments: JSON.stringify(tc.input),
    }));
    const finalToolResults = (await result.toolResults).map((tr: any) => ({
      toolCallId: tr.toolCallId,
      content: typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output),
    }));

    // Flush pending batched updates
    await flushBatchUpdates([assistantMsg.id]);
    const blockIdsToFlush = [mainTextBlockId];
    if (thinkingBlockId) blockIdsToFlush.push(thinkingBlockId);
    await flushBlockBatchUpdates(blockIdsToFlush);

    // Final DB commit
    await dbUpdateMessage(assistantMsg.id, {
      content,
      reasoningContent,
      toolCalls: finalToolCalls,
      toolResults: finalToolResults,
      isStreaming: false,
      status: MessageStatus.SUCCESS,
    });

    await dbUpdateBlock(mainTextBlockId, { content, status: MessageBlockStatus.SUCCESS });
    if (thinkingBlockId && reasoningContent) {
      await dbUpdateBlock(thinkingBlockId, { content: reasoningContent, status: MessageBlockStatus.SUCCESS });
    }

    const now = new Date().toISOString();
    dbUpdateConversation(conversationId, {
      lastMessage: content.slice(0, 100),
      lastMessageAt: now,
    }).catch((e) => log.error(`DB conversation update failed: ${e}`));

    log.info(`[v2] Stream complete. ${chunkCount} chunks, content=${content.length} chars, reasoning=${reasoningContent?.length ?? 0} chars, inThinkTag=${inThinkTag}`);

    // Auto-generate title
    autoGenerateTitleV2(conversationId, languageModel, model, dbMessages, content).catch(() => {});

  } catch (err) {
    let errMsg: string;
    if (err instanceof Error) {
      errMsg = err.message || err.name || "Unknown Error";
    } else if (typeof err === "string") {
      errMsg = err;
    } else {
      try { errMsg = JSON.stringify(err); } catch { errMsg = String(err); }
    }
    const errStack = err instanceof Error ? err.stack : "";
    console.warn(`⚠️ [v2] Stream error [${model.displayName}]: ${errMsg}`);
    log.error(`[v2] Stream error for ${model.displayName}: ${errMsg}\n${errStack}`);

    if (signal?.aborted) {
      await finishMessage("(stopped)");
      dbUpdateMessage(assistantMsg.id, { status: MessageStatus.PAUSED }).catch(() => {});
      return;
    }
    await finishMessage(`[${model.displayName}] Error: ${errMsg}`);
    dbUpdateMessage(assistantMsg.id, {
      status: MessageStatus.ERROR,
      errorMessage: errMsg,
    }).catch(() => {});
  }
}

/**
 * Auto-generate conversation title using AI SDK's generateText.
 * Replaces the legacy ApiClient.chat() call.
 */
async function autoGenerateTitleV2(
  conversationId: string,
  languageModel: ReturnType<typeof createLanguageModel>,
  model: { modelId: string; displayName: string },
  previousMessages: Message[],
  assistantContent: string,
): Promise<void> {
  const { getConversation: dbGetConversation, updateConversation: dbUpdateConv } = await import("../../storage/database");

  const assistantCount = previousMessages.filter((m) => m.role === "assistant").length;
  if (assistantCount > 0) return;

  const conv = await dbGetConversation(conversationId);
  if (!conv) return;

  const isDefaultTitle = conv.title.startsWith("Model Group") || conv.title === model.displayName;
  if (!isDefaultTitle) return;

  const userMsg = previousMessages.find((m) => m.role === "user");
  if (!userMsg) return;

  try {
    const { text } = await generateText({
      model: languageModel,
      system: "Generate a very short title (3-8 words) for this conversation. Return ONLY the title text, no quotes, no punctuation at the end.",
      prompt: `User: ${userMsg.content.slice(0, 300)}\n\nAssistant: ${assistantContent.slice(0, 300)}\n\nGenerate a short title for this conversation.`,
      temperature: 0.3,
      maxOutputTokens: 30,
    });

    const title = text.trim().replace(/^["']|["']$/g, "");
    if (!title || title.length > 60) return;

    await dbUpdateConv(conversationId, { title });
  } catch {
    // Non-critical, silently fail
  }
}
