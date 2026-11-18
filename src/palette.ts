/**
 * palette.ts — les deux habillages du site.
 * -----------------------------------------------------------------------------
 * « classique » : étiquette beige, site beige et rouge (par défaut).
 * « noir »      : étiquette noire au texte rose, site noir et rose (`npm run dev --noir`).
 *
 * Le choix est fait au lancement (astro.config.mjs) et figé à la compilation. Les couleurs du
 * site sont des jetons CSS (src/styles/global.css, bloc `[data-palette='noir']`) ; ce fichier
 * ne porte que ce que le CSS ne peut pas décrire : les textures de la bouteille 3D.
 */
export type PaletteName = 'classique' | 'noir';

export const PALETTE: PaletteName = __REDSEA_PALETTE__;

interface PaletteAssets {
  /** Étiquette pour mobile (≈ 1370 px de large) et pour ordinateur (haute définition). */
  label: string;
  labelHd: string;
  /** Logo du dessus de la capsule : sert de masque, l'encre prend la couleur `capInk`. */
  cap: string;
  /** Encre du logo de la capsule (sRGB) ; absente = rouge d'origine. */
  capInk?: number;
  /** Couleur de la barre du navigateur mobile. */
  themeColor: string;
}

const ASSETS: Record<PaletteName, PaletteAssets> = {
  classique: {
    label: '/textures/label.webp',
    labelHd: '/textures/label-hd.webp',
    cap: '/textures/cap.png',
    themeColor: '#7a0a10',
  },
  noir: {
    // Générées depuis rose.pdf par scripts/prepare-noir.py.
    label: '/textures/noir/label.webp',
    labelHd: '/textures/noir/label-hd.webp',
    cap: '/textures/cap.png',
    capInk: 0xf2a094,
    themeColor: '#1c1719',
  },
};

export const PALETTE_ASSETS = ASSETS[PALETTE];
