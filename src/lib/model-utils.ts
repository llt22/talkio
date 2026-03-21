import type { Model } from "../types";

export function sortEnabledFirst(models: Model[]): Model[] {
  return [...models].sort((a, b) => {
    if (a.enabled === b.enabled) return 0;
    return a.enabled ? -1 : 1;
  });
}

export function isSameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Group models by their provider name, sorted alphabetically.
 * Models within each group are also sorted by displayName.
 */
export function groupModelsByProvider(
  models: Model[],
  getProviderById: (id: string) => { name: string } | undefined,
): Array<{ title: string; data: Model[] }> {
  const map = new Map<string, { title: string; data: Model[] }>();
  for (const m of models) {
    const provider = getProviderById(m.providerId);
    const name = provider?.name ?? "Unknown";
    if (!map.has(name)) map.set(name, { title: name, data: [] });
    map.get(name)!.data.push(m);
  }
  for (const section of map.values()) {
    section.data.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}
