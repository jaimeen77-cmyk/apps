'use strict';
// redline-lead 0.4.0: scene clips. While Cluster Redline asks for it (its "Record scenes" setting), the helper keeps
// the last 30 s of what the front camera measures (10 frames a second: the objects, the car followed, the lane lines,
// and the speed and gear the app sends) and saves a clip of 20 s before to 10 s after a scene:
//   vru        a pedestrian or a cyclist within 30 m ahead and 2.5 m of our path
//   cutin      a vehicle in a lane beside us, within 40 m, coming 0.6 m nearer our lane in a second
//   departure  the app's lead car departure alert
//   button     the driver (BC pressed three times, or Save now on the settings screen)
// One file a clip (JSON lines: a header, then the frames) in DIR, at most MAX_FILES / MAX_BYTES (the oldest go).
const fs = require('fs'), path = require('path');
const DIR = process.env.REDLINE_CLIPS_DIR || '/var/opt/public/redline-clips';
const KEEP_MS = 30000, BEFORE_MS = 20000, AFTER_MS = 10000, FRAME_MS = 100, AUTO_GAP_MS = 15000, MAX_FILES = 50, MAX_BYTES = 5 * 1024 * 1024;
const VEHICLE = [2, 3, 4, 5, 6];
class Clips {
    constructor(o) {
        o = o || {}; this.dir = o.dir || DIR; this.fs = o.fs || fs; this.clock = o.clock || Date.now; this.version = o.version || '';
        this.on = false; this.frames = []; this.lastFrame = 0; this.pending = null; this.lastAuto = -Infinity; this.ys = {}; this.saved = 0; this.error = null;
        this.car = { speed: null, gear: null };
    }
    set(on) { this.on = !!on; if (!this.on) { this.frames = []; this.pending = null; this.ys = {}; } }
    // the app's speed (km/h) and gear, with each command
    vehicle(speed, gear) { this.car = { speed: typeof speed === 'number' ? Math.round(speed * 10) / 10 : null, gear: gear || null }; }
    /** A frame of the camera's state (cam: {lead, objects}, lane: decodeLanes' data); now: ms. */
    frame(cam, lane, now) {
        if (!this.on) return;
        now = now === undefined ? this.clock() : now;
        if (now - this.lastFrame >= FRAME_MS) {
            this.lastFrame = now;
            const o = (cam && cam.objects || []).map((x) => [x.id, x.type, x.x, x.y, x.tube]);
            const ln = lane && Array.isArray(lane.lines) ? { w: lane.width, l: lane.lines.map((l) => [l.y, l.type, l.color, l.angle]) } : null;
            this.frames.push({ t: now, v: this.car.speed, g: this.car.gear, lead: cam && cam.lead || null, o, ln });
            while (this.frames.length && now - this.frames[0].t > KEEP_MS) this.frames.shift();
            this.auto(cam && cam.objects || [], now);
        }
        if (this.pending && now >= this.pending.until) this.write(now);
    }
    // the scenes found in the objects themselves
    auto(objects, now) {
        if (this.pending || now - this.lastAuto < AUTO_GAP_MS) return;
        let why = null;
        objects.forEach((x) => { if (!why && (x.type === 0 || x.type === 1) && x.x > 0 && x.x < 30 && Math.abs(x.y) < 2.5) why = 'vru'; });
        const seen = {};
        objects.forEach((x) => {
            if (VEHICLE.indexOf(x.type) < 0 || x.x < 2 || x.x > 40) return;
            seen[x.id] = true; const h = this.ys[x.id] || (this.ys[x.id] = []); h.push([now, Math.abs(x.y)]);
            while (h.length && now - h[0][0] > 1000) h.shift();
            if (!why && x.tube !== 1 && h.length > 3 && h[0][1] < 4 && h[0][1] - h[h.length - 1][1] > 0.6) why = 'cutin';
        });
        Object.keys(this.ys).forEach((id) => { if (!seen[id]) delete this.ys[id]; });
        if (why) { this.lastAuto = now; this.save(why, now); }
    }
    /** A scene now: the clip is written AFTER_MS later (a second scene meanwhile joins it). */
    save(why, now) {
        if (!this.on) return false;
        now = now === undefined ? this.clock() : now;
        if (this.pending) { if (this.pending.why.indexOf(why) < 0) this.pending.why += '+' + why; return true; }
        this.pending = { why: String(why || 'button').replace(/[^a-z+]/g, '').slice(0, 30) || 'button', at: now, until: now + AFTER_MS };
        return true;
    }
    write(now) {
        const p = this.pending; this.pending = null;
        const frames = this.frames.filter((f) => f.t >= p.at - BEFORE_MS && f.t <= p.until);
        if (!frames.length) return null;
        const d = new Date(p.at), two = (n) => (n < 10 ? '0' : '') + n;
        const name = d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds()) + '-' + p.why + '.jsonl';
        const body = JSON.stringify({ clip: name, why: p.why, at: d.toISOString(), helper: this.version, frames: frames.length, keys: 'o: [id, type, x, y, tube]; ln.l: [y, type, color, angle]' }) + '\n' +
            frames.map((f) => JSON.stringify(Object.assign({}, f, { t: f.t - p.at }))).join('\n') + '\n';
        try {
            try { this.fs.mkdirSync(this.dir); } catch (e) {}
            this.fs.writeFileSync(path.join(this.dir, name), body); this.saved++; this.error = null; this.trim();
        } catch (e) { this.error = String(e.message || e).slice(0, 120); return null; }
        return name;
    }
    list() {
        let names = []; try { names = this.fs.readdirSync(this.dir).filter((n) => /\.jsonl$/.test(n)).sort(); } catch (e) {}
        return names.map((n) => { let size = 0; try { size = this.fs.statSync(path.join(this.dir, n)).size; } catch (e) {} return { name: n, size }; });
    }
    trim() {
        const l = this.list(); let total = l.reduce((a, c) => a + c.size, 0);
        while (l.length && (l.length > MAX_FILES || total > MAX_BYTES)) { const c = l.shift(); total -= c.size; try { this.fs.unlinkSync(path.join(this.dir, c.name)); } catch (e) {} }
    }
    status() { const l = this.list(); return { on: this.on, clips: l.length, bytes: l.reduce((a, c) => a + c.size, 0), saved: this.saved, pending: this.pending ? this.pending.why : null, error: this.error }; }
}
module.exports = { Clips, DIR, KEEP_MS, BEFORE_MS, AFTER_MS };
