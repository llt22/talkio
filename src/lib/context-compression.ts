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

/**
 * Compress API messages if they exceed the token threshold.
 * Returns the (possibly compressed) messages array.
 *
 * - If under threshold: returns original messages unchanged
 * - If over threshold: summarizes old messages, returns [system, summary, ...recent]
 */
export async function compressIfNeeded(
  messages: Array<{ role: string; content: unknown }>,
  options: CompressOptions,
): Promise<{ messages: Array<{ role: string; content: unknown }>; compressed: boolean }> {
  const {
    maxTokens = 8000,
    keepRecentCount = 6,
    baseUrl,
    headers,
    model,
    signal,
  } = options;

  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens <= maxTokens) {
    return { messages, compressed: false };
  }

  console.log(`[ContextCompression] ${totalTokens} tokens > ${maxTokens} threshold, compressing...`);

  // Split: system message(s) + old messages + recent messages
  const systemMessages: Array<{ role: string; content: unknown }> = [];
  const conversationMessages: Array<{ role: string; content: unknown }> = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemMessages.push(m);
    } else {
      conversationMessages.push(m);
    }
  }

  // Keep at least keepRecentCount conversation messages uncompressed
  const keepCount = Math.min(keepRecentCount, conversationMessages.length);
  const toCompress = conversationMessages.slice(0, conversationMessages.length - keepCount);
  const toKeep = conversationMessages.slice(conversationMessages.length - keepCount);

  if (toCompress.length <= 1) {
    // Not enough messages to compress
    return { messages, compressed: false };
  }

  // Build the text to compress
  const compressText = toCompress
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}]: ${content}`;
    })
    .join("\n\n");

  try {
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

    if (!response.ok) {
      console.warn(`[ContextCompression] API error ${response.status}, skipping compression`);
      return { messages, compressed: false };
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      console.warn("[ContextCompression] Empty summary, skipping");
      return { messages, compressed: false };
    }

    const compressedTokens = estimateTokens(summary);
    const originalTokens = estimateMessagesTokens(toCompress);
    console.log(
      `[ContextCompression] Compressed ${toCompress.length} messages: ${originalTokens} → ${compressedTokens} tokens (${Math.round((1 - compressedTokens / originalTokens) * 100)}% reduction)`,
    );

    // Build new messages: system + summary + recent
    const summaryMessage = {
      role: "user" as const,
      content: `[Previous conversation summary]\n${summary}`,
    };

    return {
      messages: [...systemMessages, summaryMessage, ...toKeep],
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
  // Separate system messages from conversation messages
  const systemMessages: Array<{ role: string; content: unknown }> = [];
  const conversationMessages: Array<{ role: string; content: unknown }> = [];
  for (const m of messages) {
    if (m.role === "system") systemMessages.push(m);
    else conversationMessages.push(m);
  }

  const keepCount = Math.min(options.keepRecentCount ?? 4, conversationMessages.length);
  const toCompress = conversationMessages.slice(0, conversationMessages.length - keepCount);

  if (toCompress.length <= 1) {
    throw new Error("Not enough messages to compress");
  }

  const compressText = toCompress
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role}]: ${content}`;
    })
    .join("\n\n");

  const response = await appFetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: COMPRESS_SYSTEM_PROMPT },
        { role: "user", content: compressText },
        { role: "user", content: COMPRESS_USER_PROMPT },
      ],
      stream: false,
      max_tokens: 1000,
      temperature: 0.2,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Compression API error: ${response.status}`);
  }

  const data = await response.json();
  const summary = data.choices?.[0]?.message?.content?.trim();
  if (!summary) throw new Error("Empty compression result");

  const originalTokens = estimateMessagesTokens(toCompress);
  const compressedTokens = estimateTokens(summary);

  return { summary, originalTokens, compressedTokens };
}
