"""Low-poly 3D render of an original two-tone (white over black) 1980s hatchback at night, seen from
slightly above and behind, so it can really yaw into a drift. Flat-shaded faces, painter's algorithm,
2D post effects (glow, smoke, flames, light trails) from make_set.py.
usage: python render3d.py gif OUT_DIR            (540x304 preview GIFs)
       python render3d.py sprites OUT.js W H N   (cluster sprite module)"""
import base64, json, math, os, random, sys, zlib
import make_set as M

def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, s): return (a[0] * s, a[1] * s, a[2] * s)
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)
def lerp(a, b, t): return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)

# ---------------- materials ----------------
WHITE = (226, 228, 232)
BLACK = (30, 30, 34)
GLASS = (26, 32, 44)
TRIM = (40, 40, 44)
BUMPER = (38, 38, 42)
TYRE = (16, 16, 18)
RIM = (130, 132, 138)
LIGHT = norm((-0.35, 1.0, -0.25))      # moon / street light from above, a little behind-left
EMISSIVE = 'emissive'

# ---------------- car model (metres; x right, y up, z forward) ----------------
def hexa(v, col, name, decals=None):
    """v: 8 corners: bottom RL, RR, FR, FL then top RL, RR, FR, FL. Faces carry corners in u/v order."""
    F = {
        'rear':   [v[0], v[1], v[5], v[4]],
        'front':  [v[2], v[3], v[7], v[6]],
        'left':   [v[3], v[0], v[4], v[7]],     # u: front -> rear seen from the left... normalised below
        'right':  [v[1], v[2], v[6], v[5]],
        'top':    [v[4], v[5], v[6], v[7]],
        'bottom': [v[3], v[2], v[1], v[0]],
    }
    # left face: u from rear to front like the right one
    F['left'] = [v[0], v[3], v[7], v[4]]
    centre = v_mul(tuple(sum(p[i] for p in v) for i in range(3)), 1 / 8)
    faces = []
    for k, pts in F.items():
        faces.append({'pts': pts, 'col': col, 'part': name, 'side': k, 'centre': centre, 'decals': (decals or {}).get(k, [])})
    return faces

def bil(face, u, v):
    c0, c1, c2, c3 = face
    a = lerp(c0, c1, u); b = lerp(c3, c2, u)
    return lerp(a, b, v)

def decal(u0, v0, u1, v1, col, emissive=False):
    return {'uv': (u0, v0, u1, v1), 'col': col, 'em': emissive}

def car_model(st):
    """st: 'run' | 'brake' | 'reverse'."""
    brake = st == 'brake'
    rev = st == 'reverse'
    red = (255, 50, 45) if brake else (200, 22, 26)
    redhot = (255, 170, 150) if brake else (255, 90, 80)
    revc = (255, 255, 245) if rev else (170, 170, 176)
    parts = []
    # lower body (black)
    parts += hexa([(-.82, .27, -2.06), (.82, .27, -2.06), (.80, .27, 2.04), (-.80, .27, 2.04),
                   (-.83, .60, -2.08), (.83, .60, -2.08), (.81, .60, 2.07), (-.81, .60, 2.07)], BLACK, 'lower',
                  {'rear': [decal(.40, .30, .60, .85, (205, 196, 118)), decal(.41, .34, .59, .81, (226, 216, 134))]})
    # upper body (white): rear deck high, hood lower
    parts += hexa([(-.83, .60, -2.08), (.83, .60, -2.08), (.81, .60, 2.07), (-.81, .60, 2.07),
                   (-.80, .87, -2.08), (.80, .87, -2.08), (.78, .79, 2.07), (-.78, .79, 2.07)], WHITE, 'upper',
                  {'rear': [decal(.02, .06, .98, .80, (14, 14, 16)),                       # tail garnish
                            decal(.03, .12, .36, .74, red, True), decal(.64, .12, .97, .74, red, True),
                            decal(.06, .30, .33, .55, redhot, True), decal(.67, .30, .94, .55, redhot, True),
                            decal(.37, .14, .43, .72, revc, True), decal(.57, .14, .63, .72, revc, True),
                            decal(.45, .40, .55, .48, (120, 120, 126))],
                   'left': [decal(0, 0, 1, .08, (70, 70, 76)), decal(.47, .10, .49, .95, (150, 150, 150))],
                   'right': [decal(0, 0, 1, .08, (70, 70, 76)), decal(.51, .10, .53, .95, (150, 150, 150))],
                   'front': [decal(.06, .45, .30, .80, (40, 40, 46)), decal(.70, .45, .94, .80, (40, 40, 46)),
                             decal(.05, .10, .95, .30, (24, 24, 28))]})
    # cabin: hatch sloping to the tail, windscreen forward
    parts += hexa([(-.77, .86, -1.95), (.77, .86, -1.95), (.75, .80, .80), (-.75, .80, .80),
                   (-.63, 1.31, -.78), (.63, 1.31, -.78), (.62, 1.32, .12), (-.62, 1.32, .12)], WHITE, 'cabin',
                  {'rear': [decal(.07, .07, .93, .90, GLASS), decal(.12, .15, .40, .85, (90, 100, 120)),
                            decal(.45, .10, .50, .55, (14, 14, 14))],
                   'front': [decal(.06, .08, .94, .92, GLASS), decal(.55, .2, .8, .85, (70, 78, 96))],
                   'left': [decal(.16, .22, .86, .90, GLASS), decal(.55, .22, .60, .90, WHITE), decal(.20, .3, .40, .85, (70, 80, 100))],
                   'right': [decal(.14, .22, .84, .90, GLASS), decal(.40, .22, .45, .90, WHITE), decal(.60, .3, .80, .85, (70, 80, 100))]})
    # bumpers
    parts += hexa([(-.87, .20, -2.22), (.87, .20, -2.22), (.87, .20, -2.04), (-.87, .20, -2.04),
                   (-.87, .42, -2.22), (.87, .42, -2.22), (.87, .42, -2.04), (-.87, .42, -2.04)], BUMPER, 'rbumper')
    parts += hexa([(-.85, .20, 2.04), (.85, .20, 2.04), (.85, .20, 2.20), (-.85, .20, 2.20),
                   (-.85, .40, 2.04), (.85, .40, 2.04), (.85, .40, 2.20), (-.85, .40, 2.20)], BUMPER, 'fbumper')
    # mirrors
    for s in (-1, 1):
        x0, x1 = s * .80, s * .95
        xa, xb = min(x0, x1), max(x0, x1)
        parts += hexa([(xa, .92, .52), (xb, .92, .52), (xb, .92, .64), (xa, .92, .64),
                       (xa, 1.04, .52), (xb, 1.04, .52), (xb, 1.04, .64), (xa, 1.04, .64)], (24, 24, 26), 'mirror')
    return parts

def wheel(cx, cy, cz, side, r=.30, wdt=.21, n=14):
    """Cylinder along x; side=-1 left (outer face at -x), +1 right."""
    xo, xi = cx + side * wdt / 2, cx - side * wdt / 2
    ring = [(math.cos(2 * math.pi * k / n), math.sin(2 * math.pi * k / n)) for k in range(n)]
    out = [(xo, cy + r * s, cz + r * c) for c, s in ring]
    inn = [(xi, cy + r * s, cz + r * c) for c, s in ring]
    centre = (cx, cy, cz)
    faces = [{'pts': out, 'col': TYRE, 'part': 'wheel', 'side': 'outer', 'centre': centre,
              'decals': [{'poly': [(xo + side * .005, cy + r * .66 * s, cz + r * .66 * c) for c, s in ring], 'col': RIM},
                         {'poly': [(xo + side * .006, cy + r * .25 * s, cz + r * .25 * c) for c, s in ring], 'col': (60, 60, 64)}]}]
    faces.append({'pts': inn[::-1], 'col': TYRE, 'part': 'wheel', 'side': 'inner', 'centre': centre, 'decals': []})
    for k in range(n):
        faces.append({'pts': [out[k], out[(k + 1) % n], inn[(k + 1) % n], inn[k]], 'col': (22, 22, 24), 'part': 'wheel', 'side': 'tread', 'centre': centre, 'decals': []})
    return faces

def build_car(st):
    faces = car_model(st)
    wheels = []
    for z in (-1.30, 1.30):
        for s in (-1, 1):
            wheels.append((s, wheel(s * .74, .30, z, s)))
    return faces, wheels

# ---------------- transforms / camera ----------------
def rot_y(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c)
def rot_x(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c)
def rot_z(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2])

class Cam:
    def __init__(self, pos, target, fov=38):
        self.C = pos
        f = norm(v_sub(target, pos)); r = norm(cross((0, 1, 0), f)); u = cross(f, r)
        self.f, self.r, self.u = f, r, u
        self.fpx = (M.W / 2) / math.tan(math.radians(fov) / 2)
    def depth(self, p): return dot(v_sub(p, self.C), self.f)
    def proj(self, p):
        q = v_sub(p, self.C)
        z = dot(q, self.f)
        if z < 0.2: z = 0.2
        return (M.W / 2 + self.fpx * dot(q, self.r) / z, M.H * 0.42 - self.fpx * dot(q, self.u) / z)
    def scale(self, p, size):
        return self.fpx * size / max(0.2, self.depth(p))

# ---------------- scene ----------------
SCENES = {
    # standing still: the road does not move, the engine idles (a slight shake, thin exhaust vapour)
    'stop':    dict(curv=0.0,    yaw=0.0,   roll=0.0,  pitch=0.0,   cycles=0,  car='run',     flames=False, smoke=0.0,   trails=False, idle=True),
    'cruise':  dict(curv=0.0,    yaw=0.0,   roll=0.0,  pitch=0.0,   cycles=2,  car='run',     flames=False, smoke=False, trails=False),
    'accel':   dict(curv=0.0,    yaw=0.0,   roll=0.0,  pitch=-0.012, cycles=3, car='run',     flames=True,  smoke=False, trails=False),
    'brake':   dict(curv=0.0,    yaw=0.0,   roll=0.0,  pitch=0.03,  cycles=1,  car='brake',   flames=False, smoke=False, trails=False),
    'reverse': dict(curv=0.0,    yaw=0.0,   roll=0.0,  pitch=0.0,   cycles=-1, car='reverse', flames=False, smoke=False, trails=False),
    # cornering in three steps: a lean into the bend, the tail stepping out with a little smoke, a full drift
    'turn1':   dict(curv=0.014,  yaw=0.14,  roll=-0.035, pitch=0.0, cycles=2,  car='run',     flames=False, smoke=0.0,   trails=False),
    'turn2':   dict(curv=0.018,  yaw=0.30,  roll=-0.05, pitch=0.0,  cycles=2,  car='run',     flames=False, smoke=0.45,  trails=True),
    'turn3':   dict(curv=0.022,  yaw=0.50,  roll=-0.06, pitch=0.0,  cycles=2,  car='run',     flames=False, smoke=1.0,   trails=True),
}
PERIOD = 6.0     # dash + post spacing (m)
ROAD_HALF = 3.7

def centre_x(z, curv): return curv * z * z

def draw_road(buf, cam, curv, phase):
    M.set_xf(M.ident)
    zs = []
    z = cam.C[2] + 1.2
    while z < 120:
        zs.append(z); z += 0.35 + 0.045 * (z - cam.C[2])
    P = lambda x, y, z: cam.proj((x, y, z))
    # verge / trees beyond the road: draw ground first
    for a, b in zip(zs, zs[1:]):
        ca, cb = centre_x(a, curv), centre_x(b, curv)
        fog = min(1.0, (a - cam.C[2]) / 70.0)
        g = (10 + 6 * (1 - fog), 14 + 8 * (1 - fog), 11 + 5 * (1 - fog))
        M.fill_poly(buf, [P(ca - 60, 0, a), P(ca + 60, 0, a), P(cb + 60, 0, b), P(cb - 60, 0, b)], g)
        asph = 20 + 10 * (1 - fog)
        M.fill_poly(buf, [P(ca - ROAD_HALF, 0, a), P(ca + ROAD_HALF, 0, a), P(cb + ROAD_HALF, 0, b), P(cb - ROAD_HALF, 0, b)], (asph, asph, asph + 4))
        lit = 0.35 + 0.65 * (1 - fog)
        for e in (-1, 1):
            x0, x1 = e * (ROAD_HALF - .35), e * (ROAD_HALF - .2)
            M.fill_poly(buf, [P(ca + x0, 0, a), P(ca + x1, 0, a), P(cb + x1, 0, b), P(cb + x0, 0, b)], (170 * lit, 170 * lit, 160 * lit))
        # centre: double yellow-white dashes
        for k in range(3):
            t0, t1 = k / 3, (k + 1) / 3
            za, zb = a + (b - a) * t0, a + (b - a) * t1
            if ((za + phase) % PERIOD) < PERIOD * 0.5:
                xa, xb = centre_x(za, curv), centre_x(zb, curv)
                for o in (-.12, .12):
                    M.fill_poly(buf, [P(xa + o - .06, 0, za), P(xa + o + .06, 0, za), P(xb + o + .06, 0, zb), P(xb + o - .06, 0, zb)], (210 * lit, 180 * lit, 70 * lit))
    # guardrail on the left: posts + rail, far first
    posts = []
    k0 = math.floor((cam.C[2] + 1.5 + phase) / PERIOD)
    for k in range(k0, k0 + 22):
        z = k * PERIOD - phase
        if z < cam.C[2] + 1.5: continue
        posts.append(z)
    xr = lambda z: centre_x(z, curv) - ROAD_HALF - 0.6
    rail = [z for z in zs if z > cam.C[2] + 1.5]
    for a, b in list(zip(rail, rail[1:]))[::-1]:
        fog = min(1.0, (a - cam.C[2]) / 70.0)
        c = 110 * (1 - fog) + 25
        M.fill_poly(buf, [P(xr(a), .55, a), P(xr(a), .78, a), P(xr(b), .78, b), P(xr(b), .55, b)], (c, c, c * 1.05))
    for z in sorted(posts, reverse=True):
        fog = min(1.0, (z - cam.C[2]) / 70.0)
        c = 80 * (1 - fog) + 20
        p0, p1 = P(xr(z), 0, z), P(xr(z), .8, z)
        w = max(0.6, cam.scale((xr(z), 0, z), .07))
        M.fill_poly(buf, [(p0[0] - w, p0[1]), (p0[0] + w, p0[1]), (p1[0] + w, p1[1]), (p1[0] - w, p1[1])], (c, c, c))

def car_xform(cfg, f, bounce):
    yaw, roll, pitch = cfg['yaw'], cfg['roll'], cfg['pitch']
    wob = math.sin(f / M.NF * 2 * math.pi * 2)
    yaw += 0.015 * wob * cfg['smoke']
    def T(p):
        q = rot_z(p, roll + 0.008 * wob * cfg['smoke'])
        q = rot_x(q, pitch)
        q = rot_y(q, yaw)
        return (q[0], q[1] + bounce, q[2])
    return T

def draw_car(buf, cam, cfg, f):
    M.set_xf(M.ident)
    # driving: a gentle bounce; idling: a quicker, smaller engine shake
    bounce = 0.004 * math.sin(f / M.NF * 2 * math.pi * 4) if cfg.get('idle') else 0.006 * math.sin(f / M.NF * 2 * math.pi * 3)
    T = car_xform(cfg, f, bounce)
    body, wheels = build_car(cfg['car'])
    # soft shadow on the road
    sh = [T(p) for p in [(-1.0, 0, -2.3), (1.0, 0, -2.3), (1.0, 0, 2.3), (-1.0, 0, 2.3)]]
    sh = [(x, 0.0, z) for x, _, z in sh]
    M.fill_poly(buf, [cam.proj(p) for p in sh], (0, 0, 0), 0.55)
    cpos = T((0, .6, 0))
    right_axis = norm(v_sub(T((1, .6, 0)), cpos))
    side_dot = dot(norm(v_sub(cam.C, cpos)), right_axis)
    # the wheels on the side we look at go over the body (they stand out of the arches); seen straight
    # from behind, neither side is shown that way
    near_side = (1 if side_dot > 0 else -1) if abs(side_dot) > 0.2 else 0
    items = []
    def add(face, bias=0.0):
        pts = [T(p) for p in face['pts']]
        cen = v_mul(tuple(sum(p[i] for p in pts) for i in range(3)), 1 / len(pts))
        n = norm(cross(v_sub(pts[1], pts[0]), v_sub(pts[2], pts[0])))
        pc = T(face['centre'])
        if dot(n, v_sub(cen, pc)) < 0: n = v_mul(n, -1)
        if dot(n, v_sub(cam.C, cen)) <= 0: return          # facing away
        items.append((cam.depth(cen) + bias, face, pts, n))
    for fc in body: add(fc)
    for side, ws in wheels:
        for fc in ws: add(fc, -3.0 if side == near_side else 0.0)
    items.sort(key=lambda it: -it[0])
    for _, face, pts, n in items:
        lam = 0.38 + 0.62 * max(0.0, dot(n, LIGHT))
        col = tuple(c * lam for c in face['col'])
        M.fill_poly(buf, [cam.proj(p) for p in pts], col)
        tp = face['pts']
        for d in face['decals']:
            if 'poly' in d:
                dp = [T(p) for p in d['poly']]
                M.fill_poly(buf, [cam.proj(p) for p in dp], tuple(c * lam for c in d['col']))
                continue
            u0, v0, u1, v1 = d['uv']
            q = [T(bil(tp, u0, v0)), T(bil(tp, u1, v0)), T(bil(tp, u1, v1)), T(bil(tp, u0, v1))]
            dc = d['col'] if d['em'] else tuple(c * lam for c in d['col'])
            M.fill_poly(buf, [cam.proj(p) for p in q], dc)
    return T

def lamp_points(T, cfg):
    # left / right tail lamp centres (on the rear face) and the exhaust tip
    return [T((-.55, .72, -2.10)), T((.55, .72, -2.10))], T((-.45, .25, -2.24)), [T((-.17, .72, -2.10)), T((.17, .72, -2.10))]

def effects(buf, cam, cfg, f, T):
    M.set_xf(M.ident)
    tails, exhaust, revs = lamp_points(T, cfg)
    brake = cfg['car'] == 'brake'
    # headlight wash on the road ahead
    if not HUD:
        ahead = T((0, 0, 9))
        s = cam.scale(ahead, 5.0)
        p = cam.proj(ahead)
        M.glow(buf, p[0], p[1], s * 1.1, s * 0.3, (150, 150, 130), 0.35, 1.6)
    # tail lamp glow
    for tp in tails:
        q = cam.proj(tp); r = cam.scale(tp, 0.55 if brake else 0.35)
        M.glow(buf, q[0], q[1], r * 1.6, r * 0.8, (255, 30, 25), 0.6 if brake else 0.35, 2.0)
        M.glow(buf, q[0], q[1], r * 0.6, r * 0.3, (255, 150, 130), 0.6 if brake else 0.35, 2.0)
    # red reflection on the road behind
    road = T((0, 0, -3.2)); q = cam.proj(road); r = cam.scale(road, 2.4)
    if not HUD: M.glow(buf, q[0], q[1], r * 1.0, r * 0.25, (200, 18, 14), 0.32 if brake else 0.12, 1.5)
    if cfg['car'] == 'reverse':
        for rp in revs:
            q = cam.proj(rp); r = cam.scale(rp, 0.5)
            M.glow(buf, q[0], q[1], r, r * 0.6, (255, 255, 245), 1.0, 2.0)
        rr = T((0, 0, -4.5)); q = cam.proj(rr); r = cam.scale(rr, 3.0)
        if not HUD: M.glow(buf, q[0], q[1], r * 1.3, r * 0.45, (220, 220, 205), 0.6, 1.4)
    if cfg['trails']:
        # light trails: the tail lamps' paths smeared back toward the camera
        for tp in tails:
            for k in range(26):
                u = k / 25
                z = tp[2] - u * 7.5
                x = tp[0] + (centre_x(z, cfg['curv']) - centre_x(tp[2], cfg['curv'])) - u * 1.6 * cfg['smoke'] * (1 if tp[0] < 0 else 0.6)
                y = tp[1] * (1 - u) + 0.05 * u
                w = (x, y, z); q = cam.proj(w); r = cam.scale(w, 0.22)
                M.glow(buf, q[0], q[1], r * 1.4, r * 0.7, (255, 30, 30), 0.55 * (1 - u) ** 0.7, 1.5)
    if cfg['smoke']:
        rng = random.Random(5)
        for wz, wx in ((-1.3, -.8), (-1.3, .8)):
            src = T((wx, .1, wz))
            for k in range(9):
                u = ((f / M.NF) * 2 + k / 9) % 1.0
                w = (src[0] - 1.8 * u + rng.uniform(-.2, .2), .15 + 0.7 * u, src[2] - 4.5 * u)
                q = cam.proj(w); r = cam.scale(w, 0.5 + 1.8 * u)
                M.haze(buf, q[0], q[1], r * 1.2, r * 0.75, (175, 172, 176), 0.55 * cfg['smoke'] * (1 - u) ** 1.2, 1.4)
    if cfg.get('idle'):
        # thin vapour from the exhaust, drifting back and up
        for k in range(5):
            u = ((f / M.NF) + k / 5) % 1.0
            w = (exhaust[0] - 0.15 * u, exhaust[1] + 0.35 * u, exhaust[2] - 0.9 * u)
            q = cam.proj(w); r = cam.scale(w, 0.10 + 0.35 * u)
            M.haze(buf, q[0], q[1], r * 1.2, r * 0.9, (150, 150, 155), 0.30 * (1 - u) ** 1.3, 1.4)
    if cfg['flames']:
        L, pop = FLAMES[f]
        q0 = cam.proj(exhaust)
        for i in range(12, -1, -1):
            t = i / 12
            w = (exhaust[0] - 0.05 * t, exhaust[1] - 0.04 * t, exhaust[2] - L * t)
            q = cam.proj(w); rad = cam.scale(w, 0.03 + (0.11 if pop else 0.065) * t ** 0.8)
            M.glow(buf, q[0], q[1], rad * 1.9, rad * 1.5, (255, 70, 15), 0.9 * (1 - 0.5 * t), 1.2)
            M.glow(buf, q[0], q[1], rad * 1.2, rad * 0.9, (255, 160, 40), 1.0 * (1 - 0.6 * t), 1.2)
            if t < 0.6:
                M.glow(buf, q[0], q[1], rad * 0.6, rad * 0.45, (255, 245, 210), 1.3 * (1 - t), 1.0)
        r = cam.scale(exhaust, 0.7 if pop else 0.4)
        M.glow(buf, q0[0], q0[1] + r * 0.2, r * 1.3, r * 0.8, (255, 110, 30), 0.5 if pop else 0.3, 1.6)

FLAMES = None
HUD = False      # the HUD set: no sky, road or light on the road (black is clear on the HUD glass)

def render_frames(name):
    global FLAMES
    cfg = SCENES[name]
    rng = random.Random(7)
    FLAMES = [((rng.uniform(1.0, 1.5) if (f % 4 in (0, 1)) else rng.uniform(0.35, 0.6)), f % 4 in (0, 1)) for f in range(M.NF)]
    frames = []
    for f in range(M.NF):
        buf = M.new_buf()
        camz = -9.6
        k = cfg['yaw'] / 0.5     # 0 straight on .. 1 full drift: the camera moves out to the side with the yaw
        cam = Cam((1.0 * k, 3.3 + 0.2 * k, camz), (0.35 * k, 0.5 - 0.05 * k, 0.6 * k), 36)
        # night sky with a faint glow on the horizon
        R, G, B = buf
        for y in (range(0) if HUD else range(M.h)):
            t = y / M.h
            c = (4 + 10 * t, 5 + 11 * t, 10 + 18 * t)
            base = y * M.w
            for x in range(M.w):
                R[base + x], G[base + x], B[base + x] = c
        phase = f / M.NF * PERIOD * cfg['cycles']
        if not HUD: draw_road(buf, cam, cfg['curv'], phase)
        T = draw_car(buf, cam, cfg, f)
        effects(buf, cam, cfg, f, T)
        frames.append(buf)
        print(name, f + 1, '/', M.NF, flush=True)
    return frames

def main():
    mode = sys.argv[1]
    if mode == 'gif':
        out = sys.argv[2]; os.makedirs(out, exist_ok=True)
        M.NF = 16
        names = sys.argv[3:] or list(SCENES)
        for n in names:
            fr = render_frames(n)
            idx = [M.quantise(b) for b in fr]
            M.write_gif(os.path.join(out, n + '.gif'), idx)
            if n.startswith('turn'):
                M.write_gif(os.path.join(out, n + '_left.gif'), [M.quantise(b, flip=True) for b in fr])
            print('wrote', n)
    else:
        out, OW, OH, N = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
        global HUD
        HUD = len(sys.argv) > 6 and sys.argv[6] == 'hud'
        import make_sprites as SP          # (its import sets its own sizes: set ours after)
        M.NF = N
        M.S = (OW * 2) / M.W
        M.w, M.h = OW * 2, OH * 2
        SP.OW, SP.OH = OW, OH
        data = {}
        total = 0
        for n in SCENES:
            fr = render_frames(n)
            raw = b''.join(SP.to_indices(b) for b in fr)
            z = zlib.compress(raw, 9); total += len(z)
            data[n] = base64.b64encode(z).decode('ascii')
        pal = base64.b64encode(M.palette()).decode('ascii')
        lines = ["'use strict';",
                 "// Generated: the Car layout's picture (car-meter.js)" + (", HUD set: the car only on black, clear on the glass" if HUD else "") + ". Original low-poly 3D renders (a generic white-over-black",
                 "// 1980s hatchback at night, no logos or lettering). " + str(OW) + "x" + str(OH) + ", " + str(N) + " frames a state,",
                 "// one 256-colour palette (rgb), each state's palette indices deflated (zlib) and base64'd. Do not edit by hand.",
                 "module.exports={W:" + str(OW) + ",H:" + str(OH) + ",N:" + str(N) + ",palette:" + json.dumps(pal) + ","]
        lines.append(" states:{" + ",\n  ".join(n + ":" + json.dumps(data[n]) for n in SCENES) + "}};")
        with open(out, 'w', encoding='utf-8', newline='\n') as fh:
            fh.write("\n".join(lines) + "\n")
        print('wrote', out, 'deflated', total)

if __name__ == '__main__':
    main()
