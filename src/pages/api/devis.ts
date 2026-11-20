/**
 * POST /api/devis — seule route serveur du site.
 * Chaîne : origine → débit → taille → honeypot → Turnstile → validation zod →
 * email Resend → Slack (optionnel, jamais bloquant).
 * Aucune adresse, clé ou URL n'est écrite ici : tout vient des variables d'environnement.
 */
import type { APIRoute } from 'astro';
import {
  QUOTE_RECIPIENT_EMAIL,
  QUOTE_SENDER_EMAIL,
  RESEND_API_KEY,
  SLACK_WEBHOOK_URL,
  TURNSTILE_SECRET_KEY,
} from 'astro:env/server';
import { HONEYPOT_FIELD, type QuoteFieldName } from '../../lib/quote-fields';
import { quoteSchema, sanitizeQuoteInput } from '../../lib/quote-schema';
import { rateLimit, rateLimitKey } from '../../lib/rate-limit';
import { postQuoteToSlack, sendQuoteEmail, verifyTurnstile } from '../../lib/quote-notify';

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;
const UNAVAILABLE = 'Le formulaire est momentanément indisponible. Écrivez-nous directement par email.';

/**
 * Lit le corps en s'arrêtant dès qu'il dépasse `limit` octets : une requête énorme n'est jamais
 * chargée en entier en mémoire. Renvoie null si la limite est dépassée.
 */
async function readBodyCapped(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const json = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });

export const POST: APIRoute = async ({ request, clientAddress, url }) => {
  // 1. Même origine uniquement (les navigateurs envoient Origin sur les POST).
  const origin = request.headers.get('origin');
  if (origin) {
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === url.host;
    } catch {
      /* origine illisible : refusée */
    }
    if (!sameOrigin) return json(403, { ok: false, message: 'Origine non autorisée.' });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return json(415, { ok: false, message: 'Format de requête non pris en charge.' });
  }

  // 2. Limite de débit : 5 requêtes / 10 minutes par IP.
  let ip = 'inconnue';
  try {
    ip = clientAddress || ip;
  } catch {
    /* adresse indisponible (certains environnements de test) */
  }
  const limit = rateLimit(rateLimitKey(ip), 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return json(
      429,
      { ok: false, message: 'Trop de demandes envoyées. Réessayez dans quelques minutes.' },
      { 'Retry-After': String(limit.retryAfterSeconds) },
    );
  }

  // 3. Corps : taille bornée (annoncée puis réellement lue), JSON objet.
  const declared = Number(request.headers.get('content-length') ?? '0');
  const rawText = declared > MAX_BODY_BYTES ? null : await readBodyCapped(request, MAX_BODY_BYTES);
  if (rawText === null) {
    return json(413, { ok: false, message: 'Demande trop volumineuse.' });
  }
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    raw = parsed as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, message: 'Requête illisible.' });
  }

  // 4. Honeypot : un robot a rempli le champ caché. On répond « ok » sans rien envoyer.
  if (typeof raw[HONEYPOT_FIELD] === 'string' && raw[HONEYPOT_FIELD].trim() !== '') {
    return json(200, { ok: true });
  }

  // 5. Cloudflare Turnstile.
  if (TURNSTILE_SECRET_KEY) {
    const token = typeof raw.turnstileToken === 'string' ? raw.turnstileToken.slice(0, 2048) : '';
    let human = false;
    try {
      human = Boolean(token) && (await verifyTurnstile(TURNSTILE_SECRET_KEY, token, ip === 'inconnue' ? undefined : ip));
    } catch (error) {
      console.error('[devis] Vérification Turnstile impossible', error);
    }
    if (!human) {
      return json(403, { ok: false, message: 'La vérification anti-robot a échoué. Rechargez la page puis réessayez.' });
    }
  } else if (import.meta.env.PROD) {
    console.error('[devis] TURNSTILE_SECRET_KEY manquante : formulaire fermé.');
    return json(503, { ok: false, message: UNAVAILABLE });
  }

  // 6. Nettoyage + validation.
  const result = quoteSchema.safeParse(sanitizeQuoteInput(raw));
  if (!result.success) {
    const fieldErrors: Partial<Record<QuoteFieldName, string>> = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as QuoteFieldName | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return json(422, { ok: false, message: 'Certains champs sont à corriger.', fieldErrors });
  }
  const data = result.data;

  // 7. Email (Resend).
  if (!RESEND_API_KEY || !QUOTE_RECIPIENT_EMAIL) {
    if (import.meta.env.DEV) {
      console.info('[devis] Mode développement sans Resend : demande reçue mais non envoyée.', data);
      return json(200, { ok: true, dev: true });
    }
    console.error('[devis] RESEND_API_KEY ou QUOTE_RECIPIENT_EMAIL manquante.');
    return json(503, { ok: false, message: UNAVAILABLE });
  }
  try {
    await sendQuoteEmail({
      apiKey: RESEND_API_KEY,
      from: QUOTE_SENDER_EMAIL || 'REDSEA Devis <onboarding@resend.dev>',
      to: QUOTE_RECIPIENT_EMAIL,
      data,
    });
  } catch (error) {
    console.error('[devis] Échec de l’envoi Resend', error);
    return json(502, { ok: false, message: 'L’envoi a échoué de notre côté. Réessayez dans un instant.' });
  }

  // 8. Slack : optionnel, et un échec ne remet jamais en cause l'email déjà parti.
  if (SLACK_WEBHOOK_URL) {
    try {
      await postQuoteToSlack(SLACK_WEBHOOK_URL, data);
    } catch (error) {
      console.error('[devis] Notification Slack non envoyée', error);
    }
  }

  return json(200, { ok: true });
};

export const ALL: APIRoute = () =>
  json(405, { ok: false, message: 'Méthode non autorisée.' }, { Allow: 'POST' });
