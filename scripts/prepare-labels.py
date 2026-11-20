"""
prepare-labels.py — textures des deux éditions de l'étiquette (beige et noire).
-----------------------------------------------------------------------------
Sources : beige.pdf et rose.pdf (une seule image 3546 × 1920 chacun : l'étiquette
197 × 90 mm en haut, une bande d'annotations en bas).

  beige.pdf -> public/textures/beige/   étiquette beige, lettres rouges facettées
  rose.pdf  -> public/textures/noir/    étiquette noire, lettres roses facettées

Pour chaque édition :
  label-hd.webp  étiquette pour ordinateur (pleine définition)
  label.webp     étiquette pour mobile (1368 px de large)
  lowpoly.png    motif de triangles des grands titres du site (voir global.css)

Traitement :
  - on ne garde que l'étiquette (ratio 197/90) ;
  - on retire les 8 premiers millimètres : ils sont recouverts par l'autre bord une fois
    l'étiquette posée (« 0–8 mm recouverts » sur le PDF). Ce qui reste fait exactement le
    tour de la bouteille ;
  - on décale l'image en boucle pour que le centre du logo tombe face caméra
    (BOTTLE.labelFrontU dans src/three/Bottle.ts), sans toucher au code 3D. La jointure
    reste entre le texte du dos et « REDSEA » ;
  - motif « low poly » : les grandes lettres de l'étiquette sont facettées en triangles de
    teintes voisines. On relève ces teintes (k-moyennes) et on en tire une tuile de
    triangles raccordable. Image matricielle (PNG) et non SVG : un SVG de ~1500 triangles
    est redessiné par le navigateur à chaque image quand le titre bouge, ce qui saccade.

Dépendances : poppler-utils (pdfimages), Pillow, numpy.
Usage : python3 scripts/prepare-labels.py            (les deux éditions)
        python3 scripts/prepare-labels.py noir       (une seule)
"""
from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

LABEL_MM = (197, 90)
COVERED_MM = 8
# Centre du logo face caméra, en fraction de la largeur (= BOTTLE.labelFrontU).
FRONT_U = 0.272
# Zone où chercher le logo, en fraction de l'étiquette : x0, x1, y0, y1.
LOGO_ZONE = (0.17, 0.47, 0.18, 0.68)

Mask = Callable[[np.ndarray, np.ndarray, np.ndarray], np.ndarray]


def pink_letters(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Roses des lettres de l'étiquette noire (l'or des feuilles est exclu)."""
    return (r > 200) & (g > 110) & (r - b > 40) & (r - g > 25) & (g - b > -10) & (g - b < 40) & (b > 100)


def red_letters(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Rouges des lettres de l'étiquette beige (la mosaïque dorée est exclue)."""
    return (r > 90) & (r - g > 70) & (r - b > 40) & (g < 55) & (b < 70)


def gold_ink(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (r > 150) & (r - b > 60) & (r - g > 20) & (r - g < 80)


EDITIONS: dict[str, dict] = {
    "beige": {
        "pdf": "beige.pdf",
        "out": "public/textures/beige",
        "facets": red_letters,
        # La mosaïque dorée couvre tout le fond : le logo est repéré par son rouge seul
        # (la fleur et le cercle qui l'entoure).
        "logo": red_letters,
    },
    "noir": {
        "pdf": "rose.pdf",
        "out": "public/textures/noir",
        "facets": pink_letters,
        # Fond noir : la fleur rose et les feuilles dorées suffisent à cadrer le logo.
        "logo": lambda r, g, b: pink_letters(r, g, b) | gold_ink(r, g, b) | ((r > 200) & (g > 110) & (r - b > 40)),
    },
}


def extract_page_image(pdf: Path) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-j", str(pdf), f"{tmp}/page"], check=True)
        files = sorted(Path(tmp).glob("page-*"))
        if not files:
            raise SystemExit(f"{pdf.name} : aucune image trouvée")
        return Image.open(files[0]).convert("RGB").copy()


def facet_palette(label: np.ndarray, mask: Mask, count: int = 8) -> list[tuple[tuple[int, int, int], float]]:
    """Teintes des lettres facettées (k-moyennes), avec leur fréquence."""
    px = label.reshape(-1, 3).astype(float)
    px = px[mask(px[:, 0], px[:, 1], px[:, 2])]
    rng = np.random.default_rng(1)
    px = px[rng.choice(len(px), min(60000, len(px)), replace=False)]
    centers = px[rng.choice(len(px), count, replace=False)]
    for _ in range(40):
        nearest = ((px[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
        centers = np.array([px[nearest == i].mean(0) if (nearest == i).any() else centers[i] for i in range(count)])
    weights = np.bincount(nearest, minlength=count) / len(nearest)
    return [(tuple(int(round(v)) for v in c), float(w)) for c, w in zip(centers, weights)]


def lowpoly_tile(palette: list[tuple[tuple[int, int, int], float]], cells: int = 9, size: int = 1024) -> Image.Image:
    """
    Tuile de triangles raccordable : grille de sommets décalés au hasard, chaque case coupée
    selon une diagonale au hasard, chaque triangle d'une teinte tirée au sort. Les sommets du
    bord droit/bas recopient ceux du bord gauche/haut et les triangles qui débordent sont
    redessinés de l'autre côté : la tuile se répète sans couture. Dessinée 3× plus grande puis
    réduite, pour des arêtes nettes et lissées.
    """
    rng = np.random.default_rng(20261118)
    scale = 3
    big = size * scale
    step = big / cells
    jitter = rng.uniform(-0.36, 0.36, size=(cells, cells, 2)) * step

    def vertex(i: int, j: int) -> np.ndarray:
        return np.array([i * step, j * step]) + jitter[i % cells, j % cells]

    colors = [c for c, _ in palette]
    # Tirage à mi-chemin entre les fréquences relevées et un tirage uniforme : les teintes
    # soutenues restent assez présentes pour que les facettes se lisent, comme sur l'étiquette.
    weights = np.array([w for _, w in palette])
    weights = 0.5 * weights / weights.sum() + 0.5 / len(weights)

    image = Image.new("RGB", (big, big))
    draw = ImageDraw.Draw(image)
    for i in range(cells):
        for j in range(cells):
            a, b, c, d = vertex(i, j), vertex(i + 1, j), vertex(i + 1, j + 1), vertex(i, j + 1)
            pairs = [(a, b, c), (a, c, d)] if rng.random() < 0.5 else [(a, b, d), (b, c, d)]
            first = rng.choice(len(colors), p=weights)
            # Les deux triangles d'une même case ne prennent jamais la même couleur.
            others = weights.copy()
            others[first] = 0
            second = rng.choice(len(colors), p=others / others.sum())
            for tri, index in zip(pairs, (first, second)):
                for dx in (-big, 0, big):
                    for dy in (-big, 0, big):
                        points = [(x + dx, y + dy) for x, y in tri]
                        draw.polygon(points, fill=colors[index], outline=colors[index])
    return image.resize((size, size), Image.LANCZOS)


def prepare(name: str, edition: dict) -> None:
    pdf = ROOT / edition["pdf"]
    if not pdf.exists():
        print(f"{name} : {pdf.name} absent, édition ignorée")
        return
    page = extract_page_image(pdf)
    width = page.width
    label_height = round(width * LABEL_MM[1] / LABEL_MM[0])
    covered = round(width * COVERED_MM / LABEL_MM[0])
    label = np.asarray(page)[:label_height, covered:]
    h, w = label.shape[:2]

    # Centre du logo : boîte englobante de ses encres dans la zone du logo.
    x0, x1 = int(w * LOGO_ZONE[0]), int(w * LOGO_ZONE[1])
    y0, y1 = int(h * LOGO_ZONE[2]), int(h * LOGO_ZONE[3])
    zone = label[y0:y1, x0:x1].astype(int)
    ink = edition["logo"](zone[..., 0], zone[..., 1], zone[..., 2])
    xs = np.nonzero(ink.any(axis=0))[0]
    logo_u = (x0 + (xs.min() + xs.max()) / 2) / w
    shift = round((FRONT_U - logo_u) * w)
    label = np.roll(label, shift, axis=1)

    out = ROOT / edition["out"]
    out.mkdir(parents=True, exist_ok=True)
    hd = Image.fromarray(label)
    hd.save(out / "label-hd.webp", quality=92, method=6)
    small = hd.resize((1368, round(1368 * h / w)), Image.LANCZOS)
    small.save(out / "label.webp", quality=90, method=6)

    palette = facet_palette(label, edition["facets"])
    lowpoly_tile(palette).save(out / "lowpoly.png", optimize=True)
    tones = ", ".join("#%02x%02x%02x" % c for c, _ in sorted(palette, key=lambda p: sum(p[0])))
    print(f"{name} : label-hd {hd.size}, logo à u={logo_u:.3f} (décalage {shift} px), facettes {tones}")


def main() -> None:
    names = sys.argv[1:] or list(EDITIONS)
    for name in names:
        if name not in EDITIONS:
            raise SystemExit(f"édition inconnue : {name} (choix : {', '.join(EDITIONS)})")
        prepare(name, EDITIONS[name])


if __name__ == "__main__":
    main()
