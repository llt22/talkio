// Web platform: localStorage fallback for MMKV

const PREFIX = "avatar-storage:";

export const storage = {
  getString(key: string): string | undefined {
    try {
      return localStorage.getItem(PREFIX + key) ?? undefined;
    } catch {
      return undefined;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(PREFIX + key, value);
    } catch {}
  },
  delete(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {}
  },
  getAllKeys(): string[] {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
      }
      return keys;
    } catch {
      return [];
    }
  },
};

export function getItem<T>(key: string): T | null {
  const value = storage.getString(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function setItem<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  storage.delete(key);
}

export function getAllKeys(): string[] {
  return storage.getAllKeys();
}
