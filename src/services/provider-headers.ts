import type { CustomHeader, Provider, ApiFormat, ProviderType } from "../types";
import { getProfile } from "./provider-profiles/registry";

function build(
  apiKey: string,
  customHeaders: CustomHeader[],
  extra?: Record<string, string>,
  apiFormat?: ApiFormat,
  profileId?: string,
  providerType?: ProviderType,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const profile = profileId ? getProfile(profileId) : undefined;
  const auth = profile?.auth;
  if (auth?.type === "azure-api-key" || providerType === "azure-openai") {
    headers["api-key"] = apiKey;
  } else if (auth?.type === "header") {
    headers[auth.name] = apiKey;
  } else if (apiFormat === "anthropic-messages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (apiFormat === "gemini-generate-content") {
    headers["x-goog-api-key"] = apiKey;
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  Object.assign(headers, profile?.endpoint.headers, profile?.defaultHeaders);
  for (const h of customHeaders) {
    if (h.name && h.value) headers[h.name] = h.value;
  }
  return headers;
}

export function buildProviderHeaders(
  provider: Provider,
  extra?: Record<string, string>,
): Record<string, string> {
  return build(
    provider.apiKey,
    (provider.customHeaders ?? []) as CustomHeader[],
    extra,
    provider.apiFormat,
    provider.profileId,
    provider.type,
  );
}

export function buildProviderHeadersFromRaw(args: {
  apiKey: string;
  customHeaders: CustomHeader[];
  extra?: Record<string, string>;
  apiFormat?: ApiFormat;
  profileId?: string;
  providerType?: ProviderType;
}): Record<string, string> {
  return build(
    args.apiKey,
    args.customHeaders,
    args.extra,
    args.apiFormat,
    args.profileId,
    args.providerType,
  );
}
