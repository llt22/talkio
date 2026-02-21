import { updateMessage } from "./database";
import type { Message } from "../types";

/**
 * Batched message update writer inspired by cherry-studio-app's BlockManager.
 *
 * During streaming, many small updates arrive rapidly. Instead of issuing a
 * DB UPDATE for every flush, we merge pending updates in memory and write
 * them on a fixed interval. This reduces SQLite write pressure and lets
 * useLiveQuery fire at a controlled cadence.
 */

const BATCH_INTERVAL_MS = 180;

type MessagePatch = Partial<Message>;

const pendingUpdates = new Map<string, MessagePatch>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;

function mergePatches(existing: MessagePatch | undefined, incoming: MessagePatch): MessagePatch {
  if (!existing) return { ...incoming };
  return { ...existing, ...incoming };
}

async function waitForCurrentFlush(): Promise<void> {
  if (!flushInFlight) return;
  try {
    await flushInFlight;
  } catch {
    // Previous flush failed — we'll retry on next cycle
  }
}

async function flushPendingUpdates(ids?: string[]): Promise<void> {
  const targetIds = ids?.length ? ids : Array.from(pendingUpdates.keys());
  if (targetIds.length === 0) return;

  const updates: { id: string; patch: MessagePatch }[] = [];
  for (const id of targetIds) {
    const patch = pendingUpdates.get(id);
    if (!patch) continue;
    updates.push({ id, patch });
    pendingUpdates.delete(id);
  }

  if (updates.length === 0) return;

  try {
    for (const { id, patch } of updates) {
      await updateMessage(id, patch);
    }
  } catch (error) {
    // Re-queue failed updates so they're retried on next flush
    for (const { id, patch } of updates) {
      const existing = pendingUpdates.get(id);
      pendingUpdates.set(id, mergePatches(existing, patch));
    }
    console.error("[BatchWriter] Failed to persist updates:", error);
  }
}

async function executeFlush(ids?: string[]): Promise<void> {
  await waitForCurrentFlush();
  const promise = flushPendingUpdates(ids);
  flushInFlight = promise;
  try {
    await promise;
  } finally {
    if (flushInFlight === promise) {
      flushInFlight = null;
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void executeFlush();
  }, BATCH_INTERVAL_MS);
}

/**
 * Queue a partial message update. Updates are merged by message ID and
 * flushed to DB every BATCH_INTERVAL_MS.
 */
export function batchUpdateMessage(id: string, patch: MessagePatch): void {
  const merged = mergePatches(pendingUpdates.get(id), patch);
  pendingUpdates.set(id, merged);
  scheduleFlush();
}

/**
 * Cancel pending updates for a specific message and wait for any
 * in-flight flush to complete. Used when a block type changes or
 * streaming completes — the caller will do a direct DB write instead.
 */
export async function cancelBatchUpdate(id: string): Promise<void> {
  pendingUpdates.delete(id);
  if (pendingUpdates.size === 0 && flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await waitForCurrentFlush();
}

/**
 * Immediately flush pending updates for specific message IDs.
 * Used at the end of streaming to ensure all data is persisted.
 */
export async function flushBatchUpdates(ids?: string[]): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await executeFlush(ids);
}
