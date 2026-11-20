/**
 * edition.ts — changer d'édition (beige & rouge ↔ noir & rose) pendant la visite.
 * -----------------------------------------------------------------------------
 * Deux façons de le faire :
 *   - les pastilles de l'en-tête (boutons [data-edition]) : visibles, sur toutes les pages ;
 *   - un clin d'œil sur l'accueil : « dévisser » la capsule de la bouteille (voir main.ts).
 *
 * Sans mise en scène, l'édition change d'un coup (pages légales). L'accueil fournit sa propre
 * transition (rideau + nouvelle étiquette sur la bouteille) via `setEditionTransition`.
 */
import { applyPalette, currentPalette, type PaletteName } from '../palette';

type Transition = (name: PaletteName, apply: () => void) => Promise<void>;

let transition: Transition | null = null;
let busy = false;

/** L'accueil s'enregistre ici pour mettre en scène le changement d'édition. */
export function setEditionTransition(next: Transition): void {
  transition = next;
}

export function otherPalette(): PaletteName {
  return currentPalette() === 'noir' ? 'classique' : 'noir';
}

export async function requestEdition(name: PaletteName): Promise<void> {
  if (busy || name === currentPalette()) return;
  busy = true;
  try {
    const apply = () => applyPalette(name);
    if (transition) await transition(name, apply);
    else apply();
  } finally {
    busy = false;
  }
}

function syncButtons(): void {
  const active = currentPalette();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-edition]')) {
    button.setAttribute('aria-pressed', String(button.dataset.edition === active));
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-edition]')) {
  button.addEventListener('click', () => {
    const name = button.dataset.edition;
    if (name === 'classique' || name === 'noir') void requestEdition(name);
  });
}
document.addEventListener('redsea:palette', syncButtons);
syncButtons();
