/**
 * ai-sdk-converter.ts — Converts between Talkio's internal types and
 * Vercel AI SDK v6 types.
 *
 * Handles:
 * - ChatApiMessage[] → ModelMessage[] (for streamText/generateText)
 * - ChatApiToolDef[] → ToolSet (for AI SDK tools)
 */

import { jsonSchema, tool } from "ai";
import type { ModelMessage, ToolSet } from "ai";
import type { ChatApiMessage, ChatApiToolDef } from "../../types";

/**
 * Convert Talkio ChatApiMessage[] to AI SDK ModelMessage[].
 *
 * AI SDK v6 ModelMessage supports:
 * - { role: "system", content: string }
 * - { role: "user", content: string | UserContent[] }
 * - { role: "assistant", content: string | AssistantContent[] }
 * - { role: "tool", content: ToolContent[] }
 */
export function toModelMessages(messages: ChatApiMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "system":
        result.push({
          role: "system",
          content: typeof msg.content === "string" ? msg.content : "",
        });
        break;

      case "user": {
        if (typeof msg.content === "string") {
          result.push({ role: "user", content: msg.content });
        } else if (Array.isArray(msg.content)) {
          const parts = msg.content.map((part) => {
            if (part.type === "text") {
              return { type: "text" as const, text: part.text };
            }
            if (part.type === "image_url" && part.image_url?.url) {
              return { type: "image" as const, image: part.image_url.url };
            }
            return { type: "text" as const, text: "" };
          });
          result.push({ role: "user", content: parts });
        }
        break;
      }

      case "assistant": {
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Assistant message with tool calls — build AssistantContent array
          const parts: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }> = [];
          if (typeof msg.content === "string" && msg.content) {
            parts.push({ type: "text", text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            let input: unknown = {};
            try {
              input = JSON.parse(tc.function.arguments);
            } catch { /* empty args */ }
            parts.push({
              type: "tool-call",
              toolCallId: tc.id,
              toolName: tc.function.name,
              input,
            });
          }
          result.push({ role: "assistant", content: parts as any });
        } else {
          result.push({
            role: "assistant",
            content: typeof msg.content === "string" ? msg.content : "",
          });
        }
        break;
      }

      case "tool": {
        if (msg.tool_call_id) {
          result.push({
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: msg.tool_call_id,
                toolName: "",
                output: {
                  type: "text" as const,
                  value: typeof msg.content === "string" ? msg.content : "",
                },
              },
            ],
          });
        }
        break;
      }
    }
  }

  return result;
}

/**
 * Convert Talkio ChatApiToolDef[] to AI SDK ToolSet.
 *
 * Uses AI SDK's jsonSchema() to pass through JSON Schema directly,
 * avoiding the need for Zod conversion.
 * No execute function — we handle execution manually after streamText.
 */
export function toAiSdkTools(toolDefs: ChatApiToolDef[]): ToolSet {
  const tools: ToolSet = {};

  for (const def of toolDefs) {
    const { name, description, parameters } = def.function;
    tools[name] = tool({
      description,
      inputSchema: jsonSchema(parameters),
    });
  }

  return tools;
}
