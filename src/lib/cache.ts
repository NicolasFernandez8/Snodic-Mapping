/** Caché en memoria por proceso con vencimiento (para consultas pesadas que no necesitan ser al segundo). */
const g = globalThis as unknown as { __snodicCache?: Map<string, { at: number; value: unknown }> };
const store = (g.__snodicCache ??= new Map());

export async function cached<T>(key: string, seconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < seconds * 1000) return hit.value as T;
  const value = await fn();
  store.set(key, { at: Date.now(), value });
  return value;
}

export function invalidate(prefix = "") {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
