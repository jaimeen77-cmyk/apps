'use strict';
// My picture layout: your own GIFs in place of the Car layout's picture, one for each of three scenes:
//   stop.gif     standing still (under 1 km/h, or in P when the speed is not known)
//   drive.gif    moving forward
//   reverse.gif  reverse gear
// They go in the app's data folder, my-pictures/ (made at start; tools/my-pictures.js checks and copies them).
// Limits (car memory: three GIFs at most about 11 MB): 400 x 225 pixels, 20 frames, 1 MB a file; frames play at
// their own GIF delays, at most 10 a second. A missing or unusable GIF falls back to the Car layout's own picture
// for that scene. The folder is looked at again every 5 s, so a copied file shows without a restart.
const fs = require('fs'), path = require('path'), GIF = require('./gif-decode');
const NAMES = ['stop', 'drive', 'reverse'];
const LIMIT = { maxW: 400, maxH: 225, maxFrames: 20, maxBytes: 1024 * 1024 };
const SCAN_MS = 5000, CONFIRM_MS = 300;
const isNum = (x) => typeof x === 'number' && isFinite(x);
let dir = null, lastScan = -Infinity;
const loaded = {};   // name -> {sig, gif, starts, total, error}

function folder() { return dir ? path.join(dir, 'my-pictures') : null; }
function setDir(d) { dir = d || null; lastScan = -Infinity; if (dir) { try { fs.mkdirSync(folder()); } catch (e) {} } }
// Reads the GIFs that are new or changed since the last look (size and time), at most every 5 s.
function scan(now, force) {
    const f = folder(); if (!f) return;
    if (!force && now - lastScan < SCAN_MS) return; lastScan = now;
    NAMES.forEach((n) => {
        const file = path.join(f, n + '.gif'); let st = null;
        try { st = fs.statSync(file); } catch (e) {}
        const sig = st ? st.size + '|' + Math.round(st.mtimeMs || 0) : null, cur = loaded[n];
        if (cur && cur.sig === sig) return;
        if (!st) { loaded[n] = { sig, gif: null, error: null }; return; }
        if (st.size > LIMIT.maxBytes) { loaded[n] = { sig, gif: null, error: 'too_large', bytes: st.size }; return; }
        try {
            const gif = GIF.decode(fs.readFileSync(file), LIMIT), starts = []; let t = 0;
            gif.frames.forEach((fr) => { starts.push(t); t += fr.delay; });
            loaded[n] = { sig, gif, starts, total: t, error: null, bytes: st.size };
        } catch (e) { loaded[n] = { sig, gif: null, error: e.code || 'broken', bytes: st.size }; }
    });
}
// What each GIF is now, for the settings screen: [{name, ok, w, h, frames, error}].
function status() { return NAMES.map((n) => { const l = loaded[n] || {}; return { name: n, ok: !!l.gif, w: l.gif ? l.gif.w : null, h: l.gif ? l.gif.h : null, frames: l.gif ? l.gif.frames.length : 0, error: l.error || (l.sig ? null : 'missing') }; }); }

function want(stage, speed) { return stage === 'R' ? 'reverse' : (isNum(speed) ? speed < 1 : stage === 'P') ? 'stop' : 'drive'; }
// A new scene must last 300 ms (reverse at once), so a speed hovering at 1 km/h does not flicker it.
const shown = {};
function pick(display, stage, speed, now) {
    const m = shown[display] || (shown[display] = { cur: 'drive', cand: null, at: 0 }), w = want(stage, speed);
    if (w === m.cur) { m.cand = null; return m.cur; }
    if (w === 'reverse' || m.cur === 'reverse') { m.cur = w; m.cand = null; return w; }
    if (m.cand !== w) { m.cand = w; m.at = now; }
    if (now - m.at >= CONFIRM_MS) { m.cur = w; m.cand = null; }
    return m.cur;
}
// The frame to show: your GIF's ({mine, i, sig, set}) or, without a usable one, the Car layout's own picture.
const OWN = { stop: 'stop', drive: 'cruise', reverse: 'reverse' };
function frameOf(display, stage, speed, now) { return frameAt(pick(display, stage, speed, now), display === 'hud' ? 'hud' : 'cluster', now); }
// Scene s's frame at time now on a display's set (no holding: the settings preview's first frame).
function frameAt(s, set, now) {
    const l = loaded[s];
    if (l && l.gif) {
        const t = now % l.total; let i = 0;
        while (i + 1 < l.starts.length && l.starts[i + 1] <= t) i++;
        return { mine: s, i, sig: l.sig, set };
    }
    const n = require('./car-meter').frames(set).N;
    return { state: OWN[s], mirror: false, i: Math.floor(now * 10 / 1000) % n, set };
}
function reset() { Object.keys(shown).forEach((k) => delete shown[k]); }

// Draws frame f of your GIF into r (a kit Canvas, or anything with blit) in the box x, y, w x h: fitted inside it
// (letterboxed), bilinear, its edges fading into the dark; on the HUD black is see-through.
function draw(r, f, x, y, w, h) {
    const l = loaded[f.mine]; if (!l || !l.gif) return;
    const g = l.gif, fr = g.frames[Math.min(f.i, g.frames.length - 1)], col = g.colours, CL = GIF.CLEAR;
    const k = Math.min(w / g.w, h / g.h), dw = Math.max(2, Math.round(g.w * k)), dh = Math.max(2, Math.round(g.h * k));
    const ox = Math.round(x + (w - dw) / 2), oy = Math.round(y + (h - dh) / 2), hud = f.set === 'hud';
    const px = new Uint8ClampedArray(dw * dh * 4), fade = Math.max(1, Math.round(Math.min(dw, dh) * 0.08));
    for (let yy = 0; yy < dh; yy++) {
        const fy = Math.max(0, Math.min(g.h - 1, (yy + 0.5) / k - 0.5)), y0 = Math.floor(fy), y1 = Math.min(g.h - 1, y0 + 1), ty = fy - y0;
        for (let xx = 0; xx < dw; xx++) {
            const fx = Math.max(0, Math.min(g.w - 1, (xx + 0.5) / k - 0.5)), x0 = Math.floor(fx), x1 = Math.min(g.w - 1, x0 + 1), tx = fx - x0;
            const s = [fr.px[y0 * g.w + x0], fr.px[y0 * g.w + x1], fr.px[y1 * g.w + x0], fr.px[y1 * g.w + x1]], wt = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
            let rr = 0, gg = 0, bb = 0, a = 0;
            for (let q = 0; q < 4; q++) { if (s[q] === CL) continue; const c = s[q] * 3; rr += col[c] * wt[q]; gg += col[c + 1] * wt[q]; bb += col[c + 2] * wt[q]; a += wt[q]; }
            const p = (yy * dw + xx) * 4; if (a <= 0) continue;
            px[p] = rr / a; px[p + 1] = gg / a; px[p + 2] = bb / a;
            const e = Math.min(xx, dw - 1 - xx, yy, dh - 1 - yy);
            let al = a * (e >= fade ? 255 : 255 * Math.pow(e / fade, 1.5));
            if (hud) al *= Math.min(1, Math.max(px[p], px[p + 1], px[p + 2]) / 64);
            px[p + 3] = Math.round(al);
        }
    }
    if (r.d && isNum(r.w) && isNum(r.h)) {
        const dd = r.d, W = r.w;
        for (let yy = Math.max(0, -oy); yy < dh && oy + yy < r.h; yy++) for (let xx = Math.max(0, -ox); xx < dw && ox + xx < W; xx++) {
            const s = (yy * dw + xx) * 4, p = ((oy + yy) * W + ox + xx) * 4, sa = px[s + 3]; if (!sa) continue;
            if (sa === 255 || !dd[p + 3]) { dd[p] = px[s]; dd[p + 1] = px[s + 1]; dd[p + 2] = px[s + 2]; dd[p + 3] = sa; continue; }
            const al = sa / 255, da = dd[p + 3] / 255, oa = al + da * (1 - al);
            for (let c = 0; c < 3; c++) dd[p + c] = Math.round((px[s + c] * al + dd[p + c] * da * (1 - al)) / oa); dd[p + 3] = Math.round(oa * 255);
        }
        return;
    }
    if (typeof r.blit === 'function') { const { Canvas } = require('./kit/canvas'), c = new Canvas(dw, dh); c.d.set(px); r.blit(c, ox, oy); }
}
module.exports = { NAMES, LIMIT, setDir, scan, status, want, pick, frameOf, frameAt, reset, draw, folder, OWN };
