#!/usr/bin/env python3
"""Cut the vehicles seen from behind out of the user's road picture (1.3.87): each box, the road taken away (pixels
unlike the road's colour, holes closed, the largest piece kept, its inside filled), a soft edge; transparent PNGs."""
import sys, os
from collections import deque
from PIL import Image, ImageFilter
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vehicles')
BOXES = {'car': (572, 550, 964, 888), 'truck': (140, 78, 498, 482), 'bus': (610, 20, 924, 462),
         'motorbike': (1168, 428, 1310, 746), 'bicycle': (1112, 134, 1218, 394), 'pedestrian': (1386, 90, 1468, 318)}
LIMIT = {'motorbike': 26, 'pedestrian': 22}
src = Image.open(SRC).convert('RGB')
def cut(name, box):
    lim = LIMIT.get(name, 16)
    c = src.crop(box); W, H = c.size; px = c.load()
    # the road's colour: the box's border, its median
    border = [px[x, y] for x in range(W) for y in (0, 1, H - 2, H - 1)] + [px[x, y] for y in range(H) for x in (0, 1, W - 2, W - 1)]
    road = [sorted(p[i] for p in border)[len(border) // 2] for i in range(3)]
    m = Image.new('L', (W, H)); mp = m.load()
    for y in range(H):
        for x in range(W):
            r, g, b = px[x, y]; d = max(abs(r - road[0]), abs(g - road[1]), abs(b - road[2]))
            mp[x, y] = 255 if d > lim and not (name == 'pedestrian' and x < 14 + (y - 150) * 0.12 and y > 150) else 0
    m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    mp = m.load()
    # the largest piece (the vehicle), not the lane marks
    seen = [[False] * W for _ in range(H)]; best = []
    for y0 in range(H):
        for x0 in range(W):
            if mp[x0, y0] and not seen[y0][x0]:
                q = deque([(x0, y0)]); seen[y0][x0] = True; part = []
                while q:
                    x, y = q.popleft(); part.append((x, y))
                    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                        if 0 <= nx < W and 0 <= ny < H and mp[nx, ny] and not seen[ny][nx]: seen[ny][nx] = True; q.append((nx, ny))
                if len(part) > len(best): best = part
    keep = Image.new('L', (W, H)); kp = keep.load()
    for x, y in best: kp[x, y] = 255
    # its inside filled: what the outside (from the border) does not reach
    out = [[False] * W for _ in range(H)]; q = deque()
    for x in range(W):
        for y in (0, H - 1): q.append((x, y))
    for y in range(H):
        for x in (0, W - 1): q.append((x, y))
    while q:
        x, y = q.popleft()
        if 0 <= x < W and 0 <= y < H and not out[y][x] and not kp[x, y]:
            out[y][x] = True; q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    for y in range(H):
        for x in range(W):
            if not out[y][x]: kp[x, y] = 255
    keep = keep.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    im = c.convert('RGBA'); im.putalpha(keep); bb = im.getbbox(); im = im.crop(bb)
    im.save(os.path.join(OUT, name + '.png')); return im
for n, b in BOXES.items():
    print(n, cut(n, b).size)
