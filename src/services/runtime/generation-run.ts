import i18n from "../../i18n";
import type { GenerationError } from "./events";

export interface GenerationRunContext {
  runId: string;
  providerId: string;
  modelId: string;
  round: number;
}

export type GenerationRunLog = GenerationRunContext & {
  event: "started" | "completed" | "failed";
  durationMs?: number;
  errorCode?: GenerationError["code"];
  retryable?: boolean;
};

export class GenerationRunError extends Error {
  readonly generationError: GenerationError;

  constructor(error: GenerationError) {
    super(error.message);
    this.name = "GenerationRunError";
    this.generationError = error;
  }
}

export function generationErrorFromUnknown(error: unknown): GenerationError {
  if (error instanceof GenerationRunError) return error.generationError;
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "aborted", message: error.message, retryable: false };
  }
  return {
    code: "unknown",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

export function userVisibleGenerationError(error: GenerationError): string {
  const key = `chat.generationErrors.${error.code}`;
  const summary = i18n.t(key, { defaultValue: i18n.t("chat.generationErrors.unknown") });
  const detail = error.message.trim().slice(0, 300);
  return detail && detail !== summary ? `${summary}\n${detail}` : summary;
}

export function logGenerationRun(log: GenerationRunLog): void {
  const label = `[generation-run] ${log.event}`;
  if (log.event === "failed") console.error(label, log);
  else console.info(label, log);
}
