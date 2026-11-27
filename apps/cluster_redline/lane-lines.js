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
const F = 454, D = 20, EYE = 4.07, HZ = -26, NEAR_D = -3.2, FAR_D = 38, MARK = 0.15, CAR_D = -1.6;
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
    if (v.surface === 'green') {
        // (1.3.85) the lane lit like the user's reference: brighter towards the car (bottom), dim far ahead (top); a warned
        // half in its colour instead (amber, red, cyan)
        const SURF = { ok: [[200, 255, 80], [30, 140, 60]], near: [[255, 200, 70], [180, 80, 10]], over: [[255, 90, 70], [150, 20, 20]], change: [[120, 235, 255], [20, 100, 200]] };
        // painted row by row on the pixels (no bands, no seams): each screen row is one distance ahead
        const c = cv.canvas, k = cv.k, px = c && c.d, mid = (d) => (fl(d) + fr(d)) / 2;
        const sides = [[fl, mid, SURF[lv.left && lv.left !== 'ok' ? lv.left : 'ok']], [mid, fr, SURF[lv.right && lv.right !== 'ok' ? lv.right : 'ok']]];
        const yNear = project(NEAR_D, 0)[1], yFar = project(FAR_D, 0)[1];
        if (px) for (let py = Math.max(0, Math.floor(yFar * k)); py < Math.min(c.h, Math.ceil(yNear * k)); py++) {
            const y = (py + 0.5) / k, d = F * EYE / (y - HZ) - D; if (d < NEAR_D || d > FAR_D) continue;
            const t = (d - NEAR_D) / (FAR_D - NEAR_D), tt = Math.pow(t, 0.6), alpha = (210 - 150 * tt) / 255;
            sides.forEach(([e0, e1, pal]) => {
                const col = [0, 1, 2].map((i) => pal[0][i] + (pal[1][i] - pal[0][i]) * tt);
                let xa = project(d, e0(d))[0] * k, xb = project(d, e1(d))[0] * k; if (xa > xb) { const q = xa; xa = xb; xb = q; }
                for (let x = Math.max(0, Math.floor(xa)); x < Math.min(c.w, Math.ceil(xb)); x++) {
                    const cover = Math.min(x + 1, xb) - Math.max(x, xa), a = alpha * Math.max(0, Math.min(1, cover)); if (a <= 0) continue;
                    const i = (py * c.w + x) * 4, da = px[i + 3] / 255, oa = a + da * (1 - a);
                    for (let ch = 0; ch < 3; ch++) px[i + ch] = Math.round((col[ch] * a + px[i + ch] * da * (1 - a)) / oa);
                    px[i + 3] = Math.round(oa * 255);
                }
            });
        }
    } else { tint(1, lv.left); tint(-1, lv.right); }
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
    // (1.3.87) the car ahead in our lane at its distance (its rear: our front + the gap; camera metres from the windscreen)
    if (v.lead && typeof v.lead.gap === 'number') {
        const L0 = v.lead, art0 = require('./hud-art'), d = Math.min(FAR_D - 2, CAR_D + 4.7 + L0.gap), [lx, ly] = project(d, 0);
        // the road user seen from behind by its class (camera: 2 motorbike, 3 car, 4 truck / bus / van ...), its real width
        const T = { 0: ['pedestrian', 0.55], 1: ['bicycle', 0.6], 2: ['motorbike', 0.8], 4: ['truck', 2.5] }[L0.type] || ['car', 1.85];
        const name = 'veh/' + T[0], sz0 = art0.size(name), fit = Math.min(1, (ly - 2) / (T[1] * F / (d + D) * 0.95 * sz0.h / sz0.w)), lw = T[1] * F / (d + D) * 0.95 * fit, lh = lw * sz0.h / sz0.w;   // a tall one kept inside the picture
        // its colour step as a glow on the road under it (green pulling away)
        const gc = L0.go ? [61, 220, 106] : L0.level === 'red' ? [255, 52, 58] : L0.level === 'amber' ? [255, 154, 31] : [62, 200, 245];
        [[1.5, 30], [1.25, 45], [1.05, 70]].forEach(([k0, a0]) => cv.roundRect(lx - lw * k0 / 2, ly - lh * 0.25 - (k0 - 1) * lw * 0.3, lw * k0, lh * 0.35 + (k0 - 1) * lw * 0.6, lw * 0.25 * k0, gc.concat([a0])));
        art0.paint(cv, name, lx - lw / 2, ly - lh, lw, lh);
        // the numbers in the picture's empty top right corner (the road is narrow there), small
        const col = L0.go ? '#3ddc6a' : L0.level === 'red' ? '#ff343a' : L0.level === 'amber' ? '#ff9a1f' : '#3ec8f5';
        cv.text(Math.round(L0.gap) + ' m', W - 2, 9, 9, '#e6edf5', { font: 'bold', align: 'right', literal: true });
        if (L0.closing) cv.text((L0.closing > 0 ? '+' : '') + Math.round(L0.closing) + ' km/h', W - 2, 17, 6.5, col, { align: 'right', literal: true });
        if (L0.go) { cv.triangle([[lx - 4, ly - lh - 1], [lx + 4, ly - lh - 1], [lx, ly - lh - 6]], '#3ddc6a'); cv.text(require('./strings').tr('Moving off'), 2, 9, 9, '#3ddc6a', { font: 'bold', literal: true }); }
    }
    // (1.3.80) the car cut from the user's reference picture (hud-art.js), its shadow included
    const [, by] = project(CAR_D, 0), cw = 1.9 * F / (CAR_D + D) * 0.66, art = require('./hud-art'), OWN = art.size('veh/own') ? 'veh/own' : 'car', sz = art.size(OWN), ch = cw * sz.h / sz.w;   // (1.3.87) our car: the user's own, seen from behind
    art.paint(cv, OWN, W / 2 - cw / 2, by - ch + 2, cw, ch);
    return cv.canvas;
}
class LaneOverlay {
    constructor(client) { this.client = client; this.layer = null; }
    tick(value, cfg, preview) {
        const surface = cfg.hudLaneSurface === 'green' ? 'green' : 'dark';
        let v = preview ? { left: { y: 1.7, type: 'dashed', color: 'white', margin: 0.75 }, right: { y: -1.05, type: 'solid', color: 'white', margin: 0.1 }, levels: { left: 'ok', right: 'near' }, lead: { gap: 22, level: 'ok', closing: -3, type: 3 } } : value;
        if (!v || (cfg.hudLaneLines !== 'on' && !preview)) { this.hide(); return false; }
        const r = require('./display-config').laneRect(cfg); let l = this.layer;
        if (l && (l.w !== r.w || l.h !== r.h)) { this.client.drop(l.ref); l = this.layer = null; }
        if (!l) { const ref = this.client.image({ target: 'hud', klass: 'overlay', z: 12, x: r.x, y: r.y, w: r.w, h: r.h, iw: r.w, ih: r.h, visible: false }); if (!ref) return false; l = this.layer = { ref, x: r.x, y: r.y, w: r.w, h: r.h, key: null, visible: false }; }
        v = Object.assign({}, v, { surface });
        const ld = v.lead && typeof v.lead.gap === 'number' ? [Math.round(v.lead.gap * 2) / 2, v.lead.level, Math.round(v.lead.closing || 0), v.lead.type, !!v.lead.go] : null;
        const key = JSON.stringify([v.left, v.right, v.levels, v.width, surface, ld]);
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
