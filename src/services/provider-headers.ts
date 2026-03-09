import type { CustomHeader, Provider, ApiFormat } from "../types";

function build(
  apiKey: string,
  customHeaders: CustomHeader[],
  extra?: Record<string, string>,
  apiFormat?: ApiFormat,
): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (apiFormat === "anthropic-messages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  for (const h of customHeaders) {
    if (h.name && h.value) headers[h.name] = h.value;
  }
  return headers;
}

export function buildProviderHeaders(
  provider: Provider,
  extra?: Record<string, string>,
): Record<string, string> {
  return build(provider.apiKey, (provider.customHeaders ?? []) as CustomHeader[], extra, provider.apiFormat);
}

export function buildProviderHeadersFromRaw(args: {
  apiKey: string;
  customHeaders: CustomHeader[];
  extra?: Record<string, string>;
  apiFormat?: ApiFormat;
}): Record<string, string> {
  return build(args.apiKey, args.customHeaders, args.extra, args.apiFormat);
}
