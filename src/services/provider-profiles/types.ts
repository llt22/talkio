/**
 * Provider profile types — data-driven description of how to connect to a
 * provider family (endpoint, auth, model discovery). Profiles never perform
 * message protocol conversion; that stays in the protocol adapters.
 *
 * The frontend persists only `secretRef`-style references, never raw secrets
 * (see src/services/secret-store.ts).
 */
import type { ApiFormat } from "../../types";

export type ProviderProtocol = ApiFormat;

export interface EndpointConfig {
  baseUrl: string;
  /** e.g. Azure `api-version`, Anthropic `anthropic-version` */
  apiVersion?: string;
  /** Fixed headers always sent with requests (e.g. Anthropic version header) */
  headers?: Record<string, string>;
}

export type AuthConfig =
  | { type: "bearer"; secretRef: string }
  | { type: "header"; name: string; secretRef: string }
  | { type: "query"; name: string; secretRef: string }
  | { type: "azure-api-key"; secretRef: string }
  | { type: "oauth"; accountRef: string }
  | { type: "aws-sigv4"; credentialRef: string; region: string };

export type ModelDiscoveryConfig =
  | { type: "openai-models"; path?: string }
  | { type: "gemini-models" }
  | { type: "ollama-tags" }
  | { type: "static"; models: ModelDescriptor[] }
  | { type: "manual" };

export interface ProviderProfile {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  endpoint: EndpointConfig;
  auth: AuthConfig;
  modelDiscovery: ModelDiscoveryConfig;
  defaultHeaders?: Record<string, string>;
  defaultOptions?: Record<string, unknown>;
}

/** Structured connection diagnostics (see connection-check.ts). */
export type CheckStatus = "ok" | "fail" | "skipped";

export interface CheckResult {
  status: CheckStatus;
  /** Human-readable detail (error message or short confirmation). */
  detail?: string;
}

export interface ConnectionCheck {
  endpoint: CheckResult;
  authentication: CheckResult;
  modelDiscovery: CheckResult;
  selectedModelAccess: CheckResult;
  protocolCompatibility: CheckResult;
}

/** Model capability metadata — see model-catalog.ts. */
export interface ModelDescriptor {
  /** Provider-specific model id sent in requests (e.g. "gpt-4o") */
  modelId: string;
  displayName: string;
  inputModalities: Array<"text" | "image" | "audio" | "video" | "file">;
  outputModalities: Array<"text" | "image" | "audio">;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities?: {
    streaming?: boolean;
    reasoning?: boolean;
    tools?: boolean;
    parallelTools?: boolean;
    structuredOutput?: boolean;
    strictToolSchema?: boolean;
    nativeSearch?: boolean;
    remoteMcp?: boolean;
    computerUse?: boolean;
    promptCaching?: boolean;
  };
  providerOptions?: {
    openai?: Record<string, unknown>;
    anthropic?: Record<string, unknown>;
    google?: Record<string, unknown>;
    openrouter?: Record<string, unknown>;
  };
}
