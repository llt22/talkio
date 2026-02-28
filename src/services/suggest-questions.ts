/**
 * Generate follow-up question suggestions based on conversation context.
 * Uses a lightweight non-streaming API call to the same provider.
 */
import { appFetch } from "../lib/http";
import { buildProviderHeaders } from "./provider-headers";
import type { Provider } from "../types";

function getSuggestPrompt(lang: string): string {
  if (lang.startsWith("zh")) {
    return "根据以上对话，建议3个用户可能想问的简短后续问题。每个问题不超过20个字。只返回3个问题，每行一个，不要编号或列表符号。";
  }
  return "Based on the conversation above, suggest exactly 3 short follow-up questions the user might want to ask. Each question should be concise (under 20 words). Return ONLY the 3 questions, one per line, without numbering or bullet points.";
}

export async function generateSuggestQuestions(
  lastMessages: { role: string; content: string }[],
  provider: Provider,
  modelId: string,
  lang: string = "en",
): Promise<string[]> {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const headers = buildProviderHeaders(provider);

  const messages = [
    ...lastMessages.slice(-4).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 2000),
    })),
    { role: "user" as const, content: getSuggestPrompt(lang) },
  ];

  const res = await appFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: 200,
      temperature: 0.7,
      stream: false,
    }),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";

  return text
    .split("\n")
    .map((line: string) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line: string) => line.length > 3 && line.length < 100)
    .slice(0, 3);
}
