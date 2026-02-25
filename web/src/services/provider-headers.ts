import type { CustomHeader, Provider } from "../../../src/types";

export function buildProviderHeaders(
  provider: Provider,
  extra?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${provider.apiKey}`,
    ...(extra ?? {}),
  };

  if (provider.customHeaders) {
    for (const h of provider.customHeaders as CustomHeader[]) {
      if (h.name && h.value) headers[h.name] = h.value;
    }
  }

  return headers;
}

export function buildProviderHeadersFromRaw(args: {
  apiKey: string;
  customHeaders: CustomHeader[];
  extra?: Record<string, string>;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${args.apiKey}`,
    ...(args.extra ?? {}),
  };
  for (const h of args.customHeaders) {
    if (h.name && h.value) headers[h.name] = h.value;
  }
  return headers;
}
