/**
 * Context Compression — dynamically compresses old messages before sending to API.
 *
 * Strategy: estimate token count of messages array. If over threshold,
 * call a cheap model to summarize the oldest messages into a single
 * "[Previous conversation summary]" message, keeping recent messages intact.
 *
 * Inspired by LobeChat's compressContext / summaryHistory chains.
 */
import { appFetch } from "./http";

// ── Token estimation ──

/** Rough token estimate: ~4 chars per token for English, ~2 for CJK */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters
  const cjk = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjk?.length ?? 0;
  const nonCjkLength = text.length - cjkCount;
  return Math.ceil(nonCjkLength / 4 + cjkCount / 2);
}

/** Estimate total tokens for an array of API messages */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: unknown }>,
): number {
  let total = 0;
  for (const m of messages) {
    total += 4; // message overhead
    if (typeof m.content === "string") {
      total += estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part.type === "text" && part.text) total += estimateTokens(part.text);
        if (part.type === "image_url") total += 85; // image token estimate
      }
    }
  }
  return total;
}

// ── Compression prompt ──

const COMPRESS_SYSTEM_PROMPT = `You are a conversation context compressor. Create a concise summary that preserves essential information for conversation continuity.

## Rules
- Output in the SAME LANGUAGE as the conversation
- Preserve ALL technical terms, code, file paths, and proper nouns exactly
- Achieve 70-80% compression (summary = 20-30% of original)
- Use bullet points for clarity
- Never invent information not present in the original

## Output Format
Structure using these sections (omit empty ones):

### Context
Brief background (1-2 sentences)

### Key Information
- Critical facts, data, specifications
- Technical details, configurations

### Decisions & Action Items
- Decisions made, solutions agreed upon
- Tasks planned, next steps

### Code & Technical
\`\`\`
Essential code snippets or commands
\`\`\``;

const COMPRESS_USER_PROMPT = `Please compress the above conversation history into a structured summary. Output ONLY the summary, no commentary.`;

// ── Compression logic ──

export interface CompressOptions {
  /** Max tokens before compression triggers (default: 8000) */
  maxTokens?: number;
  /** Number of recent messages to always keep uncompressed (default: 6) */
  keepRecentCount?: number;
  /** Provider base URL for compression model call */
  baseUrl: string;
  /** Headers for the API call */
  headers: Record<string, string>;
  /** Model ID to use for compression (should be cheap/fast) */
  model: string;
  /** AbortSignal */
  signal?: AbortSignal;
}

/** Split messages into system, old (to compress), and recent (to keep) */
function splitMessages(
  messages: Array<{ role: string; content: unknown }>,
  keepRecentCount: number,
): {
  systemMsgs: Array<{ role: string; content: unknown }>;
  toCompress: Array<{ role: string; content: unknown }>;
  toKeep: Array<{ role: string; content: unknown }>;
} {
  const systemMsgs: Array<{ role: string; content: unknown }> = [];
  const convMsgs: Array<{ role: string; content: unknown }> = [];
  for (const m of messages) {
    if (m.role === "system") systemMsgs.push(m);
    else convMsgs.push(m);
  }
  const keepCount = Math.min(keepRecentCount, convMsgs.length);
  return {
    systemMsgs,
    toCompress: convMsgs.slice(0, convMsgs.length - keepCount),
    toKeep: convMsgs.slice(convMsgs.length - keepCount),
  };
}

/** Call the LLM to generate a compression summary */
async function callCompressionApi(
  toCompress: Array<{ role: string; content: unknown }>,
  baseUrl: string,
  headers: Record<string, string>,
  model: string,
  signal?: AbortSignal,
): Promise<string> {
  const compressText = toCompress
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}]: ${content}`;
    })
    .join("\n\n");

  const response = await appFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: COMPRESS_SYSTEM_PROMPT },
        { role: "user", content: compressText },
        { role: "user", content: COMPRESS_USER_PROMPT },
      ],
      stream: false,
      max_tokens: 1000,
      temperature: 0.2,
    }),
    signal,
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("Empty compression result");
  return summary;
}

/**
 * Compress API messages if they exceed the token threshold.
 * Returns the (possibly compressed) messages array.
 */
export async function compressIfNeeded(
  messages: Array<{ role: string; content: unknown }>,
  options: CompressOptions,
): Promise<{ messages: Array<{ role: string; content: unknown }>; compressed: boolean }> {
  const { maxTokens = 8000, keepRecentCount = 6, baseUrl, headers, model, signal } = options;

  if (estimateMessagesTokens(messages) <= maxTokens) {
    return { messages, compressed: false };
  }

  const { systemMsgs, toCompress, toKeep } = splitMessages(messages, keepRecentCount);
  if (toCompress.length <= 1) return { messages, compressed: false };

  try {
    const summary = await callCompressionApi(toCompress, baseUrl, headers, model, signal);
    const originalTokens = estimateMessagesTokens(toCompress);
    const compressedTokens = estimateTokens(summary);
    console.log(
      `[ContextCompression] ${toCompress.length} messages: ${originalTokens} → ${compressedTokens} tokens (${Math.round((1 - compressedTokens / originalTokens) * 100)}% reduction)`,
    );
    return {
      messages: [
        ...systemMsgs,
        { role: "user", content: `[Previous conversation summary]\n${summary}` },
        ...toKeep,
      ],
      compressed: true,
    };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    console.warn("[ContextCompression] Failed, using original messages:", err);
    return { messages, compressed: false };
  }
}

// ── Manual compression cache ──

/** In-memory cache: conversationId → summary text */
const _manualSummaryCache = new Map<string, string>();

export function getManualSummary(conversationId: string): string | null {
  return _manualSummaryCache.get(conversationId) ?? null;
}

export function setManualSummary(conversationId: string, summary: string): void {
  _manualSummaryCache.set(conversationId, summary);
}

export function clearManualSummary(conversationId: string): void {
  _manualSummaryCache.delete(conversationId);
}

/**
 * Manually compress the conversation history right now.
 * Returns the generated summary text.
 */
export async function manualCompress(
  messages: Array<{ role: string; content: unknown }>,
  options: Omit<CompressOptions, "maxTokens">,
): Promise<{ summary: string; originalTokens: number; compressedTokens: number }> {
  const { toCompress } = splitMessages(messages, options.keepRecentCount ?? 4);
  if (toCompress.length <= 1) throw new Error("Not enough messages to compress");

  const summary = await callCompressionApi(
    toCompress,
    options.baseUrl,
    options.headers,
    options.model,
    options.signal,
  );
  const originalTokens = estimateMessagesTokens(toCompress);
  const compressedTokens = estimateTokens(summary);
  return { summary, originalTokens, compressedTokens };
}
