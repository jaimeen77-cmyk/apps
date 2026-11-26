'use strict';
// Lane lines on the HUD (1.3.77): the lines either side of the car as the front camera sees them, read through Cluster
// Redline's root helper (native/redline-lead 0.2.0: LaneBoundaries 0xD024, which this app's uid is refused). A small
// picture: the two lines in perspective and the car between them; a line the car comes within 30 cm of turns amber, one
// it is over turns red (not while the turn signal is on towards it: a lane change). Solid, dashed, double; white or
// yellow as the camera reports. Drawn just above the headway badge, at its size (HUD lamps → Lane lines).
const { LeadHelper } = require('./lead-helper');
const HALF_CAR = 0.95, NEAR_M = 0.3, STALE_MS = 1200, W = 112, H = 56;
const TYPES = { 1: 'dashed', 2: 'solid', 3: 'dotted', 4: 'edge', 5: 'double', 6: 'double', 7: 'double', 8: 'double', 9: 'edge' };
/** The lines of the car's own lane: {left, right, width} (each {y, type, color, margin} or null) from the helper's list. */
function egoLines(data) {
    if (!data || !Array.isArray(data.lines)) return null;
    let left = null, right = null;
    data.lines.forEach((l) => {
        if (typeof l.y !== 'number') return;
        if (l.y > 0 && (!left || l.y < left.y)) left = l;
        if (l.y < 0 && (!right || l.y > right.y)) right = l;
    });
    const side = (l, sign) => (l ? { y: l.y, type: TYPES[l.type] || 'solid', color: l.color === 2 ? 'yellow' : 'white', margin: Math.round((sign * l.y - HALF_CAR) * 100) / 100 } : null);
    return { left: side(left, 1), right: side(right, -1), width: typeof data.width === 'number' ? data.width : null };
}
/** A side's state: 'over' (the car on the line), 'near' (within 30 cm), 'ok'; 'change' with the turn signal towards it. */
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
const COLORS = { white: '#e8eef5', yellow: '#ffd23a', near: '#ffa020', over: '#ff3a2a', change: '#5ab0ff' };
// the picture: the road in perspective (the car's axis in the middle, 22 px a metre at the bottom, 7 at the top)
function draw(v, w, h) {
    const { ScaledCanvas } = require('./kit/canvas'); const cv = new ScaledCanvas(W, H, Math.min((w || W) / W, (h || H) / H)); cv.clear([0, 0, 0, 0]);
    const cx = W / 2, X = (y, t) => cx - y * (22 - 15 * t), yy = (t) => H - 4 - t * (H - 10);
    const line = (s, lvl) => {
        if (!s) return;
        const c = lvl && lvl !== 'ok' ? COLORS[lvl] : COLORS[s.color] || COLORS.white, wd = lvl === 'over' ? 4 : 3;
        const seg = (t0, t1, off) => cv.line(X(s.y + off, t0), yy(t0), X(s.y + off, t1), yy(t1), wd * (1 - 0.5 * t0), c);
        const offs = s.type === 'double' ? [-0.12, 0.12] : [0];
        offs.forEach((off) => {
            if (s.type === 'dashed' || s.type === 'dotted') for (let t = 0; t < 1; t += 0.25) seg(t, t + (s.type === 'dotted' ? 0.06 : 0.14), off);
            else seg(0, 1, off);
        });
    };
    line(v.left, v.levels.left); line(v.right, v.levels.right);
    // the car: a small outline at the bottom, between the lines
    const cw = HALF_CAR * 22 * 2 * 0.7; cv.roundRect(cx - cw / 2, H - 16, cw, 12, 3, [220, 230, 240, 200]);
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
        const key = JSON.stringify([v.left, v.right, v.levels]);
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
