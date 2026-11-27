#!/usr/bin/env python3
"""The Car layout's pictures (car-meter.js) from the owner's BMW M3 pictures (1.3.89).

- driving, standing still, braking, accelerating, reversing and cornering steps 1-3: the M3 seen from behind
  (../hud-art/vehicles/own.png) over render3d.py's night road; the cornering steps lean, step the tail out and smoke
  more, drawn for each side (a left bend is not the right one mirrored, so the badge reads the right way round);
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
    'turn1':   dict(curv=0.014, cycles=2,  roll=2.5, yaw=0.25, lift=0,  smoke=0.0),
    'turn2':   dict(curv=0.018, cycles=2,  roll=4.0, yaw=0.55, lift=0,  smoke=0.5),
    'turn3':   dict(curv=0.022, cycles=2,  roll=5.5, yaw=1.0,  lift=0,  smoke=1.0),
}
# the app's states, in this order: a right bend's own pictures, a left bend's own, the drift (a left one)
STATES = ['stop', 'cruise', 'accel', 'brake', 'reverse', 'turn1', 'turn2', 'turn3',
          'turn1_left', 'turn2_left', 'turn3_left', 'drift']


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
def render(state, nf, hud):
    """the state's nf frames, W x H RGB"""
    global _drift
    if state == 'drift':
        _drift = _drift or Drift()
        return [_drift.frame(f, nf, hud) for f in range(nf)]
    if state.endswith('_left'):     # the picture flipped, the frame flipped back: the left bend, badge the right way
        src = REAR.transpose(Image.FLIP_LEFT_RIGHT)
        return [np.ascontiguousarray(rear_frame(state[:-5], f, nf, hud, src)[:, ::-1]) for f in range(nf)]
    return [rear_frame(state, f, nf, hud, REAR) for f in range(nf)]


def sprites(out, ow, oh, nf, hud):
    frames = {}
    for s in STATES:
        frames[s] = [Image.fromarray(a).resize((ow, oh), Image.LANCZOS) for a in render(s, nf, hud)]
        print(s, flush=True)
    # one 256-colour palette for the set, from every frame
    every = [im for s in STATES for im in frames[s]]
    sheet = Image.new('RGB', (ow, oh * len(every)))
    for i, im in enumerate(every): sheet.paste(im, (0, oh * i))
    pal_im = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = bytes(pal_im.getpalette()[:768]).ljust(768, b'\0')
    data, total = {}, 0
    for s in STATES:
        raw = b''.join(im.quantize(palette=pal_im, dither=Image.Dither.NONE).tobytes() for im in frames[s])
        z = zlib.compress(raw, 9); total += len(z)
        data[s] = base64.b64encode(z).decode('ascii')
    lines = ["'use strict';",
             "// Generated by tools/car-meter/m3.py: the Car layout's picture (car-meter.js)" + (", HUD set: the car and its smoke on black, clear on the glass" if hud else "") + ".",
             "// The owner's BMW M3: seen from behind for driving, braking, accelerating, reversing and cornering steps 1-3 (each",
             "// side drawn), the owner's drift picture for step 4 (a left bend; a right one mirrored). " + str(ow) + "x" + str(oh) + ", " + str(nf) + " frames a state,",
             "// one 256-colour palette (rgb), each state's palette indices deflated (zlib) and base64'd. Do not edit by hand.",
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
