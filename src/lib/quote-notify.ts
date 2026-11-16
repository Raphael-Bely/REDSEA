/** Mise en forme et envoi de la demande de devis : email (Resend) et Slack (optionnel). */
import { ESTABLISHMENT_TYPES, VOLUMES, labelOf } from './quote-fields';
import type { QuoteData } from './quote-schema';

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Slack n'interprète que &, < et > : on les neutralise, ainsi que les mentions. */
const escapeSlack = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@(channel|here|everyone)/gi, '@\u200b$1');

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

function rows(data: QuoteData): [label: string, value: string][] {
  const dash = '—';
  return [
    ['Nom et prénom', data.name],
    ['Établissement', data.establishment],
    ['Type', data.type ? labelOf(ESTABLISHMENT_TYPES, data.type) : dash],
    ['Ville', data.city || dash],
    ['Email', data.email],
    ['Téléphone', data.phone || dash],
    ['Volume estimé / mois', data.volume ? labelOf(VOLUMES, data.volume) : dash],
    ['Démarrage souhaité', data.startDate ? formatDate(data.startDate) : dash],
  ];
}

export function buildSubject(data: QuoteData) {
  // Les retours à la ligne sont déjà retirés par le nettoyage : pas d'injection d'en-tête possible.
  const city = data.city ? ` (${data.city})` : '';
  return `Devis REDSEA — ${data.establishment}${city}`.slice(0, 200);
}

export function buildEmail(data: QuoteData) {
  const list = rows(data);
  const text = [
    'Nouvelle demande de devis REDSEA',
    '',
    ...list.map(([label, value]) => `${label} : ${value}`),
    '',
    'Message :',
    data.message || '—',
    '',
    'Répondre à cet email écrit directement au prospect.',
  ].join('\n');

  const cell = 'padding:10px 14px;border-bottom:1px solid #e6d2ae;font:15px/1.45 Helvetica,Arial,sans-serif;color:#1a0d0b;vertical-align:top;';
  const html = `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f3e2c4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#fffaf0;border-top:6px solid #7a0a10;">
      <tr>
        <td style="padding:28px 28px 8px;font:700 22px/1.2 Georgia,serif;color:#7a0a10;">Nouvelle demande de devis</td>
      </tr>
      <tr>
        <td style="padding:0 28px 20px;font:14px/1.4 Helvetica,Arial,sans-serif;color:#5b4a44;">${escapeHtml(data.establishment)}${data.city ? ` · ${escapeHtml(data.city)}` : ''}</td>
      </tr>
      <tr>
        <td style="padding:0 14px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${list
              .map(
                ([label, value]) =>
                  `<tr><td style="${cell}width:38%;font-weight:700;">${escapeHtml(label)}</td><td style="${cell}">${escapeHtml(value)}</td></tr>`,
              )
              .join('\n            ')}
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 28px 6px;font:700 15px/1.4 Helvetica,Arial,sans-serif;color:#1a0d0b;">Message</td>
      </tr>
      <tr>
        <td style="padding:0 28px 28px;font:15px/1.55 Helvetica,Arial,sans-serif;color:#1a0d0b;">${escapeHtml(data.message || '—').replace(/\n/g, '<br>')}</td>
      </tr>
      <tr>
        <td style="padding:16px 28px;background:#1a0d0b;font:13px/1.4 Helvetica,Arial,sans-serif;color:#f3e2c4;">Répondre à cet email écrit directement au prospect.</td>
      </tr>
    </table>
  </body>
</html>`;
  return { html, text };
}

export async function sendQuoteEmail(options: {
  apiKey: string;
  from: string;
  to: string;
  data: QuoteData;
}): Promise<void> {
  const { html, text } = buildEmail(options.data);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: options.from,
      to: [options.to],
      reply_to: options.data.email,
      subject: buildSubject(options.data),
      html,
      text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
  }
}

export async function postQuoteToSlack(webhookUrl: string, data: QuoteData): Promise<void> {
  const fields = rows(data).map(([label, value]) => ({ type: 'mrkdwn', text: `*${label}*\n${escapeSlack(value)}` }));
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: buildSubject(data).slice(0, 150), emoji: false } },
    { type: 'section', fields: fields.slice(0, 4) },
    { type: 'section', fields: fields.slice(4, 8) },
  ];
  if (data.message) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Message*\n${escapeSlack(data.message).slice(0, 2800)}` } });
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Formulaire de devis du site REDSEA' }] });

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: buildSubject(data), blocks }),
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Slack ${response.status}`);
}

export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
