/**
 * GenerationEvent — the stable boundary between runtimes (model providers,
 * coding agents, remote agents) and the UI / persistence / approval layers.
 *
 * P1: event types are defined and the existing provider adapters are bridged
 * to this shape; UI consumers migrate incrementally in later phases.
 */
import type { TokenUsage } from "../../types";

/** User approval request surfaced during a run — approval stays Talkio-controlled. */
export interface ApprovalRequest {
  id: string;
  toolCallId?: string;
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
}

/** Reference to a shared artifact produced during a run. */
export interface ArtifactRef {
  id: string;
  name: string;
  kind: "file" | "note" | "task";
  url?: string;
}

/** Structured error carried by run-failed. */
export interface GenerationError {
  code: "aborted" | "auth" | "rate-limit" | "invalid-request" | "api" | "tool" | "unknown";
  message: string;
  retryable: boolean;
}

export type GenerationEvent =
  | { type: "run-started"; runId: string }
  | { type: "text-delta"; text: string }
  | { type: "thinking-delta"; text: string }
  | { type: "image-generated"; url: string }
  | { type: "tool-call-started"; callId: string; name: string }
  | { type: "tool-call-arguments-delta"; callId: string; delta: string }
  | { type: "approval-required"; approval: ApprovalRequest }
  | { type: "tool-result"; callId: string; result: unknown }
  | { type: "artifact-updated"; artifact: ArtifactRef }
  | { type: "usage"; usage: TokenUsage }
  | { type: "run-completed"; reason: string }
  | { type: "run-failed"; error: GenerationError };
