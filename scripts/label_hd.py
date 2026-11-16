"""
label_hd.py — agrandissement ×3 « vectoriel » de l'étiquette.
-----------------------------------------------------------------------------
L'étiquette source ne fait que 1370 px de large pour tout le tour de la bouteille.
Un agrandissement classique (Lanczos) donne des contours mous, et le texte rouge
paraît pixelisé dès que la bouteille est affichée en grand.

L'étiquette est un graphisme à aplats : on sépare donc les encres pleines
(rouge, noir du texte de composition) du fond, on agrandit leur couverture en
continu, puis on la « re-trace » avec un seuil adouci (≈ 1 px d'anticrénelage
à la taille finale). Résultat : des contours nets comme un export vectoriel.
Le fond (crème, mosaïque dorée, feuilles dorées) est agrandi en Lanczos après
avoir effacé les encres (inpainting), pour qu'aucun liseré ne déborde.

Usage : appelé par prepare-assets.py, ou seul :
  python3 scripts/label_hd.py etiquette_bissap.png public/textures/label-hd.webp
"""
from __future__ import annotations

import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

SCALE = 3
RED_INK = np.array([124, 3, 12], dtype=np.float32)
DARK_INK = np.array([26, 26, 20], dtype=np.float32)


def _retrace(coverage: np.ndarray, size: tuple[int, int], threshold: float, softness: float) -> np.ndarray:
    """Couverture basse définition (0–1) → couverture nette à la taille finale."""
    up = cv2.resize(coverage, size, interpolation=cv2.INTER_CUBIC)
    # Léger flou avant le seuil : lisse le bruit de compression de la source (bords bosselés).
    up = cv2.GaussianBlur(up, (0, 0), SCALE * 0.55)
    t = np.clip((up - (threshold - softness)) / (2 * softness), 0, 1)
    return t * t * (3 - 2 * t)  # smoothstep


def upscale_label(label: Image.Image) -> Image.Image:
    src = np.asarray(label.convert("RGB")).astype(np.float32)
    h, w = src.shape[:2]
    size = (w * SCALE, h * SCALE)
    r, g = src[..., 0], src[..., 1]

    # Encre rouge : le seul aplat où R dépasse nettement G (crème ≈ 16, doré ≈ 40–50, rouge ≈ 121).
    red = np.clip((r - g - 52) / (121 - 52), 0, 1)
    # Encre noire : texte de composition, tableau, QR code — uniquement sur la face arrière
    # (moitié droite), pour ne pas confondre avec les ombres des feuilles dorées.
    dark = np.clip((170 - r) / (170 - 30), 0, 1) * (np.abs(r - g) < 30)
    dark[:, : int(w * 0.59)] = 0

    # Fond sans encres, agrandi en douceur.
    ink_mask = ((red > 0.2) | (dark > 0.2)).astype(np.uint8) * 255
    ink_mask = cv2.dilate(ink_mask, np.ones((3, 3), np.uint8))
    background = cv2.inpaint(src.astype(np.uint8), ink_mask, 3, cv2.INPAINT_TELEA)
    background = Image.fromarray(background).resize(size, Image.LANCZOS)
    background = background.filter(ImageFilter.UnsharpMask(radius=2.0, percent=70, threshold=2))
    out = np.asarray(background).astype(np.float32)

    # Encres re-tracées par-dessus.
    for coverage, ink, threshold in ((red, RED_INK, 0.4), (dark, DARK_INK, 0.45)):
        alpha = _retrace(coverage, size, threshold, 0.1)[..., None]
        out = out * (1 - alpha) + ink * alpha

    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


if __name__ == "__main__":
    source, target = sys.argv[1], sys.argv[2]
    image = Image.open(source).convert("RGB")
    iw, ih = image.size
    image = image.crop((2, 0, iw, ih - 2))  # liseré bleu d'export à gauche et en bas
    upscale_label(image).save(target, quality=92, method=6)
