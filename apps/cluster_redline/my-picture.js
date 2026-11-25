'use strict';
// My design layout (the cluster): your own GIFs in place of the Car layout's picture, one for each of three scenes:
//   stop      standing still (under 1 km/h, or in P when the speed is not known)
//   drive     moving forward (required: a scene without its own GIF shows the drive GIF)
//   reverse   reverse gear
//   left      turning left, right  turning right (1.3.52): from the sideways G, as the Car layout (0.12 G and
//             up; positive to the left), held 400 ms; one turn without its own GIF shows the other one mirrored,
//             then the drive GIF
// They come from the GIF player (my-picture-source.js), which copies each one here, into the app's data folder,
// my-pictures/<scene>.mpic, already fitted (1.3.51): any size up to the GIF player's own limits is scaled down to fit
// the picture's box (320 x 180), keeping its shape; more than 30 frames are thinned to 30 (their delays added up, so
// it runs as long). So a GIF of another size needs nothing done to it. (<scene>.gif, 1.3.50, is still read.)
// Frames play at their own GIF delays, at most 10 a second; a change of scene fades over 400 ms. The folder is
// looked at again every 5 s, so new copies show without a restart.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), GIF = require('./gif-decode');
const NAMES = ['stop', 'drive', 'reverse', 'left', 'right'];
// the picture's box on the cluster (the Car layout's: 320 x 180) and the frames kept: about 3.5 MB a scene at most
const BOX = { w: 320, h: 180 }, MAX_FRAMES = 30;
// what the GIF player accepts (its gif.js LIMIT), so every GIF it has can be fitted
const SOURCE = { maxW: 640, maxH: 360, maxFrames: 90, maxBytes: 6 * 1024 * 1024 };
// (1.3.50's limits, for its .gif copies)
const LIMIT = { maxW: 400, maxH: 225, maxFrames: 20, maxBytes: 1024 * 1024 };
const SCAN_MS = 5000, CONFIRM_MS = 300, HOLD_MS = 400, FADE_MS = 400, FADE_STEPS = 8, TURN_G = 0.12, TURN_OFF_G = 0.08;
const isNum = (x) => typeof x === 'number' && isFinite(x);
let dir = null, lastScan = -Infinity;
const loaded = {};   // name -> {sig, gif, starts, total, error, source: {w, h, frames}}

function folder() { return dir ? path.join(dir, 'my-pictures') : null; }
function setDir(d) { dir = d || null; lastScan = -Infinity; if (dir) { try { fs.mkdirSync(folder()); } catch (e) {} } }

/** A decoded GIF fitted into the box (nearest colour, its shape kept; never made bigger) and thinned to 30 frames. */
function fit(gif) {
    const k = Math.min(1, BOX.w / gif.w, BOX.h / gif.h), w = Math.max(1, Math.round(gif.w * k)), h = Math.max(1, Math.round(gif.h * k));
    let frames = gif.frames;
    if (frames.length > MAX_FRAMES) {
        // keep MAX_FRAMES of them, evenly; each kept one lasts as long as those it stands for
        const out = [];
        for (let j = 0; j < MAX_FRAMES; j++) {
            const a = Math.floor(j * frames.length / MAX_FRAMES), b = Math.floor((j + 1) * frames.length / MAX_FRAMES);
            let delay = 0; for (let q = a; q < b; q++) delay += frames[q].delay;
            out.push({ px: frames[a].px, delay });
        }
        frames = out;
    }
    if (w !== gif.w || h !== gif.h) {
        const xs = new Uint16Array(w), ys = new Uint16Array(h);
        for (let x = 0; x < w; x++) xs[x] = Math.min(gif.w - 1, Math.floor((x + 0.5) / k));
        for (let y = 0; y < h; y++) ys[y] = Math.min(gif.h - 1, Math.floor((y + 0.5) / k));
        frames = frames.map((fr) => { const px = new Uint16Array(w * h);
            for (let y = 0; y < h; y++) { const row = ys[y] * gif.w; for (let x = 0; x < w; x++) px[y * w + x] = fr.px[row + xs[x]]; }
            return { px, delay: fr.delay }; });
    }
    return { w, h, colours: gif.colours, frames, source: { w: gif.w, h: gif.h, frames: gif.frames.length } };
}
// <scene>.mpic: 'MPIC', a JSON header's length (u32), the header {w, h, n, delays, colours, source}, then deflated:
// the colours (rgb) and the frames (u16 little endian colour indices)
function encode(p) {
    const head = Buffer.from(JSON.stringify({ w: p.w, h: p.h, n: p.frames.length, delays: p.frames.map((f) => f.delay), colours: p.colours.length, source: p.source }));
    const len = Buffer.alloc(4); len.writeUInt32LE(head.length, 0);
    const frames = p.frames.map((f) => { const b = Buffer.alloc(f.px.length * 2); for (let i = 0; i < f.px.length; i++) b.writeUInt16LE(f.px[i], i * 2); return b; });
    return Buffer.concat([Buffer.from('MPIC'), len, head, zlib.deflateSync(Buffer.concat([Buffer.from(p.colours)].concat(frames)))]);
}
function decodeFile(b) {
    if (b.length < 8 || b.toString('latin1', 0, 4) !== 'MPIC') throw Object.assign(new Error('not_mpic'), { code: 'broken' });
    const hl = b.readUInt32LE(4), h = JSON.parse(b.toString('utf8', 8, 8 + hl)); b = zlib.inflateSync(b.slice(8 + hl)); let o = 0;
    if (!(h.w > 0 && h.h > 0 && h.w <= BOX.w && h.h <= BOX.h && h.n > 0 && h.n <= MAX_FRAMES)) throw Object.assign(new Error('bad'), { code: 'broken' });
    const colours = new Uint8Array(b.slice(o, o + h.colours)); o += h.colours;
    const n = h.w * h.h, frames = [];
    for (let j = 0; j < h.n; j++) { if (o + n * 2 > b.length) throw Object.assign(new Error('short'), { code: 'broken' });
        const px = new Uint16Array(n); for (let i = 0; i < n; i++) px[i] = b.readUInt16LE(o + i * 2); o += n * 2;
        frames.push({ px, delay: h.delays[j] || 100 }); }
    return { w: h.w, h: h.h, colours, frames, source: h.source || null };
}
/** A GIF from the GIF player made ready for the cluster: {file: Buffer (.mpic), w, h, frames, source}; throws. */
function prepare(bytes) {
    const p = fit(GIF.decode(bytes, SOURCE));
    return { file: encode(p), w: p.w, h: p.h, frames: p.frames.length, source: p.source };
}
// Reads the scenes that are new or changed since the last look (size and time), at most every 5 s.
function scan(now, force) {
    const f = folder(); if (!f) return;
    if (!force && now - lastScan < SCAN_MS) return; lastScan = now;
    NAMES.forEach((n) => {
        let file = path.join(f, n + '.mpic'), st = null, old = false;
        try { st = fs.statSync(file); } catch (e) { file = path.join(f, n + '.gif'); old = true; try { st = fs.statSync(file); } catch (x) {} }
        const sig = st ? (old ? 'g' : 'm') + st.size + '|' + Math.round(st.mtimeMs || 0) : null, cur = loaded[n];
        if (cur && cur.sig === sig) return;
        if (!st) { loaded[n] = { sig, gif: null, error: null }; return; }
        if (old && st.size > LIMIT.maxBytes) { loaded[n] = { sig, gif: null, error: 'too_large', bytes: st.size }; return; }
        try {
            const gif = old ? fit(GIF.decode(fs.readFileSync(file), LIMIT)) : decodeFile(fs.readFileSync(file)), starts = []; let t = 0;
            gif.frames.forEach((fr) => { starts.push(t); t += fr.delay; });
            loaded[n] = { sig, gif, starts, total: Math.max(1, t), error: null, bytes: st.size, source: gif.source };
        } catch (e) { loaded[n] = { sig, gif: null, error: ['not_gif', 'too_big', 'no_frames', 'too_large'].indexOf(e.code) >= 0 ? e.code : 'broken', bytes: st.size }; }   // (a cut file: zlib's own code)
    });
}
const usable = (n) => !!(loaded[n] && loaded[n].gif);
const OTHER = { left: 'right', right: 'left' };
/** The GIF a scene shows: {src, mirror}: its own, a turn without one the other turn's mirrored, else the drive GIF;
 *  null: none (the Car layout's own picture). */
function show(s) {
    if (usable(s)) return { src: s, mirror: false };
    if (OTHER[s] && usable(OTHER[s])) return { src: OTHER[s], mirror: true };
    return usable('drive') ? { src: 'drive', mirror: false } : null;
}
function resolve(s) { const v = show(s); return v ? v.src : null; }
// What each scene shows now, for the settings screen: [{name, ok, w, h, frames, error, uses, source}]
// (uses: the GIF it shows, 'drive' for one without its own).
function status() {
    return NAMES.map((n) => { const l = loaded[n] || {}, u = resolve(n);
        return { name: n, ok: !!l.gif, w: l.gif ? l.gif.w : null, h: l.gif ? l.gif.h : null, frames: l.gif ? l.gif.frames.length : 0,
            error: l.error || (l.sig ? null : 'missing'), uses: u, mirrored: !!(show(n) && show(n).mirror), source: l.source || null }; });
}

// The scene: reverse, standing still, turning (sideways G past 0.12, out again under 0.08: cur, the scene shown
// now, keeps a turn going through a wobble) or driving.
function want(stage, speed, g, cur) {
    if (stage === 'R') return 'reverse';
    if (isNum(speed) ? speed < 1 : stage === 'P') return 'stop';
    const lat = g && isNum(g.lat) ? g.lat : 0, side = lat > 0 ? 'left' : 'right', a = Math.abs(lat);
    if (a >= TURN_G || (cur === side && a >= TURN_OFF_G)) return side;
    return 'drive';
}
// A new scene must last 300 ms and the shown one 400 ms (reverse at once), so a speed hovering at 1 km/h or a G
// wobbling at the threshold does not flicker it.
const shown = {};
function pick(display, stage, speed, now, g) {
    const m = shown[display] || (shown[display] = { cur: 'drive', since: -Infinity, cand: null, at: 0 }), w = want(stage, speed, g, m.cur);
    if (w === m.cur) { m.cand = null; return m.cur; }
    if (w === 'reverse' || m.cur === 'reverse') { m.cur = w; m.since = now; m.cand = null; return w; }
    if (m.cand !== w) { m.cand = w; m.at = now; }
    if (now - m.at >= CONFIRM_MS && now - m.since >= HOLD_MS) { m.cur = w; m.since = now; m.cand = null; }
    return m.cur;
}
const OWN = { stop: 'stop', drive: 'cruise', reverse: 'reverse', left: 'cruise', right: 'cruise' };
// The frame of GIF src at time now (it keeps running while it fades out).
function frameRef(src, set, now, mirror) {
    const l = loaded[src], t = now % l.total; let i = 0;
    while (i + 1 < l.starts.length && l.starts[i + 1] <= t) i++;
    const f = { mine: src, i, sig: l.sig, set }; if (mirror) f.mirror = true;
    return f;
}
// The frame to show on a display: your GIF's ({mine, i, sig, set}, while a change fades in also from: the GIF it
// leaves, and t: 0..1 in FADE_STEPS steps) or, without any, the Car layout's own picture. A scene that shows the same
// GIF as the last one (the drive GIF standing in) does not fade.
const fades = {};
function frameOf(display, stage, speed, now, g) {
    const set = display === 'hud' ? 'hud' : 'cluster', scene = pick(display, stage, speed, now, g), v = show(scene), m = fades[display] || (fades[display] = { key: null, v: null, from: null, at: 0 });
    const key = v ? v.src + (v.mirror ? '~' : '') : null;
    if (key !== m.key) { if (m.v && usable(m.v.src) && v) { m.from = m.v; m.at = now; } else m.from = null; m.key = key; m.v = v; }
    if (!v) return frameAt(scene, set, now);
    const f = frameRef(v.src, set, now, v.mirror);
    if (m.from && usable(m.from.src) && now - m.at < FADE_MS) { f.from = frameRef(m.from.src, set, now, m.from.mirror); f.t = Math.ceil((now - m.at) / FADE_MS * FADE_STEPS) / FADE_STEPS; }
    else m.from = null;
    return f;
}
// Scene s's frame at time now (no holding, no fade: the settings preview's first frame).
function frameAt(s, set, now) {
    const v = show(s);
    if (v) return frameRef(v.src, set, now, v.mirror);
    const n = require('./car-meter').frames(set).N;
    return { state: OWN[s], mirror: false, i: Math.floor(now * 10 / 1000) % n, set };
}
function reset() { Object.keys(shown).forEach((k) => delete shown[k]); Object.keys(fades).forEach((k) => delete fades[k]); }

// One GIF frame in a w x h box (RGBA): fitted inside (letterboxed), bilinear, its edges fading into the dark; on the
// HUD black is see-through.
function render(ref, w, h) {
    const l = loaded[ref.mine]; if (!l || !l.gif) return null;
    const g = l.gif, fr = g.frames[Math.min(ref.i, g.frames.length - 1)], col = g.colours, CL = GIF.CLEAR;
    const k = Math.min(w / g.w, h / g.h), dw = Math.max(2, Math.round(g.w * k)), dh = Math.max(2, Math.round(g.h * k));
    const ox = Math.round((w - dw) / 2), oy = Math.round((h - dh) / 2), hud = ref.set === 'hud';
    const px = new Uint8ClampedArray(w * h * 4), fade = Math.max(1, Math.round(Math.min(dw, dh) * 0.08));
    for (let yy = 0; yy < dh; yy++) {
        const fy = Math.max(0, Math.min(g.h - 1, (yy + 0.5) / k - 0.5)), y0 = Math.floor(fy), y1 = Math.min(g.h - 1, y0 + 1), ty = fy - y0;
        for (let xx = 0; xx < dw; xx++) {
            const fx = Math.max(0, Math.min(g.w - 1, ((ref.mirror ? dw - 1 - xx : xx) + 0.5) / k - 0.5)), x0 = Math.floor(fx), x1 = Math.min(g.w - 1, x0 + 1), tx = fx - x0;
            const s = [fr.px[y0 * g.w + x0], fr.px[y0 * g.w + x1], fr.px[y1 * g.w + x0], fr.px[y1 * g.w + x1]], wt = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
            let rr = 0, gg = 0, bb = 0, a = 0;
            for (let q = 0; q < 4; q++) { if (s[q] === CL) continue; const c = s[q] * 3; rr += col[c] * wt[q]; gg += col[c + 1] * wt[q]; bb += col[c + 2] * wt[q]; a += wt[q]; }
            if (a <= 0) continue;
            const p = ((oy + yy) * w + ox + xx) * 4;
            px[p] = rr / a; px[p + 1] = gg / a; px[p + 2] = bb / a;
            const e = Math.min(xx, dw - 1 - xx, yy, dh - 1 - yy);
            let al = a * (e >= fade ? 255 : 255 * Math.pow(e / fade, 1.5));
            if (hud) al *= Math.min(1, Math.max(px[p], px[p + 1], px[p + 2]) / 64);
            px[p + 3] = Math.round(al);
        }
    }
    return px;
}
// Draws frame f (a GIF's, fading from another one while t < 1) into r (a kit Canvas, the GPU recorder, or anything
// with blit) in the box x, y, w x h.
function draw(r, f, x, y, w, h) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); if (w < 2 || h < 2) return;
    let px = render(f, w, h); if (!px) return;
    if (f.from && isNum(f.t) && f.t < 1) {
        const old = render(f.from, w, h);
        if (old) { const t = Math.max(0, f.t), mix = new Uint8ClampedArray(px.length);
            for (let p = 0; p < px.length; p += 4) { const wa = old[p + 3] * (1 - t), wb = px[p + 3] * t, al = wa + wb; if (!al) continue;
                mix[p] = (old[p] * wa + px[p] * wb) / al; mix[p + 1] = (old[p + 1] * wa + px[p + 1] * wb) / al; mix[p + 2] = (old[p + 2] * wa + px[p + 2] * wb) / al; mix[p + 3] = al; }
            px = mix; }
    }
    if (r.d && isNum(r.w) && isNum(r.h)) {
        const dd = r.d, W = r.w;
        for (let yy = Math.max(0, -y); yy < h && y + yy < r.h; yy++) for (let xx = Math.max(0, -x); xx < w && x + xx < W; xx++) {
            const s = (yy * w + xx) * 4, p = ((y + yy) * W + x + xx) * 4, sa = px[s + 3]; if (!sa) continue;
            if (sa === 255 || !dd[p + 3]) { dd[p] = px[s]; dd[p + 1] = px[s + 1]; dd[p + 2] = px[s + 2]; dd[p + 3] = sa; continue; }
            const al = sa / 255, da = dd[p + 3] / 255, oa = al + da * (1 - al);
            for (let c = 0; c < 3; c++) dd[p + c] = Math.round((px[s + c] * al + dd[p + c] * da * (1 - al)) / oa); dd[p + 3] = Math.round(oa * 255);
        }
        return;
    }
    // the GPU renderer's recorder (the settings screen on the car): a pixel image by id (its blit takes only layers)
    if (typeof r.image === 'function' && !r.d) { let rec = null; try { rec = require('./kit/record'); } catch (e) {}
        if (rec && typeof rec.setImage === 'function') { const id = (0x43A30000 + ((w * 131 + h) & 0xffff)) >>> 0; rec.setImage(id, w, h, Buffer.from(px)); r.image(id, x, y, w, h); return; } }
    if (typeof r.blit === 'function') { const { Canvas } = require('./kit/canvas'), c = new Canvas(w, h); c.d.set(px); r.blit(c, x, y); }
}
module.exports = { TURN_G, show, NAMES, BOX, MAX_FRAMES, SOURCE, LIMIT, FADE_MS, setDir, scan, status, resolve, want, pick, frameOf, frameAt, reset, draw, folder, fit, encode, decodeFile, prepare, OWN };
