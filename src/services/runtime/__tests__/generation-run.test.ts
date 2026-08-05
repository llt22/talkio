import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import {
  GenerationRunError,
  generationErrorFromUnknown,
  logGenerationRun,
  userVisibleGenerationError,
} from "../generation-run";

const AUTH_ERROR = {
  code: "auth" as const,
  message: "API Error 401: Invalid API key",
  retryable: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generation run observability", () => {
  it("preserves structured runtime errors across the chat boundary", () => {
    expect(generationErrorFromUnknown(new GenerationRunError(AUTH_ERROR))).toEqual(AUTH_ERROR);
  });

  it("maps errors to localized user guidance while retaining a bounded provider detail", async () => {
    await i18n.changeLanguage("en");
    expect(userVisibleGenerationError(AUTH_ERROR)).toBe(
      "Authentication failed. Check the provider API key and access permissions.\nAPI Error 401: Invalid API key",
    );
  });

  it("logs only the fixed run context fields supplied by the caller", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const entry = {
      event: "failed" as const,
      runId: "run-1",
      providerId: "provider-1",
      modelId: "model-1",
      round: 2,
      durationMs: 250,
      errorCode: "rate-limit" as const,
      retryable: true,
    };

    logGenerationRun(entry);

    expect(error).toHaveBeenCalledWith("[generation-run] failed", entry);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Authorization");
  });
});
