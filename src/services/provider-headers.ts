import type { CustomHeader, Provider } from "../types";

function build(
  apiKey: string,
  customHeaders: CustomHeader[],
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    ...(extra ?? {}),
  };
  for (const h of customHeaders) {
    if (h.name && h.value) headers[h.name] = h.value;
  }
  return headers;
}

export function buildProviderHeaders(
  provider: Provider,
  extra?: Record<string, string>,
): Record<string, string> {
  return build(provider.apiKey, (provider.customHeaders ?? []) as CustomHeader[], extra);
}

export function buildProviderHeadersFromRaw(args: {
  apiKey: string;
  customHeaders: CustomHeader[];
  extra?: Record<string, string>;
}): Record<string, string> {
  return build(args.apiKey, args.customHeaders, args.extra);
}
