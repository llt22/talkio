/**
 * Pick only the keys from `source` whose values are not `undefined`.
 * Useful for building partial update objects from Partial<T> without
 * manually checking each field.
 */
export function pickDefined<T extends Record<string, unknown>>(
  source: T,
): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result as any;
}
