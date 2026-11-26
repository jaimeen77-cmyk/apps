'use strict';
// Lane lines on the HUD (1.3.77): the lines either side of the car as the front camera sees them, read through Cluster
// Redline's root helper (native/redline-lead 0.2.0: LaneBoundaries 0xD024, which this app's uid is refused). A small
// picture: the two lines in perspective and the car between them; a line the car comes within 15 cm of turns amber, one
// it is over turns red (not while the turn signal is on towards it: a lane change). Solid, dashed, double; white or
// yellow as the camera reports. Drawn just above the headway badge, at its size (HUD lamps → Lane lines).
const { LeadHelper } = require('./lead-helper');
// NEAR_M 0.15 (1.3.78): with 0.3 a car 30 cm off a 3 m lane's centre was already amber (the user's capture)
const HALF_CAR = 0.95, NEAR_M = 0.15, STALE_MS = 1200, W = 112, H = 64;
const TYPES = { 1: 'dashed', 2: 'solid', 3: 'dotted', 4: 'edge', 5: 'double', 6: 'double', 7: 'double', 8: 'double', 9: 'edge' };
/** The lines of the car's own lane: {left, right, width} (each {y, type, color, margin} or null) from the helper's list. */
function egoLines(data) {
    if (!data || !Array.isArray(data.lines)) return null;
    let left = null, right = null;
    data.lines.forEach((l) => {
        if (typeof l.y !== 'number') return;
        const y = typeof l.x === 'number' && typeof l.angle === 'number' && Math.abs(l.angle) < 30 ? l.y - l.x * Math.tan(l.angle * Math.PI / 180) : l.y;
        if (y > 0 && (!left || y < left.y0)) left = Object.assign({}, l, { y0: y });
        if (y < 0 && (!right || y > right.y0)) right = Object.assign({}, l, { y0: y });
    });
    // y is sent at the line's point x metres ahead (6-12 m); at the car: back along the line's heading (angle, degrees,
    // + the line running to the left ahead; checked on the user's captures: turned right, both lines about +4 degrees)
    const at0 = (l) => (typeof l.x === 'number' && typeof l.angle === 'number' && Math.abs(l.angle) < 30 ? l.y - l.x * Math.tan(l.angle * Math.PI / 180) : l.y);
    const side = (l, sign) => (l ? { y: Math.round(at0(l) * 100) / 100, slope: typeof l.angle === 'number' && Math.abs(l.angle) < 30 ? Math.round(Math.tan(l.angle * Math.PI / 180) * 1000) / 1000 : 0, type: TYPES[l.type] || 'solid', color: l.color === 2 ? 'yellow' : 'white', margin: Math.round((sign * at0(l) - HALF_CAR) * 100) / 100 } : null);
    return { left: side(left, 1), right: side(right, -1), width: typeof data.width === 'number' ? data.width : null };
}
/** A side's state: 'over' (the car on the line), 'near' (within 15 cm), 'ok'; 'change' with the turn signal towards it. */
function levelOf(s, signal) {
    if (!s) return null;
    const l = s.margin < 0 ? 'over' : s.margin < NEAR_M ? 'near' : 'ok';
    return l !== 'ok' && signal ? 'change' : l;
}
class LaneLines {
    constructor(clock, connect) {
        this.clock = clock || Date.now; this.last = null; this.at = null; this.rx = 0;
        this.helper = new LeadHelper((m, now) => { if (m.lane) { this.rx = m.lane.rx || 0; if (m.lane.data && typeof m.lane.at === 'number' && m.at - m.lane.at < STALE_MS) { this.last = m.lane.data; this.at = now; } } }, this.clock, connect);
    }
    sync(on) { this.helper.sync(on, this.clock()); if (!on) { this.last = null; this.at = null; } }
    /** What the HUD shows now, or null: {left, right, width, levels: {left, right}}; indicator: 'left' / 'right' / 'off'. */
    read(now, indicator) {
        if (!this.last || this.at === null || now - this.at > STALE_MS) return null;
        const e = egoLines(this.last); if (!e || (!e.left && !e.right)) return null;
        return Object.assign(e, { levels: { left: levelOf(e.left, indicator === 'left' || indicator === 'hazard' || indicator === 'both'), right: levelOf(e.right, indicator === 'right' || indicator === 'hazard' || indicator === 'both') } });
    }
    status(now) { const r = this.read(now, 'off'); return { helper: this.helper.status().state, rx: this.rx, lines: this.last && this.last.lines ? this.last.lines.length : 0, now: r, visibility: this.last ? this.last.visibility : null }; }
}
const COLORS = { white: [236, 241, 247, 255], yellow: [255, 206, 58, 255], near: [255, 160, 32, 255], over: [255, 58, 42, 255], change: [90, 176, 255, 255] };
// The picture (1.3.79): the road seen from behind and above the car, in true perspective. A point d metres ahead of the
// car's centre and y metres to its left is at x = cx - F y / (d + D), y = HZ + F (EYE - z) / (d + D) on screen (z: height).
// The lines are painted road markings of their real width (15 cm; a double line two of 12 cm, 12 cm apart), dashes 3 m
// on and 5 m off (Korean town roads); the lane between them a faint surface; the car inside it, its roof and its rear.
const F = 160, D = 12, EYE = 3.6, HZ = 3, NEAR_D = -4, FAR_D = 48, MARK = 0.15;
const CAR = { half: 0.95, rear: -2.35, front: 2.35, roof: 1.42, roofHalf: 0.72, roofRear: -1.6, roofFront: 0.7 };
function project(d, y, z) { const q = d + D; return [W / 2 - F * y / q, HZ + F * (EYE - (z || 0)) / q]; }
// The car (1.3.79): the door-open warning's car (door-alert.js), its top view laid on the road at its heights (the hood
// and the tailgate 0.9 m, the roof 1.42 m, the glass between), over its shadow and a rear face; 4.7 m long.
function paintCar(cv) {
    const S = require('./door-alert').SHAPES, k = (CAR.front - CAR.rear) / S.LENGTH;
    const zOf = (py) => py < 25.4 ? 0.9 : py < 37 ? 0.9 + (py - 25.4) / 11.6 * 0.52 : py < 80.4 ? 1.42 : py < 108.6 ? 1.42 - (py - 80.4) / 28.2 * 0.47 : 0.95;
    const P = (pts, z, flip) => pts.map(([x, py]) => project(CAR.front - py * k, (flip ? x : -x) * k, z === undefined ? zOf(py) : z));
    const inset = (pts, f) => pts.map(([x, y]) => [x * f, y]);
    cv.fill([project(CAR.rear - 0.15, 1.08, 0), project(CAR.front, 1.08, 0), project(CAR.front, -1.08, 0), project(CAR.rear - 0.15, -1.08, 0)], [0, 0, 0, 160]);
    cv.fill([project(CAR.rear, 1.0, 0.92), project(CAR.rear, -1.0, 0.92), project(CAR.rear, -0.98, 0.28), project(CAR.rear, 0.98, 0.28)], S.EDGE);   // the rear face
    cv.fill([project(CAR.rear, 0.98, 0.86), project(CAR.rear, 0.55, 0.86), project(CAR.rear, 0.55, 0.74), project(CAR.rear, 0.98, 0.74)], [230, 40, 50, 255]);
    cv.fill([project(CAR.rear, -0.55, 0.86), project(CAR.rear, -0.98, 0.86), project(CAR.rear, -0.98, 0.74), project(CAR.rear, -0.55, 0.74)], [230, 40, 50, 255]);
    cv.fill(P(S.BODY, 0.9), S.EDGE); cv.fill(P(inset(S.BODY, 0.95), 0.9), S.SILVER);
    cv.fill(P(S.MIRROR, 1.0), S.SILVER); cv.fill(P(S.MIRROR, 1.0, true), S.SILVER);
    cv.fill(P(inset(S.HOOD, 0.86)), S.LIGHT); cv.fill(P(inset(S.GATE, 0.86)), S.LIGHT);
    cv.fill(P(S.SCREEN), S.GLASS); cv.fill(P(S.ROOF), S.SILVER); cv.fill(P(S.PANO), S.PANO_GLASS); cv.fill(P(S.REAR_GLASS), S.GLASS);
    cv.fill(P(S.LAMP), [200, 40, 50, 255]); cv.fill(P(S.LAMP, undefined, true), [200, 40, 50, 255]);
}
function draw(v, w, h) {
    const { ScaledCanvas } = require('./kit/canvas'); const cv = new ScaledCanvas(W, H, Math.min((w || W) / W, (h || H) / H)); cv.clear([0, 0, 0, 0]);
    const yAt = (s, d) => s.y + (s.slope || 0) * d;
    const strip = (fy0, fy1, d0, d1, c) => {   // a band on the road between two lateral functions of d, from d0 to d1
        const n = Math.max(2, Math.ceil((d1 - d0) / 3)), a = [], b = [];
        for (let i = 0; i <= n; i++) { const d = d0 + (d1 - d0) * i / n; a.push(project(d, fy0(d))); b.unshift(project(d, fy1(d))); }
        cv.fill(a.concat(b), c);
    };
    // the lane's surface: between the two lines, or a usual lane's width beside the one seen
    const L = v.left, R = v.right, lw = typeof v.width === 'number' && v.width > 2 && v.width < 5 ? v.width : 3.3;
    const fl = L ? (d) => yAt(L, d) : (d) => yAt(R, d) + lw, fr = R ? (d) => yAt(R, d) : (d) => yAt(L, d) - lw;
    strip(fl, fr, NEAR_D, FAR_D, [70, 92, 116, 70]);
    const mark = (s, lvl, side, top) => {
        if (!s) return;
        let c = lvl && lvl !== 'ok' ? COLORS[lvl] : COLORS[s.color] || COLORS.white; if (top) c = [c[0], c[1], c[2], 150];
        const near = top ? CAR.front + 1 : FAR_D;
        const wide = lvl === 'over' ? 1.6 : 1, edges = s.type === 'double' ? [[-0.18, -0.06], [0.06, 0.18]] : s.type === 'edge' ? [[-0.1, 0.1]] : [[-MARK / 2, MARK / 2]];
        // widen towards the viewer a little so the far end stays visible
        edges.forEach(([e0, e1]) => {
            const g0 = (d) => yAt(s, d) + e0 * wide * (1 + d / 18), g1 = (d) => yAt(s, d) + e1 * wide * (1 + d / 18);
            if (!top && (s.type === 'dashed' || s.type === 'dotted')) { const on = s.type === 'dotted' ? 1 : 3, period = s.type === 'dotted' ? 3 : 8;
                for (let d = NEAR_D; d < near; d += period) strip(g0, g1, d, Math.min(near, d + on), c); }
            else strip(g0, g1, NEAR_D, near, c);
        });
    };
    mark(L, v.levels.left, 1); mark(R, v.levels.right, -1);
    paintCar(cv);
    // a warned line under the car: its part beside the car again over it, half seen through
    if (v.levels.left && v.levels.left !== 'ok') mark(L, v.levels.left, 1, true);
    if (v.levels.right && v.levels.right !== 'ok') mark(R, v.levels.right, -1, true);
    return cv.canvas;
}
class LaneOverlay {
    constructor(client) { this.client = client; this.layer = null; }
    tick(value, cfg, preview) {
        const v = preview ? { left: { y: 1.7, type: 'dashed', color: 'white', margin: 0.75 }, right: { y: -1.05, type: 'solid', color: 'white', margin: 0.1 }, levels: { left: 'ok', right: 'near' } } : value;
        if (!v || (cfg.hudLaneLines !== 'on' && !preview)) { this.hide(); return false; }
        const r = require('./display-config').laneRect(cfg); let l = this.layer;
        if (l && (l.w !== r.w || l.h !== r.h)) { this.client.drop(l.ref); l = this.layer = null; }
        if (!l) { const ref = this.client.image({ target: 'hud', klass: 'overlay', z: 12, x: r.x, y: r.y, w: r.w, h: r.h, iw: r.w, ih: r.h, visible: false }); if (!ref) return false; l = this.layer = { ref, x: r.x, y: r.y, w: r.w, h: r.h, key: null, visible: false }; }
        const key = JSON.stringify([v.left, v.right, v.levels, v.width]);
        if (l.key !== key) { const im = draw(v, r.w, r.h), px = Buffer.alloc(r.w * r.h * 4);
            for (let y = 0; y < Math.min(r.h, im.h); y++) Buffer.from(im.d.buffer, im.d.byteOffset + y * im.w * 4, Math.min(r.w, im.w) * 4).copy(px, y * r.w * 4);
            this.client.pixels(l.ref, null, px); l.key = key; }
        if (l.x !== r.x || l.y !== r.y) { this.client.set(l.ref, { x: r.x, y: r.y }); l.x = r.x; l.y = r.y; }
        if (!l.visible) { this.client.set(l.ref, { visible: true }); l.visible = true; }
        return true;
    }
    hide() { const l = this.layer; if (l && l.visible) { this.client.set(l.ref, { visible: false }); l.visible = false; } }
    close() { if (this.layer) this.client.drop(this.layer.ref); this.layer = null; }
}
module.exports = { LaneLines, LaneOverlay, egoLines, levelOf, draw, HALF_CAR, NEAR_M };
