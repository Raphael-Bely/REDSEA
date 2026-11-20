/**
 * palette.ts — les deux éditions du site.
 * -----------------------------------------------------------------------------
 * « classique » : étiquette beige aux lettres rouges facettées, site beige et rouge.
 * « noir »      : étiquette noire aux lettres roses facettées, site noir et rose.
 *
 * Édition par défaut : choisie au lancement (`npm run dev` / `npm run dev --noir`, voir
 * astro.config.mjs). Le visiteur peut ensuite changer d'édition (pastilles de l'en-tête, ou
 * en dévissant la capsule de la bouteille) : voir src/scripts/edition.ts. Son choix est gardé
 * le temps de la visite (sessionStorage) et appliqué avant le premier affichage par
 * public/edition.js.
 *
 * Les couleurs du site sont des jetons CSS (src/styles/global.css, bloc `[data-palette='noir']`) ;
 * ce fichier porte ce que le CSS ne peut pas décrire : les textures de la bouteille 3D, et les
 * couleurs du rideau qui annonce l'édition suivante.
 */
export type PaletteName = 'classique' | 'noir';

export const DEFAULT_PALETTE: PaletteName = __REDSEA_PALETTE__;

/** Clé sessionStorage du choix du visiteur (lue aussi par public/edition.js). */
export const PALETTE_STORAGE_KEY = 'redsea:edition';

export interface PaletteAssets {
  /** Nom affiché (rideau de transition, pastilles de l'en-tête). */
  title: string;
  /** Étiquette pour mobile (≈ 1370 px de large) et pour ordinateur (haute définition). */
  label: string;
  labelHd: string;
  /** Logo du dessus de la capsule : sert de masque, l'encre prend la couleur `capInk`. */
  cap: string;
  /** Encre du logo de la capsule (sRGB) ; absente = rouge d'origine. */
  capInk?: number;
  /** Couleur de la barre du navigateur mobile. */
  themeColor: string;
  /** Jetons --red, --red-deep et --cream de l'édition (doivent suivre global.css). */
  tokens: { red: string; redDeep: string; cream: string };
}

// Étiquettes et motifs générés depuis beige.pdf et rose.pdf par scripts/prepare-labels.py.
export const PALETTES: Record<PaletteName, PaletteAssets> = {
  classique: {
    title: 'Beige & rouge',
    label: '/textures/beige/label.webp',
    labelHd: '/textures/beige/label-hd.webp',
    cap: '/textures/cap.png',
    themeColor: '#7a0a10',
    tokens: { red: '#7a0a10', redDeep: '#5b070c', cream: '#f3e2c4' },
  },
  noir: {
    title: 'Noir & rose',
    label: '/textures/noir/label.webp',
    labelHd: '/textures/noir/label-hd.webp',
    cap: '/textures/cap.png',
    capInk: 0xf2a094,
    themeColor: '#1c1719',
    tokens: { red: '#f4ab9f', redDeep: '#e3897d', cream: '#1c1719' },
  },
};

/** Édition affichée (navigateur uniquement). */
export function currentPalette(): PaletteName {
  return document.documentElement.dataset.palette === 'noir' ? 'noir' : 'classique';
}

/** Applique une édition à la page, la mémorise pour la visite et prévient les scripts. */
export function applyPalette(name: PaletteName): void {
  document.documentElement.dataset.palette = name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PALETTES[name].themeColor);
  try {
    sessionStorage.setItem(PALETTE_STORAGE_KEY, name);
  } catch {
    // Stockage indisponible (navigation privée stricte) : le choix vaut pour cette page.
  }
  document.dispatchEvent(new CustomEvent('redsea:palette', { detail: { name } }));
}
