"""Drawing helpers for the Car layout's pictures (render3d.py draws with them): polygons, glows, smoke,
a fixed 256-colour palette with ordered dither, and a GIF writer. Pure Python 3, no packages.
Run on its own it draws the first, flat 2D versions (kept for reference; render3d.py replaced them):
accel, turn_right, turn_left, brake, reverse.
A boxy mid-80s two-tone (white over black) hatchback seen from behind at night.
Generic shapes only: no logos, lettering or decals. Pure Python (no Pillow).
usage: python make_set.py OUT_DIR"""
import math, os, random, struct, sys

W, H = 540, 304
S = 2
w, h = W * S, H * S
NF = 24
DELAY = 5
HZ = 118
VX = 270
DASH_F = 0.9                     # dash frequency in depth units
PERIOD = 1.0 / DASH_F

# ---------------- transform for car drawing ----------------
XF = lambda x, y: (x, y)

def set_xf(f):
    global XF
    XF = f

def ident(x, y):
    return (x, y)

def new_buf():
    z = [0.0] * (w * h)
    return [z[:], z[:], z[:]]

def _spans(P, y):
    yc = y + 0.5
    xs = []
    n = len(P)
    for i in range(n):
        xa, ya = P[i]; xb, yb = P[(i + 1) % n]
        if (ya <= yc < yb) or (yb <= yc < ya):
            xs.append(xa + (yc - ya) * (xb - xa) / (yb - ya))
    xs.sort()
    return xs

def grad_poly(buf, pts, top, bot=None, a=1.0, side=None):
    R, G, B = buf
    bot = bot or top
    P = []
    for x, y in pts:
        X, Y = XF(x, y); P.append((X * S, Y * S))
    ys = [p[1] for p in P]
    ymin, ymax = min(ys), max(ys)
    y0 = max(0, int(math.floor(ymin))); y1 = min(h - 1, int(math.ceil(ymax)))
    for y in range(y0, y1 + 1):
        t = (y + 0.5 - ymin) / max(1e-6, ymax - ymin)
        c0 = top[0] + (bot[0] - top[0]) * t; c1 = top[1] + (bot[1] - top[1]) * t; c2 = top[2] + (bot[2] - top[2]) * t
        xs = _spans(P, y)
        for j in range(0, len(xs) - 1, 2):
            xa = max(0, int(xs[j] + 0.5)); xb = min(w, int(xs[j + 1] + 0.5))
            base = y * w
            ia = 1 - a
            for x in range(xa, xb):
                m = 1.0
                if side:
                    u = min(x - xa, xb - 1 - x) / (side[1] * S)
                    if u < 1: m = side[0] + (1 - side[0]) * u
                i = base + x
                R[i] = R[i] * ia + c0 * m * a; G[i] = G[i] * ia + c1 * m * a; B[i] = B[i] * ia + c2 * m * a

def fill_poly(buf, pts, col, a=1.0):
    grad_poly(buf, pts, col, col, a)

def rect(buf, x0, y0, x1, y1, col, a=1.0):
    grad_poly(buf, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], col, col, a)

def line(buf, x0, y0, x1, y1, col, wd=1.0, a=1.0):
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L * wd / 2, dx / L * wd / 2
    grad_poly(buf, [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)], col, col, a)

def _radial(buf, cx, cy, rx, ry, fn):
    cx, cy = XF(cx, cy)
    cx, cy, rx, ry = cx * S, cy * S, rx * S, ry * S
    for y in range(max(0, int(cy - ry)), min(h, int(cy + ry) + 1)):
        dy = (y + 0.5 - cy) / ry
        dy2 = dy * dy
        if dy2 >= 1: continue
        base = y * w
        for x in range(max(0, int(cx - rx)), min(w, int(cx + rx) + 1)):
            dx = (x + 0.5 - cx) / rx
            d2 = dx * dx + dy2
            if d2 < 1:
                fn(base + x, d2)

def ellipse(buf, cx, cy, rx, ry, col, a=1.0):
    R, G, B = buf
    def f(i, d2):
        R[i] = R[i] * (1 - a) + col[0] * a; G[i] = G[i] * (1 - a) + col[1] * a; B[i] = B[i] * (1 - a) + col[2] * a
    _radial(buf, cx, cy, rx, ry, f)

def glow(buf, cx, cy, rx, ry, col, k, power=2.0):
    R, G, B = buf
    def f(i, d2):
        q = k * (1 - d2) ** power
        R[i] += col[0] * q; G[i] += col[1] * q; B[i] += col[2] * q
    _radial(buf, cx, cy, rx, ry, f)

def haze(buf, cx, cy, rx, ry, col, a, power=1.5):
    """Soft alpha blend toward a colour (smoke)."""
    R, G, B = buf
    def f(i, d2):
        q = a * (1 - d2) ** power
        R[i] += (col[0] - R[i]) * q; G[i] += (col[1] - G[i]) * q; B[i] += (col[2] - B[i]) * q
    _radial(buf, cx, cy, rx, ry, f)

def shadow(buf, cx, cy, rx, ry, k):
    R, G, B = buf
    def f(i, d2):
        m = 1 - k * (1 - d2) ** 0.7
        R[i] *= m; G[i] *= m; B[i] *= m
    _radial(buf, cx, cy, rx, ry, f)

# ---------------- road ----------------
def road_half(yy):
    return 4 + 430 * (yy - HZ) / (H - HZ)

def road_off(yy, curv):
    """Horizontal shift of the road centre: bends toward the horizon."""
    u = (H - yy) / (H - HZ)
    return curv * 170 * u * u

def make_background(curv, seed=86):
    rnd = random.Random(seed)
    buf = new_buf()
    R, G, B = buf
    tree = []
    v = 14.0
    for x in range(W):
        v += rnd.uniform(-2.2, 2.2); v = max(4, min(34, v))
        tree.append(v + (6 if rnd.random() < 0.05 else 0))
    for y in range(h):
        yy = (y + 0.5) / S
        if yy >= HZ:
            hw = road_half(yy); cxr = VX + road_off(yy, curv); t = (yy - HZ) / (H - HZ)
            lw = 0.6 + 2.6 * t; lit = 0.3 + 0.7 * t
        for x in range(w):
            xx = (x + 0.5) / S
            i = y * w + x
            if yy < HZ:
                t = yy / HZ
                c = (3 + 8 * t, 4 + 9 * t, 10 + 16 * t)
                if HZ - yy < tree[min(W - 1, int(xx))]:
                    c = (6, 8, 11)
            else:
                d = abs(xx - cxr)
                if d < hw:
                    c = (22 + 10 * t, 22 + 10 * t, 26 + 10 * t)
                    if abs(d - hw * 0.93) < lw:
                        c = (150 * lit, 150 * lit, 145 * lit)
                else:
                    c = (8 + 6 * t, 11 + 7 * t, 9 + 5 * t)
            R[i], G[i], B[i] = c
    set_xf(ident)
    glow(buf, VX + road_off(HZ + 6, curv), HZ + 6, 240, 22, (150, 150, 135), 0.9, 1.5)
    glow(buf, VX + road_off(HZ + 2, curv), HZ + 2, 120, 8, (220, 220, 200), 0.6, 1.5)
    return buf

def draw_dashes(buf, phase, curv):
    R, G, B = buf
    for y in range(int((HZ + 3) * S), h):
        yy = (y + 0.5) / S
        t = (yy - HZ) / (H - HZ)
        D = 1.0 / t
        if ((D + phase) * DASH_F) % 1.0 < 0.42:
            half = 0.5 + 3.5 * t
            lit = 0.35 + 0.65 * t
            cx = VX + road_off(yy, curv)
            for x in range(max(0, int((cx - half) * S)), min(w, int((cx + half) * S) + 1)):
                i = y * w + x
                R[i] = 170 * lit; G[i] = 170 * lit; B[i] = 160 * lit

def draw_posts(buf, phase, curv):
    set_xf(ident)
    for k in range(0, 60):
        D = 1.0 + k * PERIOD - (phase % PERIOD)
        t = 1.0 / D
        if t < 0.04: break
        y = HZ + t * (H - HZ)
        hw = road_half(y)
        ph = 34 * t
        pw = max(0.6, 4 * t)
        if k % 2: continue                       # every other slot: posts sparser than dashes
        for side in (-1, 1):
            x = VX + road_off(y, curv) + side * hw * 1.06
            rect(buf, x - pw, y - ph, x + pw, y, (70, 72, 70))
            rect(buf, x - pw, y - ph * 0.85, x + pw, y - ph * 0.7, (230, 150, 40) if side > 0 else (220, 220, 210))

def draw_skids(buf, curv):
    set_xf(ident)
    for x0 in (170, 372):
        pts = []
        for k in range(12):
            u = k / 11
            pts.append((x0 - 120 * u * u - 10 * u, 258 + 46 * u))
        for a, b in zip(pts, pts[1:]):
            line(buf, a[0], a[1], b[0], b[1], (6, 6, 8), 6 + 10 * (a[1] - 258) / 46, 0.45)

# ---------------- car ----------------
def draw_side(buf, dy):
    """Left flank of the car, seen when the tail swings out (drift)."""
    o = lambda pts: [(x, y + dy) for x, y in pts]
    # Foreshortened: the flank recedes toward the horizon, so the front end is
    # shorter and the roof drops into the windshield / hood.
    # wheels behind the body (narrow ellipses: seen at an angle)
    for cx, cy, rx, ry in ((142, 214, 8, 15), (186, 232, 11, 20)):
        ellipse(buf, cx, cy + dy, rx, ry, (8, 8, 9))
        ellipse(buf, cx + 1.5, cy + dy, rx * 0.6, ry * 0.62, (120, 122, 128))
        ellipse(buf, cx + 1.5, cy + dy, rx * 0.35, ry * 0.38, (36, 36, 40))
    # lower flank (black)
    grad_poly(buf, o([(201, 198), (126, 188), (128, 212), (201, 240)]), (26, 26, 30), (10, 10, 12))
    # wheel-arch cut-outs re-show the tyres
    for cx, cy, rx, ry in ((142, 212, 9, 13), (186, 230, 12, 17)):
        ellipse(buf, cx, cy + dy, rx, ry, (8, 8, 9))
        ellipse(buf, cx + 1.5, cy + 2 + dy, rx * 0.6, ry * 0.62, (125, 127, 133))
        ellipse(buf, cx + 1.5, cy + 2 + dy, rx * 0.32, ry * 0.34, (36, 36, 40))
    # upper flank (white): C-pillar, roof, A-pillar, hood line
    grad_poly(buf, o([(236, 104), (192, 108), (162, 146), (130, 152), (126, 188), (201, 198), (214, 156)]),
              (214, 214, 210), (160, 160, 158))
    # side glass
    grad_poly(buf, o([(228, 110), (195, 113), (172, 144), (212, 150)]), (44, 50, 62), (16, 18, 24))
    fill_poly(buf, o([(204, 113), (214, 112), (196, 146), (186, 146)]), (120, 130, 150), 0.22)
    line(buf, 206, 112 + dy, 196, 148 + dy, (190, 190, 186), 1.6)          # B-pillar
    # windshield edge seen past the A-pillar
    fill_poly(buf, o([(192, 108), (180, 110), (150, 146), (162, 146)]), (30, 34, 44))
    # details: shoulder crease, pinstripe, door seam, handle, mirror, marker
    line(buf, 214, 157 + dy, 132, 154 + dy, (140, 140, 138), 1.0, 0.8)
    line(buf, 201, 198 + dy, 126, 188 + dy, (150, 150, 156), 1.2)
    line(buf, 180, 150 + dy, 178, 194 + dy, (110, 110, 108), 0.8, 0.8)
    rect(buf, 188, 160 + dy, 196, 163 + dy, (60, 60, 64))
    fill_poly(buf, o([(160, 138), (150, 137), (149, 147), (161, 147)]), (18, 18, 20))
    rect(buf, 127, 180 + dy, 131, 186 + dy, (230, 120, 30))

def draw_car(buf, dy, mode):
    """mode: 'run' | 'brake' | 'reverse' | 'turn'"""
    o = lambda pts: [(x, y + dy) for x, y in pts]
    brake = mode == 'brake'
    rev = mode == 'reverse'
    shadow(buf, 270, 260, 150, 18, 0.9)
    shadow(buf, 270, 256, 120, 8, 0.6)
    for x0 in (150, 352):
        grad_poly(buf, o([(x0, 222), (x0 + 38, 222), (x0 + 38, 260), (x0, 260)]), (26, 26, 28), (8, 8, 9), side=(0.45, 8))
        for k in range(6):
            yy = 225 + k * 6 + dy
            rect(buf, x0 + 6, yy, x0 + 32, yy + 2, (36, 36, 39))
    fill_poly(buf, o([(140, 200), (166, 200), (166, 236), (142, 236)]), (14, 14, 16))
    fill_poly(buf, o([(400, 200), (374, 200), (374, 236), (398, 236)]), (14, 14, 16))
    grad_poly(buf, o([(146, 196), (394, 196), (390, 240), (150, 240)]), (34, 34, 38), (10, 10, 12), side=(0.6, 30))
    if mode != 'turn':
        fill_poly(buf, o([(150, 130), (166, 128), (168, 142), (148, 144)]), (20, 20, 22))
    fill_poly(buf, o([(390, 130), (374, 128), (372, 142), (392, 144)]), (20, 20, 22))
    grad_poly(buf, o([(190, 104), (350, 104), (378, 156), (395, 198), (145, 198), (162, 156)]),
              (238, 238, 234), (196, 196, 192), side=(0.72, 26))
    line(buf, 162, 157 + dy, 378, 157 + dy, (170, 170, 168), 1.2, 0.7)
    line(buf, 160, 160 + dy, 380, 160 + dy, (255, 255, 252), 0.8, 0.6)
    grad_poly(buf, o([(198, 98), (342, 98), (350, 106), (190, 106)]), (215, 215, 210), (180, 180, 176))
    fill_poly(buf, o([(194, 106), (346, 106), (348, 111), (192, 111)]), (24, 24, 26))
    grad_poly(buf, o([(196, 111), (344, 111), (360, 154), (180, 154)]), (44, 52, 66), (14, 17, 24))
    fill_poly(buf, o([(204, 113), (236, 113), (212, 152), (190, 152)]), (120, 130, 150), 0.32)
    fill_poly(buf, o([(244, 113), (254, 113), (232, 152), (222, 152)]), (120, 130, 150), 0.18)
    fill_poly(buf, o([(300, 113), (340, 113), (346, 128), (306, 128)]), (150, 150, 140), 0.12)
    line(buf, 272, 152 + dy, 318, 136 + dy, (12, 12, 12), 1.6)
    line(buf, 270, 152 + dy, 276, 150 + dy, (30, 30, 30), 3.0)
    rect(buf, 180, 154 + dy, 360, 157 + dy, (30, 30, 34))
    grad_poly(buf, o([(148, 166), (392, 166), (394, 194), (146, 194)]), (22, 22, 25), (8, 8, 10))

    def lamp(xa, xb):
        x0, x1 = min(xa, xb), max(xa, xb)
        fill_poly(buf, o([(x0, 168), (x1, 168), (x1, 192), (x0, 192)]), (130, 10, 14))
        rect(buf, x0 + 2, 169 + dy, x1 - 2, 183 + dy, (255, 40, 40) if brake else (215, 25, 30))
        rect(buf, x0 + 2, 184 + dy, x1 - 2, 191 + dy, (225, 110, 25))
        for k in range(5):
            yy = 171 + k * 4 + dy
            rect(buf, x0 + 2, yy, x1 - 2, yy + 1, (255, 140, 120), 0.35)
        rect(buf, x0 + 8, 173 + dy, x1 - 8, 179 + dy, (255, 220, 210) if brake else (255, 170, 150), 0.8 if brake else 0.55)
    lamp(150, 226)
    lamp(314, 390)
    rv = (255, 255, 250) if rev else (200, 200, 205)
    rect(buf, 226, 172 + dy, 238, 190 + dy, rv)
    rect(buf, 302, 172 + dy, 314, 190 + dy, rv)
    rect(buf, 252, 178 + dy, 288, 182 + dy, (110, 110, 116))
    line(buf, 145, 198 + dy, 395, 198 + dy, (150, 150, 156), 1.4)
    fill_poly(buf, o([(232, 202), (308, 202), (306, 230), (234, 230)]), (6, 6, 8))
    grad_poly(buf, o([(238, 205), (302, 205), (302, 227), (238, 227)]), (236, 226, 150), (200, 190, 110))
    rect(buf, 239, 206 + dy, 301, 207 + dy, (120, 110, 60))
    grad_poly(buf, o([(140, 228), (400, 228), (396, 250), (144, 250)]), (52, 52, 56), (18, 18, 20), side=(0.5, 14))
    line(buf, 142, 229 + dy, 398, 229 + dy, (95, 95, 100), 1.0, 0.8)
    line(buf, 146, 238 + dy, 394, 238 + dy, (12, 12, 14), 1.5)
    rect(buf, 150, 246 + dy, 186, 252 + dy, (8, 8, 9))
    rect(buf, 354, 246 + dy, 390, 252 + dy, (8, 8, 9))
    ellipse(buf, 202, 252 + dy, 8.5, 6, (130, 130, 134))
    ellipse(buf, 202, 252 + dy, 6.5, 4.4, (60, 50, 45))
    ellipse(buf, 202, 252.5 + dy, 4.8, 3.2, (8, 6, 6))
    k = 0.75 if brake else 0.30
    for cx in (188, 352):
        glow(buf, cx, 180 + dy, 110 if brake else 95, 46 if brake else 40, (255, 25, 20), k, 2.2)
        glow(buf, cx, 176 + dy, 50, 14, (255, 140, 120), k, 2.0)
    glow(buf, 270, 266, 210, 30, (200, 18, 14), 0.55 if brake else 0.30, 1.5)
    glow(buf, 270, 203 + dy, 42, 10, (255, 250, 220), 0.22, 2.0)
    if rev:
        for cx in (232, 308):
            glow(buf, cx, 181 + dy, 40, 18, (255, 255, 245), 0.9, 2.0)
        glow(buf, 270, 285, 260, 40, (210, 210, 200), 0.55, 1.4)       # white light on the road behind
    line(buf, 198, 98 + dy, 342, 98 + dy, (230, 235, 255), 1.0, 0.6)

# ---------------- effects ----------------
def flame_seq(seed=7):
    r = random.Random(seed)
    out = []
    for f in range(NF):
        pop = f % 6 in (0, 1) or r.random() < 0.15
        out.append((r.uniform(48, 70) if pop else r.uniform(16, 32), pop))
    return out

def draw_flame(buf, f, L, pop, dy):
    r = random.Random(1000 + f)
    sx, sy = 200, 252 + dy
    dx, dyv = -0.42, 1.0
    n = math.hypot(dx, dyv); dx /= n; dyv /= n
    for k in range(5):
        u = ((f / NF) * 3 + k / 5) % 1.0
        glow(buf, sx - 30 * u - 6, sy + 40 * u + 6, 14 + 40 * u, 8 + 22 * u, (120, 110, 105), 0.18 * (1 - u), 1.3)
    glow(buf, sx - 10, sy + 14, 75 if pop else 45, 45 if pop else 28, (255, 110, 30), 0.55 if pop else 0.35, 1.6)
    glow(buf, sx - 20, 285, 120 if pop else 70, 16, (255, 120, 40), 0.35 if pop else 0.2, 1.5)
    steps = 14
    width = 15 if pop else 9
    for i in range(steps, -1, -1):
        t = i / steps
        px = sx + dx * L * t + r.uniform(-2, 2) * t
        py = sy + dyv * L * t + r.uniform(-1.5, 1.5) * t
        rad = 3 + width * (t ** 0.8) * (1 - 0.35 * t * t)
        glow(buf, px, py, rad * 1.9, rad * 1.6, (255, 70, 15), 0.9 * (1 - 0.5 * t), 1.2)
        glow(buf, px, py, rad * 1.2, rad * 1.0, (255, 160, 40), 1.0 * (1 - 0.6 * t), 1.2)
        if t < 0.65:
            glow(buf, px, py, rad * 0.6, rad * 0.5, (255, 245, 210), 1.3 * (1 - t), 1.0)
    if pop:
        for _ in range(10):
            t = r.uniform(0.6, 1.4)
            glow(buf, sx + dx * L * t + r.uniform(-14, 14), sy + dyv * L * t + r.uniform(-8, 8), 2.2, 2.2, (255, 210, 120), 1.2, 1.0)

def draw_tyre_smoke(buf, f):
    """Smoke billowing from the rear tyres, drifting outward and toward the camera."""
    set_xf(ident)
    for src, drift in (((196, 252), (-1.0, 0.45)), ((396, 258), (-0.45, 0.7))):
        for k in range(8):
            u = ((f / NF) * 2 + k / 8) % 1.0
            cx = src[0] + drift[0] * 140 * u
            cy = src[1] + drift[1] * 60 * u - 22 * u
            rx = 16 + 90 * u; ry = 10 + 42 * u
            haze(buf, cx, cy, rx, ry, (165, 162, 165), 0.62 * (1 - u) ** 1.1, 1.4)
            if k % 2 == 0:
                glow(buf, cx + 20, cy - 6, rx * 0.6, ry * 0.5, (140, 20, 15), 0.10 * (1 - u), 1.5)  # tail-light tint

# ---------------- output ----------------
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

def palette():
    p = bytearray()
    for ri in range(6):
        for gi in range(6):
            for bi in range(6):
                p += bytes((ri * 51, gi * 51, bi * 51))
    for k in range(40):
        v = round(k * 255 / 39); p += bytes((v, v, v))
    return bytes(p)

def quantise(buf, flip=False):
    R, G, B = buf
    out = bytearray(W * H)
    for y in range(H):
        brow = BAYER[y & 3]
        for x in range(W):
            sx = (W - 1 - x) if flip else x
            i0 = (2 * y) * w + 2 * sx; i1 = i0 + w
            r = min(255, max(0, (R[i0] + R[i0 + 1] + R[i1] + R[i1 + 1]) * 0.25))
            g = min(255, max(0, (G[i0] + G[i0 + 1] + G[i1] + G[i1 + 1]) * 0.25))
            b = min(255, max(0, (B[i0] + B[i0 + 1] + B[i1] + B[i1 + 1]) * 0.25))
            d = brow[x & 3] / 16.0 - 0.47
            if max(r, g, b) - min(r, g, b) < 14:
                k = int((r + g + b) / 765 * 39 + 0.5 + d); k = 0 if k < 0 else (39 if k > 39 else k)
                out[y * W + x] = 216 + k
                continue
            ri = int(r / 51 + 0.5 + d); ri = 0 if ri < 0 else (5 if ri > 5 else ri)
            gi = int(g / 51 + 0.5 + d); gi = 0 if gi < 0 else (5 if gi > 5 else gi)
            bi = int(b / 51 + 0.5 + d); bi = 0 if bi < 0 else (5 if bi > 5 else bi)
            out[y * W + x] = ri * 36 + gi * 6 + bi
    return out

def lzw(data, mcs=8):
    clear, eoi = 1 << mcs, (1 << mcs) + 1
    out = bytearray(); acc = 0; nb = 0; size = mcs + 1
    def emit(code, sz):
        nonlocal acc, nb
        acc |= code << nb; nb += sz
        while nb >= 8:
            out.append(acc & 255); acc >>= 8; nb -= 8
    table = {}; nxt = eoi + 1
    emit(clear, size)
    prefix = data[0]
    for k in data[1:]:
        key = (prefix << 8) | k
        c = table.get(key)
        if c is not None:
            prefix = c; continue
        emit(prefix, size)
        if nxt > (1 << size) - 1 and size < 12: size += 1
        if nxt < 4096:
            table[key] = nxt; nxt += 1
        else:
            emit(clear, size); table = {}; nxt = eoi + 1; size = mcs + 1
        prefix = k
    emit(prefix, size)
    if nxt > (1 << size) - 1 and size < 12: size += 1
    emit(eoi, size)
    if nb: out.append(acc & 255)
    blocks = bytearray()
    for i in range(0, len(out), 255):
        ch = out[i:i + 255]; blocks.append(len(ch)); blocks += ch
    blocks.append(0)
    return bytes(blocks)

def write_gif(path, frames):
    g = bytearray(b"GIF89a") + struct.pack("<HHBBB", W, H, 0xF7, 0, 0) + palette()
    g += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"
    for idx in frames:
        g += b"\x21\xF9\x04\x04" + struct.pack("<H", DELAY) + b"\x00\x00"
        g += b"\x2C" + struct.pack("<HHHHB", 0, 0, W, H, 0) + b"\x08" + lzw(idx)
    g += b"\x3B"
    with open(path, "wb") as fh: fh.write(g)
    return len(g)

def rot_about(cx, cy, ang, then=None):
    ca, sa = math.cos(ang), math.sin(ang)
    def f(x, y):
        if then: x, y = then(x, y)
        x -= cx; y -= cy
        return (cx + x * ca - y * sa, cy + x * sa + y * ca)
    return f

def render_scene(name, out_dir):
    """Returns list of (filename, frames)."""
    frames = render_frames(name)
    if name == 'turn':
        # tail out to the left == turning right; the mirror image is the left turn
        return [("turn_right.gif", [quantise(b) for b in frames]),
                ("turn_left.gif", [quantise(b, flip=True) for b in frames])]
    return [(name + ".gif", [quantise(b) for b in frames])]

def render_frames(name):
    """Full-resolution RGB float buffers, one per frame (NF of them)."""
    cfg = {
        'cruise':  dict(curv=0.0, cycles=2,  mode='run'),
        'accel':   dict(curv=0.0, cycles=3,  mode='run'),
        'brake':   dict(curv=0.0, cycles=1,  mode='brake'),
        'reverse': dict(curv=0.0, cycles=-1, mode='reverse'),
        'turn':    dict(curv=0.55, cycles=2, mode='turn'),
    }[name]
    bg = make_background(cfg['curv'])
    if name == 'turn':
        draw_skids(bg, cfg['curv'])
    flames = flame_seq()
    frames = []
    for f in range(NF):
        buf = [bg[0][:], bg[1][:], bg[2][:]]
        phase = f / NF * PERIOD * cfg['cycles']
        draw_dashes(buf, phase, cfg['curv'])
        draw_posts(buf, phase, cfg['curv'])
        wob = math.sin(f / NF * 2 * math.pi * 3)
        if name == 'turn':
            # tail swung out: rear face compressed toward its right edge, flank visible on the left,
            # whole body rolled onto its outside wheels; slight shudder
            dy = round(wob * 0.8)
            comp = lambda x, y: (400 - (400 - x) * 0.78 + 6, y)
            roll = rot_about(270, 250, math.radians(-4.5 + 0.6 * wob))
            set_xf(roll)
            shadow(buf, 250, 262, 175, 20, 0.85)
            set_xf(lambda x, y: roll(x + 6, y))
            draw_side(buf, dy)
            set_xf(rot_about(270, 250, math.radians(-4.5 + 0.6 * wob), comp))
            draw_car(buf, dy, 'turn')
            fl = flames[f]
            if fl[1]:
                draw_flame(buf, f, fl[0] * 0.8, True, dy)
            set_xf(ident)
            draw_tyre_smoke(buf, f)
        elif name == 'brake':
            # nose dives, so the tail rises a little; shudder from the brakes
            dy = -4 + round(wob * 0.6)
            set_xf(ident)
            draw_car(buf, dy, 'brake')
        elif name == 'reverse':
            dy = round(wob * 0.4)
            set_xf(ident)
            draw_car(buf, dy, 'reverse')
        else:
            dy = round(wob * 0.8)
            set_xf(ident)
            draw_car(buf, dy, 'run')
            if name == 'accel':
                L, pop = flames[f]
                draw_flame(buf, f, L, pop, dy)
        set_xf(ident)
        frames.append(buf)
        print(name, f + 1, "/", NF, flush=True)
    return frames

if __name__ == "__main__":
    out_dir = sys.argv[1]
    scenes = sys.argv[2:] or ['accel', 'turn', 'brake', 'reverse']
    os.makedirs(out_dir, exist_ok=True)
    for s in scenes:
        for fn, fr in render_scene(s, out_dir):
            n = write_gif(os.path.join(out_dir, fn), fr)
            print("wrote", fn, n, "bytes")
