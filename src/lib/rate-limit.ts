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
const MAX_KEYS = 20000;

/**
 * Clé de limitation d'une adresse IP. En IPv6, un même abonné dispose en général d'un bloc /64
 * entier : changer d'adresse dans ce bloc ne doit pas suffire à contourner la limite.
 */
export function rateLimitKey(ip: string): string {
  const address = ip.trim().toLowerCase().split('%')[0]; // sans identifiant de zone (fe80::1%eth0)
  // IPv4 écrite en IPv6 (::ffff:1.2.3.4) : c'est une adresse IPv4, gardée telle quelle.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1];
  if (!address.includes(':')) return address;
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return `${groups.slice(0, 4).join(':')}::/64`;
}

export function rateLimit(key: string, limit = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  if (buckets.size >= MAX_KEYS) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    // Toujours plein : on retire les plus anciennes entrées (ordre d'insertion), jamais tout.
    // Une remise à zéro générale permettrait de contourner la limite en multipliant les adresses.
    for (const k of buckets.keys()) {
      if (buckets.size < MAX_KEYS) break;
      buckets.delete(k);
    }
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
