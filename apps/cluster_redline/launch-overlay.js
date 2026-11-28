'use strict';
// The 0-100 screen on the HUD (1.3.105): an overlay layer of its own (like the lead-car headway), placed and sized by
// HUD lamps → 0-100 screen → Position / size (display-config launchRect). A new picture only when what it shows
// changes (launch-draw.js key: at most 10 a second while timing); hidden while off.
const D = require('./display-config');
class LaunchOverlay {
    constructor(client) { this.client = client; this.layer = null; }
    // value: {speed, g, time, state, best, newBest} or null; preview: the Position / size sample
    tick(value, cfg, preview) {
        const draw = require('./launch-draw'), v = preview ? draw.SAMPLE : value;
        if (!v || (cfg.hudLaunch !== 'on' && !preview) || cfg.hudLaunchHidden) { this.hide(); return false; }
        const r = D.launchRect(cfg); let l = this.layer;
        if (l && (l.w !== r.w || l.h !== r.h)) { this.client.drop(l.ref); l = this.layer = null; }
        if (!l) { const ref = this.client.image({ target: 'hud', klass: 'overlay', z: 12, x: r.x, y: r.y, w: r.w, h: r.h, iw: r.w, ih: r.h, visible: false }); if (!ref) return false; l = this.layer = { ref, x: r.x, y: r.y, w: r.w, h: r.h, key: null, visible: false }; }
        const key = draw.key(v) + '|' + r.w + 'x' + r.h;
        if (l.key !== key) { const im = draw.drawSized(v, r.w, r.h); this.client.pixels(l.ref, null, Buffer.from(im.d.buffer, im.d.byteOffset, im.d.byteLength)); l.key = key; }
        if (l.x !== r.x || l.y !== r.y) { this.client.set(l.ref, { x: r.x, y: r.y }); l.x = r.x; l.y = r.y; }
        if (!l.visible) { this.client.set(l.ref, { visible: true }); l.visible = true; }
        return true;
    }
    hide() { const l = this.layer; if (l && l.visible) { this.client.set(l.ref, { visible: false }); l.visible = false; } }
    close() { if (this.layer) this.client.drop(this.layer.ref); this.layer = null; }
}
module.exports = { LaunchOverlay };
