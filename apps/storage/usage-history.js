'use strict';
// Daily averages from the app's own 30-day usage logs (usage-log.js): the whole head unit's CPU / memory and
// each app's CPU / RSS, one summary per log file. A past day's file no longer changes, so its summary is kept
// (also on disk, beside the logs' folder) and read once; today's file is read again when it has grown.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const FILE = /^usage-(\d{4}-\d{2}-\d{2})\.csv\.gz$/;
const COLUMNS = 14;                       // columns before apps_json (usage-log.js HEADER)
const MAX_FILE = 3 * 1024 * 1024;         // as usage-log.js: a bigger file is not ours
const TODAY_MS = 60000;                   // today's file is read again at most once a minute
const SUMMARY_VERSION = 1;
const valid = (v) => typeof v === 'number' && isFinite(v);
const placeholder = (name) => /^oap_\d+$/.test(String(name));

/** One CSV row -> { time, cpu, memory, memoryUsed, apps: [[uid, name, cpu, rss, processes, cpuDelta, memDelta, flags]] } | null */
function parseRow(line) {
    const cols = [];
    let at = 0;
    for (let i = 0; i < COLUMNS; i++) {
        const comma = line.indexOf(',', at);
        if (comma < 0) return null;
        cols.push(line.slice(at, comma));
        at = comma + 1;
    }
    const time = Date.parse(cols[0]);
    if (!isFinite(time)) return null;
    const num = (s) => (s === '' ? null : Number(s));
    let apps = [];
    let json = line.slice(at);
    if (json.length >= 2 && json[0] === '"' && json[json.length - 1] === '"') json = json.slice(1, -1).split('""').join('"');
    try { const parsed = JSON.parse(json); if (Array.isArray(parsed)) apps = parsed; } catch (e) { apps = []; }
    return { time, cpu: num(cols[1]), memory: num(cols[2]), memoryUsed: num(cols[3]), apps };
}

/** A day's text (the log's CSV, header included) -> its summary */
function summarize(day, text) {
    const s = { day, samples: 0, first: null, last: null, cpuSum: 0, cpuN: 0, memSum: 0, memN: 0, usedSum: 0, usedN: 0, apps: {} };
    let at = text.indexOf('\n') + 1;      // past the header
    while (at > 0 && at < text.length) {
        let end = text.indexOf('\n', at);
        if (end < 0) end = text.length;
        const line = text.slice(at, end);
        at = end + 1;
        if (!line || line.startsWith('timestamp_utc,')) continue;   // an appended gzip member's header
        const row = parseRow(line);
        if (!row) continue;
        s.samples++;
        if (s.first === null || row.time < s.first) s.first = row.time;
        if (s.last === null || row.time > s.last) s.last = row.time;
        if (valid(row.cpu)) { s.cpuSum += row.cpu; s.cpuN++; }
        if (valid(row.memory)) { s.memSum += row.memory; s.memN++; }
        if (valid(row.memoryUsed)) { s.usedSum += row.memoryUsed; s.usedN++; }
        row.apps.forEach((a) => {
            if (!Array.isArray(a) || !valid(a[0])) return;
            const key = String(a[0]), name = String(a[1] || '');
            const app = s.apps[key] || (s.apps[key] = { name, cpuSum: 0, cpuN: 0, rssSum: 0, rssN: 0, rssMax: 0 });
            if (name && (!placeholder(name) || placeholder(app.name) || !app.name)) app.name = name;
            const partial = (Number(a[7]) | 0) & 1;
            if (!partial && valid(a[2])) { app.cpuSum += a[2]; app.cpuN++; }
            if (!partial && valid(a[3])) { app.rssSum += a[3]; app.rssN++; if (a[3] > app.rssMax) app.rssMax = a[3]; }
        });
    }
    return s;
}

const average = (sum, n) => (n ? sum / n : null);

/** Days' summaries -> { cpu, memory, memoryUsed, samples, hours, apps: [{ uid, name, cpu, rss, rssMax, hours }] } */
function combine(days, intervalMs) {
    const out = { cpuSum: 0, cpuN: 0, memSum: 0, memN: 0, usedSum: 0, usedN: 0, samples: 0, apps: {} };
    days.forEach((d) => {
        out.cpuSum += d.cpuSum; out.cpuN += d.cpuN; out.memSum += d.memSum; out.memN += d.memN;
        out.usedSum += d.usedSum; out.usedN += d.usedN; out.samples += d.samples;
        Object.keys(d.apps).forEach((uid) => {
            const a = d.apps[uid], o = out.apps[uid] || (out.apps[uid] = { name: a.name, cpuSum: 0, cpuN: 0, rssSum: 0, rssN: 0, rssMax: 0 });
            if (a.name && (!placeholder(a.name) || !o.name || placeholder(o.name))) o.name = a.name;
            o.cpuSum += a.cpuSum; o.cpuN += a.cpuN; o.rssSum += a.rssSum; o.rssN += a.rssN; o.rssMax = Math.max(o.rssMax, a.rssMax);
        });
    });
    const hours = (n) => n * (intervalMs || 10000) / 3600000;
    return {
        cpu: average(out.cpuSum, out.cpuN), memory: average(out.memSum, out.memN), memoryUsed: average(out.usedSum, out.usedN),
        samples: out.samples, hours: hours(out.samples),
        apps: Object.keys(out.apps).map((uid) => {
            const a = out.apps[uid];
            return { uid: Number(uid), name: a.name, cpu: average(a.cpuSum, a.cpuN), rss: average(a.rssSum, a.rssN), rssMax: a.rssMax || null,
                hours: hours(Math.max(a.cpuN, a.rssN)) };
        }).filter((a) => a.cpu !== null || a.rss !== null)
            .sort((a, b) => (b.cpu || 0) - (a.cpu || 0) || (b.rss || 0) - (a.rss || 0)),
    };
}

function gunzip(buffer) {
    return new Promise((resolve, reject) => zlib.gunzip(buffer, (e, out) => (e ? reject(e) : resolve(out))));
}
const later = () => new Promise((resolve) => setImmediate(resolve));

class UsageHistory {
    constructor(dataDir) {
        this.dir = dataDir ? path.join(dataDir, 'usage-logs') : null;
        this.store = dataDir ? path.join(dataDir, 'usage-summary.json') : null;
        this.cache = {};                  // file name -> { size, read, summary }
        this.days = [];                   // summaries, oldest first
        this.busy = false; this.done = 0; this.total = 0; this.error = ''; this.read = 0;
        this._loaded = false;
    }
    _load() {
        if (this._loaded || !this.store) return;
        this._loaded = true;
        try {
            const saved = JSON.parse(fs.readFileSync(this.store, 'utf8'));
            if (saved && saved.version === SUMMARY_VERSION && saved.files && typeof saved.files === 'object') this.cache = saved.files;
        } catch (e) { /* none yet */ }
    }
    _save(today) {
        if (!this.store) return;
        // only the finished days: today's summary is made again at the next start
        const files = {};
        Object.keys(this.cache).forEach((name) => { if (name !== today) files[name] = this.cache[name]; });
        try {
            const tmp = this.store + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify({ version: SUMMARY_VERSION, files }), { mode: 0o600 });
            fs.renameSync(tmp, this.store);
        } catch (e) { /* a summary that is not saved is made again */ }
    }
    /** Read the log files that are new or have grown; resolves when done. */
    async refresh(now) {
        if (this.busy || !this.dir) return false;
        this.busy = true;
        try {
            this._load();
            let names = [];
            try { names = fs.readdirSync(this.dir).filter((n) => FILE.test(n)).sort(); }
            catch (e) { if (e.code !== 'ENOENT') throw e; }
            const today = 'usage-' + new Date(now).toISOString().slice(0, 10) + '.csv.gz';
            const todo = [];
            names.forEach((name) => {
                const file = path.join(this.dir, name), stat = fs.lstatSync(file);
                if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE) return;
                const known = this.cache[name];
                if (known && known.size === stat.size) return;
                if (known && name === today && now - (known.read || 0) < TODAY_MS) return;
                todo.push({ name, file, size: stat.size });
            });
            Object.keys(this.cache).forEach((name) => { if (names.indexOf(name) < 0) delete this.cache[name]; });
            this.done = 0; this.total = todo.length;
            for (const entry of todo) {
                const text = (await gunzip(fs.readFileSync(entry.file))).toString('utf8');
                await later();
                this.cache[entry.name] = { size: entry.size, read: now, summary: summarize(FILE.exec(entry.name)[1], text) };
                this.done++;
                await later();
            }
            this.days = names.filter((n) => this.cache[n]).map((n) => this.cache[n].summary).filter((d) => d.samples > 0);
            if (todo.some((e) => e.name !== today)) this._save(today);
            this.error = ''; this.read = now;
            return true;
        } catch (e) {
            this.error = String(e.code || e.message || e);
            return false;
        } finally { this.busy = false; }
    }
}

/** Demo days (off the car): 30 days of believable averages for the screen. */
function demoDays(now) {
    const days = [];
    for (let i = 29; i >= 0; i--) {
        const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
        if (i === 12 || i === 13) continue;                       // the car not used those days
        const n = 2000 + ((i * 397) % 3000), w = Math.sin(i / 3);
        const cpu = 22 + w * 6 + (i % 5), mem = 58 + Math.cos(i / 4) * 5 + (i < 4 ? 6 : 0);
        const app = (name, c, r) => ({ name, cpuSum: c * n, cpuN: n, rssSum: r * 1048576 * n, rssN: n, rssMax: r * 1.2 * 1048576 });
        days.push({ day, samples: n, first: null, last: null, cpuSum: cpu * n, cpuN: n, memSum: mem * n, memN: n, usedSum: mem / 100 * 2 * 1073741824 * n, usedN: n,
            apps: { 12201: app('App platform (MainApp)', 7 + w, 80 + i % 7), 12210: app('Redline', 9 + w * 2, 46 + (30 - i) / 3),
                12211: app('G-Force', 3, 22), 12212: app('MGU Monitor', 1.5, 6 + i % 3), 12215: app('Live Data', i % 3 ? 2 : 0.4, 30) } });
    }
    return days;
}

module.exports = { UsageHistory, parseRow, summarize, combine, demoDays };
