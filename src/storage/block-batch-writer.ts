import { updateBlock } from "./database";
import type { MessageBlock } from "../types";

/**
 * Batched block update writer — same pattern as batch-writer.ts but for
 * message_blocks table. During streaming, the active block (e.g. MAIN_TEXT)
 * receives rapid content updates. We merge them in memory and flush on a
 * fixed interval to reduce SQLite write pressure.
 */

const BATCH_INTERVAL_MS = 180;

type BlockPatch = Partial<MessageBlock>;

const pendingUpdates = new Map<string, BlockPatch>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;

function mergePatches(existing: BlockPatch | undefined, incoming: BlockPatch): BlockPatch {
  if (!existing) return { ...incoming };
  return { ...existing, ...incoming };
}

async function waitForCurrentFlush(): Promise<void> {
  if (!flushInFlight) return;
  try {
    await flushInFlight;
  } catch {
    // Previous flush failed — retry on next cycle
  }
}

async function flushPendingUpdates(ids?: string[]): Promise<void> {
  const targetIds = ids?.length ? ids : Array.from(pendingUpdates.keys());
  if (targetIds.length === 0) return;

  const updates: { id: string; patch: BlockPatch }[] = [];
  for (const id of targetIds) {
    const patch = pendingUpdates.get(id);
    if (!patch) continue;
    updates.push({ id, patch });
    pendingUpdates.delete(id);
  }

  if (updates.length === 0) return;

  try {
    for (const { id, patch } of updates) {
      await updateBlock(id, patch);
    }
  } catch (error) {
    for (const { id, patch } of updates) {
      const existing = pendingUpdates.get(id);
      pendingUpdates.set(id, mergePatches(existing, patch));
    }
    console.error("[BlockBatchWriter] Failed to persist updates:", error);
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
 * Queue a partial block update. Updates are merged by block ID and
 * flushed to DB every BATCH_INTERVAL_MS.
 */
export function batchUpdateBlock(id: string, patch: BlockPatch): void {
  const merged = mergePatches(pendingUpdates.get(id), patch);
  pendingUpdates.set(id, merged);
  scheduleFlush();
}

/**
 * Cancel pending updates for a specific block.
 */
export async function cancelBlockBatchUpdate(id: string): Promise<void> {
  pendingUpdates.delete(id);
  if (pendingUpdates.size === 0 && flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await waitForCurrentFlush();
}

/**
 * Immediately flush pending block updates.
 */
export async function flushBlockBatchUpdates(ids?: string[]): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await executeFlush(ids);
}
