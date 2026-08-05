/**
 * Secret store — keeps provider API keys out of localStorage on desktop.
 *
 * Desktop (Tauri): keys live in the OS credential store (macOS Keychain /
 * Windows Credential Manager / Linux Secret Service) via Rust commands.
 * Browser dev mode and Android: fall back to localStorage (Android has no
 * supported keyring backend yet — see src-tauri/src/secrets.rs).
 *
 * A process-lifetime in-memory cache provides synchronous reads for the
 * runtime code paths (ApiClient, adapters) that receive a Provider object.
 */
import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../lib/platform";

const LOCAL_PREFIX = "talkio:secret:";

const memoryCache = new Map<string, string>();

function localGet(account: string): string | null {
  return localStorage.getItem(LOCAL_PREFIX + account);
}

function localSet(account: string, secret: string): void {
  localStorage.setItem(LOCAL_PREFIX + account, secret);
}

function localDelete(account: string): void {
  localStorage.removeItem(LOCAL_PREFIX + account);
}

export const secretStore = {
  /** Persist a secret. Empty string deletes it. */
  async set(account: string, secret: string): Promise<void> {
    if (secret) {
      memoryCache.set(account, secret);
    } else {
      memoryCache.delete(account);
    }
    if (isDesktop) {
      if (secret) {
        await invoke("secret_set", { account, secret });
      } else {
        await invoke("secret_delete", { account });
      }
    } else if (secret) {
      localSet(account, secret);
    } else {
      localDelete(account);
    }
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
      value = localGet(account);
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
