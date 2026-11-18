/**
 * Orchestration de la page d'accueil : loader, smooth scroll, scènes pilotées
 * par le scroll, bouteille 3D (chargée à la demande) et formulaire de devis.
 *
 * Principe des scènes : la page ne « défile » pas. Les trois premières sections
 * sont des calques fixes ; le scroll ne fait qu'avancer des timelines qui
 * déplacent les éléments (titre, textes, fonds, bouteille). Seul le formulaire
 * de devis, plus haut que l'écran, défile normalement une fois révélé.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import type { BottleController } from '../three/Bottle';
import { initQuoteForm } from './quote-form';
import { PALETTE_ASSETS } from '../palette';

gsap.registerPlugin(ScrollTrigger, CustomEase);

// Courbes de la maison : une sortie longue et posée, un rideau franc.
const EASE_OUT = CustomEase.create('redsea-out', '0.16, 1, 0.3, 1');
const EASE_CURTAIN = CustomEase.create('redsea-curtain', '0.76, 0, 0.24, 1');
const EASE_SOFT = CustomEase.create('redsea-soft', '0.33, 0.01, 0.12, 1');

/** Textures de la bouteille : celles de la palette active (voir src/palette.ts). */
const TEXTURES = PALETTE_ASSETS;

/**
 * Durée de scroll de chaque scène, en écrans (1 = 100svh). À garder en phase avec les hauteurs
 * déclarées dans home.css (html.has-scenes .hero / .about). La scène des arguments dure
 * « nombre d'arguments + 1 » écrans. Dans les timelines, 1 unité de temps = 1 écran de scroll.
 */
const SCENE_LENGTH = { hero: 2.2, about: 2.4 } as const;
const SCRUB = 0.5;

/**
 * Couleur d'un jeton CSS (#rrggbb) en sRGB 0–1. Les fonds des scènes viennent des jetons de la
 * palette active (beige/rouge ou noir/rose) : le verre de la bouteille les réfracte.
 */
function tokenColor(token: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Couleurs de fond des scènes (sRGB 0–1) : le verre de la bouteille les réfracte. */
const CREAM = tokenColor('--cream', '#f3e2c4');
const RED = tokenColor('--red', '#7a0a10');

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(selector));

// ?motion=off force le mode sans animation (pratique pour le tester sans changer les réglages système).
const reducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
  new URLSearchParams(location.search).get('motion') === 'off';
const compactLayout = window.matchMedia('(max-width: 760px), (max-aspect-ratio: 4 / 5)');
const smallScreen = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const vw = () => window.innerWidth;
const vh = () => window.innerHeight;

/* -------------------------------------------------------------------------- */
/* Choix du rendu : 3D ou image de secours                                    */
/* -------------------------------------------------------------------------- */
function pickBottleMode(): '3d' | 'fallback' {
  const forced = new URLSearchParams(location.search).get('bottle'); // ?bottle=3d | ?bottle=fallback (tests)
  if (reducedMotion) return 'fallback';
  if (forced === '3d' || forced === 'fallback') return forced;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return 'fallback';
  if ((nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return 'fallback';
  try {
    const probe = document.createElement('canvas');
    // failIfMajorPerformanceCaveat : on écarte le rendu logiciel, trop lent pour la transmission du verre.
    const gl = probe.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return 'fallback';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return 'fallback';
  }
  return '3d';
}

/* -------------------------------------------------------------------------- */
/* Loader : compteur synchronisé avec le chargement réel                      */
/* -------------------------------------------------------------------------- */
class LoadProgress {
  private tasks = new Map<string, { weight: number; value: number }>();
  constructor(private onChange: (ratio: number) => void) {}
  add(name: string, weight: number) {
    this.tasks.set(name, { weight, value: 0 });
  }
  set(name: string, value: number) {
    const task = this.tasks.get(name);
    if (!task) return;
    task.value = Math.max(task.value, Math.min(1, value));
    this.onChange(this.ratio);
  }
  get ratio() {
    let total = 0;
    let done = 0;
    for (const { weight, value } of this.tasks.values()) {
      total += weight;
      done += weight * value;
    }
    return total ? done / total : 1;
  }
}

function setupLoader() {
  const loader = $('[data-loader]');
  const count = $('[data-loader-count]');
  const bar = $('[data-loader-bar]');
  const shown = { value: 0 };
  let resolveDone: () => void = () => {};
  const reachedEnd = new Promise<void>((resolve) => (resolveDone = resolve));

  loader?.classList.add('is-controlled');
  const render = () => {
    const v = Math.round(shown.value);
    if (count) count.textContent = String(v);
    if (bar) gsap.set(bar, { scaleX: shown.value / 100 });
    if (shown.value >= 99.5) resolveDone();
  };
  const progress = new LoadProgress((ratio) => {
    gsap.to(shown, {
      value: ratio * 100,
      duration: reducedMotion ? 0.01 : 0.7,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: render,
    });
  });

  const exit = async () => {
    await reachedEnd;
    if (!loader) return;
    if (reducedMotion) {
      loader.hidden = true;
      return;
    }
    await gsap
      .timeline()
      .to(count?.parentElement ?? loader, { yPercent: -12, duration: 0.5, ease: EASE_SOFT }, 0.15)
      .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.15, ease: EASE_CURTAIN }, 0.2)
      .then();
    loader.hidden = true;
  };
  return { progress, exit };
}

/* -------------------------------------------------------------------------- */
/* Bouteille                                                                  */
/* -------------------------------------------------------------------------- */
/** Pose pilotée par le scroll (même forme que BottlePose) + offsets de l'intro. */
const pose = { spin: 0, x: 0, y: 0, scale: 1, tiltX: 0.1, tiltZ: 0 };
const intro = { y: reducedMotion ? 0 : -1.05, spin: reducedMotion ? 0 : -1.5 };
/** Fond réfracté par le verre : suit la couleur de la scène en cours. */
const backdrop = { ...CREAM };
/** Vrai tant que les scènes fixes sont à l'écran (faux une fois le devis déroulé par-dessus). */
let scenesOnScreen = true;

function showFallback(onLoaded: () => void) {
  const img = $<HTMLImageElement>('[data-bottle-fallback]');
  $('[data-stage]')?.setAttribute('hidden', '');
  if (!img) return onLoaded();
  img.loading = 'eager';
  img.hidden = false;
  if (img.complete && img.naturalWidth) onLoaded();
  else {
    img.addEventListener('load', onLoaded, { once: true });
    img.addEventListener('error', onLoaded, { once: true });
  }
}

async function mountBottle(onProgress: (ratio: number) => void): Promise<BottleController | null> {
  const canvas = $<HTMLCanvasElement>('[data-bottle-canvas]');
  const hit = $<HTMLButtonElement>('[data-bottle-hit]');
  if (!canvas || !hit) return null;

  // Three.js n'est téléchargé qu'ici, dans un chunk séparé.
  const { createBottle } = await import('../three/Bottle');
  onProgress(0.25);
  const textures = {
    // Étiquette haute définition sur ordinateur, où la bouteille est affichée en grand.
    labelUrl: smallScreen ? TEXTURES.label : TEXTURES.labelHd,
    capUrl: TEXTURES.cap,
    capInk: TEXTURES.capInk,
  };
  const bottle = await createBottle({
    canvas,
    ...textures,
    lowPower: smallScreen,
    onProgress: (ratio) => onProgress(0.25 + ratio * 0.75),
    onContextLost: () => {
      canvas.classList.remove('is-ready');
      showFallback(() => {});
    },
  });

  canvas.classList.add('is-ready');
  hit.hidden = false;
  new ResizeObserver(() => bottle.resize()).observe(canvas);

  // À chaque image : la pose (scroll + intro) est recopiée, la zone de drag recalée sur la
  // bouteille. La boucle de rendu ne tourne que si la bouteille est réellement visible.
  let running = false;
  let lastRect = '';
  gsap.ticker.add(() => {
    const y = pose.y + intro.y;
    const visible = scenesOnScreen && !document.hidden && Math.abs(pose.x) < 0.82 && Math.abs(y) < 1.3;
    if (visible !== running) {
      running = visible;
      if (visible) bottle.start();
      else {
        bottle.stop();
        hit.style.width = '0px';
        hit.style.height = '0px';
        lastRect = '';
      }
    }
    if (!visible) return;
    Object.assign(bottle.pose, pose);
    bottle.pose.y = y;
    bottle.pose.spin = pose.spin + intro.spin;
    bottle.setBackdrop(backdrop.r, backdrop.g, backdrop.b);
    const rect = bottle.getScreenRect();
    if (!rect) return;
    const signature = `${rect.left.toFixed(0)}|${rect.top.toFixed(0)}|${rect.width.toFixed(0)}|${rect.height.toFixed(0)}`;
    if (signature === lastRect) return;
    lastRect = signature;
    hit.style.transform = `translate(${rect.left.toFixed(1)}px, ${rect.top.toFixed(1)}px)`;
    hit.style.width = `${rect.width.toFixed(1)}px`;
    hit.style.height = `${rect.height.toFixed(1)}px`;
  });

  bindBottleInteractions(hit, bottle);
  return bottle;
}

function bindBottleInteractions(hit: HTMLElement, bottle: BottleController) {
  const cursor = $('[data-cursor]');
  const moveX = cursor ? gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' }) : null;
  const moveY = cursor ? gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' }) : null;

  let pointerId: number | null = null;
  let lastX = 0;
  let travelled = 0;
  let downAt = 0;

  hit.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    hit.setPointerCapture(pointerId);
    lastX = event.clientX;
    travelled = 0;
    downAt = performance.now();
    bottle.dragStart();
    cursor?.classList.add('is-dragging');
  });

  hit.addEventListener('pointermove', (event) => {
    moveX?.(event.clientX);
    moveY?.(event.clientY);
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    travelled += Math.abs(dx);
    bottle.dragMove(dx);
  });

  const release = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    bottle.dragEnd();
    cursor?.classList.remove('is-dragging');
    // Clic sans glisser : demi-tour vers l'autre face de l'étiquette.
    if (event.type === 'pointerup' && travelled < 6 && performance.now() - downAt < 450) bottle.flip();
  };
  hit.addEventListener('pointerup', release);
  hit.addEventListener('pointercancel', release);

  hit.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse') return;
    if (cursor) gsap.set(cursor, { x: event.clientX, y: event.clientY });
    cursor?.classList.add('is-visible');
  });
  hit.addEventListener('pointerleave', () => cursor?.classList.remove('is-visible'));

  // Clavier : flèches pour tourner, Entrée / Espace pour le demi-tour.
  hit.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') bottle.nudge(-0.7);
    else if (event.key === 'ArrowRight') bottle.nudge(0.7);
    else return;
    event.preventDefault();
  });
  hit.addEventListener('click', (event) => {
    if (event.detail === 0) bottle.flip(); // activation clavier (le clic souris est géré au pointerup)
  });
}

/* -------------------------------------------------------------------------- */
/* Mode sans animation : en-tête qui suit la couleur des sections             */
/* -------------------------------------------------------------------------- */
function setupStaticHeader() {
  const header = $('[data-header]');
  if (!header) return;
  for (const zone of $$('[data-theme-zone]')) {
    ScrollTrigger.create({
      trigger: zone,
      start: 'top 36px',
      end: 'bottom 36px',
      onToggle: (self) => {
        if (self.isActive) header.dataset.theme = zone.dataset.themeZone ?? 'light';
      },
    });
  }
  const quote = $('[data-quote]');
  if (quote) {
    ScrollTrigger.create({
      trigger: quote,
      start: 'top 80px',
      end: 'bottom 80px',
      onToggle: (self) => header.setAttribute('data-at-quote', String(self.isActive)),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Scènes pilotées par le scroll                                              */
/* -------------------------------------------------------------------------- */

/** Ajuste le corps du texte « Qui sommes-nous » pour qu'il tienne dans l'écran, quelle que soit sa longueur. */
function fitAboutText() {
  const front = $('[data-about-front]');
  const text = $('[data-about-text]');
  if (!front || !text) return;
  const style = getComputedStyle(front);
  const label = $('[data-about-label]', front);
  const signature = $('[data-about-signature]', front);
  const gap = parseFloat(style.rowGap) || 0;
  const available =
    front.clientHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom) -
    (label?.offsetHeight ?? 0) -
    (signature?.offsetHeight ?? 0) -
    gap * 2;
  const target = available * 0.94; // un peu d'air en haut et en bas
  let low = 13;
  let high = compactLayout.matches ? 34 : 62;
  for (let i = 0; i < 9; i++) {
    const middle = (low + high) / 2;
    text.style.fontSize = `${middle}px`;
    if (text.scrollHeight <= target) low = middle;
    else high = middle;
  }
  text.style.fontSize = `${Math.floor(low)}px`;
}

interface SceneOptions {
  /** Vrai si la bouteille est l'image de secours (pas de scène 3D). */
  fallback: boolean;
}

function setupScenes({ fallback }: SceneOptions) {
  const header = $('[data-header]');
  const hero = $('[data-scene="hero"]');
  const about = $('[data-scene="about"]');
  const args = $('[data-scene="args"]');
  const quote = $('[data-quote]');
  const quotePin = $('[data-quote-pin]');
  if (!header || !hero || !about || !args || !quote || !quotePin) return;

  const items = $$('[data-arg]', args);
  args.style.setProperty('--arg-count', String(items.length));

  const parts = $$('[data-hero-part]', hero);
  const letters = $$('[data-hero-letter]', hero);
  const aboutBg = $('[data-scene-bg]', about);
  const aboutFront = $('[data-about-front]', about);
  const argsBg = $('[data-scene-bg]', args);
  const argsLabel = $('[data-args-label]', args);
  const fallbackImage = fallback ? $('[data-bottle-fallback]') : null;
  const drift = [-7, 5, -3, 6, -5, 8]; // décalage vertical de chaque lettre (svh)
  const twist = [-5, 3, -2, 4, -3, 5]; // rotation de chaque lettre (deg)
  /** Face de l'étiquette montrée pour chaque argument (radians, 0 = logo de face). */
  const faces = [0, -0.5, 2.95, Math.PI * 2 + 0.25];

  fitAboutText();
  ScrollTrigger.addEventListener('refreshInit', fitAboutText);

  // Couleur de l'en-tête : déduite directement de la position de scroll (et non posée par les
  // timelines, dont l'ordre d'exécution n'est pas garanti quand on saute d'une scène à l'autre).
  // Les seuils correspondent au moment où chaque nouveau fond a recouvert le haut de l'écran.
  let marks = { dark: 0, light: 0, quote: 0, atQuote: 0 };
  const top = (element: Element) => element.getBoundingClientRect().top + window.scrollY;
  const measure = () => {
    marks = {
      dark: top(hero) + 1.72 * vh(),
      light: top(about) + 2.04 * vh(),
      quote: top(quote) + 0.32 * vh(),
      atQuote: top(quote) + 0.4 * vh(),
    };
  };
  measure();
  ScrollTrigger.addEventListener('refresh', measure);
  gsap.ticker.add(() => {
    const y = window.scrollY;
    const theme = y >= marks.quote ? 'dark' : y >= marks.light ? 'light' : y >= marks.dark ? 'dark' : 'light';
    if (header.dataset.theme !== theme) header.dataset.theme = theme;
    const atQuote = String(y >= marks.atQuote);
    if (header.getAttribute('data-at-quote') !== atQuote) header.setAttribute('data-at-quote', atQuote);
  });

  // Les scènes fixes ne sont plus à l'écran une fois le devis déroulé par-dessus.
  ScrollTrigger.create({
    trigger: '[data-scenes]',
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => (scenesOnScreen = self.isActive),
  });

  const mm = gsap.matchMedia();
  mm.add({ compact: compactLayout.media, wide: `not all and ${compactLayout.media}` }, (context) => {
    const compact = Boolean(context.conditions?.compact);
    const scrollTrigger = (trigger: Element): ScrollTrigger.Vars => ({
      trigger,
      start: 'top top',
      end: 'bottom top',
      scrub: SCRUB,
      invalidateOnRefresh: true,
    });

    /* ------------------------------ Scène 1 : hero ------------------------------ */
    const heroTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: scrollTrigger(hero) });

    // Le titre s'ouvre pour laisser passer la bouteille, qui fait un tour complet…
    if (compact) {
      heroTl.to(parts[0], { yPercent: -34, xPercent: -6, duration: 1, ease: 'power2.inOut' }, 0);
      heroTl.to(parts[1], { yPercent: 34, xPercent: 6, duration: 1, ease: 'power2.inOut' }, 0);
    } else {
      heroTl.to(parts[0], { x: () => -vw() * 0.115, duration: 1, ease: 'power2.inOut' }, 0);
      heroTl.to(parts[1], { x: () => vw() * 0.115, duration: 1, ease: 'power2.inOut' }, 0);
    }
    letters.forEach((letter, i) => {
      const amount = compact ? 0.45 : 1;
      heroTl.to(
        letter,
        {
          y: () => (drift[i % drift.length] * amount * vh()) / 100,
          rotation: twist[i % twist.length] * amount,
          duration: 0.9,
          ease: 'power1.in',
        },
        0.35,
      );
    });
    heroTl.to(pose, { spin: Math.PI * 2, duration: 1.5, ease: 'sine.inOut' }, 0);
    heroTl.to(pose, { scale: compact ? 1.08 : 1.14, tiltX: 0.2, duration: 1, ease: 'power1.inOut' }, 0.1);
    // fromTo (et non to) : l'intro anime aussi ces éléments ; leur état « visible » est donc
    // écrit ici en dur plutôt que relu dans la page au moment d'un recalcul.
    heroTl.fromTo(
      '[data-hero-scroll]',
      { autoAlpha: 1 },
      { autoAlpha: 0, duration: 0.08, immediateRender: false },
      0.02,
    );
    heroTl.fromTo(
      '[data-hero-meta]',
      { autoAlpha: 1, y: 0 },
      { autoAlpha: 0, y: -16, duration: 0.2, stagger: 0.04, immediateRender: false },
      0.55,
    );

    // … puis il se disperse pendant que le rouge du bissap envahit l'écran depuis la bouteille.
    if (compact) {
      heroTl.to(parts[0], { yPercent: -150, duration: 0.7, ease: 'power2.in' }, 1.25);
      heroTl.to(parts[1], { yPercent: 150, duration: 0.7, ease: 'power2.in' }, 1.25);
      heroTl.to(pose, { x: 1, tiltZ: -0.3, duration: 0.75, ease: 'power2.in' }, 1.25);
    } else {
      heroTl.to(parts[0], { x: () => -vw() * 0.8, duration: 0.75, ease: 'power2.in' }, 1.25);
      heroTl.to(parts[1], { x: () => vw() * 0.8, duration: 0.75, ease: 'power2.in' }, 1.25);
      // La bouteille glisse à droite : elle y restera pendant les deux scènes suivantes.
      heroTl.to(pose, { x: 0.315, scale: 0.9, tiltZ: 0.05, duration: 0.9, ease: 'power2.inOut' }, 1.3);
      heroTl.to(pose, { spin: Math.PI * 2 + 0.6, duration: 0.7, ease: 'sine.inOut' }, 1.5);
    }
    if (fallbackImage) {
      heroTl.to(fallbackImage, { autoAlpha: 0, yPercent: -8, duration: 0.5, ease: 'power2.in' }, 1.25);
    }
    heroTl.fromTo(
      aboutBg,
      { clipPath: 'circle(0% at 50% 52%)' },
      { clipPath: 'circle(125% at 50% 52%)', duration: 0.8, ease: 'power2.inOut' },
      1.3,
    );
    heroTl.to(backdrop, { ...RED, duration: 0.35 }, 1.45);
    heroTl.fromTo(aboutFront, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 1.85);
    heroTl.set({}, {}, SCENE_LENGTH.hero);

    /* ------------------------- Scène 2 : qui sommes-nous ------------------------- */
    const aboutTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: scrollTrigger(about) });
    const words = $$('[data-word]', about);
    const wordDuration = 0.3;
    // États de départ posés explicitement : avec un décalage (stagger), un fromTo ne les
    // applique pas à toutes les cibles tant que la timeline n'est pas passée dessus.
    gsap.set(words, { opacity: 0.16, y: '0.22em' });
    aboutTl.to(
      words,
      { opacity: 1, y: 0, duration: wordDuration, stagger: (1.35 - wordDuration) / Math.max(1, words.length - 1) },
      0.05,
    );
    aboutTl.fromTo('[data-about-signature]', { opacity: 0 }, { opacity: 1, duration: 0.2 }, 1.3);
    if (!compact) aboutTl.to(pose, { spin: Math.PI * 2 + 3, tiltZ: -0.04, duration: SCENE_LENGTH.about }, 0);

    // Sortie : le texte s'efface vers le haut, le fond crème arrive par la droite.
    aboutTl.to(aboutFront, { opacity: 0, y: () => -vh() * 0.08, duration: 0.4, ease: 'power2.in' }, 1.6);
    aboutTl.fromTo(
      argsBg,
      { clipPath: 'inset(0% 0% 0% 100%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.65, ease: 'power2.inOut' },
      1.7,
    );
    aboutTl.to(backdrop, { ...CREAM, duration: 0.3 }, 1.92);
    aboutTl.fromTo(argsLabel, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 2.15);
    aboutTl.set({}, {}, SCENE_LENGTH.about);

    /* ----------------------------- Scène 3 : arguments ---------------------------- */
    // Un argument par écran de scroll ; le dernier écran sert à la sortie vers le devis.
    const argsTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: scrollTrigger(args) });
    items.forEach((item, i) => {
      const title = $('[data-arg-title]', item);
      const struck = $('[data-arg-struck]', item);
      const strike = $('[data-arg-strike]', item);
      const details = $$('[data-arg-index], [data-arg-note]', item);
      const last = i === items.length - 1;

      argsTl.fromTo(item, { opacity: 0 }, { opacity: 1, duration: 0.1 }, i);
      if (struck && strike) {
        // Barré → remplacé : le mot arrive, le trait le raye, l'argument prend sa place.
        argsTl.fromTo(struck, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.14 }, i + 0.02);
        argsTl.fromTo(strike, { scaleX: 0 }, { scaleX: 1, duration: 0.16, ease: 'power2.inOut' }, i + 0.17);
        argsTl.to(struck, { opacity: 0.6, duration: 0.1 }, i + 0.3);
      }
      argsTl.fromTo(
        title,
        { yPercent: 110 },
        { yPercent: 0, duration: 0.32, ease: 'power3.out' },
        i + (struck ? 0.27 : 0.06),
      );
      gsap.set(details, { opacity: 0, y: 14 });
      argsTl.to(details, { opacity: 1, y: 0, duration: 0.2, stagger: 0.05 }, i + (struck ? 0.42 : 0.24));
      argsTl.to(
        item,
        { opacity: 0, y: () => -vh() * 0.07, duration: 0.2, ease: 'power1.in' },
        last ? i + 1.02 : i + 0.8,
      );

      // La bouteille présente la face de l'étiquette qui correspond à l'argument.
      if (!compact) {
        const turns = Math.PI * 4 + Math.floor(i / faces.length) * Math.PI * 2;
        argsTl.to(
          pose,
          { spin: turns + faces[i % faces.length], duration: 0.6, ease: 'power2.inOut' },
          i === 0 ? 0 : i - 0.12,
        );
      }
    });
    // Sortie vers le devis : la bouteille quitte l'écran par le bas.
    argsTl.to(argsLabel, { opacity: 0, duration: 0.15 }, items.length + 0.02);
    if (!compact) argsTl.to(pose, { y: -1.4, tiltZ: 0.22, duration: 0.5, ease: 'power2.in' }, items.length);
    argsTl.set({}, {}, items.length + 1);

    /* -------------------------------- Scène 4 : devis ------------------------------ */
    // Le panneau noir s'ouvre comme une fente depuis le milieu de l'écran, puis le formulaire
    // défile normalement.
    const quoteTl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: quote,
        start: 'top top',
        end: () => `+=${vh()}`,
        scrub: SCRUB,
        invalidateOnRefresh: true,
      },
    });
    quoteTl.fromTo(
      quotePin,
      { clipPath: () => `inset(${vh() / 2}px 0px ${Math.max(0, quotePin.offsetHeight - vh() / 2)}px 0px)` },
      { clipPath: 'inset(0px 0px 0px 0px)', duration: 0.6, ease: 'power2.inOut' },
      0,
    );
    quoteTl.fromTo(
      '[data-quote-title]',
      { yPercent: 40, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.45, ease: 'power3.out' },
      0.3,
    );
    const quoteParts = '.quote__label, .quote__intro, .form__legend, .form .field, .form__submit, .form__rgpd';
    gsap.set(quoteParts, { y: 24, opacity: 0 });
    quoteTl.to(quoteParts, { y: 0, opacity: 1, duration: 0.3, stagger: 0.025, ease: 'power2.out' }, 0.4);
    quoteTl.set({}, {}, 1);

    return () => {
      // Changement de mise en page (bureau ↔ mobile) : GSAP annule les timelines, on remet la pose à zéro.
      Object.assign(pose, { spin: 0, x: 0, y: 0, scale: 1, tiltX: 0.1, tiltZ: 0 });
      Object.assign(backdrop, CREAM);
    };
  });
}

/** Position de scroll où le devis est entièrement révélé (cible du lien « Demander un devis »). */
function quoteScrollTarget(scenes: boolean) {
  const quote = $('[data-quote]');
  if (!quote) return 0;
  return quote.getBoundingClientRect().top + window.scrollY + (scenes ? vh() : 0);
}

/**
 * Lien « Demander un devis » : plutôt que de dérouler toutes les scènes, un rideau rouge
 * monte, la page saute au formulaire derrière lui, puis le rideau se lève sur le devis.
 */
function setupQuoteJump(lenis: Lenis, scenes: boolean) {
  const curtain = $('[data-curtain]');
  const word = curtain?.querySelector('.curtain__word');
  let busy = false;

  const jump = () => {
    lenis.scrollTo(quoteScrollTarget(scenes), { immediate: true, force: true });
    ScrollTrigger.update();
    // Les timelines « scrub » rattrapent le scroll en douceur : on les termine tout de suite,
    // à l'abri du rideau, pour que le devis soit déjà en place quand il se lève.
    for (const trigger of ScrollTrigger.getAll()) trigger.getTween()?.progress(1);
    // Volontairement, l'adresse ne prend pas « #devis » : un rechargement repart du hero.
  };

  const focusQuote = () => {
    const title = $('#quote-title');
    if (!title) return;
    title.setAttribute('tabindex', '-1');
    title.focus({ preventScroll: true });
  };

  for (const link of $$<HTMLAnchorElement>('a[href$="#devis"]')) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (busy) return;
      if (!curtain) {
        jump();
        focusQuote();
        return;
      }
      busy = true;
      lenis.stop();
      // Contraste avec la section affichée : rideau rouge sur fond beige, beige sur fond rouge
      // (et sur le devis, sombre).
      const onLightScene = ($('[data-header]')?.dataset.theme ?? 'light') === 'light';
      curtain.classList.toggle('curtain--cream', !onLightScene);
      gsap
        .timeline({
          onComplete: () => {
            busy = false;
            lenis.start();
            focusQuote();
          },
        })
        .set(curtain, { visibility: 'visible' })
        .fromTo(
          curtain,
          { clipPath: 'inset(100% 0% 0% 0%)' },
          { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'expo.inOut' },
        )
        .fromTo(word ?? {}, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: EASE_OUT }, 0.35)
        .add(jump)
        .to(word ?? {}, { yPercent: -50, autoAlpha: 0, duration: 0.45, ease: 'power2.in' }, '+=0.25')
        .to(curtain, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.85, ease: 'expo.inOut' }, '<0.1')
        .set(curtain, { visibility: 'hidden', clipPath: 'inset(100% 0% 0% 0%)' });
    });
  }
}

/**
 * Le site ne s'ouvre sur le devis que si l'on vient de cliquer « Demander un devis » depuis une
 * autre page du site (mentions légales, confidentialité). Un rechargement, un onglet restauré
 * ou un lien externe démarrent sur le hero, avec l'animation d'entrée.
 */
function arrivedFromQuoteLink() {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navigation && navigation.type !== 'navigate') return false;
  try {
    const from = new URL(document.referrer);
    return from.origin === location.origin && from.pathname !== location.pathname;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Démarrage                                                                  */
/* -------------------------------------------------------------------------- */
async function init() {
  const root = document.documentElement;
  const scenes = !reducedMotion;
  root.classList.add('is-loading');
  if (scenes) root.classList.add('has-scenes');
  // La page s'ouvre toujours sur le hero (l'intro en dépend), sauf si l'URL vise le devis.
  history.scrollRestoration = 'manual';
  const startAtQuote = location.hash === '#devis' && arrivedFromQuoteLink();
  // L'ancre ne doit pas survivre à un rechargement : on la retire de l'adresse.
  if (location.hash === '#devis') history.replaceState(null, '', location.pathname + location.search);
  if (!startAtQuote) window.scrollTo(0, 0);

  const { progress, exit } = setupLoader();
  const mode = pickBottleMode();
  root.dataset.bottle = mode;

  // Smooth scroll (désactivé si l'utilisateur préfère moins d'animations).
  let lenis: Lenis | null = null;
  if (!reducedMotion) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis?.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }

  // --- Tâches de chargement réelles : polices + bouteille (3D ou image) ---
  progress.add('fonts', 2);
  progress.add('bottle', 8);

  const fontsReady = Promise.all([
    document.fonts.load('400 1em "Redsea Display"', 'REDSEA'),
    document.fonts.load('500 1em "Schibsted Grotesk"'),
  ])
    .catch(() => undefined)
    .then(() => progress.set('fonts', 1));

  let bottleReady: Promise<unknown>;
  if (mode === 'fallback') {
    bottleReady = new Promise<void>((resolve) => showFallback(resolve)).then(() => progress.set('bottle', 1));
  } else if (!startAtQuote) {
    bottleReady = mountBottle((ratio) => progress.set('bottle', ratio))
      .catch((error) => {
        console.warn('[REDSEA] Scène 3D indisponible, image de secours utilisée.', error);
        root.dataset.bottle = 'fallback';
        return new Promise<void>((resolve) => showFallback(resolve));
      })
      .then(() => progress.set('bottle', 1));
  } else {
    // Page ouverte directement sur le devis : la scène 3D se charge en arrière-plan, sans retenir le loader.
    progress.set('bottle', 1);
    bottleReady = Promise.resolve();
    mountBottle(() => {}).catch(() => showFallback(() => {}));
  }

  // Garde-fou : on ne retient jamais la page plus de 10 s.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10000));
  await Promise.race([Promise.all([fontsReady, bottleReady]), timeout]);
  progress.set('fonts', 1);
  progress.set('bottle', 1);

  // L'entrée animée du hero n'a de sens que si l'on arrive en haut de page.
  const playIntro = scenes && !startAtQuote;
  if (!playIntro) Object.assign(intro, { y: 0, spin: 0 });
  if (scenes) {
    setupScenes({ fallback: root.dataset.bottle === 'fallback' });
    if (playIntro) {
      gsap.set('[data-hero-letter]', { yPercent: 70, autoAlpha: 0 });
      gsap.set('[data-hero-meta], [data-hero-scroll]', { autoAlpha: 0 });
    }
  } else {
    setupStaticHeader();
  }
  initQuoteForm({ reducedMotion });
  // Le formulaire change de hauteur (message de succès) : les repères de scroll sont recalculés.
  document.addEventListener('redsea:layout', () => ScrollTrigger.refresh());
  ScrollTrigger.refresh();

  if (lenis) setupQuoteJump(lenis, scenes);

  const exiting = exit();
  if (playIntro) {
    // Entrée du hero, lancée pendant que le rideau se lève.
    const tl = gsap.timeline({ delay: 0.75 });
    tl.to('[data-hero-letter]', { yPercent: 0, autoAlpha: 1, duration: 1.3, ease: EASE_OUT, stagger: 0.055 }, 0)
      .to(intro, { y: 0, duration: 1.7, ease: EASE_OUT }, 0.1)
      .to(intro, { spin: 0, duration: 2.1, ease: EASE_OUT }, 0.1)
      .to('[data-hero-meta], [data-hero-scroll]', { autoAlpha: 1, duration: 0.9, ease: EASE_SOFT, stagger: 0.1 }, 0.9);
  }
  if (startAtQuote) {
    const target = quoteScrollTarget(scenes);
    if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
    else window.scrollTo(0, target);
    ScrollTrigger.update();
  }
  // Le navigateur peut encore sauter à une ancre (#devis) pendant le chargement : sans clic
  // sur « Demander un devis », on repart du haut, là où l'animation d'entrée se joue.
  const backToTop = () => {
    if (startAtQuote || window.scrollY === 0) return;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
    ScrollTrigger.update();
  };
  backToTop();
  await exiting;
  backToTop();
  root.classList.remove('is-loading');
  lenis?.start();
  ScrollTrigger.refresh();
}

init().catch((error) => {
  // Quoi qu'il arrive, on ne laisse jamais le visiteur bloqué derrière le loader.
  console.error('[REDSEA] Initialisation interrompue', error);
  document.documentElement.classList.remove('is-loading', 'has-scenes');
  const loader = $('[data-loader]');
  if (loader) loader.hidden = true;
});
