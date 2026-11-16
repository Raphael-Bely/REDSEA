/**
 * Formulaire de devis : validation côté client (confort), envoi vers /api/devis,
 * états chargement / succès / erreur. La validation qui fait foi est côté serveur.
 */
import gsap from 'gsap';
import {
  DATE_RE,
  EMAIL_RE,
  ESTABLISHMENT_TYPES,
  HONEYPOT_FIELD,
  LIMITS,
  PHONE_RE,
  VOLUMES,
  type QuoteFieldName,
} from '../lib/quote-fields';

type Validator = (value: string) => string | null;

const required = (message: string): Validator => (v) => (v ? null : message);
const maxLength = (max: number): Validator => (v) => (v.length > max ? `${max} caractères maximum.` : null);
const oneOf = (list: readonly { value: string }[]): Validator => (v) =>
  !v || list.some((o) => o.value === v) ? null : 'Choix non valide.';
const all = (...validators: Validator[]): Validator => (v) => {
  for (const validate of validators) {
    const error = validate(v);
    if (error) return error;
  }
  return null;
};

const VALIDATORS: Record<QuoteFieldName, Validator> = {
  name: all(required('Indiquez votre nom et votre prénom.'), (v) => (v.length < 2 ? 'Ce nom est trop court.' : null), maxLength(LIMITS.name)),
  establishment: all(required('Indiquez le nom de votre établissement.'), maxLength(LIMITS.establishment)),
  type: oneOf(ESTABLISHMENT_TYPES),
  city: maxLength(LIMITS.city),
  email: all(required('Indiquez une adresse email pour que nous puissions vous répondre.'), (v) =>
    EMAIL_RE.test(v) && v.length <= LIMITS.email ? null : 'Cette adresse email ne semble pas valide (exemple : nom@domaine.fr).',
  ),
  phone: (v) => (!v || PHONE_RE.test(v) ? null : 'Ce numéro ne semble pas valide (chiffres, espaces, + uniquement).'),
  volume: oneOf(VOLUMES),
  startDate: (v) => {
    if (!v) return null;
    if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) return 'Cette date n’est pas valide.';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(`${v}T00:00:00`) < today ? 'Choisissez une date à venir.' : null;
  },
  message: maxLength(LIMITS.message),
};

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(id?: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type ApiResponse = { ok: true } | { ok: false; message?: string; fieldErrors?: Partial<Record<QuoteFieldName, string>> };

export function initQuoteForm({ reducedMotion = false } = {}) {
  const form = document.querySelector<HTMLFormElement>('[data-quote-form]');
  if (!form) return;
  const status = form.querySelector<HTMLElement>('[data-form-status]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const submitLabel = form.querySelector<HTMLElement>('[data-submit-label]')!;
  const success = document.querySelector<HTMLElement>('[data-form-success]');
  const counter = form.querySelector<HTMLElement>('[data-message-count]');
  const names = Object.keys(VALIDATORS) as QuoteFieldName[];

  const control = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const valueOf = (name: string) => (control(name)?.value ?? '').trim();

  const setError = (name: QuoteFieldName, message: string | null) => {
    const input = control(name);
    const field = form.querySelector<HTMLElement>(`[data-field="${name}"]`);
    const error = field?.querySelector<HTMLElement>('[data-error]');
    if (!input || !field || !error) return;
    field.classList.toggle('is-invalid', Boolean(message));
    if (message) {
      error.textContent = message;
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
      // Le texte est vidé après la transition de sortie.
      window.setTimeout(() => !field.classList.contains('is-invalid') && (error.textContent = ''), 350);
    }
  };
  const validate = (name: QuoteFieldName) => {
    const message = VALIDATORS[name](valueOf(name));
    setError(name, message);
    return !message;
  };

  const startInput = control('startDate') as HTMLInputElement | null;
  if (startInput) startInput.min = new Date().toISOString().slice(0, 10);

  for (const name of names) {
    const input = control(name);
    input?.addEventListener('blur', () => validate(name));
    input?.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validate(name);
    });
  }
  const message = control('message');
  message?.addEventListener('input', () => {
    if (counter) counter.textContent = String(message.value.length);
  });

  // --- Cloudflare Turnstile : chargé seulement à l'approche du formulaire ---
  const siteKey = form.dataset.turnstileSitekey ?? '';
  const turnstileBox = form.querySelector<HTMLElement>('[data-turnstile]');
  let turnstileToken = '';
  let turnstileId: string | undefined;
  if (siteKey && turnstileBox) {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.addEventListener('load', () => {
          turnstileId = window.turnstile?.render(turnstileBox, {
            sitekey: siteKey,
            theme: 'dark',
            language: 'fr',
            appearance: 'interaction-only',
            callback: (token: string) => (turnstileToken = token),
            'expired-callback': () => (turnstileToken = ''),
            'error-callback': () => (turnstileToken = ''),
          });
        });
        document.head.append(script);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(form);
  }

  const setLoading = (loading: boolean) => {
    submit.classList.toggle('is-loading', loading);
    submit.setAttribute('aria-disabled', String(loading));
    submitLabel.textContent = (loading ? form.dataset.labelSending : form.dataset.labelSubmit) ?? '';
  };
  const showStatus = (text: string) => {
    status.textContent = '';
    // Réinsertion différée : relance l'annonce aux lecteurs d'écran et l'animation d'entrée.
    requestAnimationFrame(() => (status.textContent = text));
  };

  const showSuccess = async () => {
    if (!success) return;
    if (!reducedMotion) {
      await gsap.to(form, { autoAlpha: 0, y: -24, duration: 0.55, ease: 'power2.in' }).then();
    }
    form.hidden = true;
    success.hidden = false;
    // La section change de hauteur : main.ts recalcule ses repères de scroll.
    document.dispatchEvent(new CustomEvent('redsea:layout'));
    if (!reducedMotion) {
      gsap.from(success.children, { y: 40, autoAlpha: 0, duration: 1.1, ease: 'expo.out', stagger: 0.12 });
    }
    success.focus({ preventScroll: true });
    success.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  let sending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    status.textContent = '';

    const invalid = names.filter((name) => !validate(name));
    if (invalid.length) {
      control(invalid[0])?.focus();
      showStatus(invalid.length === 1 ? 'Un champ est à corriger.' : `${invalid.length} champs sont à corriger.`);
      return;
    }
    if (siteKey && !turnstileToken) {
      showStatus('La vérification anti-robot n’est pas terminée. Patientez un instant puis renvoyez le formulaire.');
      return;
    }

    const payload: Record<string, string> = { turnstileToken, [HONEYPOT_FIELD]: control(HONEYPOT_FIELD)?.value ?? '' };
    for (const name of names) payload[name] = valueOf(name);

    sending = true;
    setLoading(true);
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as ApiResponse | null;
      if (response.ok && data?.ok) {
        await showSuccess();
        return;
      }
      if (data && !data.ok && data.fieldErrors) {
        const entries = Object.entries(data.fieldErrors) as [QuoteFieldName, string][];
        entries.forEach(([name, text]) => setError(name, text));
        if (entries[0]) control(entries[0][0])?.focus();
      }
      showStatus((data && !data.ok && data.message) || form.dataset.errorGeneric || 'L’envoi a échoué.');
    } catch {
      showStatus('Connexion impossible. Vérifiez votre réseau puis réessayez.');
    } finally {
      sending = false;
      setLoading(false);
      // Un jeton Turnstile ne sert qu'une fois : on en redemande un après chaque tentative.
      if (turnstileId !== undefined) {
        turnstileToken = '';
        window.turnstile?.reset(turnstileId);
      }
    }
  });
}
