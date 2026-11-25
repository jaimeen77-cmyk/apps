'use strict';
// The Animation layout's GIF on a layer of its own (1.3.64): sent at the GIF's own size, the renderer scaling it up.
//
// Until 1.3.63 the GIF was scaled up to the picture's place in the layout's image and that image's changed pixels
// sent: about 160 KB a frame on the cluster, against at most 1 MB a second shared with the HUD (3-5 frames a second
// whatever the GIF's size). Here a small image layer over the picture's place (fitted, its shape kept) holds the frame
// at the GIF's own size (my-picture.js fits it to 320 x 180 at most) and cluster-render scales it (bilinear), so what
// goes is the GIF's pixels that changed: a 160 x 90 GIF at most 57.6 KB a frame, about 20 frames a second. The
// layout's image leaves the picture out meanwhile (a still placeholder), so it is not painted again for its frames.
// The same drawing as before (my-picture.js draw: edges fading, HUD black see-through, mirrored turns, fades).
// An image layer as the layout's own, nothing else (1.3.62's GPU atlas made the car slower and is off).
// Not shown yet, or refused: painted into the layout's image as before.
const MP = require('./my-picture');

class PictureLayer {
    // client: the controller's (image, pixels, set, drop, showWhenSent, canPaint; layer / refused events)
    constructor(client, display, upload) {
        this.client = client; this.display = display; this.upload = upload || null;
        this.ref = 0; this.state = 'none'; this.size = null; this.rect = null; this.target = null;
        this.buf = null; this.sent = null; this.key = null; this.blocked = null; this.failure = null; this.frames = 0; this.skipped = 0;
        if (typeof client.on !== 'function') return;
        client.on('layer', (ref, state, reason) => { if (ref && ref === this.ref) { this.state = state; if (state === 'error') this.fail('layer', reason); } });
        client.on('refused', (op, ref, reason) => { if (op !== 'drop' && ref && ref === this.ref) this.fail(op, reason); });
    }
    // refused: painted into the layout's image again, not tried for these GIFs until they change
    fail(op, reason) { this.failure = { op: op || '', reason: reason || '' }; this.blocked = this.sig; this.hide(); }
    hide() { if (this.ref) this.client.drop(this.ref); this.ref = 0; this.state = 'none'; this.size = null; this.rect = null; this.sent = null; this.key = null; }
    release() { this.hide(); this.buf = null; }
    /** Whether the renderer shows the picture now (the layout's image then leaves it out). */
    active() { return !!(this.ref && this.state === 'shown'); }
    status() { return { state: this.ref ? this.state : 'none', size: this.size ? this.size.w + 'x' + this.size.h : null, frames: this.frames, skipped: this.skipped, failure: this.failure }; }
    /**
     * Each tick of the controller. o: {target, klass, z, rect (the layout image's place on the target), iw, ih (its
     * size), box (the picture's place in that image, redline-hud.js pictureBox, or null), frame (my-picture.js's
     * frame for this display), sent (the layout's image has its first frame)}. Returns active().
     */
    update(now, o) {
        const f = o.frame, gifs = f && f.mine ? MP.gifs() : [], g = gifs.find((x) => x.name === f.mine);
        this.sig = gifs.map((x) => x.name + ':' + x.sig).join('|');
        if (!o.box || !g || this.blocked === this.sig) { if (this.ref) this.hide(); return false; }
        if (this.blocked && this.blocked !== this.sig) { this.blocked = null; this.failure = null; }
        const gw = g.gif.w, gh = g.gif.h;
        // its place: the GIF fitted inside the picture's box (as my-picture.js letterboxes it), on the target
        const k = Math.min(o.box.w / gw, o.box.h / gh), dw = gw * k, dh = gh * k, sx = o.rect.w / o.iw, sy = o.rect.h / o.ih;
        const bx = o.box.x + (o.box.w - dw) / 2, by = o.box.y + (o.box.h - dh) / 2;
        const r = { x: Math.round(o.rect.x + bx * sx), y: Math.round(o.rect.y + by * sy), w: Math.max(2, Math.round(dw * sx)), h: Math.max(2, Math.round(dh * sy)) };
        if (this.ref && (this.size.w !== gw || this.size.h !== gh || this.target !== o.target)) this.hide();   // another GIF size: a new layer
        if (!this.ref) {
            if (!o.sent) return false;
            this.ref = this.client.image({ target: o.target, klass: o.klass, z: o.z, x: r.x, y: r.y, w: r.w, h: r.h, iw: gw, ih: gh, sampling: 'bilinear', visible: false, fps: 30 });
            if (!this.ref) { this.fail('layer', 'client refused'); return false; }
            this.state = 'waiting'; this.size = { w: gw, h: gh }; this.rect = r; this.target = o.target; this.sent = null; this.key = null;
        } else if (r.x !== this.rect.x || r.y !== this.rect.y || r.w !== this.rect.w || r.h !== this.rect.h) {
            this.client.set(this.ref, { x: r.x, y: r.y, w: r.w, h: r.h }); this.rect = r;
        }
        // the frame (a fade's mix included), drawn only when it changes
        const key = [f.mine, f.sig, f.i, f.mirror ? 1 : 0, f.from ? f.from.mine + ':' + f.from.i + ':' + (f.from.mirror ? 1 : 0) : '', f.t === undefined ? '' : f.t].join('|');
        if (key === this.key) return this.active();
        if (this.sent && typeof this.client.canPaint === 'function' && !this.client.canPaint(this.ref)) return this.active();
        if (this.sent && this.upload && !this.upload.ready(now)) return this.active();
        const n = gw * gh * 4;
        if (!this.buf || this.buf.length !== n) this.buf = new Uint8ClampedArray(n); else this.buf.fill(0);
        MP.draw({ d: this.buf, w: gw, h: gh }, f, 0, 0, gw, gh);
        const px = Buffer.from(this.buf.buffer, this.buf.byteOffset, n);
        if (!this.sent) {
            if (this.upload && !this.upload.allow(n, now, false, this)) { this.skipped++; return this.active(); }
            this.client.pixels(this.ref, null, px);
            if (typeof this.client.showWhenSent === 'function') this.client.showWhenSent(this.ref); else this.client.set(this.ref, { visible: true });
            this.sent = Buffer.from(px);
        } else {
            // the rows and columns that changed (one rectangle)
            let x0 = gw, y0 = gh, x1 = -1, y1 = -1; const a = this.sent;
            for (let y = 0; y < gh; y++) { const row = y * gw * 4; let first = -1, last = -1;
                for (let x = 0; x < gw; x++) { const p = row + x * 4; if (a[p] !== px[p] || a[p + 1] !== px[p + 1] || a[p + 2] !== px[p + 2] || a[p + 3] !== px[p + 3]) { if (first < 0) first = x; last = x; } }
                if (first >= 0) { if (y < y0) y0 = y; y1 = y; if (first < x0) x0 = first; if (last > x1) x1 = last; } }
            if (x1 >= 0) {
                const w = x1 - x0 + 1, h = y1 - y0 + 1, out = Buffer.alloc(w * h * 4);
                for (let y = 0; y < h; y++) px.copy(out, y * w * 4, ((y0 + y) * gw + x0) * 4, ((y0 + y) * gw + x0 + w) * 4);
                if (this.upload && !this.upload.allow(out.length, now, false, this)) { this.skipped++; return this.active(); }
                this.client.pixels(this.ref, [{ x: x0, y: y0, w, h }], out);
                px.copy(this.sent);
            }
        }
        this.key = key; this.frames++;
        return this.active();
    }
}
module.exports = { PictureLayer };
