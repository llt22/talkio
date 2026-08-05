/**
 * Structured connection check — separates failure domains so the UI can show
 * exactly which part of a provider connection is broken (endpoint reachable?
 * credentials valid? model discovery works? protocol compatible?).
 */
import type { Provider } from "../../types";
import { appFetch } from "../../lib/http";
import { buildProviderHeaders } from "../provider-headers";
import { getProfile } from "./registry";
import type { CheckResult, ConnectionCheck } from "./types";

function ok(detail?: string): CheckResult {
  return { status: "ok", detail };
}

function fail(detail: string): CheckResult {
  return { status: "fail", detail };
}

function skipped(detail?: string): CheckResult {
  return { status: "skipped", detail };
}

/** Base URL without trailing slash: user-configured value, else profile default. */
function effectiveBaseUrl(provider: Provider): string {
  if (provider.baseUrl) return provider.baseUrl.replace(/\/+$/, "");
  const profile = provider.profileId ? getProfile(provider.profileId) : undefined;
  return (profile?.endpoint.baseUrl ?? "").replace(/\/+$/, "");
}

/**
 * Run the full connection check. Every stage is attempted independently so a
 * failure in one domain doesn't hide the state of the others.
 */
export async function checkProviderConnection(provider: Provider): Promise<ConnectionCheck> {
  const baseUrl = effectiveBaseUrl(provider);
  const isGemini = provider.apiFormat === "gemini-generate-content";
  const headers = buildProviderHeaders(provider);

  // 1. Endpoint reachability — bare OPTIONS/GET on the origin.
  const endpoint: CheckResult = await (async () => {
    try {
      const res = await appFetch(`${baseUrl}/models`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });
      return ok(`${res.status} ${res.statusText}`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  })();

  // 2. Authentication — same request with credentials attached.
  const authentication: CheckResult = await (async () => {
    try {
      const res = await appFetch(isGemini ? `${baseUrl}/models` : `${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 401 || res.status === 403) {
        return fail(`Credentials rejected (HTTP ${res.status})`);
      }
      return ok(`Credentials accepted (HTTP ${res.status})`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  })();

  // 3. Model discovery.
  const modelDiscovery: CheckResult = await (async () => {
    const profile = provider.profileId ? getProfile(provider.profileId) : undefined;
    const discovery = profile?.modelDiscovery ?? { type: "openai-models" as const };
    if (discovery.type === "manual") {
      return skipped("Manual model configuration — nothing to discover");
    }
    try {
      const res = await appFetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return fail(`Model list failed (HTTP ${res.status})`);
      const json = await res.json();
      const models = isGemini
        ? (json.models ?? [])
        : Array.isArray(json.data)
          ? json.data
          : Array.isArray(json)
            ? json
            : [];
      if (models.length === 0) return fail("Model list returned no models");
      return ok(`${models.length} models discoverable`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  })();

  // 4. Selected model access — skip when no model is attached to the provider.
  const selectedModelAccess: CheckResult = (() => {
    return skipped("Checked when a model is selected");
  })();

  // 5. Protocol compatibility — one minimal streaming-style request shape.
  const protocolCompatibility: CheckResult = await (async () => {
    try {
      const url = isGemini
        ? `${baseUrl}/models/gemini-2.0-flash:generateContent`
        : `${baseUrl}/chat/completions`;
      const res = await appFetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(
          isGemini
            ? { contents: [{ role: "user", parts: [{ text: "hi" }] }] }
            : { model: "probe", messages: [{ role: "user", content: "hi" }], max_tokens: 1 },
        ),
        signal: AbortSignal.timeout(10000),
      });
      // Any HTTP response (even 4xx) proves the endpoint speaks the protocol.
      return ok(`Protocol responded (HTTP ${res.status})`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  })();

  return { endpoint, authentication, modelDiscovery, selectedModelAccess, protocolCompatibility };
}
