/**
 * Generation helpers — stream flushing, SSE delta parsing, context compression bridge.
 * Extracted from chat-generation.ts for readability.
 */
import type { ApiFormat } from "../types";
import { compressIfNeeded, getManualSummary } from "../lib/context-compression";
import type { GenerationContext, StreamingState } from "./chat-generation";

// ── Tag search helper ──

/** Find the earliest occurrence of any of the given tags in a string */
export function findFirst(str: string, ...tags: string[]): { idx: number; len: number } | null {
  let best: { idx: number; len: number } | null = null;
  for (const tag of tags) {
    const i = str.indexOf(tag);
    if (i !== -1 && (best === null || i < best.idx)) best = { idx: i, len: tag.length };
  }
  return best;
}

// ── Stream flusher ──

/**
 * Create throttled streaming state updater (DRYs the duplicated pattern).
 * Uses a 100 ms interval instead of rAF (~16 ms) to reduce DOM churn during
 * fast SSE streams — mitigates WKWebView GPU-compositing black-screen on
 * macOS 12 / Apple Silicon and generally improves smoothness on lower-end HW.
 */
const STREAM_FLUSH_INTERVAL_MS = 100;

export function createStreamFlusher(
  ctx: GenerationContext,
  messageId: string,
  getContent: () => string,
  getReasoning: () => string,
) {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  function flush() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (!dirty) return;
    dirty = false;
    const sm: StreamingState = { cid: ctx.cid, messageId, content: getContent(), reasoning: getReasoning() };
    ctx.streamingMessages.set(messageId, sm);
    if (ctx.cid === ctx.getCurrentConversationId()) {
      const all = Array.from(ctx.streamingMessages.values()).filter((s) => s.cid === ctx.cid);
      ctx.setStoreState({ streamingMessages: all });
    }
  }

  function schedule() {
    dirty = true;
    if (timerId === null) {
      timerId = setTimeout(flush, STREAM_FLUSH_INTERVAL_MS);
    }
  }

  return { flush, schedule };
}

// ── SSE content parsing with think-tag support ──

export interface ContentAccumulator {
  fullContent: string;
  fullReasoning: string;
  inThinkTag: boolean;
  pendingToolCalls: { id: string; name: string; arguments: string }[];
}

export function processSseDelta(acc: ContentAccumulator, delta: any): void {
  const rc = delta.reasoning_content ?? delta.reasoning;
  if (rc) acc.fullReasoning += rc;

  if (delta.content) {
    let chunk = delta.content as string;
    while (chunk.length > 0) {
      if (acc.inThinkTag) {
        const m = findFirst(chunk, "</think>", "</thinking>");
        if (m) {
          acc.fullReasoning += chunk.slice(0, m.idx);
          chunk = chunk.slice(m.idx + m.len);
          acc.inThinkTag = false;
        } else {
          acc.fullReasoning += chunk;
          chunk = "";
        }
      } else {
        const m = findFirst(chunk, "<think>", "<thinking>");
        if (m) {
          acc.fullContent += chunk.slice(0, m.idx);
          chunk = chunk.slice(m.idx + m.len);
          acc.inThinkTag = true;
        } else {
          acc.fullContent += chunk;
          chunk = "";
        }
      }
    }
  }

  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      while (acc.pendingToolCalls.length <= idx) {
        acc.pendingToolCalls.push({ id: "", name: "", arguments: "" });
      }
      if (tc.id) acc.pendingToolCalls[idx].id = tc.id;
      if (tc.function?.name) acc.pendingToolCalls[idx].name += tc.function.name;
      if (tc.function?.arguments) acc.pendingToolCalls[idx].arguments += tc.function.arguments;
    }
  }
}

// ── Context compression bridge ──

/** Apply context compression (manual summary > cached group > auto-compress) */
export async function applyCompression(
  apiMessages: Array<{ role: string; content: unknown }>,
  ctx: GenerationContext,
  baseUrl: string,
  headers: Record<string, string>,
  modelId: string,
  apiFormat?: ApiFormat,
): Promise<Array<{ role: string; content: unknown }>> {
  const manualSummary = getManualSummary(ctx.cid);

  if (manualSummary) {
    return injectSummary(apiMessages, manualSummary);
  }
  if (ctx.compressionEnabled && ctx.cachedCompressionSummary) {
    return injectSummary(apiMessages, ctx.cachedCompressionSummary);
  }
  if (ctx.compressionEnabled) {
    const result = await compressIfNeeded(apiMessages, {
      maxTokens: ctx.compressionThreshold,
      keepRecentCount: 6,
      baseUrl,
      headers,
      model: modelId,
      apiFormat,
      signal: ctx.abortController.signal,
    });
    return result.messages;
  }
  return apiMessages;
}

export function injectSummary(
  apiMessages: Array<{ role: string; content: unknown }>,
  summary: string,
): Array<{ role: string; content: unknown }> {
  const systemMsgs = apiMessages.filter((m) => m.role === "system");
  const convMsgs = apiMessages.filter((m) => m.role !== "system");
  const keepCount = Math.min(6, convMsgs.length);
  const recent = convMsgs.slice(convMsgs.length - keepCount);
  return [...systemMsgs, { role: "user", content: summary }, ...recent];
}

// ── Tool helpers ──

/** Parse tool call arguments safely */
export function parseToolArgs(argsStr: string): Record<string, unknown> {
  try {
    return JSON.parse(argsStr);
  } catch {
    return {};
  }
}
