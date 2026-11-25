'use strict';
// The Animation layout's GIFs on the GPU (1.3.62): 20 frames a second and more on the cluster and the HUD.
//
// Before, each new GIF frame was painted into the layout's image and its changed pixels sent to the renderer
// (about 160 KB a frame on the cluster against a shared allowance of at most 1 MB a second, so 3-5 frames a second,
// less while the HUD's went too). Now every frame of the GIFs goes to the renderer once, when they are loaded: one
// atlas of colour numbers (r8, the frames side by side) and one palette (a row of 256 colours a GIF). A small
// effect layer over the picture's place draws the frame (fitted, bilinear, edges fading into the dark; on the HUD
// black is see-through, as my-picture.js draws it), and the renderer itself steps through the frames at their own
// GIF delays (an animation of the frame's place in the atlas), so nothing is sent per frame. A change of scene
// (stop, drive, reverse, left, right) sends the new GIF's steps and fades over 400 ms.
// The layout's image then leaves the picture out (a still placeholder), so it is not painted again for it either.
//
// Until the renderer shows the effect layer (the atlas written), or if it refuses any of it (an older renderer, its
// pixel memory full), the picture is painted into the image as before.
const MP = require('./my-picture');
// Off since 1.3.63: on the car 1.3.62 made things slower (the cluster, and the head unit: the GIF player's page no
// longer opened on the phone). Kept for a test build; the picture is painted as in 1.3.61.
let enabled = false;
const setEnabled = (on) => { enabled = !!on; };
const isEnabled = () => enabled;
const CLEAR = 255, MAX_SIDE = 2048;
// the atlas's bytes at most, per display: a whole 30-frame GIF of the picture's box (320 x 180) fits; more frames are
// thinned. The renderer keeps two copies; its pixel memory full, half as much is tried, then a quarter.
const CAP_BYTES = 1800 * 1024;
const FADE_MS = MP.FADE_MS || 400;

const FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v_uv;',
    'uniform sampler2D u_atlas;',
    'uniform sampler2D u_pal;',
    'uniform vec4 u_size;',   // the atlas's w, h, the palette's rows, 1 on the HUD
    'uniform vec2 u_box;',    // the layer's w, h (pixels)
    'uniform vec4 u_a;',      // the frame shown: x, y, w, h in the atlas (the renderer steps it)
    'uniform vec4 u_b;',      // the frame faded from
    'uniform vec4 u_meta;',   // the palette rows of a and b, mirrored a, mirrored b
    'uniform float u_t;',     // a's share (1: no fade)
    'vec4 texel(vec4 tile, float row, vec2 p) {',
    '  float i = floor(texture2D(u_atlas, (tile.xy + p + 0.5) / u_size.xy).r * 255.0 + 0.5);',
    '  if (i > 254.5) return vec4(0.0);',
    '  return vec4(texture2D(u_pal, vec2((i + 0.5) / 256.0, (row + 0.5) / u_size.z)).rgb, 1.0);',
    '}',
    'vec4 picture(vec4 tile, float row, float mirror) {',
    '  if (tile.z < 1.0 || tile.w < 1.0) return vec4(0.0);',
    '  float k = min(u_box.x / tile.z, u_box.y / tile.w);',
    '  vec2 d = max(vec2(2.0), floor(tile.zw * k + 0.5));',
    '  vec2 o = floor((u_box - d) * 0.5 + 0.5);',
    '  vec2 q = v_uv * u_box - o;',
    '  if (q.x < 0.0 || q.y < 0.0 || q.x > d.x || q.y > d.y) return vec4(0.0);',
    '  vec2 s = q;',
    '  if (mirror > 0.5) s.x = d.x - s.x;',
    '  vec2 f = clamp(s / k - 0.5, vec2(0.0), tile.zw - 1.0);',
    '  vec2 f0 = floor(f);',
    '  vec2 w = f - f0;',
    '  vec2 f1 = min(f0 + 1.0, tile.zw - 1.0);',
    '  vec4 c = texel(tile, row, f0) * (1.0 - w.x) * (1.0 - w.y) + texel(tile, row, vec2(f1.x, f0.y)) * w.x * (1.0 - w.y)',
    '         + texel(tile, row, vec2(f0.x, f1.y)) * (1.0 - w.x) * w.y + texel(tile, row, f1) * w.x * w.y;',
    '  float fade = max(1.0, floor(min(d.x, d.y) * 0.08 + 0.5));',
    '  float e = max(0.0, min(min(q.x, d.x - q.x), min(q.y, d.y - q.y)) - 0.5);',
    '  return e >= fade ? c : c * pow(e / fade, 1.5);',
    '}',
    'void main() {',
    '  vec4 c = picture(u_a, u_meta.x, u_meta.z);',
    '  if (u_t < 0.999) c = c * u_t + picture(u_b, u_meta.y, u_meta.w) * (1.0 - u_t);',
    '  if (c.a <= 0.002) { gl_FragColor = vec4(0.0); return; }',
    '  vec3 rgb = c.rgb / c.a;',
    '  float a = c.a;',
    '  if (u_size.w > 0.5) a *= min(1.0, max(rgb.r, max(rgb.g, rgb.b)) / 0.25);',
    '  gl_FragColor = vec4(rgb, a);',
    '}'
].join('\n');

// Keeps n of a GIF's frames, evenly; each kept one lasts as long as those it stands for.
function thin(frames, n) {
    if (frames.length <= n) return frames.map((f, i) => ({ px: f.px, delay: f.delay, from: i }));
    const out = [];
    for (let j = 0; j < n; j++) {
        const a = Math.floor(j * frames.length / n), b = Math.floor((j + 1) * frames.length / n);
        let delay = 0; for (let q = a; q < b; q++) delay += frames[q].delay;
        out.push({ px: frames[a].px, delay, from: a });
    }
    return out;
}
// A GIF's colour numbers as at most 255 colours (255: clear): those used, the most used kept when there are more,
// each other one as the nearest kept one. -> {map: Uint8Array (old number -> new), rgb: Uint8Array (new -> rgb)}
function palette(gif) {
    const n = Math.floor(gif.colours.length / 3), count = new Uint32Array(n), CL = 0xFFFF;
    gif.frames.forEach((f) => { const px = f.px; for (let i = 0; i < px.length; i++) { const c = px[i]; if (c !== CL && c < n) count[c]++; } });
    const used = []; for (let c = 0; c < n; c++) if (count[c]) used.push(c);
    const keep = used.length <= 255 ? used : used.slice().sort((a, b) => count[b] - count[a] || a - b).slice(0, 255);
    const map = new Uint8Array(n).fill(0), rgb = new Uint8Array(256 * 3), at = new Int16Array(n).fill(-1), col = gif.colours;
    keep.forEach((c, j) => { at[c] = j; rgb[j * 3] = col[c * 3]; rgb[j * 3 + 1] = col[c * 3 + 1]; rgb[j * 3 + 2] = col[c * 3 + 2]; map[c] = j; });
    if (keep.length < used.length) used.forEach((c) => {
        if (at[c] >= 0) return;
        let best = 0, bd = Infinity;
        keep.forEach((k, j) => { const dr = col[c * 3] - col[k * 3], dg = col[c * 3 + 1] - col[k * 3 + 1], db = col[c * 3 + 2] - col[k * 3 + 2], dd = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (dd < bd) { bd = dd; best = j; } });
        map[c] = best;
    });
    return { map, rgb };
}
// How the GIFs lie in the atlas with n[g] frames each: one band of rows a GIF. -> {w, h, bands: [{y, cols}]}
function layout(list, n) {
    let w = 1, h = 0; const bands = [];
    list.forEach((it, g) => {
        const gw = it.gif.w, gh = it.gif.h, cols = Math.max(1, Math.min(n[g], Math.floor(MAX_SIDE / gw))), rows = Math.ceil(n[g] / cols);
        bands.push({ y: h, cols }); w = Math.max(w, cols * gw); h += rows * gh;
    });
    return { w, h: Math.max(1, h), bands };
}
/**
 * The atlas for the GIFs (MP.gifs(): [{name, sig, gif}]): {w, h, data (r8: colour numbers, 255 clear), rows, pal
 * (rgba8 256 x rows), entries: {name: {row, w, h, n (frames in the source GIF), tiles: [[x, y, w, h]], delays,
 * total, of: source frame -> tile}}, bytes, thinned}. Over cap bytes (or 2048 px a side), every GIF's frames are
 * thinned alike until it fits.
 */
function build(list, cap) {
    cap = cap || CAP_BYTES;
    if (!list.length) return null;
    const n = list.map((it) => it.gif.frames.length);
    let lay = layout(list, n), thinned = false;
    for (let guard = 0; (lay.w * lay.h > cap || lay.h > MAX_SIDE) && guard < 64; guard++) {
        if (n.every((v) => v <= 1)) break;
        for (let g = 0; g < n.length; g++) n[g] = Math.max(1, Math.floor(n[g] * 0.85));
        lay = layout(list, n); thinned = true;
    }
    if (lay.w * lay.h > cap * 2 || lay.h > MAX_SIDE) return null;
    const data = Buffer.alloc(lay.w * lay.h, CLEAR), rows = list.length, pal = Buffer.alloc(256 * rows * 4), entries = {};
    list.forEach((it, g) => {
        const gif = it.gif, gw = gif.w, gh = gif.h, p = palette(gif), frames = thin(gif.frames, n[g]), band = lay.bands[g], tiles = [], CL = 0xFFFF;
        for (let j = 0; j < 255; j++) { const o = (g * 256 + j) * 4; pal[o] = p.rgb[j * 3]; pal[o + 1] = p.rgb[j * 3 + 1]; pal[o + 2] = p.rgb[j * 3 + 2]; pal[o + 3] = 255; }
        frames.forEach((f, j) => {
            const tx = (j % band.cols) * gw, ty = band.y + Math.floor(j / band.cols) * gh, px = f.px, map = p.map;
            for (let y = 0; y < gh; y++) { const row = (ty + y) * lay.w + tx, src = y * gw;
                for (let x = 0; x < gw; x++) { const c = px[src + x]; data[row + x] = c === CL || c >= map.length ? CLEAR : map[c]; } }
            tiles.push([tx, ty, gw, gh]);
        });
        const of = new Uint16Array(gif.frames.length);
        frames.forEach((f, j) => { const end = j + 1 < frames.length ? frames[j + 1].from : gif.frames.length; for (let q = f.from; q < end; q++) of[q] = j; });
        const delays = frames.map((f) => Math.max(20, f.delay | 0));
        entries[it.name] = { row: g, w: gw, h: gh, n: gif.frames.length, tiles, delays, total: delays.reduce((a, b) => a + b, 0), of };
    });
    return { w: lay.w, h: lay.h, data, rows, pal, entries, bytes: data.length + pal.length, thinned };
}
// The renderer's steps through a GIF's frames: "t:x,y,w,h ..." (step), the first again at its end, looped.
function keysOf(e) {
    const out = []; let t = 0;
    e.tiles.forEach((tile, j) => { out.push(t + ':' + tile.join(',')); t += e.delays[j]; });
    out.push(t + ':' + e.tiles[0].join(','));
    return out.join(' ');
}

class Flipbook {
    // client: the controller's (OutputClient: asset, effect, bind, uniform, animate, stop, drop; layer / refused events)
    // display: 'cluster' or 'hud'; upload: the shared UploadPacer (the atlas spends it once)
    constructor(client, display, upload) {
        this.client = client; this.display = display; this.upload = upload || null;
        this.atlas = null; this.atlasRef = 0; this.palRef = 0; this.sig = null; this.target = null;
        this.ref = 0; this.state = 'none'; this.rect = null; this.key = null; this.anim = 0; this.fadeAnim = 0;
        this.failure = null; this.retryAt = 0; this.now = 0; this.built = 0; this.shrink = 0; this.blocked = null; this.wanted = null;
        this.supported = typeof client.effect === 'function' && typeof client.asset === 'function' && typeof client.animate === 'function';
        if (!this.supported || typeof client.on !== 'function') return;
        client.on('layer', (ref, state, reason) => {
            if (!ref || ref !== this.ref) return;
            this.state = state; this.reason = reason || '';
            if (state === 'error') this.fail('layer', this.reason);
        });
        client.on('refused', (op, ref, reason) => {
            if (op === 'drop' || !ref || (ref !== this.ref && ref !== this.atlasRef && ref !== this.palRef)) return;
            this.fail(op, reason);
        });
        // a new connection: the client makes the assets again with their pixels; the controller drops the layer
        client.on('disconnected', () => { this.state = 'none'; });
    }
    // Refused: the renderer's memory full, half the room tried a second later (twice); anything else (an older
    // renderer, the shader refused) is not tried again for these GIFs, painted as before.
    fail(op, reason) {
        this.failure = { op: op || '', reason: reason || '', at: this.now };
        const memory = /pixel memory|too many assets/.test(reason || '') && this.shrink < 2;
        if (memory) { this.shrink++; this.retryAt = this.now + 1000; } else this.blocked = this.sig || this.wanted;
        this.release();
    }
    /** The effect layer only (the atlas stays for when the layout's image is shown again). */
    hide() { if (this.ref) this.client.drop(this.ref); this.ref = 0; this.state = 'none'; this.rect = null; this.key = null; this.anim = 0; this.fadeAnim = 0; }
    /** Everything, the atlas too. */
    release() {
        this.hide();
        if (this.atlasRef) this.client.drop(this.atlasRef); if (this.palRef) this.client.drop(this.palRef);
        this.atlasRef = 0; this.palRef = 0; this.atlas = null; this.sig = null; this.target = null;
    }
    /** Whether the renderer shows the picture now (the layout's image then leaves it out). */
    active() { return !!(this.ref && this.state === 'shown'); }
    status() { return { supported: this.supported, state: this.ref ? this.state : this.atlasRef ? 'loaded' : 'none', frames: this.atlas ? Object.keys(this.atlas.entries).reduce((a, k) => a + this.atlas.entries[k].tiles.length, 0) : 0, bytes: this.atlas ? this.atlas.bytes : 0, thinned: !!(this.atlas && this.atlas.thinned), failure: this.failure }; }
    /**
     * Each tick of the controller. o: {target, klass, z, rect (the image layer's place on the target), iw, ih (its
     * image's size), box (the picture's place in the image, redline-hud.js pictureBox, or null), frame (the frame
     * my-picture.js picked for this display: {mine, i, mirror, from, t}), sent (the image layer has its first frame)}.
     */
    update(now, o) {
        this.now = now;
        if (!this.supported) return false;
        const f = o.frame;
        const list = o.box && f && f.mine ? MP.gifs() : [], sig = list.map((g) => g.name + ':' + g.sig).join('|');
        this.wanted = sig;
        if (!list.length || now < this.retryAt || this.blocked === sig) { if (this.ref || this.atlasRef) this.release(); return false; }
        if (sig !== this.sig || o.target !== this.target) {
            this.release();
            const atlas = build(list, CAP_BYTES / Math.pow(2, this.shrink));
            if (!atlas) { this.fail('atlas', 'too large'); return false; }
            this.atlas = atlas; this.sig = sig; this.target = o.target; this.built++;
            this.atlasRef = this.client.asset({ target: o.target, format: 'r8', w: atlas.w, h: atlas.h, sampling: 'nearest' });
            this.palRef = this.client.asset({ target: o.target, format: 'rgba8', w: 256, h: atlas.rows, sampling: 'nearest' });
            if (!this.atlasRef || !this.palRef) { this.fail('asset', 'client refused'); return false; }
            this.client.pixels(this.atlasRef, null, atlas.data); this.client.pixels(this.palRef, null, atlas.pal);
            if (this.upload) this.upload.allow(atlas.bytes, now, true, this);
        }
        const e = this.atlas.entries[f.mine];
        if (!e) return false;
        const k = o.rect.w / o.iw, ky = o.rect.h / o.ih;
        const r = { x: Math.round(o.rect.x + o.box.x * k), y: Math.round(o.rect.y + o.box.y * ky), w: Math.max(2, Math.round(o.box.w * k)), h: Math.max(2, Math.round(o.box.h * ky)) };
        if (!this.ref) {
            if (!o.sent) return false;
            this.ref = this.client.effect({ target: o.target, klass: o.klass, z: o.z, x: r.x, y: r.y, w: r.w, h: r.h, fs: FS });
            if (!this.ref) { this.fail('layer', 'client refused'); return false; }
            this.state = 'waiting'; this.rect = r; this.key = null;
            this.client.bind(this.ref, 'u_atlas', this.atlasRef); this.client.bind(this.ref, 'u_pal', this.palRef);
            this.client.uniform(this.ref, 'u_size', [this.atlas.w, this.atlas.h, this.atlas.rows, this.display === 'hud' ? 1 : 0]);
            this.client.uniform(this.ref, 'u_box', [r.w, r.h]);
        } else if (r.x !== this.rect.x || r.y !== this.rect.y || r.w !== this.rect.w || r.h !== this.rect.h) {
            this.client.set(this.ref, { x: r.x, y: r.y, w: r.w, h: r.h });
            if (r.w !== this.rect.w || r.h !== this.rect.h) this.client.uniform(this.ref, 'u_box', [r.w, r.h]);
            this.rect = r;
        }
        const key = f.mine + (f.mirror ? '~' : '');
        if (key !== this.key) {
            const first = this.key === null, from = f.from && this.atlas.entries[f.from.mine];
            this.key = key;
            if (this.anim) this.client.stop(this.ref, this.anim);
            this.client.uniform(this.ref, 'u_a', e.tiles[0]);
            this.anim = this.client.animate(this.ref, { property: 'uniform', name: 'u_a', keys: keysOf(e), loop: true, interp: 'step' });
            if (this.fadeAnim) { this.client.stop(this.ref, this.fadeAnim); this.fadeAnim = 0; }
            this.client.uniform(this.ref, 'u_t', [1]);
            if (!first && from) {
                // the GIF left stands at the frame it was on while the new one fades in
                const j = from.of[Math.min(from.of.length - 1, Math.max(0, f.from.i | 0))] || 0;
                this.client.uniform(this.ref, 'u_b', from.tiles[j]);
                this.client.uniform(this.ref, 'u_meta', [e.row, from.row, f.mirror ? 1 : 0, f.from.mirror ? 1 : 0]);
                this.fadeAnim = this.client.animate(this.ref, { property: 'uniform', name: 'u_t', keys: '0:0 ' + FADE_MS + ':1', loop: false, interp: 'linear' });
            } else {
                this.client.uniform(this.ref, 'u_b', e.tiles[0]);
                this.client.uniform(this.ref, 'u_meta', [e.row, e.row, f.mirror ? 1 : 0, 0]);
            }
        }
        return this.active();
    }
}
module.exports = { setEnabled, isEnabled, Flipbook, build, keysOf, palette, thin, FS, CAP_BYTES, CLEAR };
