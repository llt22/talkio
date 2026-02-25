/**
 * Key-Value store — replaces react-native-mmkv with localStorage.
 */

const PREFIX = "talkio:";

export const kvStore = {
  getString(key: string): string | null {
    return localStorage.getItem(PREFIX + key);
  },
  set(key: string, value: string): void {
    localStorage.setItem(PREFIX + key, value);
  },
  delete(key: string): void {
    localStorage.removeItem(PREFIX + key);
  },
  getAllKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
    }
    return keys;
  },
  getObject<T>(key: string): T | null {
    const val = localStorage.getItem(PREFIX + key);
    if (!val) return null;
    try { return JSON.parse(val); } catch { return null; }
  },
  setObject(key: string, value: unknown): void {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
};
