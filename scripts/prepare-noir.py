"""
prepare-noir.py — textures de la palette « noir » (étiquette noire, texte rose).
-----------------------------------------------------------------------------
Source : rose.pdf (une seule image 3546 × 1920 : l'étiquette 197 × 90 mm en haut,
une bande d'annotations en bas).

  rose.pdf -> public/textures/noir/label-hd.webp  (ordinateur, pleine définition)
           -> public/textures/noir/label.webp     (mobile, 1368 px de large)
           -> public/textures/noir/lowpoly.svg    (facettes roses des grandes lettres du site)

Traitement :
  - on ne garde que l'étiquette (les 1620 premières lignes, ratio 197/90) ;
  - on retire les 8 premiers millimètres : ils sont recouverts par l'autre bord une fois
    l'étiquette posée (« 0–8 mm recouverts » sur le PDF). Ce qui reste fait exactement le
    tour de la bouteille ;
  - on décale l'image en boucle pour que le centre du logo tombe au même endroit que sur
    l'étiquette beige (BOTTLE.labelFrontU dans src/three/Bottle.ts) : le logo arrive face
    caméra sans toucher au code 3D. La jointure reste entre le texte du dos et « REDSEA » ;
  - motif « low poly » : les lettres roses de l'étiquette sont facettées en triangles de
    roses différents. On relève ces roses sur l'étiquette (k-moyennes) et on en tire un motif
    de triangles raccordable, appliqué aux grands titres du site (voir global.css).

Dépendances : poppler-utils (pdfimages), Pillow, numpy.
Usage : python3 scripts/prepare-noir.py
"""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/textures/noir"

LABEL_MM = (197, 90)
COVERED_MM = 8
# Centre du logo sur l'étiquette beige, en fraction de la largeur (= BOTTLE.labelFrontU).
FRONT_U = 0.272
# Zone où chercher le logo (fleur rose + feuilles et cercle dorés), en fraction de l'étiquette.
LOGO_ZONE = (0.17, 0.47, 0.18, 0.68)  # x0, x1, y0, y1


def extract_page_image(pdf: Path) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdfimages", "-j", str(pdf), f"{tmp}/page"], check=True)
        files = sorted(Path(tmp).glob("page-*"))
        if not files:
            raise SystemExit("rose.pdf : aucune image trouvée")
        return Image.open(files[0]).convert("RGB").copy()


def pink_palette(label: np.ndarray, count: int = 8) -> list[tuple[tuple[int, int, int], float]]:
    """Roses des lettres facettées (k-moyennes), avec leur fréquence. L'or des feuilles est exclu."""
    px = label.reshape(-1, 3).astype(float)
    r, g, b = px[:, 0], px[:, 1], px[:, 2]
    px = px[(r > 200) & (g > 110) & (r - b > 40) & (r - g > 25) & (g - b > -10) & (g - b < 40) & (b > 100)]
    rng = np.random.default_rng(1)
    px = px[rng.choice(len(px), min(60000, len(px)), replace=False)]
    centers = px[rng.choice(len(px), count, replace=False)]
    for _ in range(40):
        nearest = ((px[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
        centers = np.array([px[nearest == i].mean(0) if (nearest == i).any() else centers[i] for i in range(count)])
    weights = np.bincount(nearest, minlength=count) / len(nearest)
    return [(tuple(int(round(v)) for v in c), float(w)) for c, w in zip(centers, weights)]


def lowpoly_svg(palette: list[tuple[tuple[int, int, int], float]], cells: int = 9, size: int = 900) -> str:
    """
    Motif de triangles raccordable (tuile carrée) : grille de sommets décalés au hasard, chaque
    case coupée selon une diagonale au hasard, chaque triangle d'un rose tiré selon les
    fréquences relevées. Les sommets du bord droit/bas recopient ceux du bord gauche/haut et
    les triangles qui débordent sont redessinés de l'autre côté : la tuile se répète sans couture.
    """
    rng = np.random.default_rng(20261118)
    step = size / cells
    jitter = rng.uniform(-0.36, 0.36, size=(cells, cells, 2)) * step

    def vertex(i: int, j: int) -> np.ndarray:
        base = np.array([i * step, j * step])
        return base + jitter[i % cells, j % cells]

    colors = [c for c, _ in palette]
    # Tirage à mi-chemin entre les fréquences relevées et un tirage uniforme : les roses
    # soutenus restent assez présents pour que les facettes se lisent, comme sur l'étiquette.
    weights = np.array([w for _, w in palette])
    weights = 0.5 * weights / weights.sum() + 0.5 / len(weights)
    triangles = []
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
                triangles.append((np.array(tri), colors[index]))

    shapes = []
    for points, (r, g, b) in triangles:
        fill = f"#{r:02x}{g:02x}{b:02x}"
        for dx in (-size, 0, size):
            for dy in (-size, 0, size):
                moved = points + (dx, dy)
                if moved[:, 0].max() < 0 or moved[:, 0].min() > size or moved[:, 1].max() < 0 or moved[:, 1].min() > size:
                    continue
                coords = " ".join(f"{x:.1f},{y:.1f}" for x, y in moved)
                # Contour de la même couleur : bouche les liserés d'anticrénelage entre triangles.
                shapes.append(f'<polygon points="{coords}" fill="{fill}" stroke="{fill}" stroke-width="1.2" stroke-linejoin="round"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">'
        + "".join(shapes)
        + "</svg>\n"
    )


def main() -> None:
    page = extract_page_image(ROOT / "rose.pdf")
    width = page.width
    label_height = round(width * LABEL_MM[1] / LABEL_MM[0])
    covered = round(width * COVERED_MM / LABEL_MM[0])
    label = np.asarray(page)[:label_height, covered:]
    h, w = label.shape[:2]

    # Centre du logo : boîte englobante des encres rose et or dans la zone du logo.
    x0, x1 = int(w * LOGO_ZONE[0]), int(w * LOGO_ZONE[1])
    y0, y1 = int(h * LOGO_ZONE[2]), int(h * LOGO_ZONE[3])
    zone = label[y0:y1, x0:x1].astype(int)
    r, g, b = zone[..., 0], zone[..., 1], zone[..., 2]
    ink = ((r > 200) & (g > 110) & (r - b > 40)) | ((r > 150) & (r - b > 60) & (r - g > 20) & (r - g < 80))
    xs = np.nonzero(ink.any(axis=0))[0]
    logo_u = (x0 + (xs.min() + xs.max()) / 2) / w
    shift = round((FRONT_U - logo_u) * w)
    label = np.roll(label, shift, axis=1)

    OUT.mkdir(parents=True, exist_ok=True)
    hd = Image.fromarray(label)
    hd.save(OUT / "label-hd.webp", quality=92, method=6)
    small = hd.resize((1368, round(1368 * h / w)), Image.LANCZOS)
    small.save(OUT / "label.webp", quality=90, method=6)

    palette = pink_palette(label)
    (OUT / "lowpoly.svg").write_text(lowpoly_svg(palette))
    print("roses :", ", ".join("#%02x%02x%02x" % c for c, _ in sorted(palette, key=lambda p: sum(p[0]))))
    print(f"label-hd {hd.size}, label {small.size}, logo à u={logo_u:.3f}, décalage {shift} px")


if __name__ == "__main__":
    main()
