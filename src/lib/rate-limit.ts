/**
 * Limiteur de débit en mémoire : fenêtre fixe par clé (IP).
 *
 * Limite connue : en serverless, chaque instance a sa propre mémoire. C'est un
 * frein efficace contre les rafales, pas une garantie stricte. Pour un quota
 * exact, brancher un magasin partagé (Upstash Redis, Vercel KV) ou activer une
 * règle de rate limiting dans le pare-feu de l'hébergeur (voir README).
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 5000;

export function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
