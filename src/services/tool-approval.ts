/**
 * Tool approval — user-in-the-loop gate before tool execution.
 *
 * Default mode is "auto" (existing behavior: tools execute without asking).
 * When mode is "ask", executeOneTool awaits the user's decision through this
 * module; the UI (ToolApprovalDialog) resolves pending requests.
 *
 * Approval state lives outside React; components subscribe for changes.
 */
import { useSettingsStore } from "../stores/settings-store";

export type ToolApprovalMode = "auto" | "ask";

export type ApprovalRisk = "read" | "write" | "network" | "execute" | "unknown";

export interface PendingApproval {
  id: string;
  toolCallId?: string;
  toolName: string;
  description?: string;
  args: Record<string, unknown>;
  conversationId?: string;
  participantName?: string;
  modelName?: string;
  risk: ApprovalRisk;
}

type ApprovalListener = () => void;

const pending = new Map<string, { approval: PendingApproval; resolve: (ok: boolean) => void }>();
const listeners = new Set<ApprovalListener>();
let idCounter = 0;

function emit() {
  for (const listener of listeners) listener();
}

function currentMode(): ToolApprovalMode {
  return useSettingsStore.getState().settings.toolApprovalMode ?? "auto";
}

export const toolApproval = {
  /** Current approval mode (auto = run tools without asking). */
  mode(): ToolApprovalMode {
    return currentMode();
  },

  /**
   * Request approval for a tool call.
   * - auto: resolves true immediately.
   * - ask: resolves when the user decides (or false when the run is stopped).
   */
  request(request: Omit<PendingApproval, "id">): Promise<boolean> {
    if (currentMode() === "auto") return Promise.resolve(true);
    const { promise, resolve } = Promise.withResolvers<boolean>();
    const approval: PendingApproval = {
      id: `approval-${++idCounter}`,
      ...request,
    };
    pending.set(approval.id, { approval, resolve });
    emit();
    return promise;
  },

  /** Resolve a pending approval from the UI. */
  resolve(id: string, approved: boolean): void {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.resolve(approved);
    emit();
  },

  /** Reject all pending approvals (e.g. generation stopped). */
  rejectAll(): void {
    if (pending.size === 0) return;
    for (const { resolve } of pending.values()) resolve(false);
    pending.clear();
    emit();
  },

  /** Reject pending approvals owned by one conversation. */
  rejectConversation(conversationId: string): void {
    let changed = false;
    for (const [id, entry] of pending) {
      if (entry.approval.conversationId !== conversationId) continue;
      pending.delete(id);
      entry.resolve(false);
      changed = true;
    }
    if (changed) emit();
  },

  /** Snapshot of pending approvals for the UI. */
  getPending(): PendingApproval[] {
    return Array.from(pending.values()).map((entry) => entry.approval);
  },

  /** Subscribe to pending-approval changes. Returns an unsubscribe fn. */
  subscribe(listener: ApprovalListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
