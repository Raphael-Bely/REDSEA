/** Options et limites du formulaire de devis, partagées entre le client et le serveur. */

export const ESTABLISHMENT_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'cafe', label: 'Café' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'epicerie', label: 'Épicerie fine' },
  { value: 'evenementiel', label: 'Événementiel' },
  { value: 'autre', label: 'Autre' },
] as const;

/** `label` : texte complet (email, lecteurs d'écran) ; `short` : texte de la pastille. */
export const VOLUMES = [
  { value: 'lt50', label: 'Moins de 50 bouteilles', short: 'Moins de 50' },
  { value: '50-200', label: '50 à 200 bouteilles', short: '50 – 200' },
  { value: '200-500', label: '200 à 500 bouteilles', short: '200 – 500' },
  { value: '500plus', label: 'Plus de 500 bouteilles', short: '500 et plus' },
] as const;

export const LIMITS = {
  name: 100,
  establishment: 120,
  city: 80,
  email: 254,
  phone: 30,
  message: 1000,
} as const;

/** Nom du champ piège (honeypot) : invisible pour les humains, rempli par les robots. */
export const HONEYPOT_FIELD = 'site_web';

export const EMAIL_RE = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]{2,}$/;
export const PHONE_RE = /^[+0-9 ().-]{6,30}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type QuoteFieldName =
  | 'name'
  | 'establishment'
  | 'type'
  | 'city'
  | 'email'
  | 'phone'
  | 'volume'
  | 'startDate'
  | 'message';

export const labelOf = (list: readonly { value: string; label: string }[], value: string) =>
  list.find((o) => o.value === value)?.label ?? value;
