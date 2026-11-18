"""
prepare-noir.py — textures de la palette « noir » (étiquette noire, texte rose).
-----------------------------------------------------------------------------
Source : rose.pdf (une seule image 3546 × 1920 : l'étiquette 197 × 90 mm en haut,
une bande d'annotations en bas).

  rose.pdf -> public/textures/noir/label-hd.webp  (ordinateur, pleine définition)
           -> public/textures/noir/label.webp     (mobile, 1368 px de large)

Traitement :
  - on ne garde que l'étiquette (les 1620 premières lignes, ratio 197/90) ;
  - on retire les 8 premiers millimètres : ils sont recouverts par l'autre bord une fois
    l'étiquette posée (« 0–8 mm recouverts » sur le PDF). Ce qui reste fait exactement le
    tour de la bouteille ;
  - on décale l'image en boucle pour que le centre du logo tombe au même endroit que sur
    l'étiquette beige (BOTTLE.labelFrontU dans src/three/Bottle.ts) : le logo arrive face
    caméra sans toucher au code 3D. La jointure reste entre le texte du dos et « REDSEA ».

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
    print(f"label-hd {hd.size}, label {small.size}, logo à u={logo_u:.3f}, décalage {shift} px")


if __name__ == "__main__":
    main()
