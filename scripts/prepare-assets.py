#!/usr/bin/env python3
"""Régénère les assets dérivés à partir des deux fichiers sources fournis.

  etiquette_bissap.png  -> public/textures/label.png + label.webp (texture 3D)
                        -> public/textures/cap.png (logo hibiscus sur capsule dorée)
                        -> public/favicon-*.png, public/apple-touch-icon.png
  bouteille_bissap.png  -> public/images/bottle-ref.png (référence)
                        -> src/assets/bottle-cutout.png (détourée, fallback sans WebGL)

Dépendances : Pillow, numpy, opencv-python.  Usage : python3 scripts/prepare-assets.py
Les fichiers générés sont versionnés : ce script n'est utile que si les sources changent.
"""
from pathlib import Path
import numpy as np
import sys

import cv2
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"

# ---------- Étiquette ----------
label = Image.open(ROOT / "etiquette_bissap.png").convert("RGB")
w, h = label.size
label = label.crop((2, 0, w, h - 2))  # liseré bleu d'export à gauche et en bas
label.save(PUB / "textures/label.png", optimize=True)
label.save(PUB / "textures/label.webp", quality=92, method=6)
print("label", label.size)

# Version haute définition (écrans d'ordinateur) : la face visible de la bouteille n'utilise
# qu'un tiers de l'image, agrandie à l'écran. Agrandissement ×3 qui re-trace les encres
# pleines (voir label_hd.py) : texte et logo restent nets au lieu de pixeliser.
# À remplacer par un export ≥ 4000 px de large de l'étiquette quand il existe.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from label_hd import upscale_label  # noqa: E402

label_hd = upscale_label(label)
label_hd.save(PUB / "textures/label-hd.webp", quality=92, method=6)
print("label-hd", label_hd.size)

# ---------- Logo hibiscus (capsule + favicon) ----------
# Zone du logo sur l'étiquette (fleur + feuilles, sans le cercle).
# Pris sur l'étiquette HD (encres re-tracées, ×3) : le logo du bouchon est net en gros plan.
logo = label_hd.crop((666, 474, 1536, 1284)).convert("RGB")
a = np.asarray(logo).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# Le rouge hibiscus est le seul ton où R dépasse nettement G (voir label_hd.py).
redness = np.clip((r - g - 52) / (121 - 52), 0, 1)
mask = Image.fromarray((redness * 255).astype(np.uint8))
# Retire le cercle fin qui entoure le logo : on ne garde que les composantes épaisses.
m = (np.asarray(mask) > 110).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
keep = np.zeros_like(m)
opened = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((15, 15), np.uint8))  # efface les traits fins (cercle)
for i in range(1, n):
    if opened[lab == i].any():
        keep[lab == i] = 1
keep = cv2.dilate(keep, np.ones((7, 7), np.uint8))
mask = Image.fromarray((np.asarray(mask) * keep).astype(np.uint8))
ys, xs = np.nonzero(np.asarray(mask) > 40)
mask = mask.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def flower(size, color):
    s = size / max(mask.size)
    mm = mask.resize((round(mask.width * s), round(mask.height * s)), Image.LANCZOS)
    layer = Image.new("RGBA", mm.size, color + (0,))
    layer.putalpha(mm)
    return layer

def disc(size, bg, fg, scale=0.74, rim=None):
    ss = size * 4
    im = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, ss - 1, ss - 1), fill=bg + (255,))
    if rim:
        d.ellipse((ss * 0.06, ss * 0.06, ss * 0.94, ss * 0.94), outline=rim + (255,), width=max(2, ss // 160))
    f = flower(int(ss * scale), fg)
    im.alpha_composite(f, ((ss - f.width) // 2, (ss - f.height) // 2))
    return im.resize((size, size), Image.LANCZOS)

GOLD, RED, CREAM = (201, 163, 92), (122, 10, 16), (243, 226, 196)
disc(1024, GOLD, RED, 0.72, rim=(176, 138, 70)).save(PUB / "textures/cap.png", optimize=True)
disc(32, CREAM, RED, 0.84).save(PUB / "favicon-32.png")
disc(192, CREAM, RED, 0.8).save(PUB / "favicon-192.png")
sq = Image.new("RGB", (180, 180), CREAM); f = flower(132, RED); sq.paste(f, ((180 - f.width) // 2, (180 - f.height) // 2), f)
sq.save(PUB / "apple-touch-icon.png")
fl = flower(512, RED); fl.save(ROOT / "src/assets/hibiscus.png", optimize=True)
print("logo", mask.size)

# ---------- Bouteille : référence + détourage GrabCut ----------
src = Image.open(ROOT / "bouteille_bissap.png").convert("RGB")
src.save(PUB / "images/bottle-ref.png", optimize=True)
img = cv2.cvtColor(np.asarray(src), cv2.COLOR_RGB2BGR)
H, W = img.shape[:2]
gc = np.full((H, W), cv2.GC_BGD, np.uint8)
# Silhouette approximative (x gauche, x droite) par hauteur, relevée sur la photo.
prof = [(18, 430, 585), (60, 402, 610), (150, 404, 608), (175, 418, 596), (300, 404, 606),
        (420, 360, 650), (520, 318, 692), (700, 304, 700), (1200, 306, 696), (1330, 318, 690),
        (1395, 360, 650), (1422, 430, 590)]
left = [(x0, y) for y, x0, _ in prof]; right = [(x1, y) for y, _, x1 in reversed(prof)]
poly = np.array(left[::-1][::-1] + right, np.int32)
outer = np.zeros((H, W), np.uint8); cv2.fillPoly(outer, [poly], 1)
probable = cv2.dilate(outer, np.ones((25, 25), np.uint8))
sure = cv2.erode(outer, np.ones((41, 41), np.uint8))
gc[probable == 1] = cv2.GC_PR_FGD
gc[sure == 1] = cv2.GC_FGD
bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
cv2.grabCut(img, gc, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
fg = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8)
# Le col en verre clair se confond avec le fond : on impose la silhouette au-dessus du liquide.
neck = np.zeros_like(fg); neck[:330] = cv2.erode(outer, np.ones((7, 7), np.uint8))[:330]
fg = np.maximum(fg, neck)
fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
fg = (lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
alpha = cv2.GaussianBlur(fg.astype(np.float32) * 255, (0, 0), 1.6)
alpha = np.clip((alpha - 60) * 1.5, 0, 255).astype(np.uint8)
out = np.dstack([np.asarray(src), alpha])
ys, xs = np.nonzero(alpha > 8)
cut = Image.fromarray(out, "RGBA").crop((xs.min() - 6, ys.min() - 6, xs.max() + 7, ys.max() + 7))
cut.save(ROOT / "src/assets/bottle-cutout.png", optimize=True)
print("cutout", cut.size)
