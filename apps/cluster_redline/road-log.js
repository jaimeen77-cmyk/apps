'use strict';
// The cut-in / pedestrian warning recording (1.3.100): road-alerts.log in the app's data folder, for checking the warnings
// (road-alerts.js) on the car. Off by default (QR log collection → Warning recording). While on, the last 25 s of the
// helper's camera frames are kept in memory; a warning writes 5 s before it and 3 s after it, "Save a miss" (a cut-in or
// a person the warning missed) writes the last 20 s at once. One JSON line a record: a header {clip, why, at, kind, id,
// helper, frames, keys}, then one line a frame {t (ms from the warning / the press), v (km/h), o: [[id, type, x, y]],
// ln: [[y, angle]]} (the 1.3.89 scene clips' shape, so the same tools read it). No position is written.
// At most 3 MB: road-alerts.log up to 1.5 MB, then it becomes road-alerts.log.1 (the older .1 goes) and a new one starts.
// Taken off the phone with QR log collection (the helper's page joins the two parts).
const path = require('path');
const KEEP_MS = 25000, BEFORE_MS = 5000, AFTER_MS = 3000, MISS_MS = 20000, PART_BYTES = 1.5 * 1024 * 1024, NAME = 'road-alerts.log';
const r2 = (v) => Math.round(v * 100) / 100;
class RoadLog {
    constructor(o) { o = o || {}; this.fs = o.fs || require('fs'); this.dir = o.dir || null; this.clock = o.clock || Date.now; this.version = o.version || ''; this.frames = []; this.pending = []; this.saved = 0; this.error = null; this.frameAt = null; }
    file() { return this.dir ? path.join(this.dir, NAME) : null; }
    /** One camera frame from the helper's message (kept only while recording). */
    frame(m, speed) {
        const c = m && m.cam; if (!c || !Array.isArray(c.objects) || typeof c.at !== 'number' || c.at === this.frameAt) return;
        this.frameAt = c.at;
        const lines = m.lane && m.lane.data && Array.isArray(m.lane.data.lines) ? m.lane.data.lines : [];
        this.frames.push({ at: c.at, v: typeof speed === 'number' ? Math.round(speed * 10) / 10 : null, o: c.objects.map((x) => [x.id, x.type, r2(x.x), r2(x.y)]), ln: lines.map((l) => [r2(l.y), typeof l.angle === 'number' ? r2(l.angle) : null]) });
        while (this.frames.length && c.at - this.frames[0].at > KEEP_MS) this.frames.shift();
        // a warning's record is written once its 3 s after have come
        this.pending = this.pending.filter((p) => { if (c.at - p.at < AFTER_MS) return true; this.write(p, this.frames.filter((f) => f.at >= p.at - BEFORE_MS && f.at <= p.at + AFTER_MS)); return false; });
    }
    /** A warning (road-alerts.js frame()'s hit): written 3 s later. */
    warned(hit, at) { if (hit && !this.pending.some((p) => p.id === hit.id && Math.abs(p.at - at) < 1000)) this.pending.push({ at, why: hit.kind, kind: hit.kind, id: hit.id }); }
    /** "Save a miss": the last 20 s now. */
    miss() { const last = this.frames.length ? this.frames[this.frames.length - 1].at : null; if (last === null) { this.error = 'no frames'; return false; } this.write({ at: last, why: 'miss' }, this.frames.filter((f) => f.at >= last - MISS_MS)); return true; }
    write(p, frames) {
        const file = this.file(); if (!file || !frames.length) return;
        const head = { clip: (this.saved + 1), why: p.why, at: new Date(this.clock()).toISOString(), kind: p.kind || null, id: p.id === undefined ? null : p.id, app: this.version, frames: frames.length, keys: 'o: [id, type, x, y]; ln: [y, angle]' };
        const text = [JSON.stringify(head)].concat(frames.map((f) => JSON.stringify({ t: f.at - p.at, v: f.v, o: f.o, ln: f.ln }))).join('\n') + '\n';
        try {
            let size = 0; try { size = this.fs.statSync(file).size; } catch (e) {}
            if (size + text.length > PART_BYTES && size > 0) { try { this.fs.unlinkSync(file + '.1'); } catch (e) {} this.fs.renameSync(file, file + '.1'); }
            this.fs.appendFileSync(file, text); this.saved++; this.error = null;
        } catch (e) { this.error = String(e && e.message || e).slice(0, 80); }
    }
    /** The recording off: what is kept in memory goes (the files stay until Delete logs). */
    stop() { this.frames = []; this.pending = []; this.frameAt = null; }
    /** Delete logs: road-alerts.log and its .1, and (others) the files named. */
    clear(others) {
        const names = [NAME].concat(others || []), dir = this.dir; let n = 0;
        if (dir) names.forEach((b) => [b, b + '.1'].forEach((x) => { try { this.fs.unlinkSync(path.join(dir, x)); n++; } catch (e) {} }));
        this.saved = 0; return n;
    }
    size() { const file = this.file(); let k = null; if (file) [file + '.1', file].forEach((p) => { try { k = (k || 0) + this.fs.statSync(p).size; } catch (e) {} }); return k; }
    status() { return { saved: this.saved, kept: this.frames.length, pending: this.pending.length, size: this.size(), error: this.error }; }
}
module.exports = { RoadLog, NAME, PART_BYTES, BEFORE_MS, AFTER_MS, MISS_MS };
