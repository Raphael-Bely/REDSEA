/**
 * Orchestration de la page d'accueil : loader, smooth scroll, scènes pilotées
 * par le scroll, bouteille 3D (chargée à la demande) et formulaire de devis.
 *
 * Principe des scènes : la page ne « défile » pas. Les premières sections (dont la « nuit »,
 * le simulateur complet de la bouteille)
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
import { PALETTES, currentPalette, type PaletteName } from '../palette';
import { otherPalette, requestEdition, setEditionTransition } from './edition';

gsap.registerPlugin(ScrollTrigger, CustomEase);

// Courbes de la maison : une sortie longue et posée, un rideau franc.
const EASE_OUT = CustomEase.create('redsea-out', '0.16, 1, 0.3, 1');
const EASE_CURTAIN = CustomEase.create('redsea-curtain', '0.76, 0, 0.24, 1');
const EASE_SOFT = CustomEase.create('redsea-soft', '0.33, 0.01, 0.12, 1');

/** Textures de la bouteille pour l'édition affichée (voir src/palette.ts). */
function bottleTextures() {
  const assets = PALETTES[currentPalette()];
  return {
    // Étiquette haute définition sur ordinateur, où la bouteille est affichée en grand.
    labelUrl: smallScreen ? assets.label : assets.labelHd,
    capUrl: assets.cap,
    capInk: assets.capInk,
  };
}

/**
 * Durée de scroll de chaque scène, en écrans (1 = 100svh). À garder en phase avec les hauteurs
 * déclarées dans home.css (html.has-scenes .hero / .about). La scène des arguments dure
 * « nombre d'arguments + 1 » écrans. Dans les timelines, 1 unité de temps = 1 écran de scroll.
 */
const SCENE_LENGTH = { hero: 2.2, about: 2.4, night: 3 } as const;
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

/** Couleurs de fond des scènes (sRGB 0–1) : relues à chaque changement d'édition. */
const CREAM = { r: 0, g: 0, b: 0 };
const RED = { r: 0, g: 0, b: 0 };
function readSceneColors() {
  Object.assign(CREAM, tokenColor('--cream', '#f3e2c4'));
  Object.assign(RED, tokenColor('--red', '#7a0a10'));
}
readSceneColors();

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
const pose = { spin: 0, x: 0, y: 0, scale: 1, tiltX: 0.1, tiltZ: 0, night: 0 };
const intro = { y: reducedMotion ? 0 : -1.05, spin: reducedMotion ? 0 : -1.5 };
/**
 * Fond réfracté par le verre : suit la couleur de la scène en cours. Mélange (0 = crème,
 * 1 = rouge) et non couleur figée : il reste juste après un changement d'édition.
 */
const backdrop = { mix: 0 };
/** Bouteille 3D affichée : reconstruite avec l'autre étiquette quand l'édition change. */
let bottleStage: { rebuild(): Promise<void> } | null = null;
/** Bouteille 3D en cours (pour les boutons de la scène « nuit »). */
let liveBottle: (() => BottleController) | null = null;
/** Bouton « Faire tourner » de la nuit : repris par la nouvelle bouteille après un changement d'édition. */
let nightSpinning = false;
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
  const stage = $('[data-stage]');
  const firstCanvas = $<HTMLCanvasElement>('[data-bottle-canvas]');
  const hit = $<HTMLButtonElement>('[data-bottle-hit]');
  if (!stage || !firstCanvas || !hit) return null;
  let canvas: HTMLCanvasElement = firstCanvas;

  // Three.js n'est téléchargé qu'ici, dans un chunk séparé.
  const { createBottle } = await import('../three/Bottle');
  onProgress(0.25);
  const build = (target: HTMLCanvasElement, progress?: (ratio: number) => void) =>
    createBottle({
      canvas: target,
      ...bottleTextures(),
      lowPower: smallScreen,
      onProgress: progress,
      onContextLost: () => {
        target.classList.remove('is-ready');
        showFallback(() => {});
      },
    });
  let bottle = await build(canvas, (ratio) => onProgress(0.25 + ratio * 0.75));

  canvas.classList.add('is-ready');
  hit.hidden = false;
  new ResizeObserver(() => bottle.resize()).observe(stage);

  // À chaque image : la pose (scroll + intro) est recopiée, la zone de drag recalée sur la
  // bouteille. La boucle de rendu ne tourne que si la bouteille est réellement visible.
  let running = false;
  let lastRect = '';
  gsap.ticker.add(() => {
    const y = pose.y + intro.y;
    const visible = scenesOnScreen && !document.hidden && Math.abs(pose.x) < 0.82 && Math.abs(y) < 1.3;
    if (visible !== running) {
      running = visible;
      // Rendu arrêté = le canvas garderait sa dernière image (bouteille figée au milieu de
      // l'écran si des images ont été sautées pendant un scroll rapide) : on le masque.
      canvas.style.visibility = visible ? '' : 'hidden';
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
    const m = backdrop.mix;
    bottle.setBackdrop(CREAM.r + (RED.r - CREAM.r) * m, CREAM.g + (RED.g - CREAM.g) * m, CREAM.b + (RED.b - CREAM.b) * m);
    const rect = bottle.getScreenRect();
    if (!rect) return;
    const signature = `${rect.left.toFixed(0)}|${rect.top.toFixed(0)}|${rect.width.toFixed(0)}|${rect.height.toFixed(0)}`;
    if (signature === lastRect) return;
    lastRect = signature;
    hit.style.transform = `translate(${rect.left.toFixed(1)}px, ${rect.top.toFixed(1)}px)`;
    hit.style.width = `${rect.width.toFixed(1)}px`;
    hit.style.height = `${rect.height.toFixed(1)}px`;
  });

  // Changement d'édition : une nouvelle bouteille (autre étiquette, autre encre de capsule) est
  // construite sur un canvas neuf, puis remplace l'ancienne d'un coup. Un canvas neuf plutôt
  // que le même : chaque bouteille garde son propre contexte WebGL, rien ne se mélange.
  bottleStage = {
    async rebuild() {
      const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
      fresh.classList.remove('is-ready');
      fresh.style.visibility = 'hidden'; // la boucle ci-dessus l'affiche si la bouteille est à l'écran
      canvas.after(fresh);
      let next: BottleController;
      try {
        next = await build(fresh);
      } catch (error) {
        fresh.remove();
        console.warn('[REDSEA] Étiquette de l’autre édition indisponible : bouteille inchangée.', error);
        return;
      }
      bottle.dispose();
      canvas.remove();
      bottle = next;
      bottle.setSpinning(nightSpinning);
      canvas = fresh;
      canvas.classList.add('is-ready');
      running = false;
      lastRect = '';
    },
  };

  liveBottle = () => bottle;
  bindBottleInteractions(hit, () => bottle);
  return bottle;
}

/** Part haute de la bouteille (capsule) : la « dévisser » change d'édition. */
const CAP_ZONE = 0.1;

function bindBottleInteractions(hit: HTMLElement, current: () => BottleController) {
  const cursor = $('[data-cursor]');
  const moveX = cursor ? gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' }) : null;
  const moveY = cursor ? gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' }) : null;
  const turnLabel = cursor?.textContent ?? '';
  const onCap = (event: PointerEvent) => {
    const rect = hit.getBoundingClientRect();
    return event.clientY - rect.top < rect.height * CAP_ZONE;
  };

  let pointerId: number | null = null;
  let lastX = 0;
  let travelled = 0;
  let downAt = 0;

  // Nuit : la bouteille se manipule comme dans le simulateur (sphère virtuelle, déplacement, zoom).
  const freeIds = new Set<number>();

  hit.addEventListener('pointerdown', (event) => {
    if (current().isFree()) {
      if (event.button > 2) return;
      hit.setPointerCapture(event.pointerId);
      freeIds.add(event.pointerId);
      const panMode = event.button !== 0 || event.ctrlKey || event.metaKey;
      current().freeDown(event.pointerId, event.clientX, event.clientY, panMode);
      cursor?.classList.add('is-dragging');
      return;
    }
    if (event.button !== 0) return;
    pointerId = event.pointerId;
    hit.setPointerCapture(pointerId);
    lastX = event.clientX;
    travelled = 0;
    downAt = performance.now();
    current().dragStart();
    cursor?.classList.add('is-dragging');
  });

  hit.addEventListener('pointermove', (event) => {
    moveX?.(event.clientX);
    moveY?.(event.clientY);
    // Clin d'œil : sur la capsule, le curseur propose de la dévisser.
    if (freeIds.has(event.pointerId)) {
      current().freeMove(event.pointerId, event.clientX, event.clientY);
      return;
    }
    if (cursor && pointerId === null) {
      const label = !current().isFree() && onCap(event) ? 'Dévisser' : turnLabel;
      if (cursor.textContent !== label) cursor.textContent = label;
    }
    if (event.pointerId !== pointerId) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    travelled += Math.abs(dx);
    current().dragMove(dx);
  });

  const release = (event: PointerEvent) => {
    if (freeIds.delete(event.pointerId)) {
      current().freeUp(event.pointerId);
      if (!freeIds.size) cursor?.classList.remove('is-dragging');
      return;
    }
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    current().dragEnd();
    cursor?.classList.remove('is-dragging');
    if (event.type !== 'pointerup' || travelled >= 6 || performance.now() - downAt >= 450) return;
    if (onCap(event)) {
      // Capsule dévissée : un tour sur elle-même, puis l'autre édition.
      current().nudge(-Math.PI * 2);
      window.setTimeout(() => void requestEdition(otherPalette()), 380);
    } else {
      // Clic sans glisser : demi-tour vers l'autre face de l'étiquette.
      current().flip();
    }
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
  hit.addEventListener('contextmenu', (event) => {
    if (current().isFree()) event.preventDefault();
  });
  // Zoom : Ctrl + molette (ou pincement au pavé tactile). La molette seule continue de faire défiler la page.
  hit.addEventListener(
    'wheel',
    (event) => {
      if (!current().isFree() || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = Math.max(-30, Math.min(30, event.deltaY));
      current().freeZoom(Math.exp(delta * 0.008), event.clientX, event.clientY);
    },
    { passive: false },
  );
  hit.addEventListener('dblclick', () => {
    if (current().isFree()) current().recenter();
  });

  hit.addEventListener('keydown', (event) => {
    if (current().isFree()) {
      const k = event.key;
      if (k === 'ArrowLeft') current().freeKick(0, -1, 0);
      else if (k === 'ArrowRight') current().freeKick(0, 1, 0);
      else if (k === 'ArrowUp') current().freeKick(-1, 0, 0);
      else if (k === 'ArrowDown') current().freeKick(1, 0, 0);
      else if (k === 'a' || k === 'q') current().freeKick(0, 0, 1);
      else if (k === 'e' || k === 'd') current().freeKick(0, 0, -1);
      else if (k === '+' || k === '=') current().freeZoom(0.9);
      else if (k === '-') current().freeZoom(1.1);
      else return;
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowLeft') current().nudge(-0.7);
    else if (event.key === 'ArrowRight') current().nudge(0.7);
    else return;
    event.preventDefault();
  });
  hit.addEventListener('click', (event) => {
    if (event.detail === 0 && !current().isFree()) current().flip(); // activation clavier (le clic souris est géré au pointerup)
  });
}

/**
 * Changement d'édition sur l'accueil : un rideau aux couleurs de l'édition suivante monte et
 * l'annonce, le site et la bouteille changent derrière lui, puis il se lève.
 */
async function switchEdition(name: PaletteName, apply: () => void, lenis: Lenis | null) {
  const curtain = $('[data-curtain]');
  const word = curtain?.querySelector<HTMLElement>('.curtain__word');
  const swap = async () => {
    apply();
    readSceneColors();
    await bottleStage?.rebuild();
  };
  if (!curtain || !word || reducedMotion) {
    await swap();
    return;
  }
  lenis?.stop();
  const { tokens, title } = PALETTES[name];
  const quoteWord = word.textContent;
  curtain.classList.remove('curtain--cream');
  curtain.classList.add('curtain--edition');
  curtain.style.setProperty('--red', tokens.red);
  curtain.style.setProperty('--red-deep', tokens.redDeep);
  curtain.style.setProperty('--cream', tokens.cream);
  word.textContent = title;
  await gsap
    .timeline()
    .set(curtain, { visibility: 'visible' })
    .fromTo(
      curtain,
      { clipPath: 'inset(100% 0% 0% 0%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.75, ease: 'expo.inOut' },
    )
    .fromTo(word, { yPercent: 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: EASE_OUT }, 0.35)
    .then();
  // Le temps de lire le nom de l'édition, même si la nouvelle bouteille est prête plus tôt.
  await Promise.all([swap(), new Promise((resolve) => setTimeout(resolve, 450))]);
  await gsap
    .timeline()
    .to(word, { yPercent: -50, autoAlpha: 0, duration: 0.45, ease: 'power2.in' })
    .to(curtain, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.85, ease: 'expo.inOut' }, '<0.1')
    .set(curtain, { visibility: 'hidden', clipPath: 'inset(100% 0% 0% 0%)' })
    .then();
  curtain.classList.remove('curtain--edition');
  for (const token of ['--red', '--red-deep', '--cream']) curtain.style.removeProperty(token);
  word.textContent = quoteWord;
  lenis?.start();
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
  // La nuit (simulateur complet) n'existe qu'avec la bouteille 3D.
  const night = fallback ? null : $('[data-scene="night"]');
  const nightBg = night ? $('[data-scene-bg]', night) : null;
  const nightFront = night ? $('[data-night-front]', night) : null;
  if (night) {
    const spinButton = $<HTMLButtonElement>('[data-night-spin]', night);
    spinButton?.addEventListener('click', () => {
      nightSpinning = !nightSpinning;
      spinButton.setAttribute('aria-pressed', String(nightSpinning));
      liveBottle?.().setSpinning(nightSpinning);
    });
    $('[data-night-reset]', night)?.addEventListener('click', () => liveBottle?.().recenter());
  }

  const items = $$('[data-arg]', args);

  const parts = $$('[data-hero-part]', hero);
  const letters = $$('[data-hero-letter]', hero);
  const aboutBg = $('[data-scene-bg]', about);
  const aboutFront = $('[data-about-front]', about);
  const argsBg = $('[data-scene-bg]', args);
  const argsLabel = $('[data-args-label]', args);
  const argsLayers = $$('.scene__back, .scene__front', args);
  const fallbackImage = fallback ? $('[data-bottle-fallback]') : null;
  const drift = [-7, 5, -3, 6, -5, 8]; // décalage vertical de chaque lettre (svh)
  const twist = [-5, 3, -2, 4, -3, 5]; // rotation de chaque lettre (deg)

  fitAboutText();
  ScrollTrigger.addEventListener('refreshInit', fitAboutText);

  // Couleur de l'en-tête : déduite directement de la position de scroll (et non posée par les
  // timelines, dont l'ordre d'exécution n'est pas garanti quand on saute d'une scène à l'autre).
  // Les seuils correspondent au moment où chaque nouveau fond a recouvert le haut de l'écran.
  let marks = { dark: 0, light: 0, night: Infinity, quote: 0, atQuote: 0 };
  const top = (element: Element) => element.getBoundingClientRect().top + window.scrollY;
  const measure = () => {
    marks = {
      dark: top(hero) + 1.72 * vh(),
      light: top(about) + 2.04 * vh(),
      night: night ? top(args) + 1.72 * vh() : Infinity,
      quote: top(quote) + 0.32 * vh(),
      atQuote: top(quote) + 0.4 * vh(),
    };
  };
  measure();
  ScrollTrigger.addEventListener('refresh', measure);
  gsap.ticker.add(() => {
    const y = window.scrollY;
    const theme = y >= marks.quote || y >= marks.night ? 'dark' : y >= marks.light ? 'light' : y >= marks.dark ? 'dark' : 'light';
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
      // En hauteur d'écran (et non en % des lettres) : les deux moitiés sortent vraiment de
      // l'écran, sinon elles restent visibles par-dessus les scènes suivantes sur téléphone.
      heroTl.to(parts[0], { y: () => -vh() * 0.8, duration: 0.7, ease: 'power2.in' }, 1.25);
      heroTl.to(parts[1], { y: () => vh() * 0.8, duration: 0.7, ease: 'power2.in' }, 1.25);
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
    heroTl.to(backdrop, { mix: 1, duration: 0.35 }, 1.45);
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
    // Le texte des arguments est découpé avec son fond : en remontant, il disparaît avec lui
    // au lieu de traîner par-dessus la scène précédente.
    aboutTl.fromTo(
      [argsBg, ...argsLayers],
      { clipPath: 'inset(0% 0% 0% 100%)' },
      { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.65, ease: 'power2.inOut' },
      1.7,
    );
    aboutTl.to(backdrop, { mix: 0, duration: 0.3 }, 1.92);
    aboutTl.set({}, {}, SCENE_LENGTH.about);

    /* ----------------------------- Scène 3 : arguments ---------------------------- */
    // Les quatre arguments tiennent sur un seul écran. Ils ne suivent pas le scroll : ils
    // apparaissent d'un bloc quand la section arrive (le fond crème a presque fini de balayer
    // l'écran), et s'effacent si l'on remonte au-dessus, pour rejouer à la prochaine arrivée.
    const argsReveal = gsap.timeline({ paused: true, defaults: { ease: EASE_OUT } });
    gsap.set(argsLabel, { opacity: 0, y: 12 });
    argsReveal.to(argsLabel, { opacity: 1, y: 0, duration: 0.6 }, 0);
    items.forEach((item, i) => {
      const at = 0.12 + i * 0.16;
      const title = $('[data-arg-title]', item);
      const struck = $('[data-arg-struck]', item);
      const strike = $('[data-arg-strike]', item);
      const details = $$('[data-arg-index], [data-arg-note]', item);
      gsap.set(item, { opacity: 0 });
      gsap.set(details, { opacity: 0, y: 14 });
      gsap.set(title, { yPercent: 110 });
      argsReveal.to(item, { opacity: 1, duration: 0.4 }, at);
      if (struck && strike) {
        // Barré → remplacé : le mot arrive, le trait le raye, l'argument prend sa place.
        gsap.set(struck, { opacity: 0, y: 14 });
        gsap.set(strike, { scaleX: 0 });
        argsReveal.to(struck, { opacity: 1, y: 0, duration: 0.5 }, at);
        argsReveal.to(strike, { scaleX: 1, duration: 0.45, ease: 'power2.inOut' }, at + 0.3);
        argsReveal.to(struck, { opacity: 0.6, duration: 0.3 }, at + 0.7);
      }
      argsReveal.to(title, { yPercent: 0, duration: 0.9, ease: 'power3.out' }, at + (struck ? 0.55 : 0.1));
      argsReveal.to(details, { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, at + (struck ? 0.75 : 0.3));
    });
    // Déclenché quand le fond crème couvre presque tout l'écran ; en remontant, le texte
    // s'efface très vite (le fond repart, il ne doit pas traîner par-dessus la scène rouge).
    ScrollTrigger.create({
      trigger: args,
      start: 'top 8%',
      end: 'max',
      onEnter: () => argsReveal.timeScale(1).play(),
      onEnterBack: () => argsReveal.timeScale(1).play(),
      onLeaveBack: () => argsReveal.timeScale(6).reverse(),
    });

    // Piloté par le scroll : seulement la bouteille (un tour, retour de face) et la sortie.
    const argsTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: scrollTrigger(args) });
    if (!compact) argsTl.to(pose, { spin: Math.PI * 4, duration: 0.95, ease: 'power1.inOut' }, 0);
    // Sortie : le texte s'efface…
    argsTl.to(argsLayers, { opacity: 0, y: () => -vh() * 0.06, duration: 0.3, ease: 'power1.in' }, 1);
    if (night && nightBg && nightFront) {
      // … puis la nuit tombe : le noir monte du bas de l'écran, la bouteille déjà là glisse au centre
      // et se recadre comme dans le simulateur, le sol d'eau apparaît sous elle.
      argsTl.fromTo(
        nightBg,
        { clipPath: 'inset(100% 0% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7, ease: 'power2.inOut' },
        1.05,
      );
      argsTl.to(pose, { x: 0, y: 0, scale: 1, tiltZ: 0, duration: 0.8, ease: 'power2.inOut' }, 1.05);
      argsTl.to(pose, { night: 1, duration: 0.6, ease: 'sine.inOut' }, 1.36);

      /* ------------------------- Scène 4 : nuit (simulateur) ------------------------ */
      const nightTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: scrollTrigger(night) });
      gsap.set(nightFront, { autoAlpha: 0, y: 18 });
      nightTl.to(nightFront, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out' }, 0);
      // Près de deux écrans pour jouer avec la bouteille. Le devis s'ouvre pendant le dernier écran
      // de la scène : le texte s'efface juste avant, la bouteille sort par le bas pendant l'ouverture.
      nightTl.to(nightFront, { autoAlpha: 0, y: -18, duration: 0.22, ease: 'power1.in' }, 1.74);
      nightTl.to(pose, { y: -1.4, duration: 0.5, ease: 'power2.in' }, 1.9);
      nightTl.set({}, {}, SCENE_LENGTH.night);
    } else {
      // … et, sans la nuit (image de secours), la bouteille quitte l'écran par le bas.
      if (!compact) argsTl.to(pose, { y: -1.4, tiltZ: 0.22, duration: 0.5, ease: 'power2.in' }, 1);
    }
    argsTl.set({}, {}, 2);

    /* ---------------------------------- Devis --------------------------------- */
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
      Object.assign(pose, { spin: 0, x: 0, y: 0, scale: 1, tiltX: 0.1, tiltZ: 0, night: 0 });
      backdrop.mix = 0;
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
  setEditionTransition((name, apply) => switchEdition(name, apply, lenis));

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
