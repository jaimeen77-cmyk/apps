'use strict';
// The 0-100 screen's picture (1.3.105, after the user's reference): the speed large, slanted and glowing, km/h under it;
// ACCEL and the longitudinal acceleration in g over a bevelled bar (cyan into lime, 0-1 g); "0–100" and the time
// large in cyan (counting while running, kept when done; green with BEST when it is a new best); the best time small.
// No ground: dark is see-through on the HUD glass. Drawn at the final size (a 480 x 320 design scaled), the letters
// widened and thickened from the app's faces to look like a wide sports face, with a soft glow (a blurred copy).
// (the canvas loaded when drawing: the module's key and sample work without the kit)
const DW = 480, DH = 320;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function painter(w, h) {
    const { Canvas } = require('./kit/canvas');
    const cv = new Canvas(w, h); cv.clear([0, 0, 0, 0]);
    const k = Math.min(w / DW, h / DH), ox = (w - DW * k) / 2, oy = (h - DH * k) / 2, px = cv.d;
    const X = (x) => ox + x * k, Y = (y) => oy + y * k;
    function blend(x, y, c, a) {
        if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
        const i = (y * w + x) * 4, da = px[i + 3] / 255, oa = a + da * (1 - a);
        for (let n = 0; n < 3; n++) px[i + n] = Math.round((c[n] * a + px[i + n] * da * (1 - a)) / oa);
        px[i + 3] = Math.round(oa * 255);
    }
    function blur(A, mw, mh, r) {
        let a = A;
        for (let pass = 0; pass < 2; pass++) {
            const b = new Float32Array(mw * mh), c = new Float32Array(mw * mh);
            for (let y = 0; y < mh; y++) { let s = 0; for (let x = -r; x <= r; x++) s += x >= 0 && x < mw ? a[y * mw + x] : 0; for (let x = 0; x < mw; x++) { b[y * mw + x] = s / (2 * r + 1); if (x - r >= 0) s -= a[y * mw + x - r]; if (x + r + 1 < mw) s += a[y * mw + x + r + 1]; } }
            for (let x = 0; x < mw; x++) { let s = 0; for (let y = -r; y <= r; y++) s += y >= 0 && y < mh ? b[y * mw + x] : 0; for (let y = 0; y < mh; y++) { c[y * mw + x] = s / (2 * r + 1); if (y - r >= 0) s -= b[(y - r) * mw + x]; if (y + r + 1 < mh) s += b[(y + r + 1) * mw + x]; } }
            a = c;
        }
        return a;
    }
    // text: o {font, align, sx (wider), th (thicker, design px), shear (slant), glow (colour), glowA}; returns its width (design px)
    function text(t, x, y, size, col, o) {
        o = o || {}; const s = size * k, font = o.font || 'bold';
        const m = new Canvas(Math.ceil(s * t.length * 0.9 + s), Math.ceil(s * 1.6)); m.clear([0, 0, 0, 0]);
        const tw = m.textWidth(t, s, { font, literal: true }), mx = Math.round(s * 0.3), base = Math.round(s * 1.15);
        m.text(t, mx, base, s, '#ffffff', { font, literal: true });
        const sx = o.sx || 1, th = Math.max(0, Math.round((o.th || 0) * k)), mw = Math.ceil(m.w * sx), mh = m.h, A = new Float32Array(mw * mh);
        for (let yy = 0; yy < mh; yy++) for (let xx = 0; xx < mw; xx++) {
            let v = 0;
            for (let dy = -th; dy <= th; dy++) for (let dx = -th; dx <= th; dx++) { const qx = Math.floor((xx + dx) / sx), qy = yy + dy; if (qx >= 0 && qy >= 0 && qx < m.w && qy < mh) { const q = m.d[(qy * m.w + qx) * 4 + 3]; if (q > v) v = q; } }
            A[yy * mw + xx] = v / 255;
        }
        const tw2 = tw * sx, ax = o.align === 'center' ? X(x) - tw2 / 2 : o.align === 'right' ? X(x) - tw2 : X(x), sh = o.shear === undefined ? 0.2 : o.shear;
        const place = (fn) => { for (let yy = 0; yy < mh; yy++) { const d = Math.round((base - yy) * sh); for (let xx = 0; xx < mw; xx++) fn(yy * mw + xx, Math.round(ax - mx * sx + xx + d), Math.round(Y(y) - base + yy)); } };
        if (o.glow) { const G = blur(A, mw, mh, Math.max(1, Math.round((o.glowR || 6) * k))), gc = rgb(o.glow), ga = o.glowA || 0.7; place((i, gx, gy) => { const a = Math.min(1, G[i] * 1.8) * ga; if (a > 0.01) blend(gx, gy, gc, a); }); }
        const c = rgb(col); place((i, gx, gy) => { if (A[i] > 0) blend(gx, gy, c, A[i]); });
        return tw2 / k;
    }
    function line(pts, col, wid) { const c = rgb(col), P = pts.map((p) => [X(p[0]), Y(p[1])]); [[4, 0.12], [2.2, 0.28]].forEach(([m, a]) => cv.polyline(P, wid * m * k, c.concat([Math.round(a * 255)]))); cv.polyline(P, Math.max(1, wid * k), col); }
    return { cv, k, X, Y, text, line, blend };
}
/** v: {speed (km/h or null), g (longitudinal, or null), time (s or null), state ('ready' | 'run' | 'done'), best, newBest} */
function drawSized(v, w, h) {
    const P = painter(w, h), { cv, X, Y, text, line } = P;
    const speed = typeof v.speed === 'number' ? String(Math.max(0, Math.round(v.speed))) : '--';
    text(speed, 244, 116, 104, '#ffffff', { font: 'num', align: 'center', sx: 1.45, th: 2.4, shear: 0.24, glow: '#bfefff', glowA: 0.45, glowR: 5 });
    text('km/h', 246, 146, 21, '#bfc6cf', { align: 'center', sx: 1.3, th: 0.4 });
    // the acceleration and its bar (0-1 g)
    const g = typeof v.g === 'number' ? v.g : null;
    text('ACCEL', 232, 176, 14, '#d9dde3', { align: 'right', sx: 1.35, th: 0.3 });
    text(g === null ? '-.-- g' : g.toFixed(2) + ' g', 242, 176, 15, '#2fe6ff', { sx: 1.35, th: 0.3, glow: '#16d9ff', glowA: 0.6, glowR: 3 });
    const x0 = 22, x1 = 458, y0 = 184, y1 = 204, sl = 9, fr = g === null ? 0 : Math.max(0, Math.min(1, g / 1.0));
    cv.fill([[X(x0 + sl), Y(y0)], [X(x1 - sl), Y(y0)], [X(x1), Y((y0 + y1) / 2)], [X(x1 - sl), Y(y1)], [X(x0 + sl), Y(y1)], [X(x0), Y((y0 + y1) / 2)]], [10, 22, 28, 220]);
    if (fr > 0) {
        const fx0 = X(x0 + 6), fx1 = X(x0 + 6 + (x1 - x0 - 12) * fr), ya = Y(y0 + 4), yb = Y(y1 - 4);
        for (let x = Math.floor(fx0); x < fx1; x++) {
            const t = (x - fx0) / Math.max(1, X(x1 - 6) - fx0), q = Math.max(0, (t - 0.4) / 0.6), c = t < 0.4 ? [0, 230, 255] : [Math.round(180 * q), Math.round(230 + 25 * q), Math.round(255 - 235 * q)];
            for (let y = Math.floor(ya); y < yb; y++) P.blend(x, y, c, 0.95);
        }
    }
    line([[x0 + sl, y0], [x1 - sl, y0], [x1, (y0 + y1) / 2], [x1 - sl, y1], [x0 + sl, y1], [x0, (y0 + y1) / 2], [x0 + sl, y0]], '#22d8f0', 1.1);
    // 0-100 and the time
    const done = v.state === 'done', best = done && v.newBest, col = best ? '#3ddc6a' : v.state === 'ready' && typeof v.time !== 'number' ? '#6f7c8a' : '#18e8ff', glow = best ? '#22c55e' : '#00c8ff';
    line([[96, 232], [196, 229]], '#22d8f0', 0.8); line([[284, 229], [384, 232]], '#22d8f0', 0.8);
    text('0–100', 240, 236, 15, '#2fe6ff', { align: 'center', sx: 1.3, th: 0.3, shear: 0.15 });
    const t = typeof v.time === 'number' ? v.time.toFixed(2) : '-.--', tw = text(t, 226, 296, 60, col, { font: 'num', align: 'center', sx: 1.4, th: 1.6, shear: 0.22, glow, glowA: 0.6, glowR: 4 });
    text('s', 226 + tw / 2 + 6, 296, 34, col, { sx: 1.35, th: 0.8, shear: 0.22 });
    if (best) text('NEW BEST', 470, 316, 12, '#3ddc6a', { align: 'right', sx: 1.25, th: 0.3, shear: 0.15 });
    else if (typeof v.best === 'number') text('BEST ' + v.best.toFixed(2), 470, 316, 11, '#8d97a4', { align: 'right', sx: 1.2, shear: 0.15 });
    return cv;
}
// the key of what is drawn (a new picture only when it changes): the speed, g to 0.02, the time to 0.1 s while running
// (at most 10 pictures a second)
function key(v) { return v ? JSON.stringify([typeof v.speed === 'number' ? Math.round(v.speed) : null, typeof v.g === 'number' ? Math.round(v.g * 50) : null, typeof v.time === 'number' ? (v.state === 'run' ? Math.round(v.time * 10) : v.time) : null, v.state, v.best, v.newBest]) : ''; }
const SAMPLE = { speed: 87, g: 0.78, time: 4.82, state: 'done', best: 4.82, newBest: false };
module.exports = { drawSized, key, SAMPLE, DW, DH };
