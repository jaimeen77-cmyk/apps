'use strict';
// Speed limit data collection, from the hidden menu (Basic settings tapped three times). Off by default and the
// app keeps no logs otherwise; while it is on, it records to <dataDir>/speed-probe.log (one JSON line each, at
// most 1 MB, then one older file .1), so a later version can show the speed limit and speeding on the HUD:
//  - once: which interfaces / fields / events in the car's SOME/IP catalog look like a speed limit (by name), and
//    which of them this install can read (added at install, see speed-probe-config.js);
//  - the vehicle speed and each readable speed-limit field, on change (at most once a second each);
//  - from route guidance (BMW navigation or phone): its speedLimitAssistInfo and any speed limit / speed camera /
//    school zone events, on change.
const path = require('path');
const LIMIT_NAME = /speed.?limit|trafficsign|signrecogn|nopassing|overtak|school.?zone|child.?zone/i;
// Route events of every kind (the HUD's own query asks for turns and destinations only), polled by the collection
// itself while it is on, with BMW navigation or a phone alike. The includedTypes names come from the car's catalog
// (any INCLUDE_* names under GuidanceEventList) and a few guesses; a rejected set moves on to the next.
const ROUTE_IFACE = 'de.bmw.infotainment.navigation.guiding.GuidanceEventList';
const ROUTE_GUESSES = [['INCLUDE_ALL'], [], ['INCLUDE_ACTIVE_MANEUVERS', 'INCLUDE_PASSIVE_MANEUVERS', 'INCLUDE_DESTINATIONS', 'INCLUDE_SPEED_LIMITS', 'INCLUDE_SPEED_CAMERAS', 'INCLUDE_SCHOOL_ZONES', 'INCLUDE_DANGER_ZONES'],
    ['INCLUDE_ACTIVE_MANEUVERS', 'INCLUDE_PASSIVE_MANEUVERS', 'INCLUDE_DESTINATIONS', 'INCLUDE_TRAFFIC_EVENTS', 'INCLUDE_POIS']];
// INCLUDE_* names anywhere under a catalog object (its enums)
function includeNames(o, out, depth) {
    out = out || new Set(); depth = depth || 0;
    if (depth > 12 || o === null || o === undefined) return out;
    if (typeof o === 'string') { if (/^INCLUDE_[A-Z0-9_]+$/.test(o)) out.add(o); return out; }
    if (typeof o === 'object') Object.keys(o).forEach((k) => { if (/^INCLUDE_[A-Z0-9_]+$/.test(k)) out.add(k); includeNames(o[k], out, depth + 1); });
    return out;
}
function routeQuery(types) {
    return { viewConfigs: [{ viewport: { startPoint: { anchorPoint: { standardReferencePoint: 'CCP' }, offsets: [] }, maxElementCount: 10, endPoints: [], includedTypes: types },
        options: [], minimumUpdateIntervalMs: 1000, segmentItemRasterLength: 100 }] };
}
const SPEED = { iface: 'de.bmw.infotainment.vehicle.Vehicle2', field: 'statusCarSpeed2' };
const CATALOGS = ['/etc/oap/someip/someip-interfaces.json'];
const MAX_BYTES = 1 << 20, GUIDE_KINDS = ['speedLimitAssist', 'speedCamera', 'speedSectionCamera', 'schoolZone'];

// Speed-limit looking names in a SOME/IP catalog: [{iface, kind:'field'|'event'|'method', name, get, notify}]
function scanCatalog(catalog) {
    const out = [], defs = (catalog && catalog.interfaces) || {};
    Object.keys(defs).forEach((iface) => {
        const d = defs[iface] || {};
        Object.keys(d.fields || {}).forEach((n) => { if (LIMIT_NAME.test(n)) out.push({ iface, kind: 'field', name: n, get: !!(d.fields[n] && d.fields[n].getter), notify: !!(d.fields[n] && d.fields[n].notifier) }); });
        Object.keys(d.events || d.broadcasts || {}).forEach((n) => { if (LIMIT_NAME.test(n)) out.push({ iface, kind: 'event', name: n }); });
        Object.keys(d.methods || {}).forEach((n) => { if (LIMIT_NAME.test(n)) out.push({ iface, kind: 'method', name: n }); });
    });
    return out;
}
// The vehicle speed in km/h from statusCarSpeed2 (as the kit reads it), or null.
function speedOf(v) {
    const raw = v && typeof v === 'object' ? v.speedVehicleCentreOfGravity : v;
    return typeof raw === 'number' && raw !== 65535 ? Math.round(raw * 0.015625 * 10) / 10 : null;
}
// The speed-limit parts of a GuidanceEventList reply: speedLimitAssistInfo of each view and the speed events.
function guidanceOf(reply) {
    const views = reply && Array.isArray(reply.viewContent) ? reply.viewContent : [];
    const info = [], events = [];
    views.forEach((v) => {
        if (v && v.speedLimitAssistInfo !== undefined) info.push(v.speedLimitAssistInfo);
        (v && Array.isArray(v.eventsInView) ? v.eventsInView : []).forEach((e) => GUIDE_KINDS.forEach((k) => { if (e && e[k]) events.push({ [k]: e[k] }); }));
    });
    // speedLimitAssistInfo may also sit inside an event
    (views[0] && Array.isArray(views[0].eventsInView) ? views[0].eventsInView : []).forEach((e) => Object.keys(e || {}).forEach((k) => { const b = e[k]; if (b && b.speedLimitAssistInfo !== undefined) info.push(b.speedLimitAssistInfo); }));
    return { info, events };
}

class SpeedProbe {
    constructor(o) {
        this.fs = o.fs; this.signals = o.signals; this.dataDir = o.dataDir; this.someipDirs = o.someipDirs || []; this.manifestFiles = o.manifestFiles || [];
        this.now = o.now || (() => Date.now()); this.version = o.version || '';
        this.file = path.join(this.dataDir, 'speed-probe.log'); this.flag = path.join(this.dataDir, 'speed-probe.json');
        this.subs = []; this.last = {}; this.lastAt = {}; this.lines = 0; this.found = null; this.readable = []; this.latest = { speed: null, limits: {}, guidance: null };
        this.on = false;
        try { this.on = JSON.parse(this.fs.readFileSync(this.flag, 'utf8')).on === true; } catch (e) {}
        if (this.on) this.start();
    }
    setOn(v) {
        v = !!v; if (v === this.on) return;
        this.on = v;
        try { if (v) this.fs.writeFileSync(this.flag, JSON.stringify({ on: true }) + '\n'); else this.fs.unlinkSync(this.flag); } catch (e) {}
        if (v) this.start(); else this.stop();
    }
    clear() { [this.file, this.file + '.1'].forEach((f) => { try { this.fs.unlinkSync(f); } catch (e) {} }); this.lines = 0; if (this.on) this.write({ ev: 'cleared' }); }
    bytes() { let n = 0; [this.file, this.file + '.1'].forEach((f) => { try { n += this.fs.statSync(f).size; } catch (e) {} }); return n; }
    write(rec) {
        if (!this.on) return;
        const line = JSON.stringify(Object.assign({ t: new Date(this.now()).toISOString() }, rec)) + '\n';
        try {
            let size = 0; try { size = this.fs.statSync(this.file).size; } catch (e) {}
            if (size + line.length > MAX_BYTES) { try { this.fs.renameSync(this.file, this.file + '.1'); } catch (e) {} }
            this.fs.appendFileSync(this.file, line); this.lines++;
        } catch (e) {}
    }
    // a value on change, at most once a second per name
    sample(name, value) {
        const s = JSON.stringify(value), t = this.now();
        if (s === this.last[name] || t - (this.lastAt[name] || -Infinity) < 1000) return;
        this.last[name] = s; this.lastAt[name] = t; this.write({ ev: 'value', name, value });
    }
    start() {
        this.write({ ev: 'start', version: this.version });
        // 1. the catalog, by name
        if (!this.found) {
            this.found = [];
            for (const f of CATALOGS) { try { const c = JSON.parse(this.fs.readFileSync(f, 'utf8')); this.found = scanCatalog(c); this.includes = Array.from(includeNames([c.interfaces && c.interfaces[ROUTE_IFACE], c.types, c.typeDefinitions])).sort(); this.catalog = f; break; } catch (e) { this.catalogError = String(e && e.code || e); } }
        }
        this.write({ ev: 'catalog', path: this.catalog || null, error: this.catalog ? null : this.catalogError || null, found: this.found, routeTypes: this.includes || [] });
        this.candidates = (this.includes && this.includes.length ? [this.includes] : []).concat(ROUTE_GUESSES); this.candidate = 0; this.routeOk = false;
        if (!this.timer) { this.timer = setInterval(() => this.queryRoute(), 2000); if (this.timer.unref) this.timer.unref(); }
        // 2. what this install can read: the vehicle speed and the speed-limit fields added at install
        const want = {}, add = (iface, field, fn) => { (want[iface] || (want[iface] = {}))[field] = fn; };
        let cfgs = {}; try { cfgs = this.installed(); } catch (e) {}
        if (cfgs[SPEED.iface] && cfgs[SPEED.iface].fields && cfgs[SPEED.iface].fields[SPEED.field]) add(SPEED.iface, SPEED.field, (v) => { this.latest.speed = speedOf(v); this.sample('speed', this.latest.speed); });
        Object.keys(cfgs).forEach((iface) => Object.keys(cfgs[iface].fields || {}).forEach((field) => {
            if (!LIMIT_NAME.test(field)) return;
            const name = iface.split('.').pop() + '.' + field;
            add(iface, field, (v) => { this.latest.limits[name] = v; this.sample(name, v); });
        }));
        this.readable = Object.keys(want).reduce((a, i) => a.concat(Object.keys(want[i]).map((f) => i.split('.').pop() + '.' + f)), []);
        this.write({ ev: 'readable', fields: this.readable });
        if (!this.signals || typeof this.signals.watch !== 'function') return;
        Object.keys(want).forEach((iface) => {
            Promise.resolve().then(() => this.signals.watch(iface, this.instanceOf(iface), want[iface], null, { pollMs: 2000 })).then((sub) => {
                if (!this.on) { try { sub.shutdown(); } catch (e) {} return; }
                this.subs.push(sub); if (sub && sub.error) this.write({ ev: 'error', iface, error: String(sub.error) });
            }).catch((e) => this.write({ ev: 'error', iface, error: String(e) }));
        });
    }
    stop() { this.subs.forEach((s) => { try { s.shutdown(); } catch (e) {} }); this.subs = []; this.last = {}; this.lastAt = {}; if (this.timer) clearInterval(this.timer); this.timer = null; }
    // the route events interface the worker opened (shared, not a second proxy) and its method caller
    attachRoute(sub, call) { this.route = { sub, call }; }
    queryRoute() {
        const r = this.route, sub = r && r.sub;
        if (!this.on || !sub || this.routeBusy || sub.available !== true || !sub.proxy || !this.candidates) return;
        const i = this.candidate % this.candidates.length, types = this.candidates[i];
        this.routeBusy = true;
        Promise.resolve().then(() => r.call(sub.proxy, 'queryContent', routeQuery(types), 1500)).then((reply) => {
            this.routeBusy = false;
            const err = reply && reply.GuidanceEventListError, ok = err === 0 || err === 'NO_ERROR';
            const kinds = []; ((reply && reply.viewContent) || []).forEach((v) => ((v && v.eventsInView) || []).forEach((e) => Object.keys(e || {}).forEach((k) => kinds.push(k))));
            this.sample('route-query', { types, error: err === undefined ? null : err, kinds });
            if (ok) { this.routeOk = true; this.guidance(reply); if (kinds.some((k) => GUIDE_KINDS.includes(k)) && !this.rawSeen) { this.rawSeen = true; this.write({ ev: 'route-raw', reply: JSON.stringify(reply).slice(0, 8000) }); } }
            else if (!this.routeOk) this.candidate++;
        }, (e) => { this.routeBusy = false; this.sample('route-query', { types, error: String(e && e.message || e) }); if (!this.routeOk) this.candidate++; });
    }
    // installed SOME/IP configs: { iface: config } from <app>/someipInterfaces
    installed() {
        const out = {};
        this.someipDirs.forEach((dir) => { let names = []; try { names = this.fs.readdirSync(dir); } catch (e) { return; }
            names.forEach((f) => { const iface = f.slice(0, -5).replace(/_/g, '.'); if (!/\.json$/.test(f) || out[iface]) return; try { out[iface] = JSON.parse(this.fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) {} }); });
        return out;
    }
    instanceOf(iface) {
        for (const file of this.manifestFiles) { try { const m = JSON.parse(this.fs.readFileSync(file, 'utf8')), p = m.proxies && m.proxies[iface]; if (p && p.instances) return String(p.instances).split(',')[0]; } catch (e) {} }
        return '1';
    }
    // a GuidanceEventList reply (route events): the speed-limit parts, on change
    guidance(reply) {
        if (!this.on) return;
        const g = guidanceOf(reply), s = JSON.stringify(g);
        this.latest.guidance = g;
        if (s !== this.last.guidance) { this.last.guidance = s; this.write({ ev: 'guidance', info: g.info, events: g.events }); }
    }
    status() { return { route: this.route ? (this.routeOk ? 'ok' : 'trying') : 'none', on: this.on, lines: this.lines, bytes: this.bytes(), found: this.found, readable: this.readable, latest: this.latest, catalog: this.catalog || null, catalogError: this.catalog ? null : this.catalogError || null }; }
}
module.exports = { SpeedProbe, scanCatalog, speedOf, guidanceOf, includeNames, routeQuery, LIMIT_NAME, SPEED, ROUTE_GUESSES };
