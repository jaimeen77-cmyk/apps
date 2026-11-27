'use strict';
// Speed cameras from the public list (1.3.99): 공공데이터포털 전국무인교통단속카메라표준데이터, built into speed-cams-data.js
// by tools/speed-cams/build.py, read with the car's position from the lead-car helper (redline-lead 0.6.0+, Positioning
// currentLocation about once a second). For the vehicle alerts when the car's own navigation sends no camera events
// (it sends them only while it guides a route); worker.js prefers the navigation's own events when there are any.
//
// The list has no direction a camera faces. A camera is taken when it lies ahead along the way the car is going (from
// its last fixes at least 10 m apart), within 25 m to the side, and getting nearer; it is let go once passed (20 m behind
// it), more than 40 m to the side, or not seen again for 5 s. On a road with both directions close together, a camera
// for the other direction can still show: the list cannot tell them apart.
// Between fixes the distance is carried on with the car's speed. Nothing is written anywhere; positions are not kept.
// Section cameras: passing a section's start camera starts the section (its length from the list); the average speed is
// the distance driven over the time since, until the length (plus 300 m) is driven or its end camera is passed.
const LAT_M = 110540, SIDE_M = 25, LET_GO_SIDE_M = 40, PASSED_M = 20, LOST_MS = 5000, HEAD_MIN_M = 10, FIX_STALE_MS = 4000;
const NEAR_M = 300, NEAR_FAST_M = 500, FAST_KMH = 80, CELL = 0.01;
const F = { CHILD: 1, ELDER: 2, START: 4, END: 8, SIGNAL: 16 };
let table = null;
/** The cameras, decoded once: {n, lat[], lon[], limit[], flags[], len[] (m), cells: Map 'i|j' -> [indexes], date}. */
function load(data) {
    if (table && !data) return table;
    const d = data || require('./speed-cams-data'), b = Buffer.from(d.b64, 'base64'), n = Math.floor(b.length / 12);
    const t = { n, date: d.date || null, lat: new Float64Array(n), lon: new Float64Array(n), limit: new Uint8Array(n), flags: new Uint8Array(n), len: new Uint32Array(n), cells: new Map() };
    for (let i = 0; i < n; i++) {
        const o = i * 12; t.lat[i] = b.readInt32LE(o) / 1e6; t.lon[i] = b.readInt32LE(o + 4) / 1e6; t.limit[i] = b[o + 8]; t.flags[i] = b[o + 9]; t.len[i] = b.readUInt16LE(o + 10) * 10;
        const k = Math.floor(t.lat[i] / CELL) + '|' + Math.floor(t.lon[i] / CELL); let c = t.cells.get(k); if (!c) t.cells.set(k, c = []); c.push(i);
    }
    if (!data) table = t;
    return t;
}
const rad = Math.PI / 180;
// metres east (x) and north (y) from (lat0, lon0)
function local(lat0, lon0, lat, lon) { return [(lon - lon0) * Math.cos(lat0 * rad) * 111320, (lat - lat0) * LAT_M]; }
class SpeedCams {
    constructor(data) { this.data = data || null; this.t = null; this.reset(); }
    reset() { this.fix = null; this.anchor = null; this.heading = null; this.cam = null; this.section = null; this.lastAt = null; this.fixes = 0; }
    table() { if (!this.t) this.t = load(this.data); return this.t; }
    /** A position from the helper: {lat, lon, at} (the helper's own time; a new one each second or so). */
    position(p, now) {
        if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number' || p.valid === false) return;
        if (this.fix && this.fix.at === p.at) return;
        this.fix = { lat: p.lat, lon: p.lon, at: p.at, t: now }; this.fixes++;
        if (!this.anchor) { this.anchor = this.fix; return; }
        const [x, y] = local(this.anchor.lat, this.anchor.lon, p.lat, p.lon), d = Math.hypot(x, y);
        if (d >= HEAD_MIN_M) { this.heading = (Math.atan2(x, y) / rad + 360) % 360; this.anchor = this.fix; }
    }
    /** What shows now: {camera: {m, limit, zone, section, inside, avg, remain, over}} or null. speed: km/h (or null). */
    tick(now, speed) {
        const dt = this.lastAt === null ? 0 : Math.max(0, Math.min(2000, now - this.lastAt)) / 1000; this.lastAt = now;
        const v = typeof speed === 'number' && speed >= 0 ? speed / 3.6 : null;
        if (this.section) {
            if (v !== null) this.section.driven += v * dt;
            this.section.time += dt;
            if (this.section.driven > this.section.len + 300) this.section = null;
        }
        if (!this.fix || now - this.fix.t > FIX_STALE_MS || this.heading === null) { this.cam = null; return this.view(speed); }
        // the car's place now: the last fix carried on along the heading with the speed
        const ahead = v !== null ? v * Math.max(0, now - this.fix.t) / 1000 : 0, h = this.heading * rad, ux = Math.sin(h), uy = Math.cos(h);
        const t = this.table(), lat0 = this.fix.lat, lon0 = this.fix.lon, range = (speed || 0) >= FAST_KMH ? NEAR_FAST_M : NEAR_M;
        const along = (i) => { const [x, y] = local(lat0, lon0, t.lat[i], t.lon[i]); return [x * ux + y * uy - ahead, Math.abs(x * uy - y * ux)]; };
        // the camera followed: kept until passed, off to the side, or gone
        if (this.cam) {
            const [a, s] = along(this.cam.i);
            if (a < -PASSED_M || s > LET_GO_SIDE_M || a > range + 100) {
                if (a < -PASSED_M && s <= LET_GO_SIDE_M) this.passed(this.cam.i);
                this.cam = null;
            } else { this.cam.m = Math.max(0, a); this.cam.seen = now; }
        }
        if (!this.cam) {
            const ci = Math.floor(lat0 / CELL), cj = Math.floor(lon0 / CELL); let best = null;
            for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
                const c = t.cells.get((ci + di) + '|' + (cj + dj)); if (!c) continue;
                for (const i of c) { const [a, s] = along(i); if (a > 0 && a <= range && s <= SIDE_M && (!best || a < best.m)) best = { i, m: a, seen: now }; }
            }
            this.cam = best;
        }
        return this.view(speed);
    }
    passed(i) {
        const t = this.table(), f = t.flags[i];
        if (f & F.START && t.len[i] > 0) this.section = { limit: t.limit[i], len: t.len[i], driven: 0, time: 0 };
        else if (f & F.END) this.section = null;
    }
    view(speed) {
        const t = this.t, s = this.section, c = this.cam, kmh = typeof speed === 'number' ? speed : null;
        if (s) {
            const avg = s.time >= 3 ? Math.round(s.driven / s.time * 3.6) : kmh;
            return { camera: { section: true, inside: true, limit: s.limit, avg, remain: Math.max(0, s.len - s.driven), over: avg !== null && avg > s.limit, zone: null } };
        }
        if (!c) return null;
        const f = t.flags[c.i], limit = t.limit[c.i];
        return { camera: { m: Math.round(c.m), limit, zone: f & F.CHILD ? 'child' : f & F.ELDER ? 'elder' : null, section: !!(f & F.START), inside: false, signal: !!(f & F.SIGNAL), over: kmh !== null && kmh > limit } };
    }
    status() { const t = this.t; return { cameras: t ? t.n : null, date: t ? t.date : null, fixes: this.fixes, heading: this.heading === null ? null : Math.round(this.heading), following: !!this.cam, section: !!this.section }; }
}
module.exports = { SpeedCams, load, local, F, NEAR_M, NEAR_FAST_M, SIDE_M };
