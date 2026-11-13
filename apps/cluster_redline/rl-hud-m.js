'use strict';
// From jaimeen77-cmyk/appsKOR apps/redline/hud-m.js at 9cd5badd6c7a8bb23086a8414c7ad2782a5bc9e2
// (cauliflowermossgrape/idrive7-apps Redline; HUD output by @biscotit), MIT License: see NOTICE.
// Local changes: module paths, a fallback when the kit has no fonts.has(); the ramp (G80) is redrawn after
// the car's own cluster (Cluster Redline 1.2.31, see drawRamp).
/**
 * Part of Redline's experimental features; README.md in this folder has the whole picture.
 *
 * The layouts after BMW M's own head-up displays (setting "hudStyle"), drawn by hud-draw.js's drawLayer()
 * for these styles. Their colours are the originals' (they take no palette); the readouts, the shift grade
 * and its burst, the peak, the downshift arrows and the limiter flash work as in the other layouts.
 * Draws on canvas.js Canvas (or hud-draw's scaled()); arc() angles are degrees clockwise from 12 o'clock.
 *   arc   after F80/F82 M3/M4 (2014-20): 8 curved lights (6 amber, 2 red) over a curved band, gear under it
 *   ramp  after G80/G82 M3/M4 (2021+): the band climbs from bottom left then runs flat; its fields turn
 *         yellow, then red, towards the shift; 0-8 scale; gear over a line, a readout under it
 *   dial  after E60 M5 (2005-10): a 3/4 dial round the gear, green / orange advance warning / red,
 *         a readout bottom right in the dial's orange-red
 */
const { withAlpha } = require('./kit/canvas');
const IW = 400;
const isNum = (x) => typeof x === 'number' && isFinite(x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const flashing = (cue) => cue.shift || cue.limiter;
// f.only (Cluster Redline): one element at a time; readouts readA..readD are items 0..3. No f.only: all.
const wants = (f) => (part) => !f.only || f.only === part;

/* ---------- shared: readouts, the shift grade, the burst ---------- */
const GRADE = { 'SPOT ON': 'low', EARLY: 'mid', LATE: 'high', LIMITER: 'limit', 'COLD REV': 'cold', KNOCK: 'limit' };
/** A chip's colour: its own tone (the launch time), else its grade's. */
const chipCol = (chip, P) => P[chip.tone || GRADE[chip.verdict]] || P.text;
const toneCol = (it, P, base) => (it.tone && it.tone !== 'text' ? P[it.tone] || base : base);
/**
 * A readout's label size and colour: Normal 13 px nearly full brightness, Clearer 16 px full (10 / 12 px
 * read as specks on the glass, 2026-11-09 drive).
 */
const labelOf = (o, base) => (o.clearLabels ? { s: 16, c: base } : { s: 13, c: withAlpha(base, 0.9) });
/** A label at (x, y), made smaller (down to 8 px) when it would be wider than room. */
function fitLabel(cv, text, x, y, size, col, room, opts) {
    const lo = Object.assign({ font: 'bold', spacing: 1 }, opts || {});
    let s = size;
    if (cv.textWidth && room) { const w = cv.textWidth(text, s, lo); if (w > room) s = Math.max(8, s * room / w); }
    cv.text(text, x, y, s, col, lo);
}
/** A small readout: label then value on one line (row) or label over value (stack); align 'left' | 'right' | 'center'. */
function small(cv, x, y, it, P, o, base, mode, align, vsize) {
    const vs = vsize || 19;
    const lab = labelOf(o, base);
    if (mode === 'row') {
        // label at x, value right-aligned at the row's right edge (x + w); a label too long for the room the
        // value leaves (GEARBOX 120°, BOOST in kPa) is drawn smaller, down to 7 px, rather than run into it
        const w = align, lo = { font: 'bold', spacing: 1 };
        let ls = lab.s;
        if (cv.textWidth) {
            const room = w - cv.textWidth(it.value, vs, { font: 'bold' }) - 4, lw = cv.textWidth(it.label, ls, lo);
            if (lw > room) ls = Math.max(8, ls * room / lw);
        }
        cv.text(it.label, x, y, ls, lab.c, lo);
        cv.text(it.value, x + w, y + 1, vs, toneCol(it, P, base), { align: 'right', font: 'bold' });
        return;
    }
    cv.text(it.label, x, y, lab.s, lab.c, { align: align, font: 'bold', spacing: 1 });
    cv.text(it.value, x, y + 21, 20, toneCol(it, P, base), { align: align, font: 'bold' });
}
/** The shift grade at (x, y): pops in (burst), holds, fades over its last 300 ms. */
function grade(cv, x, y, chip, P, size, align) {
    const a = chip.age || 0, c = chipCol(chip, P);
    const alpha = a > 1200 ? clamp(1 - (a - 1200) / 300, 0, 1) : 1;
    const s = chip.burst && a < 150 ? size * (1.3 - 0.3 * a / 150) : size;
    if (alpha > 0) cv.text(chip.text || chip.verdict, x, y, s, withAlpha(c, alpha), { align: align || 'center', font: 'bold', spacing: 1 });
}
/** Burst: a ring grows from (cx, cy) radius r0 to r1 over 500 ms and fades. */
function ring(cv, cx, cy, r0, r1, chip, P) {
    const a = chip.age || 0;
    if (!chip.burst || a >= 500) return;
    const k = a / 500, r = r0 + (r1 - r0) * k;
    cv.arc(cx, cy, r - 2.5, r, 0, 360, withAlpha(chipCol(chip, P), 0.85 * (1 - k)));
}
const burstOn = (chip, ms) => chip && chip.burst && (chip.age || 0) < ms;
/**
 * The band layouts' shift colours follow the app's "Shift light style" as the other layouts' lights do:
 * M (the originals' own colours: own() false), Race (green / red / blue) or one colour. With the HUD's
 * shift lights Off they don't count in or flash for the shift; the limiter still flashes.
 */
const ownColours = (o) => o.lightStyle === 'f1' || o.lightStyle === 'mono';
const flashOn = (o, cue) => cue.limiter || (o.lights && cue.shift);
const flashColour = (o, cue, h, red) => (!cue.limiter && o.lightStyle === 'f1' ? h.RACE_BLUE : red);   // as drawLights: Race blue, else red

/* ---------- arc (F80) ---------- */
const A = { cx: 200, cy: 372, span: 27, l0: 352, l1: 368, b0: 325, b1: 343, rim: 3 };
const AC = { amber: '#f2a81d', red: '#e3262a', rim: '#f4f4f4', fill: '#bcd6e8', unlit: '#5d6b74', warn: '#f2b81d', zone: '#e3262a' };
const aAng = (f) => -A.span + 2 * A.span * clamp(f, 0, 1);
const aPt = (a, r) => [A.cx + r * Math.sin(a * Math.PI / 180), A.cy - r * Math.cos(a * Math.PI / 180)];
function cbox(cv, cx, cy, a0, a1, r0, r1, c, w) {
    if (!w) { cv.arc(cx, cy, r0, r1, a0, a1, c); return; }
    const da = (w / r1) * 180 / Math.PI;
    cv.arc(cx, cy, r1 - w, r1, a0, a1, c); cv.arc(cx, cy, r0, r0 + w, a0, a1, c);
    cv.arc(cx, cy, r0, r1, a0, a0 + da, c); cv.arc(cx, cy, r0, r1, a1 - da, a1, c);
}
function drawArc(cv, f, layer, h) {
    const o = f.opts, d = f.d, cue = f.cue, bg = layer !== 'fg', fg = layer !== 'bg', R = (r) => aAng(r / f.max), want = wants(f);
    if (o.lights && want('alert')) {
        const n = 8, gap = 1.3, step = 2 * A.span / n, fl = flashing(cue);
        // "Shift light style": M is the F80's own amber and red; Race and one colour as the app's lights
        const own = o.lightStyle === 'f1' || o.lightStyle === 'mono';
        const flashCol = cue.limiter ? AC.red : o.lightStyle === 'f1' ? h.RACE_BLUE : AC.red;
        const lit = fl ? n : Math.ceil((isNum(d.rpm) ? clamp((d.rpm - cue.from) / (cue.at - cue.from), 0, 1) : 0) * (n - 1));
        for (let i = 0; i < n; i++) {
            const a0 = -A.span + i * step + gap / 2, a1 = a0 + step - gap, col = own ? h.lightCol(o.lightStyle, h.P, i / (n - 1)) : i >= n - 2 ? AC.red : AC.amber;
            if (bg && o.dim) cbox(cv, A.cx, A.cy, a0, a1, A.l0, A.l1, withAlpha(col, 0.85), 1.6);
            if (fg && i < lit && (!fl || f.blink)) cbox(cv, A.cx, A.cy, a0, a1, A.l0, A.l1, fl ? flashCol : col, 0);
        }
    }
    if (o.bar !== false && want('gauge')) {
        const warn = Math.max(0, f.redline - 500);
        if (bg) {
            if (o.dim) cv.arc(A.cx, A.cy, A.b0, A.b1, R(0), R(warn), withAlpha(AC.unlit, 0.9));
            cv.arc(A.cx, A.cy, A.b0, A.b1, R(warn), R(f.redline), withAlpha(AC.warn, 0.55));
            cv.arc(A.cx, A.cy, A.b0, A.b1, R(f.redline), R(f.max), withAlpha(AC.zone, 0.55));
        }
        if (fg && isNum(d.rpm) && d.rpm > 50) {
            const top = Math.min(d.rpm, f.max), lim = cue.limiter, c = lim ? (f.blink ? AC.zone : withAlpha(AC.zone, 0.4)) : AC.fill;
            cv.arc(A.cx, A.cy, A.b0, A.b1, R(0), R(Math.min(top, warn)), c);
            if (top > warn) cv.arc(A.cx, A.cy, A.b0, A.b1, R(warn), R(Math.min(top, f.redline)), lim ? c : AC.warn);
            if (top > f.redline) cv.arc(A.cx, A.cy, A.b0, A.b1, R(f.redline), R(top), lim ? c : AC.zone);
        }
        if (bg) {
            cv.arc(A.cx, A.cy, A.b1, A.b1 + A.rim, R(0) - 0.4, R(f.max) + 0.4, AC.rim);
            for (let r = 1000; r < f.max; r += 1000) { const p = aPt(R(r), A.b1), q = aPt(R(r), A.b0 + 6); cv.line(p[0], p[1], q[0], q[1], 1.6, AC.rim); }
        }
        if (fg && isNum(f.peak) && f.peak > 0 && !(isNum(d.rpm) && d.rpm >= f.peak - 50)) {
            const p = aPt(R(Math.min(f.peak, f.max)), A.b1 + A.rim), q = aPt(R(Math.min(f.peak, f.max)), A.b0);
            cv.line(p[0], p[1], q[0], q[1], 2.4, '#ffffff');
        }
    }
    if (!fg) return;
    const W = '#f4f4f4', P = h.P, items = f.readouts || [];
    if (f.chip && want('gear')) ring(cv, A.cx, 102, 28, 70, f.chip, P);
    if (o.gear && want('gear')) cv.text(h.gearText(d), A.cx, 124, 62, cue.limiter && f.blink ? AC.red : W, { align: 'center', font: h.gearFont(o) });
    if (f.mode && o.gear && want('mode')) cv.text(f.mode, A.cx + 30, 86, 16, withAlpha(W, 0.85), { font: 'bold' });
    if (want('gear')) h.drawDown(cv, A.cx - 40, 112, f.down || 0, 0.8, P.arrow);
    // left, under the band and kept high (BMW's assistance graphic sits bottom left): readout 4
    if (items[3] && want('readD')) small(cv, 132, 82, items[3], P, o, W, 'stack', 'center');
    // right: readout 1 big beside the gear, 2 and 3 stacked at the far right; the grade takes them over
    if (f.chip) { if (want('readA')) grade(cv, 312, 122, f.chip, P, 24); }
    else {
        if (items[0] && want('readA')) {
            const lb = labelOf(o, W);
            fitLabel(cv, items[0].label, 288, 100, lb.s, lb.c, 48, { align: 'center' });
            cv.text(items[0].value, 288, 125, 26, toneCol(items[0], P, W), { align: 'center', font: o.valFont || 'bold' });
        }
        // from just right of the first readout (it ends by x 313) to the edge, values a size smaller
        if (items[1] && want('readB')) small(cv, 318, 104, items[1], P, o, W, 'row', 80, 17);
        if (items[2] && want('readC')) small(cv, 318, 126, items[2], P, o, W, 'row', 80, 17);
    }
}

/* ---------- ramp (G80) ---------- */
// Cluster Redline 1.2.31: redrawn after the G80/G82 M3/M4 cluster (owner's photo), in that photo's pixels
// (582 wide) scaled to the layout's 400. A cream band climbs from 0, bends round at 2000 rpm and runs flat
// to the end; it is solid (grey-edged, a red mark at its end) up to the rpm and only its top line past it,
// notched every 1000 rpm; yellow then red dashes mark the redline zone. Above the flat part the rpm
// alert: 6 slanted blocks from the bend to the redline and 2 longer ones past it, lit yellow with the rpm
// and all red from the shift point. Square digits: 0-8 scale, gear (and mode), a line with "rpm" over the
// rpm; the readouts under 6 and 8.
const RK = 400 / 582;
const RC = { band: '#e4dfd1', edge: '#8a877e', yellow: '#f3c936', red: '#e8352a', off: '#a2301f', text: '#e4dfd1', sep: '#6f6c64' };
const RP = (() => {
    const P0 = [40, 124], K = [104, 55], E = [538, 55], r = 36, t = 18;
    const L0 = Math.hypot(K[0] - P0[0], K[1] - P0[1]), u = [(K[0] - P0[0]) / L0, (K[1] - P0[1]) / L0];
    const th = Math.acos(u[0]), dd = r * Math.tan(th / 2);
    const A = [K[0] - u[0] * dd, K[1] - u[1] * dd], B = [K[0] + dd, K[1]], C = [B[0], B[1] + r];
    const pts = [];
    const push = (p) => { const q = pts[pts.length - 1]; pts.push({ x: p[0], y: p[1], s: q ? q.s + Math.hypot(p[0] - q.x, p[1] - q.y) : 0 }); };
    push(P0); push(A);
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), a1 = Math.atan2(B[1] - C[1], B[0] - C[0]);
    for (let k = 1; k <= 16; k++) { const a = a0 + (a1 - a0) * k / 16; push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); }
    const sA = pts[1].s, sB = pts[pts.length - 1].s;
    push(E);
    return { pts, sA, sB, L: pts[pts.length - 1].s, t, knee: 2000, flatX: B[0], y: E[1], x1: E[0] };
})();
const rS = (rpm, max) => { const r = clamp(rpm, 0, max); return r <= RP.knee ? r / RP.knee * RP.sB : RP.sB + (r - RP.knee) / Math.max(1, max - RP.knee) * (RP.L - RP.sB); };
function rPt(s) {
    const p = RP.pts; let i = 1; while (i < p.length - 1 && p[i].s < s) i++;
    const a = p[i - 1], b = p[i], k = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1), L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, nx: uy, ny: -ux };
}
const off = (q, d) => [q.x + q.nx * d, q.y + q.ny * d];
/** Pieces of the band between rpm a and b: straight runs whole, the bend in short pieces. */
function rPieces(a, b, max) {
    const s0 = rS(a, max), s1 = rS(b, max), cuts = [s0], out = [];
    [RP.sA, RP.sB].forEach((x) => { if (x > s0 && x < s1) cuts.push(x); });
    cuts.push(s1);
    for (let k = 0; k + 1 < cuts.length; k++) {
        const u0 = cuts[k], u1 = cuts[k + 1], bend = u0 >= RP.sA - 1e-6 && u1 <= RP.sB + 1e-6, n = bend ? Math.max(1, Math.ceil((u1 - u0) / 4)) : 1;
        for (let m = 0; m < n; m++) out.push([rPt(u0 + (u1 - u0) * m / n), rPt(u0 + (u1 - u0) * (m + 1) / n)]);
    }
    return out;
}
function rFill(cv, a, b, max, c, inset) {
    const h = RP.t / 2 - (inset || 0);
    rPieces(a, b, max).forEach(([p, q], i, all) => {
        const L = Math.hypot(q.x - p.x, q.y - p.y) || 1, ex = (q.x - p.x) / L * 0.7, ey = (q.y - p.y) / L * 0.7;
        const P = { x: p.x - (i ? ex : 0), y: p.y - (i ? ey : 0), nx: p.nx, ny: p.ny }, Q = { x: q.x + (i < all.length - 1 ? ex : 0), y: q.y + (i < all.length - 1 ? ey : 0), nx: q.nx, ny: q.ny };
        cv.quad([off(P, h), off(Q, h), off(Q, -h), off(P, -h)], c);
    });
}
function rEdge(cv, a, b, max, d, w, c) { rPieces(a, b, max).forEach(([p, q]) => { const A = off(p, d), B = off(q, d); cv.line(A[0], A[1], B[0], B[1], w, c); }); }
/** Square digits as in the photo (bars meeting at the corners). */
const BD = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
    P: 'abefg', R: 'abcefg', N: 'abcef', D: 'bcdeg', '-': 'g', ' ': '' };
function bDigit(cv, ch, x, y, w, h, t, c) {
    const on = BD[ch] !== undefined ? BD[ch] : '', m = (h - t) / 2;
    const R = { a: [x, y, w, t], g: [x, y + m, w, t], d: [x, y + h - t, w, t], f: [x, y, t, m + t], b: [x + w - t, y, t, m + t], e: [x, y + m, t, h - m], c: [x + w - t, y + m, t, h - m] };
    for (const k of on) cv.fillRect(R[k][0], R[k][1], R[k][2], R[k][3], c);
}
function bText(cv, str, x, y, w, h, t, gap, c) { for (let i = 0; i < str.length; i++) bDigit(cv, str[i], x + i * (w + gap), y, w, h, t, c); }
/** Alert block i (slanted): 6 from the bend to the redline, then 2 past it (the last twice as long). */
function rBlock(cv, i, max, redline, c, outline) {
    const x0 = 152, xr = Math.max(x0 + 60, rPt(rS(redline, max)).x + 4), xe = 536;
    const w = i < 6 ? (xr - x0) / 6 : i === 6 ? (xe - xr) / 3 : (xe - xr) * 2 / 3, x = i < 6 ? x0 + i * w : i === 6 ? xr : xr + (xe - xr) / 3;
    const top = 16, bot = 38, sl = 14, g = 4;
    const q = [[x + sl, top], [x + w - g + sl, top], [x + w - g, bot], [x, bot]];
    if (outline) cv.polyline(q.concat([q[0]]), 1.6, c); else cv.quad(q, c);
}
function drawRamp(cv0, f, layer, h) {
    const cv = require('./rl-hud-draw').scaled(cv0, RK, 0, 0);
    const o = f.opts, d = f.d, cue = f.cue, BG = layer !== 'fg', fg = layer !== 'bg', max = f.max, want = wants(f);
    const rpm = isNum(d.rpm) ? clamp(d.rpm, 0, max) : 0, shift = isNum(cue.at) ? cue.at : f.redline;
    const atShift = rpm > 50 && rpm >= shift, flash = cue.limiter && f.blink, H = RP.t / 2;
    if (want('alert')) {
        const start = (i) => (i < 6 ? RP.knee + (f.redline - RP.knee) * i / 6 : f.redline + (max - f.redline) * (i === 6 ? 0 : 1 / 3));
        for (let i = 0; i < 8; i++) {
            if (BG && !(fg && rpm > 50 && rpm >= start(i))) rBlock(cv, i, max, f.redline, RC.off, true);
            if (fg && rpm > 50 && rpm >= start(i) && !(cue.limiter && !f.blink)) rBlock(cv, i, max, f.redline, atShift || flash ? RC.red : RC.yellow);
        }
    }
    if (want('gauge')) {
        if (BG) {
            // past the rpm only the band's top line shows, with a notch every 1000 rpm and a cap at the end
            rEdge(cv, 0, max, max, H - 1, 2.6, RC.band);
            const end = rPt(rS(max, max));
            cv.polyline([[end.x - 5, end.y - H], [end.x - 5, end.y - H + 9], [end.x - 2, end.y - H + 12], [end.x + 1, end.y - H + 9], [end.x + 1, end.y - H]], 2.4, RC.band);
            for (let r = 1000; r < max; r += 1000) { const q = rPt(rS(r, max)), a = off(q, H - 1); cv.line(a[0], a[1], a[0] - q.nx * 0 + 0, a[1] + 7, 3.4, RC.band); }
            // the scale under the band (0 a little left of the start), square digits
            const lab = max <= 9000 ? 2000 : 3000;
            for (let r = 0; r <= max; r += lab) {
                const q = rPt(rS(r, max));
                if (r === 0) bText(cv, '0', q.x - 20, q.y + 6, 17, 13, 3.4, 0, RC.text);
                else bText(cv, String(r / 1000), q.x - 9, q.y + H + 8, 17, 13, 3.4, 0, RC.text);
            }
            // redline zone: a yellow dash and dot, then red dashes along the band
            const y = RP.y - H + 6, xa = rPt(rS(Math.max(RP.knee, f.redline - 600), max)).x, xr = rPt(rS(f.redline, max)).x, xe = rPt(rS(max, max)).x - 8;
            cv.fillRect(xa, y, Math.max(4, (xr - xa) * 0.55), 2.6, RC.yellow);
            cv.fillRect(xa + (xr - xa) * 0.7, y, 3, 2.6, RC.yellow);
            const m = xr + (xe - xr) * 0.32;
            cv.fillRect(xr, y, m - xr - 4, 2.6, RC.red); cv.fillRect(m + 4, y, xe - m - 4, 2.6, RC.red);
        }
        if (fg && rpm > 50) {
            // the lit band: grey edge, cream inside, segment lines every 1000 rpm, a red mark at its end
            rFill(cv, 0, rpm, max, RC.edge);
            rFill(cv, 0, rpm, max, flash ? RC.red : RC.band, 1.4);
            for (let r = 1000; r < rpm; r += 1000) { const q = rPt(rS(r, max)), a = off(q, H), b = off(q, -H); cv.line(a[0], a[1], b[0], b[1], 1.2, RC.sep); }
            const q = rPt(rS(rpm, max)), a = off(q, -H + 6), b = off(q, -H);
            cv.line(a[0] - 1.5, a[1], b[0] - 1.5, b[1], 3.4, RC.red);
        }
    }
    const items = f.readouts || [];
    if (o.gear && want('gear') && fg) bDigit(cv, h.gearText(d).slice(0, 1), 120, 92, 47, 38, 10, atShift || flash ? RC.red : RC.text);
    if (fg && f.mode && o.gear && want('mode')) cv.text(f.mode, 177, 109, 16, RC.text, { font: 'bold' });
    if (fg && want('gear')) h.drawDown(cv0, 66, 76, f.down || 0, 0.8, h.P.arrow);
    if (o.rpm !== false && want('rpm')) {
        if (BG) { cv.fillRect(68, 140, 125, 2, RC.text); cv.text('rpm', 199, 147, 15, RC.text, { font: 'bold' }); }
        const txt = isNum(d.rpm) && d.rpm < 9995 ? String(Math.max(0, Math.round(d.rpm / 10) * 10)).padStart(4, ' ') : '----';
        if (fg) bText(cv, txt, 57, 150, 34, 27, 7, 4.5, RC.text);
    }
    // readouts: label centred under 6, value right-aligned under 8, one row each
    if (fg) [0, 1, 2, 3].forEach((i) => {
        const it = items[i]; if (!it || !want('read' + 'ABCD'[i])) return;
        const bar = it.gauge && it.frac !== null && it.frac !== undefined, y = bar ? 113 + i * 40 : 113 + i * 22;
        fitLabel(cv, it.label.toUpperCase(), 400, y, 15, RC.text, 120, { align: 'center' });
        cv.text(it.value, 566, y + 2, 23, it.tone && it.tone !== 'text' ? h.P[it.tone] : RC.text, { align: 'right', font: 'bold' });
        // gauge mode: a row of the ramp's slanted blocks under the row, yellow lit, outlined unlit
        if (bar) {
            const n = 8, x0 = 344, pitch = (566 - x0) / n, lit = Math.round(clamp(it.frac, 0, 1) * n), top = y + 7, bot = y + 17, sl = 5;
            for (let k = 0; k < n; k++) {
                const x = x0 + k * pitch, q = [[x + sl, top], [x + pitch - 4 + sl, top], [x + pitch - 4, bot], [x, bot]];
                if (k < lit) cv.quad(q, it.tone === 'hot' ? RC.red : RC.yellow); else cv.polyline(q.concat([q[0]]), 1.4, RC.sep);
            }
        }
    });
}

/* ---------- dial (E60) ---------- */
const D = { cx: 200, cy: 70, r0: 50, r1: 60, a0: -125, a1: 110 };
const DC = { green: '#a6d64a', orange: '#ff8a2e', red: '#f0313a', text: '#ff8a2e', speed: '#ff5a2e' };
function drawDial(cv, f, layer, h) {
    const o = f.opts, d = f.d, cue = f.cue, BG = layer !== 'fg', fg = layer !== 'bg', max = f.max, fl = flashOn(o, cue), want = wants(f);
    const flashCol = flashColour(o, cue, h, DC.red);
    const ang = (r) => D.a0 + (D.a1 - D.a0) * clamp(r / max, 0, 1);
    // the E60's advance warning field: the last 1000 rpm before the redline (fixed, so the cached static
    // layer stays right; the count-in itself is the shift cue's flash)
    const warn = Math.max(0, f.redline - 1000);
    // the zones in the E60's colours, or the app's light style's: Race green / red / blue, one colour throughout
    const Z = o.lightStyle === 'f1' ? [h.P.low, h.P.high, h.RACE_BLUE] : o.lightStyle === 'mono' ? [h.P.text, h.P.text, h.P.text] : [DC.green, DC.orange, DC.red];
    const zone = (r) => (r >= f.redline ? Z[2] : r >= warn ? Z[1] : Z[0]);
    const step = 250;
    if ((o.bar !== false || o.lights) && want('gauge')) {
        if (BG) for (let r = 0; r < max; r += step) {
            // the zones always faintly there; a hairline gap every 1000 rpm
            const g = (r + step) % 1000 === 0 ? 0.9 : 0;
            cv.arc(D.cx, D.cy, D.r0, D.r1, ang(r), ang(r + step) - g, withAlpha(zone(r), o.dim ? 0.22 : r >= warn ? 0.22 : 0));
        }
        if (fg && isNum(d.rpm) && d.rpm > 50) {
            const top = Math.min(d.rpm, max);
            // burst: the lit dial flashes the grade's colour for 300 ms
            const pop = burstOn(f.chip, 300) ? chipCol(f.chip, h.P) : null;
            for (let r = 0; r < top; r += step) {
                const c = fl ? (f.blink ? flashCol : null) : pop || zone(r);
                const g = (r + step) % 1000 === 0 ? 0.9 : 0;
                if (c) cv.arc(D.cx, D.cy, D.r0, D.r1, ang(r), ang(Math.min(top, r + step)) - (r + step <= top ? g : 0), c);
            }
        }
        if (fg && isNum(f.peak) && f.peak > 0 && !(isNum(d.rpm) && d.rpm >= f.peak - 50)) cv.arc(D.cx, D.cy, D.r0 - 3, D.r1 + 3, ang(f.peak) - 0.8, ang(f.peak) + 0.8, '#ffffff');
    }
    if (!fg) return;
    const items = f.readouts || [];
    if (f.chip && want('gauge')) ring(cv, D.cx, D.cy, D.r1 + 2, D.r1 + 34, f.chip, h.P);
    // readouts 2 and 3: a list on the right; 4: top left (kept high, clear of BMW's assistance graphic)
    [1, 2].forEach((i, k) => { if (items[i] && want('read' + 'ABCD'[i])) small(cv, 284, 30 + k * 28, items[i], h.P, o, DC.speed, 'row', 112); });
    if (items[3] && want('readD')) small(cv, 70, 30, items[3], h.P, o, DC.speed, 'stack', 'center');
    if (o.gear && want('gear')) cv.text(h.gearText(d), D.cx, D.cy + 20, 56, cue.limiter && f.blink ? DC.red : DC.text, { align: 'center', font: h.gearFont(o) });
    if (f.mode && o.gear && want('mode')) cv.text(f.mode, D.cx + 24, D.cy - 14, 14, withAlpha(DC.text, 0.85), { font: 'bold' });
    if (want('gear')) h.drawDown(cv, D.cx, D.cy + 30, f.down || 0, 0.9, h.P.arrow);
    // bottom right, where the E60 shows the speed: the first readout, or the shift grade
    if (f.chip) { if (want('readA')) grade(cv, 330, 122, f.chip, h.P, 22); }
    else {
        const it = items[0];
        if (it && want('readA')) {
            cv.text(it.value, 300, 122, 26, it.tone && it.tone !== 'text' ? h.P[it.tone] : DC.speed, { align: 'right', font: o.valFont || 'bold' });
            fitLabel(cv, it.label.toLowerCase(), 304, 122, labelOf(o, DC.speed).s, DC.speed, 94, { spacing: 0 });
        }
    }
}

function drawM(cv, f, layer, h) {
    const st = f.opts.style;
    if (st === 'arc') drawArc(cv, f, layer, h); else if (st === 'ramp') drawRamp(cv, f, layer, h); else drawDial(cv, f, layer, h);
}
module.exports = { drawM };
