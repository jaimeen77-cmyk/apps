#!/usr/bin/env python3
"""The Car layout's pictures (car-meter.js) from the owner's BMW M3 pictures (1.3.90).

- driving, standing still, braking, accelerating and reversing: the M3 seen from behind (../hud-art/vehicles/own.png)
  over render3d.py's night road;
- cornering steps 1-3 (1.3.94): the owner's pictures of the M3 in a left bend, its nose turned 10, 20 and 30 degrees
  about the tail lamps (m3-turn10/20/30.png, Turned); a right bend is them mirrored;
- cornering step 4 (drift): the owner's drift picture (m3-drift.png, a left bend) with the car swaying about its front
  wheels and its tyre smoke flowing; a right drift is it mirrored.

Needs numpy, Pillow and opencv-python-headless (the drift picture's road under the car is filled in with OpenCV).

  python m3.py preview <dir> [state ...]            # 540 x 304 webp loops, 16 frames
  python m3.py sprites <out.js> <w> <h> <frames> [hud]
"""
import sys, os, math, random, json, zlib, base64
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render3d as R3
M = R3.M

W, H = 540, 304                      # drawn at this size, then scaled to the app's
NF = 16

# ---------------------------------------------------------------- the M3 from behind on the night road
REAR = Image.open(os.path.join(HERE, '..', 'hud-art', 'vehicles', 'own.png')).convert('RGBA')
SW, SH = REAR.size                   # 324 x 285
SCALE = 0.74
TAIL = [(64, 165), (260, 165)]                        # tail-lamp centres (picture px)
TAIL_IN = [(95, 176), (229, 176)]                     # the inner lamps (reversing)
TIPS = [(92, 274), (112, 274), (207, 274), (227, 274)]   # the four tail pipes
TYRES = [(28, 278), (296, 278)]

# road curve and speed, roll (deg, leaning out of the bend), yaw (0..1: the tail out), lift (px up), smoke
REAR_SCENES = {
    'stop':    dict(curv=0.0,   cycles=0,  roll=0.0, yaw=0.0,  lift=0,  smoke=0.0, idle=True),
    'cruise':  dict(curv=0.0,   cycles=2,  roll=0.0, yaw=0.0,  lift=0,  smoke=0.0),
    'accel':   dict(curv=0.0,   cycles=3,  roll=0.0, yaw=0.0,  lift=-3, smoke=0.0, flames=True),
    'brake':   dict(curv=0.0,   cycles=1,  roll=0.0, yaw=0.0,  lift=5,  smoke=0.0, lamps='brake'),
    'reverse': dict(curv=0.0,   cycles=-1, roll=0.0, yaw=0.0,  lift=0,  smoke=0.0, lamps='reverse'),
}
# (1.3.94) cornering steps 1-3 are the owner's pictures of the M3 in a left bend, its nose turned 10, 20 and 30 degrees
# into it about the tail lamps (Turned below); a right bend is them mirrored
# the app's states, in this order
# (1.3.94) only the left bends' pictures: car-meter.js mirrors them for a right bend, as the drift
STATES = ['stop', 'cruise', 'accel', 'brake', 'reverse', 'turn1_left', 'turn2_left', 'turn3_left', 'drift']


def road(cfg, f, nf):
    buf = M.new_buf()
    cam = R3.Cam((0.0, 3.3, -9.6), (0.0, 0.5, 0.6), 36)
    Rr, Gg, Bb = buf
    for y in range(M.h):
        t = y / M.h; c = (4 + 10 * t, 5 + 11 * t, 10 + 18 * t); b = y * M.w
        for x in range(M.w): Rr[b + x], Gg[b + x], Bb[b + x] = c
    R3.draw_road(buf, cam, cfg['curv'], f / nf * R3.PERIOD * cfg['cycles'])
    a = np.clip(np.stack([np.array(ch, np.float32).reshape(M.h, M.w) for ch in buf], -1), 0, 255)
    return a.reshape(H, a.shape[0] // H, W, a.shape[1] // W, 3).mean((1, 3))      # (drawn at twice the size)


def glow(img, cx, cy, rx, ry, col, k, power=2.0):
    """additive soft light"""
    h, w = img.shape[:2]
    x0, x1 = int(max(0, cx - rx)), int(min(w, cx + rx + 1)); y0, y1 = int(max(0, cy - ry)), int(min(h, cy + ry + 1))
    if x0 >= x1 or y0 >= y1: return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    wgt = np.clip(1 - np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0, 1) ** power * k
    img[y0:y1, x0:x1] += wgt[..., None] * np.array(col, np.float32)


def puff(img, cx, cy, r, a, shade):
    """smoke, laid over"""
    h, w = img.shape[:2]
    x0, x1 = int(max(0, cx - r)), int(min(w, cx + r + 1)); y0, y1 = int(max(0, cy - r)), int(min(h, cy + r + 1))
    if x0 >= x1 or y0 >= y1: return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    wgt = (np.clip(1 - np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r, 0, 1) ** 1.6 * a)[..., None]
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - wgt) + shade * wgt


def car_sprite(src, cfg, f, nf):
    """the M3 for this frame: scaled, the rear's far edge shorter as the tail steps out, leaning; returns (RGBA,
    offset, P: picture px -> frame px)"""
    sw, sh = round(SW * SCALE), round(SH * SCALE)
    im = src.resize((sw, sh), Image.LANCZOS)
    k = cfg['yaw'] * 0.10
    if k:
        dy = sh * k / 2
        im = im.transform((round(sw * (1 - k * 0.6)), sh), Image.QUAD, (0, 0, 0, sh, sw, sh + dy, sw, -dy), Image.BICUBIC)
    sxk = im.width / sw
    wob = math.sin(f / nf * 2 * math.pi * 2)
    roll = cfg['roll'] + 0.6 * wob * cfg['smoke']
    big = im.rotate(roll, resample=Image.BICUBIC, expand=True)
    bob = 0.0 if cfg.get('idle') else 1.0 * math.sin(f / nf * 2 * math.pi * 3)     # standing still: only the vapour moves
    cx = W / 2 - 34 * cfg['yaw'] + 3 * wob * cfg['smoke']
    by = H - 14 - cfg['lift'] + bob
    ox = cx - big.width / 2; oy = by - big.height + (big.height - im.height) / 2
    th = math.radians(roll)
    def P(px, py):
        x = px * SCALE * sxk - im.width / 2; y = py * SCALE - im.height / 2
        if k: y = y * (1 - k * (px / SW))
        X = x * math.cos(th) + y * math.sin(th); Y = -x * math.sin(th) + y * math.cos(th)
        return ox + big.width / 2 + X, oy + big.height / 2 + Y
    return big, (round(ox), round(oy)), P


def flames(nf):
    rng = random.Random(7)
    return [((rng.uniform(1.0, 1.5) if f % 4 in (0, 1) else rng.uniform(0.35, 0.6)), f % 4 in (0, 1)) for f in range(nf)]


def rear_frame(name, f, nf, hud, src):
    cfg = REAR_SCENES[name]
    img = np.zeros((H, W, 3), np.float32) if hud else road(cfg, f, nf)
    big, (ox, oy), P = car_sprite(src, cfg, f, nf)
    if not hud:      # the car's shadow and its red light on the road
        sx, sy = P(162, 283)
        sh = np.zeros((H, W, 3), np.float32); glow(sh, sx, sy, 150, 16, (1, 1, 1), 0.75, 1.2)
        img *= (1 - np.clip(sh, 0, 1))
        glow(img, sx, sy + 12, 170, 30, (120, 10, 6), 0.9 if cfg.get('lamps') == 'brake' else 0.35, 1.6)
        if cfg.get('lamps') == 'reverse': glow(img, sx, sy + 14, 150, 28, (150, 150, 140), 0.8, 1.6)
    smoke, rng, puffs = cfg['smoke'], random.Random(3), []
    if smoke:        # tyre smoke blowing out of the bend
        for side, (tx, ty) in enumerate(TYRES):
            for j in range(int(10 * smoke) + 3):
                ph = (f / nf + j / (10 * smoke + 3)) % 1.0
                x, y = P(tx, ty)
                drift = -1 if side == 0 else -0.4
                puffs.append((x + drift * 90 * ph * smoke + rng.uniform(-8, 8), y - 6 - 30 * ph + rng.uniform(-4, 4) + 30 * ph * ph,
                              14 + 80 * ph * (0.6 + smoke * 0.7), 0.6 * (1 - ph) * (0.5 + 0.5 * smoke)))
    if cfg.get('idle'):  # thin exhaust vapour
        for (tx, ty) in TIPS[::3]:
            for j in range(4):
                ph = (f / nf + j / 4) % 1.0
                x, y = P(tx, ty)
                puffs.append((x - 6 * ph, y - 4 - 34 * ph, 6 + 22 * ph, 0.28 * (1 - ph)))
    for (x, y, r, a) in puffs[: len(puffs) // 2]: puff(img, x, y, r, a, 150 if hud else 170)
    base = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    base.alpha_composite(big, (max(0, ox), max(0, oy)), (max(0, -ox), max(0, -oy)))
    img = np.array(base.convert('RGB'), np.float32)
    lamps = cfg.get('lamps')
    for (tx, ty) in TAIL:
        x, y = P(tx, ty)
        if lamps == 'brake': glow(img, x, y, 58, 22, (255, 40, 20), 0.9, 1.4); glow(img, x, y, 30, 10, (255, 200, 180), 0.6, 1.5)
        else: glow(img, x, y, 44, 16, (220, 20, 10), 0.35, 1.8)
    if lamps == 'brake':     # the third brake lamp over the rear window
        x, y = P(162, 52); glow(img, x, y, 46, 5, (255, 30, 20), 0.9, 1.2)
    if lamps == 'reverse':
        for (tx, ty) in TAIL_IN:
            x, y = P(tx, ty); glow(img, x, y, 26, 14, (255, 255, 245), 1.0, 1.6); glow(img, x, y, 60, 26, (180, 190, 200), 0.35, 1.5)
    if cfg.get('flames'):    # bursts from the four pipes (towards the camera)
        L, pop = flames(nf)[f]
        for (tx, ty) in TIPS:
            x, y = P(tx, ty); r = (10 if pop else 6) * L
            glow(img, x, y + 4 * L, r * 2.6, r * 1.9, (255, 70, 15), 0.9, 1.2)
            glow(img, x, y + 2 * L, r * 1.5, r * 1.1, (255, 160, 40), 1.0, 1.2)
            glow(img, x, y, r * 0.7, r * 0.55, (255, 245, 210), 1.3, 1.0)
    for (x, y, r, a) in puffs[len(puffs) // 2:]: puff(img, x, y, r, a, 150 if hud else 175)
    return np.clip(img, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- cornering steps 1-3 (1.3.94)
TURNED = {
    # picture, the 16:9 crop round the car, the box for the cut, the dark tyres the cut leaves out, the tail lamps,
    # the rear tyres (the smoke's sources), how much smoke
    'turn1_left': dict(file='m3-turn10.png', crop=(0, 410, 832, 878), box=(215, 450, 530, 395), wheels=[(255, 600, 28, 55), (352, 772, 28, 55)],
                       tails=[(455, 710), (685, 700)], tyres=[(355, 805), (700, 805)], smoke=0.25),
    'turn2_left': dict(file='m3-turn20.png', crop=(0, 400, 832, 868), box=(215, 440, 545, 395), wheels=[(246, 582, 26, 52), (372, 752, 28, 55)],
                       tails=[(485, 700), (705, 690)], tyres=[(372, 795), (722, 795)], smoke=0.55),
    'turn3_left': dict(file='m3-turn30.png', crop=(8, 116, 326, 295), box=(70, 140, 258, 185), wheels=[(182, 292, 20, 24), (94, 226, 13, 22)],
                       tails=[(222, 266), (292, 250)], tyres=[(178, 300), (292, 286)], smoke=1.0),
}


class Turned:
    """One of the owner's pictures of the M3 turned into a left bend: the car cut out (GrabCut from a box round it,
    its tyres added), swaying a little about its tail lamps over the road filled in under it, tyre smoke from the
    rear growing with the step."""

    def __init__(self, cfg):
        import cv2
        self.cv2, self.cfg = cv2, cfg
        bgr = cv2.imread(os.path.join(HERE, cfg['file']))
        self.A = bgr[..., ::-1].astype(np.float32)
        self.IH, self.IW = self.A.shape[:2]
        self.k = self.IW / 335.0          # sizes below are for the 335 px wide picture
        mask = np.zeros((self.IH, self.IW), np.uint8)
        cv2.setRNGSeed(1)
        cv2.grabCut(bgr, mask, cfg['box'], np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 8, cv2.GC_INIT_WITH_RECT)
        m = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
        for (cx, cy, rx, ry) in cfg['wheels']: cv2.ellipse(m, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
        r = max(3, int(3 * self.k)) | 1
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((r * 2 + 1, r * 2 + 1), np.uint8))
        self.M = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 1.0 * self.k)
        hole = cv2.dilate((self.M > 0.02).astype(np.uint8) * 255, np.ones((r * 3, r * 3), np.uint8))
        self.ROAD = cv2.inpaint(bgr, hole, 7, cv2.INPAINT_TELEA)[..., ::-1].astype(np.float32)
        t = cfg['tails']; self.PIVOT = ((t[0][0] + t[1][0]) / 2, (t[0][1] + t[1][1]) / 2)
        rng = random.Random(9)
        self.PUFFS = [(s, rng.random(), rng.uniform(-1, 1), rng.uniform(0.7, 1.3)) for s in range(2) for _ in range(int(6 + 14 * cfg['smoke']))]

    def warp(self, img, ang, dx, dy, edge=False):
        cv2 = self.cv2
        m = cv2.getRotationMatrix2D(self.PIVOT, ang, 1.0); m[0, 2] += dx; m[1, 2] += dy
        return cv2.warpAffine(img, m, (self.IW, self.IH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE if edge else cv2.BORDER_CONSTANT, borderValue=0)

    def frame(self, f, nf, hud):
        cv2, IW, IH, k, sm_k = self.cv2, self.IW, self.IH, self.k, self.cfg['smoke']
        ph = f / nf
        ang = (0.3 + 0.5 * sm_k) * (math.sin(2 * math.pi * ph * 2) + 0.4 * math.sin(2 * math.pi * ph * 3))   # the nose swaying about the tail
        shx, shy = 0.8 * k * math.sin(2 * math.pi * ph * 3), 0.6 * k * math.cos(2 * math.pi * ph * 2)
        base = np.zeros_like(self.A) if hud else self.warp(self.ROAD, 0, shx * 0.4, shy * 0.4, True)
        m = self.warp(self.M, ang, shx, shy)[..., None]
        img = base * (1 - m) + self.warp(self.A, ang, shx, shy) * m
        sm = np.zeros((IH, IW), np.float32)
        for s, off, jit, sz in self.PUFFS:
            t = (ph + off) % 1.0
            tx, ty = self.cfg['tyres'][s]
            x = tx + (70 * t + 20 * jit * t) * k + shx
            y = ty + (40 * t + 14 * jit * t) * k + shy
            r = (6 + 36 * t) * sz * k; a = (0.2 + 0.25 * sm_k) * (1 - t) ** 1.3 * (0.7 if s else 1.0)
            x0, x1 = int(max(0, x - r)), int(min(IW, x + r + 1)); y0, y1 = int(max(0, y - r)), int(min(IH, y + r + 1))
            if x0 >= x1 or y0 >= y1: continue
            yy, xx = np.mgrid[y0:y1, x0:x1]
            w = np.clip(1 - np.hypot(xx - x, yy - y) / r, 0, 1) ** 1.5 * a
            sm[y0:y1, x0:x1] = 1 - (1 - sm[y0:y1, x0:x1]) * (1 - w)
        sm = np.clip(sm, 0, 0.85)[..., None]
        img = img * (1 - sm) + np.array((170, 172, 184), np.float32) * sm
        for (lx, ly) in self.cfg['tails']:
            glow(img, lx + shx, ly + shy, 22 * k, 12 * k, (255, 40, 25), 0.28 + 0.06 * math.sin(2 * math.pi * ph * 4))
        x0, y0, x1, y1 = self.cfg['crop']
        return np.array(Image.fromarray(np.clip(img, 0, 255)[y0:y1, x0:x1].astype(np.uint8)).resize((W, H), Image.LANCZOS))


# ---------------------------------------------------------------- the drift (cornering step 4)
class Drift:
    CROP = (205, 108, 877, 486)          # 16:9 round the car (picture px)
    # the car's outline (picture px), traced by hand
    OUTLINE = [(x / 2 + 240, y / 2 + 140) for x, y in [
        (90, 150), (95, 262), (118, 342), (176, 348), (205, 332), (300, 400), (400, 470), (430, 520), (470, 600), (560, 600),
        (620, 565), (740, 605), (900, 600), (1000, 565), (1058, 480), (1058, 380), (1040, 322), (995, 282), (935, 232),
        (855, 132), (805, 92), (735, 52), (640, 35), (500, 40), (380, 55), (330, 62), (205, 95), (118, 120), (96, 138)]]
    PIVOT = (300, 280)                   # the front wheels: the tail swings about them
    TYRES = [(455, 400), (690, 440)]     # the rear tyres: the smoke's sources
    TAILS = [(587, 343), (750, 320)]

    def __init__(self):
        import cv2
        self.cv2 = cv2
        self.A = np.array(Image.open(os.path.join(HERE, 'm3-drift.png')).convert('RGB')).astype(np.float32)
        self.IH, self.IW = self.A.shape[:2]
        mask = Image.new('L', (self.IW, self.IH), 0); ImageDraw.Draw(mask).polygon(self.OUTLINE, fill=255)
        self.M = np.array(mask.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
        # the road under the car, filled in, for the car to sway over
        hole = cv2.dilate((self.M > 0.02).astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
        self.ROAD = cv2.inpaint(self.A.astype(np.uint8)[..., ::-1], hole, 7, cv2.INPAINT_TELEA)[..., ::-1].astype(np.float32)
        rng = random.Random(5)
        self.PUFFS = [(s, rng.random(), rng.uniform(-1, 1), rng.uniform(0.7, 1.3)) for s in range(2) for _ in range(26)]

    def warp(self, img, ang, dx, dy):
        cv2 = self.cv2
        m = cv2.getRotationMatrix2D(self.PIVOT, ang, 1.0); m[0, 2] += dx; m[1, 2] += dy
        return cv2.warpAffine(img, m, (self.IW, self.IH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

    def frame(self, f, nf, hud):
        cv2, IW, IH = self.cv2, self.IW, self.IH
        ph = f / nf
        ang = 1.1 * math.sin(2 * math.pi * ph * 2) + 0.4 * math.sin(2 * math.pi * ph * 3)    # the tail swaying
        shx, shy = 1.2 * math.sin(2 * math.pi * ph * 3), 0.9 * math.cos(2 * math.pi * ph * 2)   # the camera shaking
        base = np.zeros_like(self.A) if hud else self.warp(self.ROAD, 0, shx * 0.4, shy * 0.4)
        m = self.warp(self.M, ang, shx, shy)[..., None]
        img = base * (1 - m) + self.warp(self.A, ang, shx, shy) * m
        sm = np.zeros((IH, IW), np.float32)
        for s, off, jit, sz in self.PUFFS:       # puffs leaving each rear tyre, growing and thinning
            t = (ph + off) % 1.0
            tx, ty = self.TYRES[s]
            x = tx + 210 * t + 40 * jit * t + (10 if s else -20) * t * t + shx
            y = ty + 120 * t + 30 * jit * t + shy
            r = (14 + 90 * t) * sz; a = 0.55 * (1 - t) ** 1.3 * (0.6 if s else 1.0)
            x0, x1 = int(max(0, x - r)), int(min(IW, x + r + 1)); y0, y1 = int(max(0, y - r)), int(min(IH, y + r + 1))
            if x0 >= x1 or y0 >= y1: continue
            yy, xx = np.mgrid[y0:y1, x0:x1]
            w = np.clip(1 - np.hypot(xx - x, yy - y) / r, 0, 1) ** 1.5 * a
            sm[y0:y1, x0:x1] = 1 - (1 - sm[y0:y1, x0:x1]) * (1 - w)
        noise = cv2.GaussianBlur(np.random.default_rng(f).random((IH // 6, IW // 6)).astype(np.float32), (0, 0), 1.5)
        noise = cv2.resize(noise, (IW, IH)); noise = 0.75 + 0.5 * (noise - noise.min()) / (np.ptp(noise) + 1e-6)
        sm = np.clip(sm * noise, 0, 0.9)[..., None]
        yy, xx = np.mgrid[0:IH, 0:IW]
        red = np.clip(1 - np.hypot(xx - 670, yy - 400) / 260, 0, 1)[..., None]       # the tail lamps on the smoke
        col = np.array((178, 180, 192), np.float32) * (1 - 0.35 * red) + np.array((200, 50, 45), np.float32) * 0.35 * red
        img = img * (1 - sm) + col * sm
        for (lx, ly) in self.TAILS:
            glow(img, lx + shx, ly + shy, 46, 24, (255, 40, 25), 0.30 + 0.08 * math.sin(2 * math.pi * ph * 4))
        x0, y0, x1, y1 = self.CROP
        return np.array(Image.fromarray(np.clip(img, 0, 255)[y0:y1, x0:x1].astype(np.uint8)).resize((W, H), Image.LANCZOS))


_drift = None
_turned = {}
def render(state, nf, hud):
    """the state's nf frames, W x H RGB"""
    global _drift
    if state == 'drift':
        _drift = _drift or Drift()
        return [_drift.frame(f, nf, hud) for f in range(nf)]
    left = state if state.endswith('_left') else state + '_left'
    if left in TURNED:              # cornering steps 1-3: the owner's left-bend pictures; a right bend is them mirrored
        _turned[left] = _turned.get(left) or Turned(TURNED[left])
        fr = [_turned[left].frame(f, nf, hud) for f in range(nf)]
        return fr if state == left else [np.ascontiguousarray(a[:, ::-1]) for a in fr]
    return [rear_frame(state, f, nf, hud, REAR) for f in range(nf)]


COLOURS = 128      # fewer colours and a slight smoothing (1.3.94: 128, from 160)


def palette_of(pix, k, seed=1, iters=20):
    """k colours for the set (k-means over a sample of its pixels; the rarer saturated ones, the yellow lines, the
    lamps and the flames, weighted up so they keep their own colours); black is always the first (clear on the HUD)"""
    rng = np.random.default_rng(seed)
    p = pix.reshape(-1, 3).astype(np.float32)
    mx, mn = p.max(1), p.min(1)
    w = 1 + 5 * (mx - mn) / (mx + 1) + 1.5 * mx / 255
    x = p[rng.choice(len(p), size=min(len(p), 250000), replace=False, p=w / w.sum())]
    c = x[rng.choice(len(x), k, replace=False)].copy(); c[0] = 0
    for _ in range(iters):
        lab = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(-1), 1)
        for j in range(1, k):
            m = x[lab == j]
            c[j] = m.mean(0) if len(m) else x[rng.integers(len(x))]
    return np.clip(np.round(c), 0, 255).astype(np.uint8)


def indices(img, pal):
    f = img.reshape(-1, 3).astype(np.int32); P = pal.astype(np.int32); out = np.empty(len(f), np.uint8)
    for i in range(0, len(f), 20000):
        out[i:i + 20000] = np.argmin(((f[i:i + 20000, None, :] - P[None]) ** 2).sum(-1), 1)
    return out


def sprites(out, ow, oh, nf, hud):
    frames = {}
    for s in STATES:
        frames[s] = [np.array(Image.fromarray(a).resize((ow, oh), Image.LANCZOS).filter(ImageFilter.SMOOTH)) for a in render(s, nf, hud)]
        print(s, flush=True)
    # one palette for the set, from every frame
    P = palette_of(np.concatenate([np.stack(frames[s]) for s in STATES]), COLOURS)
    pal = P.tobytes().ljust(768, b'\0')
    data, total = {}, 0
    for s in STATES:
        raw = b''.join(indices(im, P).tobytes() for im in frames[s])
        z = zlib.compress(raw, 9); total += len(z)
        data[s] = base64.b64encode(z).decode('ascii')
    lines = ["'use strict';",
             "// Generated by tools/car-meter/m3.py: the Car layout's picture (car-meter.js)" + (", HUD set: the car and its smoke on black, clear on the glass" if hud else "") + ".",
             "// The owner's BMW M3: seen from behind for driving, braking, accelerating, reversing and cornering steps 1-3 (each",
             "// side drawn), the owner's drift picture for step 4 (a left bend; a right one mirrored). " + str(ow) + "x" + str(oh) + ", " + str(nf) + " frames a state,",
             "// one palette (rgb, 256 entries, " + str(COLOURS) + " used), each state's palette indices deflated (zlib) and base64'd. Do not edit by hand.",
             "module.exports={W:" + str(ow) + ",H:" + str(oh) + ",N:" + str(nf) + ",palette:" + json.dumps(base64.b64encode(pal).decode('ascii')) + ","]
    lines.append(" states:{" + ",\n  ".join(s + ":" + json.dumps(data[s]) for s in STATES) + "}};")
    with open(out, 'w', encoding='utf-8', newline='\n') as fh: fh.write("\n".join(lines) + "\n")
    print('wrote', out, 'deflated', total)


def preview(out, names):
    os.makedirs(out, exist_ok=True)
    for hud in (False, True):
        for s in names or STATES:
            fr = [Image.fromarray(a) for a in render(s, NF, hud)]
            fr[0].save(os.path.join(out, ('hud_' if hud else 'cluster_') + s + '.webp'), save_all=True, append_images=fr[1:], duration=100, loop=0, quality=80, method=6)
            print('wrote', s, flush=True)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    if mode == 'preview': preview(sys.argv[2], sys.argv[3:])
    elif mode == 'sprites': sprites(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), len(sys.argv) > 6 and sys.argv[6] == 'hud')
    else: print(__doc__); sys.exit(2)
