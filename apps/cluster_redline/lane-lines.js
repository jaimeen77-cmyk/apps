'use strict';
// Lane lines on the HUD (1.3.77): the lines either side of the car as the front camera sees them, read through Cluster
// Redline's root helper (native/redline-lead 0.2.0: LaneBoundaries 0xD024, which this app's uid is refused). A small
// picture: the two lines in perspective and the car between them; a line the car comes within 15 cm of turns amber, one
// it is over turns red (not while the turn signal is on towards it: a lane change). Solid, dashed, double; white or
// yellow as the camera reports. Drawn just above the headway badge, at its size (HUD lamps → Lane lines).
const { LeadHelper } = require('./lead-helper');
// NEAR_M 0.15 (1.3.78): with 0.3 a car 30 cm off a 3 m lane's centre was already amber (the user's capture)
const HALF_CAR = 0.95, NEAR_M = 0.15, STALE_MS = 1200, W = 112, H = 84;
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
const COLORS = { white: [232, 238, 246, 255], yellow: [255, 206, 58, 255], near: [255, 158, 40, 255], over: [255, 52, 44, 255], change: [56, 214, 255, 255] };
// The picture (1.3.79, as the user's reference): a dark road in perspective with a faint grid near the car, the lines
// glowing in their colour, the car seen from behind in the middle. A warning colours both lines (amber near, red over)
// and tints the half of the lane on its side; red also glows under the car; with the turn signal (a lane change) only
// that side's line turns cyan. A point d metres ahead of the car and y metres to its left: x = cx - F y / (d + D),
// y = HZ + F EYE / (d + D). The lines are 15 cm (a double line two of 12 cm), dashes 3 m on and 5 m off.
const F = 454, D = 20, EYE = 4.07, HZ = -26, NEAR_D = -3.2, FAR_D = 38, MARK = 0.15, CAR_D = 1.5;
function project(d, y) { const q = d + D; return [W / 2 - F * y / q, HZ + F * EYE / q]; }
const px2m = (px, d) => px * (d + D) / F;
function draw(v, w, h) {
    const { ScaledCanvas } = require('./kit/canvas');
    const cv = new ScaledCanvas(W, H, Math.min((w || W) / W, (h || H) / H)); cv.clear([0, 0, 0, 0]);
    const yAt = (s, d) => s.y + (s.slope || 0) * d;
    const strip = (fy0, fy1, d0, d1, c) => {
        const n = Math.max(2, Math.ceil((d1 - d0) / 2)), a = [], b = [];
        for (let i = 0; i <= n; i++) { const d = d0 + (d1 - d0) * i / n; a.push(project(d, fy0(d))); b.unshift(project(d, fy1(d))); }
        cv.fill(a.concat(b), c);
    };
    const L = v.left, R = v.right, lw = typeof v.width === 'number' && v.width > 2 && v.width < 5 ? v.width : 3.3;
    const fl = L ? (d) => yAt(L, d) : (d) => yAt(R, d) + lw, fr = R ? (d) => yAt(R, d) : (d) => yAt(L, d) - lw;
    const lv = v.levels || {}, worst = ['over', 'near'].find((x) => lv.left === x || lv.right === x) || null;
    // the road: dark, a little beyond the lines, lighter near the car; the grid
    strip((d) => fl(d) + 0.45, (d) => fr(d) - 0.45, NEAR_D, FAR_D, [20, 24, 30, 230]);
    strip((d) => fl(d) + 0.45, (d) => fr(d) - 0.45, NEAR_D, 8, [36, 41, 49, 120]);
    for (let d = -3; d <= 9; d += 2) strip((x) => fl(x) + 0.5, (x) => fr(x) - 0.5, d, d + px2m(0.5, d) * 0.6, [120, 140, 160, 34]);
    for (let k = 1; k < 5; k++) { const t = k / 5; strip((d) => fl(d) + (fr(d) - fl(d)) * t + px2m(0.25, d), (d) => fl(d) + (fr(d) - fl(d)) * t - px2m(0.25, d), NEAR_D, 9, [120, 140, 160, 26]); }
    // the warned half of the lane: from the middle to the line, in the warning's colour
    const tint = (side, lvl) => { if (!lvl || lvl === 'ok') return; const c = COLORS[lvl], a = lvl === 'over' ? 92 : lvl === 'near' ? 78 : 46, mid = (d) => (fl(d) + fr(d)) / 2;
        strip(side > 0 ? fl : mid, side > 0 ? mid : fr, NEAR_D, FAR_D, [c[0], c[1], c[2], a]); };
    tint(1, lv.left); tint(-1, lv.right);
    if (worst === 'over') { const c = COLORS.over; [[1.15, 26], [0.85, 32], [0.55, 40]].forEach(([wd, a]) => strip(() => wd, () => -wd, NEAR_D, CAR_D + 0.6, [c[0], c[1], c[2], a])); }
    // the lines: a soft glow under each painted line
    const mark = (s, lvl) => {
        if (!s) return;
        const c = worst ? COLORS[worst] : lvl === 'change' ? COLORS.change : COLORS[s.color] || COLORS.white;
        const edges = s.type === 'double' ? [[-0.2, -0.07], [0.07, 0.2]] : s.type === 'edge' ? [[-0.1, 0.1]] : [[-MARK / 2, MARK / 2]];
        const pieces = s.type === 'dashed' || s.type === 'dotted' ? (() => { const out = [], on = s.type === 'dotted' ? 0.8 : 3, per = s.type === 'dotted' ? 2.4 : 8; for (let d = NEAR_D - 1; d < FAR_D; d += per) out.push([Math.max(NEAR_D, d), Math.min(FAR_D, d + on)]); return out; })() : [[NEAR_D, FAR_D]];
        [[3.2, 38], [1.6, 80], [0, 255]].forEach(([pad, a]) => edges.forEach(([e0, e1]) => pieces.forEach(([d0, d1]) => {
            if (d1 <= d0) return;
            strip((d) => yAt(s, d) + e1 + px2m(pad, d) + px2m(0.35, d), (d) => yAt(s, d) + e0 - px2m(pad, d) - px2m(0.35, d), d0, d1, [c[0], c[1], c[2], a === 255 ? c[3] : a]);
        })));
    };
    mark(L, lv.left); mark(R, lv.right);
    // the car in the middle, over the lines (a line it is on goes under it)
    // (1.3.80) the car cut from the user's reference picture (hud-art.js), its shadow included
    const [, by] = project(CAR_D, 0), cw = 1.9 * F / (CAR_D + D) * 0.86, art = require('./hud-art'), sz = art.size('car'), ch = cw * sz.h / sz.w;
    art.paint(cv, 'car', W / 2 - cw / 2, by - ch + 2, cw, ch);
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
