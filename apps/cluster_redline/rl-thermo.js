'use strict';
// A thermometer for temperature readouts (oil, outside) in gauge mode: a glass bulb and tube with a bright rim,
// a glint along the glass, small ticks, and liquid in the layout's colour: solid in the bulb and up to the value,
// faint from there to the top of the scale. Horizontal (bulb on the left) or upright (bulb at the bottom).
// thermo(cv, x, y, len, th, frac, col, o): (x, y) is the outer end of the bulb (left end, or bottom end when
// o.vertical), on the tube's centre line; len the whole length; th the tube's thickness.
// o.glass rim colour, o.look 'outline' (Vector arcade: see-through liquid), o.ticks false to leave the ticks out.
const { withAlpha } = require('./kit/canvas');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function thermo(cv, x, y, len, th, frac, col, o) {
    o = o || {};
    const v = !!o.vertical, R = th * 1.2, rim = Math.max(1.4, th * 0.2), glass = o.glass || [215, 225, 235, 230];
    const f = clamp(frac, 0, 1), see = o.look === 'outline';
    // positions along the tube: 0 at the bulb's centre, the tube from there to len - R
    const P = (t, n) => (v ? [x + n, y - R - t] : [x + R + t, y + n]);
    const run = len - 2 * R, half = th / 2;
    const rect = (t0, t1, hw, c) => {
        if (t1 <= t0) return;
        if (v) { const [px, py] = P(t1, -hw); cv.fillRect(px, py, 2 * hw, t1 - t0, c); }
        else { const [px, py] = P(t0, -hw); cv.fillRect(px, py, t1 - t0, 2 * hw, c); }
    };
    const dot = (t, r, c) => { const [px, py] = P(t, 0); cv.circle(px, py, r, c); };
    // the glass: rim, then the dark inside
    dot(0, R + rim, glass); rect(0, run + R * 0.2, half + rim, glass); dot(run + R * 0.2, half + rim, glass);
    const inside = [10, 12, 16, 255];
    dot(0, R, inside); rect(0, run + R * 0.2, half, inside); dot(run + R * 0.2, half, inside);
    // the liquid: faint to the top, solid to the value, the bulb full
    const lw = half * 0.62, top = run, at = R * 0.6 + (top - R * 0.6) * f, solid = see ? withAlpha(col, 0.55) : col;
    rect(R * 0.5, top, lw, withAlpha(col, 0.22)); dot(top, lw, withAlpha(col, 0.22));
    dot(0, R - rim * 0.9, solid); rect(R * 0.5, at, lw, solid); if (f > 0) dot(at, lw, solid);
    // a glint on the glass: a thin light line along the tube and a spot on the bulb
    const g = withAlpha([255, 255, 255], 0.35);
    if (v) cv.fillRect(x - half + rim * 0.4, y - R - top, Math.max(1, th * 0.12), top - R * 0.6, g);
    else cv.fillRect(x + R * 1.6, y - half + rim * 0.4, top - R * 0.6, Math.max(1, th * 0.12), g);
    cv.circle(v ? x - R * 0.35 : x + R * 0.65, v ? y - R * 1.35 : y - R * 0.35, Math.max(1, R * 0.22), withAlpha([255, 255, 255], 0.45));
    // ticks beside the tube: ten steps, longer at the middle and the ends
    if (o.ticks !== false) for (let k = 0; k <= 10; k++) {
        const t = R * 0.6 + (top - R * 0.6) * k / 10, l = k % 5 ? th * 0.35 : th * 0.7, w = Math.max(1, th * 0.12);
        if (v) cv.fillRect(x + half + rim + 2, y - R - t - w / 2, l, w, glass);
        else cv.fillRect(x + R + t - w / 2, y + half + rim + 2, w, l, glass);
    }
}
module.exports = { thermo };
