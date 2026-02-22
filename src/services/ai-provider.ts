/**
 * ai-provider.ts — Unified AI SDK provider factory for Talkio.
 *
 * Maps Talkio's Provider config to Vercel AI SDK provider instances.
 * Supports: OpenAI(-compatible), Anthropic, Gemini, Azure OpenAI.
 *
 * Inspired by cherry-studio-app's provider/factory.ts but simplified
 * for Talkio's 4 provider types.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAzure } from "@ai-sdk/azure";
import { fetch as expoFetch } from "expo/fetch";
import type { LanguageModel } from "ai";
import type { Provider, ProviderType } from "../types";
import { logger } from "./logger";

const log = logger.withContext("AiProvider");

/**
 * Create a Vercel AI SDK LanguageModel from a Talkio Provider + modelId.
 *
 * This replaces the manual per-provider HTTP handling in ApiClient
 * with a single unified interface that supports streaming, tool calling,
 * and reasoning out of the box.
 */
export function createLanguageModel(
  provider: Provider,
  modelId: string,
): LanguageModel {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const customHeaders: Record<string, string> = {};
  for (const h of provider.customHeaders ?? []) {
    if (h.name && h.value) customHeaders[h.name] = h.value;
  }

  switch (provider.type) {
    case "anthropic": {
      const anthropic = createAnthropic({
        baseURL: `${baseUrl}`,
        apiKey: provider.apiKey,
        headers: customHeaders,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
      });
      return anthropic(modelId);
    }

    case "gemini": {
      const google = createGoogleGenerativeAI({
        baseURL: `${baseUrl}`,
        apiKey: provider.apiKey,
        headers: customHeaders,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
      });
      return google(modelId);
    }

    case "azure-openai": {
      const azure = createAzure({
        baseURL: `${baseUrl}`,
        apiKey: provider.apiKey,
        apiVersion: provider.apiVersion,
        headers: customHeaders,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
      });
      // Azure uses chat completions API
      return azure.chat(modelId);
    }

    case "openai":
    default: {
      // OpenAI and all OpenAI-compatible providers (DeepSeek, Groq, etc.)
      // IMPORTANT: AI SDK v6 defaults to Responses API (/responses).
      // We must use .chat() to target /chat/completions which is what
      // all OpenAI-compatible providers support.
      const openai = createOpenAI({
        baseURL: baseUrl,
        apiKey: provider.apiKey,
        headers: customHeaders,
        fetch: expoFetch as unknown as typeof globalThis.fetch,
      });
      return openai.chat(modelId);
    }
  }
}

/**
 * Get the appropriate base URL suffix for chat completions.
 * Used by legacy methods (listModels, testConnection, etc.) that
 * still need raw HTTP access.
 */
export function getChatEndpoint(providerType: ProviderType): string {
  switch (providerType) {
    case "anthropic":
      return "/messages";
    case "gemini":
      return ""; // Gemini uses model-specific URLs
    default:
      return "/v1/chat/completions";
  }
}
