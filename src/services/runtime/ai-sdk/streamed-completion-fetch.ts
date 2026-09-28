/**
 * Transport-level compatibility shim for OpenAI-compatible gateways that keep
 * streaming no matter what the request asks for.
 *
 * Chatbox AI and several proxies answer non-streaming `POST /chat/completions`
 * requests (no `stream` field in the body) with an SSE stream. The AI SDK parses
 * non-streaming bodies as JSON, so such a response surfaces as an
 * `Invalid JSON response` error with a 2xx status — a healthy endpoint reported
 * as broken.
 *
 * This wrapper rebuilds the streamed completion into the JSON body the SDK
 * expects, before the SDK sees it. Only responses to non-streaming JSON requests
 * are touched; streaming requests are passed through untouched, and any response
 * that does not parse as a chat-completion stream is returned as-is.
 */
import { z } from "zod";

const streamedChunkSchema = z
  .object({
    id: z.string().nullish(),
    created: z.number().nullish(),
    model: z.string().nullish(),
    usage: z.unknown().nullish(),
    type: z.string().nullish(),
    error: z.union([z.string(), z.object({ message: z.string().nullish() })]).nullish(),
    choices: z
      .array(
        z
          .object({
            delta: z
              .object({
                content: z.string().nullish(),
                reasoning_content: z.string().nullish(),
                reasoning: z.string().nullish(),
                tool_calls: z
                  .array(
                    z
                      .object({
                        index: z.number().nullish(),
                        id: z.string().nullish(),
                        function: z
                          .object({ name: z.string().nullish(), arguments: z.string().nullish() })
                          .nullish(),
                      })
                      .passthrough(),
                  )
                  .nullish(),
              })
              .nullish(),
            finish_reason: z.string().nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

/** A streamed completion, or the error frame the gateway streamed instead. */
export type StreamedCompletion =
  | { kind: "completion"; body: string }
  | { kind: "error"; message: string };

/** Parse an SSE body into the equivalent non-streaming chat completion. */
export function completionFromEventStream(body: string): StreamedCompletion | undefined {
  const content: string[] = [];
  const reasoning: string[] = [];
  const toolCalls = new Map<number, { id?: string; name: string; arguments: string }>();
  let finishReason: string | null = null;
  let id: string | undefined;
  let created: number | undefined;
  let model: string | undefined;
  let usage: unknown;
  let streamError: string | undefined;
  let sawChunk = false;

  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    let decoded: unknown;
    try {
      decoded = JSON.parse(payload);
    } catch {
      continue;
    }
    const parsed = streamedChunkSchema.safeParse(decoded);
    if (!parsed.success) continue;
    const chunk = parsed.data;
    if (chunk.error != null && chunk.type == null && !Array.isArray(chunk.choices)) {
      // OpenAI-style error frame: the gateway accepted the request and failed inside the stream.
      sawChunk = true;
      streamError =
        typeof chunk.error === "string" ? chunk.error : (chunk.error.message ?? "Stream error");
      continue;
    }
    // Only an OpenAI-style chunk proves this is a chat-completion stream; any
    // other protocol's frames must fall through to the caller untouched.
    if (!Array.isArray(chunk.choices)) continue;
    sawChunk = true;
    if (chunk.error != null) {
      streamError =
        typeof chunk.error === "string" ? chunk.error : (chunk.error.message ?? "Stream error");
    }
    id ??= chunk.id ?? undefined;
    created ??= chunk.created ?? undefined;
    model ??= chunk.model ?? undefined;
    if (chunk.usage != null) usage = chunk.usage;

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta;
      if (delta?.content) content.push(delta.content);
      const thoughts = delta?.reasoning_content ?? delta?.reasoning;
      if (thoughts) reasoning.push(thoughts);
      for (const call of delta?.tool_calls ?? []) {
        const index = call.index ?? 0;
        const existing = toolCalls.get(index) ?? { name: "", arguments: "" };
        if (call.id) existing.id = call.id;
        if (call.function?.name) existing.name += call.function.name;
        if (call.function?.arguments) existing.arguments += call.function.arguments;
        toolCalls.set(index, existing);
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
  }

  if (!sawChunk) return undefined;
  if (streamError) return { kind: "error", message: streamError };

  const message: Record<string, unknown> = {
    role: "assistant",
    content: content.join("") || null,
  };
  if (reasoning.length > 0) message.reasoning_content = reasoning.join("");
  if (toolCalls.size > 0) {
    message.tool_calls = [...toolCalls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, call]) => ({
        id: call.id ?? `call_${index}`,
        function: { name: call.name, arguments: call.arguments },
      }));
  }

  return {
    kind: "completion",
    body: JSON.stringify({
      id,
      created,
      model,
      object: "chat.completion",
      choices: [{ index: 0, message, finish_reason: finishReason ?? "stop" }],
      ...(usage != null ? { usage } : {}),
    }),
  };
}

/** True when a raw request body is a chat-completions request asking for an SSE stream. */
function bodyRequestsStreaming(body: string): boolean {
  let decoded: unknown;
  try {
    decoded = JSON.parse(body);
  } catch {
    // Not a JSON body we can reason about: leave the response alone.
    return true;
  }
  if (typeof decoded !== "object" || decoded === null) return true;
  return "stream" in decoded && decoded.stream === true;
}

function respondWithBody(
  response: Response,
  body: string,
  contentType: string,
  status: number,
): Response {
  return new Response(body, {
    status,
    statusText: response.statusText,
    headers: { ...Object.fromEntries(response.headers), "content-type": contentType },
  });
}

/**
 * Wrap a fetch implementation so OpenAI-compatible providers tolerate gateways
 * that answer non-streaming requests with an SSE stream.
 */
export function createStreamedCompletionFetch(
  fetchImpl: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const requestBody = init?.body;
    const normalizable = typeof requestBody === "string" && !bodyRequestsStreaming(requestBody);

    const response = await fetchImpl(input, init);
    if (!normalizable || !response.ok) return response;
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/event-stream")) {
      return response;
    }

    const raw = await response.text();
    const completion = completionFromEventStream(raw);
    // Not a chat-completion stream: hand back what the gateway sent.
    if (completion === undefined) {
      return respondWithBody(response, raw, "text/event-stream", response.status);
    }
    // A stream that carries an error frame is a failure, not a completion.
    if (completion.kind === "error") {
      return respondWithBody(
        response,
        JSON.stringify({ error: { message: completion.message } }),
        "application/json",
        502,
      );
    }
    return respondWithBody(response, completion.body, "application/json", response.status);
  };
}
