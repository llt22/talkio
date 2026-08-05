import type { Provider } from "../types";
import { getProfile } from "./provider-profiles/registry";

export const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";

export function isAzureOpenAIProvider(provider: Provider): boolean {
  return provider.profileId === "azure-openai" || provider.type === "azure-openai";
}

export function providerApiVersion(provider: Provider): string | undefined {
  if (!isAzureOpenAIProvider(provider)) return provider.apiVersion;
  return (
    provider.apiVersion ||
    (provider.profileId ? getProfile(provider.profileId)?.endpoint.apiVersion : undefined) ||
    DEFAULT_AZURE_OPENAI_API_VERSION
  );
}

export function appendApiVersion(url: string, apiVersion?: string): string {
  if (!apiVersion) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}api-version=${encodeURIComponent(apiVersion)}`;
}

/** Append a resource path before an existing query string. */
export function appendResourcePath(baseUrl: string, path: string): string {
  const queryIndex = baseUrl.indexOf("?");
  if (queryIndex === -1) return `${baseUrl.replace(/\/+$/, "")}${path}`;
  const root = baseUrl.slice(0, queryIndex).replace(/\/+$/, "");
  return `${root}${path}${baseUrl.slice(queryIndex)}`;
}

/**
 * Adapter base URL for a concrete model/deployment.
 * Azure OpenAI addresses chat completions below `/deployments/{deployment}`;
 * protocol adapters append their normal resource path afterwards.
 */
export function resolveAdapterBaseUrl(provider: Provider, modelId: string): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  if (!isAzureOpenAIProvider(provider)) return baseUrl;
  const deploymentBase = `${baseUrl}/deployments/${encodeURIComponent(modelId)}`;
  return appendApiVersion(deploymentBase, providerApiVersion(provider));
}

export function resolveProviderResourceUrl(provider: Provider, path: string): string {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  return appendApiVersion(`${baseUrl}${path}`, providerApiVersion(provider));
}
