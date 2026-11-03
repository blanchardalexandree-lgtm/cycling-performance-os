/**
 * Limiteur de requêtes en mémoire (fenêtre glissante simple).
 * Suffisant pour une instance unique ; en multi-instance, remplacer par Redis/Upstash.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}
