'use strict';
// Cut-in and pedestrian / cyclist warnings on the HUD lane picture (1.3.100), from the front camera's objects and lane
// lines the lead-car helper sends (redline-lead 0.3.0+: cam.objects [{id, type, x m ahead, y m left}], lane.data.lines
// [{y, angle (degrees)}]). The rules come from the user's 32 recorded scenes (1.3.89 scene clips, 2026-11-27, city
// driving), worked out in another session: on those they warn once, at the one real cut-in (35 m ahead, about 1 s before
// that car reached the middle of our lane), and never at cars crossing at junctions, cars overtaking us, or the sideways
// drift a bend or our own lane change gives cars far ahead. Cases it should warn at but does not could not be checked
// (there was only that one).
//
// Cut-in (a vehicle: type 2-5): we at 20 km/h or more; it 3-35 m ahead; it drove beside us in the next lane (2.0-4.5 m to
// the side, its own speed over 3 m/s, moving sideways less than a quarter of that) for at least 1 s (remembered 1.5 s
// after it leaves that band), now coming in at 0.5-2.5 m/s, |y| - inward x 1.5 s under 1.2 m, |y| under 3.2 m, not
// pulling away (relative speed ahead at most +1 m/s). A bend: y less x tan(lane angle), the angle the median of the last
// 0.4 s of both nearest lines' mean (only when they agree within 2 degrees; 0 after 0.8 s without). Our own lane change
// (any line within 0.6 m of the car): nothing for 2 s.
// Pedestrian / cyclist (type 0 / 1): we at 5 km/h or more; it 0-30 m ahead; reached within 2.5 s (x / our speed), where
// it would be then (or is now) within 1.3 m of the car's axis.
// One object warns again only after 3 s. A warning stays up to 2.5 s, following the object while it is seen.
const VEH = [2, 3, 4, 5], VRU = [0, 1];
const P = { cutV: 20, cutX: 35, cutGx: 3, cutLat: 0.5, cutTt: 1.5, sideMs: 1000, away: 1.0, vruV: 5, vruX: 30, vruTtc: 2.5 };
const HIST_MS = 1500, SIDE_KEEP_MS = 1500, ONLINE_MS = 2000, AGAIN_MS = 3000, SHOW_MS = 2500;
const median = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
class RoadAlerts {
    constructor(params) { this.p = Object.assign({}, P, params || {}); this.reset(); }
    reset() { this.hist = new Map(); this.side = new Map(); this.angs = []; this.online = -Infinity; this.last = new Map(); this.shown = null; this.frameAt = null; this.fired = 0; }
    /** One camera frame: t (ms), speed (km/h), objects [{id, type, x, y}], lines [{y, angle}]. The new warning or null. */
    frame(t, speed, objects, lines) {
        const p = this.p, v = (speed || 0) / 3.6, ls = Array.isArray(lines) ? lines : [];
        if (ls.some((l) => typeof l.y === 'number' && Math.abs(l.y) < 0.6)) this.online = t;
        const lft = ls.filter((l) => l.y > 0 && l.y < 3), rgt = ls.filter((l) => l.y < 0 && l.y > -3);
        if (lft.length && rgt.length) {
            const a1 = lft.reduce((a, b) => (b.y < a.y ? b : a)).angle, a2 = rgt.reduce((a, b) => (b.y > a.y ? b : a)).angle;
            if (typeof a1 === 'number' && typeof a2 === 'number' && Math.abs(a1 - a2) < 2 && Math.abs(a1 + a2) / 2 < 8) this.angs.push([t, (a1 + a2) / 2]);
        }
        while (this.angs.length && t - this.angs[0][0] > 400) this.angs.shift();
        const tn = this.angs.length && t - this.angs[this.angs.length - 1][0] < 800 ? Math.tan(median(this.angs.map((a) => a[1])) * Math.PI / 180) : 0;
        const st = new Map(), seen = new Set();
        (objects || []).forEach((o) => {
            if (!o || typeof o.x !== 'number' || typeof o.y !== 'number') return;
            const y = o.y - o.x * tn; seen.add(o.id);
            let h = this.hist.get(o.id); if (!h) this.hist.set(o.id, h = []);
            h.push([t, o.x, y, o.type]); while (h.length && t - h[0][0] > HIST_MS) h.shift();
            if (h.length >= 5 && t - h[0][0] >= 800) { const dt = (h[h.length - 1][0] - h[0][0]) / 1000; st.set(o.id, { vx: (h[h.length - 1][1] - h[0][1]) / dt, vy: (h[h.length - 1][2] - h[0][2]) / dt, type: o.type, x: o.x, y, y0: h[0][2] }); }
        });
        for (const id of Array.from(this.hist.keys())) if (!seen.has(id) && t - this.hist.get(id)[this.hist.get(id).length - 1][0] > HIST_MS) this.hist.delete(id);
        st.forEach((s, id) => {
            const par = Math.abs(s.y) >= 2.0 && Math.abs(s.y) <= 4.5 && v + s.vx > 3 && Math.abs(s.vy) < 0.25 * (v + s.vx);
            if (par) { const w = this.side.get(id) || [t, t]; w[1] = t; this.side.set(id, w); } else if (this.side.has(id) && t - this.side.get(id)[1] > SIDE_KEEP_MS) this.side.delete(id);
        });
        let hit = null;
        st.forEach((s, id) => {
            const gx = v + s.vx, ay = Math.abs(s.y), ay0 = Math.abs(s.y0), inward = s.y > 0 ? -s.vy : s.vy, w = this.side.get(id);
            let kind = null;
            if (VEH.indexOf(s.type) >= 0 && t - this.online > ONLINE_MS && v * 3.6 >= p.cutV && s.x >= 3 && s.x <= p.cutX && gx > p.cutGx && Math.abs(s.vy) < 0.3 * gx
                && w && w[1] - w[0] >= p.sideMs && ay < ay0 && inward >= p.cutLat && inward <= 2.5 && ay - inward * p.cutTt < 1.2 && ay < 3.2 && s.vx <= p.away) kind = 'cutin';
            if (VRU.indexOf(s.type) >= 0 && v * 3.6 >= p.vruV && s.x > 0 && s.x <= p.vruX) {
                const ttc = s.x / Math.max(v, 0.5), ypred = s.y + s.vy * ttc;
                if (ttc <= p.vruTtc && (Math.abs(ypred) < 1.3 || ay < 1.3)) kind = 'vru';
            }
            if (kind && t - (this.last.get(kind + id) || -Infinity) > AGAIN_MS && (!hit || s.x < hit.x)) hit = { kind, id, type: s.type, x: s.x, y: s.y, vy: s.vy };
        });
        if (hit) { this.last.set(hit.kind + hit.id, t); this.shown = Object.assign({ at: t }, hit); this.fired++; }
        // the shown warning follows its object while seen, for up to 2.5 s
        if (this.shown) {
            const s = st.get(this.shown.id);
            if (t - this.shown.at > SHOW_MS || (!s && !seen.has(this.shown.id))) this.shown = null;
            else if (s) { this.shown.x = s.x; this.shown.y = s.y; }
        }
        return hit;
    }
    /** From the helper's message: a new camera instant is one frame. */
    fromHelper(m, speed) {
        const c = m && m.cam; if (!c || !Array.isArray(c.objects) || typeof c.at !== 'number' || c.at === this.frameAt) return;
        this.frameAt = c.at; const lines = m.lane && m.lane.data && Array.isArray(m.lane.data.lines) ? m.lane.data.lines : [];
        return this.frame(c.at, speed, c.objects, lines);
    }
    /** For the lane picture: {type, x, y, dir, level, label, kind} or null. */
    view(now) {
        const s = this.shown; if (!s) return null;
        const cut = s.kind === 'cutin', level = !cut || Math.abs(s.y) < 1.6 ? 'red' : 'amber';
        const label = cut ? 'Cut-in' : s.type === 0 ? 'Pedestrian' : 'Cyclist';
        return { kind: s.kind, type: s.type, x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, dir: s.y > 0 ? -1 : 1, level, label };
    }
    status() { return { fired: this.fired, tracked: this.hist.size, shown: this.shown ? this.shown.kind : null }; }
}
module.exports = { RoadAlerts, P };
