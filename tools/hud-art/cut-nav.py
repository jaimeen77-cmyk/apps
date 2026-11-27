#!/usr/bin/env python3
"""Cut the HUD guidance icons from the user's icon sheet (1.3.81): each box, the background taken out so the glow and
the grey parts stay (alpha from the brightness over the background, colour un-mixed from it)."""
import sys, os
from PIL import Image
SHEET = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nav')
R1, R2, R3, R4 = (22, 110), (158, 264), (310, 418), (438, 550)
BOXES = {
 'left': (25, 100, R1), 'right': (208, 282, R1), 'straight': (398, 452, R1), 'slight-left': (568, 637, R1),
 'slight-right': (743, 807, R1), 'uturn-left': (903, 992, R1),
 'uturn-right': (26, 112, R2), 'roundabout': (208, 318, R2), 'lane-left': (418, 482, R2), 'lane-right': (588, 647, R2),
 'arrival-left': (743, 827, R2), 'arrival-right': (913, 997, R2),
 'in-left': (24, 112, R3), 'in-straight': (204, 287, R3), 'in-right': (378, 457, R3), 'out-left': (568, 647, R3),
 'out-straight': (748, 787, R3), 'out-right': (903, 967, R3),
 'lg-uturn-left': (253, 327, R4), 'lg-slight-left': (335, 407, R4), 'lg-left': (415, 491, R4),
 'lg-left-b': (499, 574, R4), 'lg-straight': (583, 651, R4), 'lg-straight-b': (660, 726, R4),
 'lg-slight-right': (735, 801, R4), 'lg-slight-right-on': (809, 877, R4),
}
src = Image.open(SHEET).convert('RGB'); px = src.load()
def cut(name, x0, x1, ys):
    y0, y1 = ys; W, H = x1 - x0, y1 - y0
    # the background: the darkest of the box's border, per row (the sheet has a soft vertical gradient)
    out = Image.new('RGBA', (W, H)); o = out.load()
    for y in range(H):
        row = [px[x0 + x, y0 + y] for x in (0, 1, W - 2, W - 1)]
        bg = min(row, key=lambda c: sum(c))
        for x in range(W):
            r, g, b = px[x0 + x, y0 + y]
            d = max(r - bg[0], g - bg[1], b - bg[2])
            a = max(0.0, min(1.0, (d - 6) / max(1, 255 - max(bg)) * 1.25))
            edge = min(x, y, W - 1 - x, H - 1 - y); a *= min(1.0, edge / 9)
            if a < 0.03: o[x, y] = (0, 0, 0, 0); continue
            c = [max(0, min(255, int((v - bv * (1 - a)) / a))) for v, bv in zip((r, g, b), bg)]
            o[x, y] = (c[0], c[1], c[2], int(a * 255))
    bb = out.getbbox(); out = out.crop(bb) if bb else out
    out.save(os.path.join(OUT, name + '.png')); return out
for n, v in BOXES.items():
    if v: im = cut(n, v[0], v[1], v[2]); print(n, im.size)
