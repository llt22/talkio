/**
 * Secret store — keeps provider API keys out of browser persistence.
 *
 * Desktop Tauri stores keys in the OS credential store. Browser and mobile
 * WebViews keep keys only in process memory because Web APIs do not expose a
 * system credential store without introducing an application master password.
 * Legacy plaintext localStorage entries are deleted when their accounts load.
 */
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../lib/platform";

const LEGACY_LOCAL_PREFIX = "talkio:secret:";

const memoryCache = new Map<string, string>();

function deleteLegacyLocalSecret(account: string): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(LEGACY_LOCAL_PREFIX + account);
  }
}

export const secretStore = {
  /** Persist a secret. Empty string deletes it. */
  async set(account: string, secret: string): Promise<void> {
    if (isDesktop) {
      if (secret) {
        await invoke("secret_set", { account, secret });
      } else {
        await invoke("secret_delete", { account });
      }
    } else {
      deleteLegacyLocalSecret(account);
    }

    // Publish to synchronous runtime readers only after persistence succeeds.
    if (secret) memoryCache.set(account, secret);
    else memoryCache.delete(account);
  },

  /** Load a secret (from cache or the backing store). */
  async get(account: string): Promise<string | undefined> {
    const cached = memoryCache.get(account);
    if (cached !== undefined) return cached;

    let value: string | null = null;
    if (isDesktop) {
      try {
        value = (await invoke<string | null>("secret_get", { account })) ?? null;
      } catch {
        value = null;
      }
    } else {
      deleteLegacyLocalSecret(account);
    }

    if (value) memoryCache.set(account, value);
    return value ?? undefined;
  },

  /** Synchronous read — only returns secrets already loaded into memory. */
  getSync(account: string): string | undefined {
    return memoryCache.get(account);
  },

  async delete(account: string): Promise<void> {
    await this.set(account, "");
  },

  /** Warm the in-memory cache for a set of accounts (e.g. on app start). */
  async loadAll(accounts: string[]): Promise<void> {
    await Promise.all(accounts.map((a) => this.get(a)));
  },
};
