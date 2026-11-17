'use strict';
// App-owned daily gzip CSV only. No network or vehicle file cleanup.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const DAY = 86400000, RETENTION = 30 * DAY;
const MAX_FILE = 3 * 1024 * 1024, MAX_TOTAL = 96 * 1024 * 1024;
const FILE = /^usage-(\d{4}-\d{2}-\d{2})\.csv\.gz$/;
const HEADER = 'timestamp_utc,cpu_percent,memory_percent,memory_used_bytes,memory_total_bytes,uptime_seconds,cpu_delta_5m_pp,memory_delta_5m_pp,cpu_rising,memory_rising,memory_leak_suspected,status,unreadable_processes,skipped_processes,apps_json\n';
const number = (n, digits) => typeof n === 'number' && isFinite(n) ? n.toFixed(digits || 0) : '';
class UsageLog {
    constructor(dataDir) {
        this.dir = dataDir ? path.join(dataDir, 'usage-logs') : null;
        this.error = ''; this.lastCleanup = null;
    }
    _directory() {
        if (!this.dir) throw new Error('App data directory unavailable');
        let stat;
        try { stat = fs.lstatSync(this.dir); }
        catch (e) { if (e.code !== 'ENOENT') throw e; fs.mkdirSync(this.dir, 0o700); stat = fs.lstatSync(this.dir); }
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid usage log directory');
    }
    _files() {
        return fs.readdirSync(this.dir).filter((name) => FILE.test(name)).map((name) => {
            const file = path.join(this.dir, name), stat = fs.lstatSync(file);
            if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid usage log file');
            return { name, file, size: stat.size, day: Date.parse(FILE.exec(name)[1] + 'T00:00:00Z') };
        });
    }
    cleanup(now) {
        this._directory();
        const cutoff = now - RETENTION;
        this._files().forEach((entry) => {
            if (entry.day + DAY <= cutoff) { fs.unlinkSync(entry.file); return; }
            if (entry.day > cutoff || !isFinite(entry.day)) return;
            if (entry.size > MAX_FILE) throw new Error('Oversized usage log');
            const lines = zlib.gunzipSync(fs.readFileSync(entry.file)).toString('utf8').split('\n').slice(1);
            const kept = lines.filter((line) => line && Date.parse(line.split(',')[0]) >= cutoff);
            if (!kept.length) { fs.unlinkSync(entry.file); return; }
            // Rewrite just the boundary day atomically, preserving valid new rows.
            const tmp = entry.file + '.tmp';
            try {
                fs.writeFileSync(tmp, zlib.gzipSync(Buffer.from(HEADER + kept.join('\n') + '\n')), { flag: 'wx', mode: 0o600 });
                fs.renameSync(tmp, entry.file);
            } catch (e) {
                // A stale temporary file is ours only when it is a regular file.
                try { const s = fs.lstatSync(tmp); if (s.isFile() && !s.isSymbolicLink()) fs.unlinkSync(tmp); } catch (ignore) {}
                throw e;
            }
        });
        this.lastCleanup = now;
    }
    append(sample) {
        try {
            const now = sample.time;
            if (!isFinite(now) || !isFinite(new Date(now).getTime())) throw new Error('Invalid sample time');
            this._directory();
            // Retention runs on startup, clock correction and hourly while running.
            if (this.lastCleanup === null || now < this.lastCleanup || now - this.lastCleanup >= 3600000) this.cleanup(now);
            const files = this._files();
            const file = path.join(this.dir, 'usage-' + new Date(now).toISOString().slice(0, 10) + '.csv.gz');
            const existing = files.find((entry) => entry.file === file);
            const m = sample.memory;
            const trend = sample.trend || {};
            const coverage = sample.coverage || {};
            const apps = (sample.apps || []).map((a) => [a.uid, String(a.name).slice(0,96), a.cpu === null ? null : Number(a.cpu.toFixed(2)), a.rss, a.processes,
                a.trend && a.trend.cpuDelta, a.trend && a.trend.memoryDelta,
                (a.partial ? 1 : 0) | (a.trend && a.trend.cpuRising ? 2 : 0) | (a.trend && a.trend.memoryRising ? 4 : 0) | (a.trend && a.trend.leakSuspected ? 8 : 0)]);
            const json = '"' + JSON.stringify(apps).replace(/"/g,'""') + '"';
            const status = [sample.cpu === null ? 'cpu_unavailable' : '', !m ? 'memory_unavailable' : '', coverage.error ? 'processes_unavailable' : ''].filter(Boolean).join('|') || 'ok';
            const row = [new Date(now).toISOString(), number(sample.cpu, 2), number(m && m.used * 100 / m.total, 2),
                number(m && m.used), number(m && m.total), number(sample.uptime, 1), number(trend.cpuDelta, 2), number(trend.memoryDelta, 2),
                trend.cpuRising ? '1' : '0', trend.memoryRising ? '1' : '0', trend.leakSuspected ? '1' : '0', status, coverage.denied || 0, coverage.skipped || 0, json].join(',') + '\n';
            const data = zlib.gzipSync(Buffer.from((existing && existing.size ? '' : HEADER) + row));
            if ((existing ? existing.size : 0) + data.length > MAX_FILE ||
                files.reduce((sum, entry) => sum + entry.size, 0) + data.length > MAX_TOTAL) throw new Error('Usage log size limit reached');
            fs.appendFileSync(file, data, { mode: 0o600 });
            this.error = ''; return true;
        } catch (e) { this.error = String(e.code || e.message || e); return false; }
    }
    prune(now) {
        try {
            // Disabling recording still expires existing files. Do not create an
            // unused log directory when recording has never been enabled.
            if (!this.dir || !fs.existsSync(this.dir)) return;
            if (this.lastCleanup === null || now < this.lastCleanup || now - this.lastCleanup >= 3600000) this.cleanup(now);
            this.error = '';
        } catch (e) { this.error = String(e.code || e.message || e); }
    }
}
module.exports = { UsageLog, RETENTION, MAX_FILE, MAX_TOTAL, HEADER };
