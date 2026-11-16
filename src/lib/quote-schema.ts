/** Validation serveur de la demande de devis (zod). Messages en français. */
import { z } from 'zod';
import { DATE_RE, EMAIL_RE, ESTABLISHMENT_TYPES, LIMITS, PHONE_RE, VOLUMES } from './quote-fields';

/** Supprime les caractères de contrôle, normalise l'Unicode, réduit les espaces. */
export function cleanLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Comme cleanLine, mais conserve les retours à la ligne (champ message). */
export function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Champ facultatif : chaîne vide acceptée, sinon la valeur doit passer `isValid`. */
const optional = (isValid: (value: string) => boolean, message: string) =>
  z.string({ error: message }).refine((v) => v === '' || isValid(v), { error: message });
const optionalChoice = (list: readonly { value: string }[]) =>
  optional((v) => list.some((o) => o.value === v), 'Choix non valide.');

export const quoteSchema = z.object({
  name: z
    .string({ error: 'Indiquez votre nom et votre prénom.' })
    .min(2, { error: 'Indiquez votre nom et votre prénom.' })
    .max(LIMITS.name, { error: `${LIMITS.name} caractères maximum.` }),
  establishment: z
    .string({ error: 'Indiquez le nom de votre établissement.' })
    .min(1, { error: 'Indiquez le nom de votre établissement.' })
    .max(LIMITS.establishment, { error: `${LIMITS.establishment} caractères maximum.` }),
  type: optionalChoice(ESTABLISHMENT_TYPES),
  city: z.string().max(LIMITS.city, { error: `${LIMITS.city} caractères maximum.` }),
  email: z
    .string({ error: 'Indiquez une adresse email.' })
    .min(1, { error: 'Indiquez une adresse email pour que nous puissions vous répondre.' })
    .max(LIMITS.email, { error: 'Cette adresse email est trop longue.' })
    .regex(EMAIL_RE, { error: 'Cette adresse email ne semble pas valide.' }),
  phone: optional((v) => PHONE_RE.test(v), 'Ce numéro ne semble pas valide.'),
  volume: optionalChoice(VOLUMES),
  startDate: optional((v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v)), 'Cette date n’est pas valide.'),
  message: z.string().max(LIMITS.message, { error: `${LIMITS.message} caractères maximum.` }),
});

export type QuoteData = z.infer<typeof quoteSchema>;

/** Nettoie les champs bruts avant validation. Tout ce qui n'est pas attendu est ignoré. */
export function sanitizeQuoteInput(raw: Record<string, unknown>) {
  return {
    name: cleanLine(raw.name),
    establishment: cleanLine(raw.establishment),
    type: cleanLine(raw.type),
    city: cleanLine(raw.city),
    email: cleanLine(raw.email).toLowerCase(),
    phone: cleanLine(raw.phone),
    volume: cleanLine(raw.volume),
    startDate: cleanLine(raw.startDate),
    message: cleanText(raw.message),
  };
}
