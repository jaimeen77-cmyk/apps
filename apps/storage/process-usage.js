'use strict';
const fs = require('fs'), path = require('path');
const S = require('./sysinfo');
const read = (file) => new Promise((resolve, reject) => fs.readFile(file, 'utf8', (e, data) => e ? reject(e) : resolve(data)));
const list = (dir) => new Promise((resolve, reject) => fs.readdir(dir, (e, data) => e ? reject(e) : resolve(data)));
function parseStat(text) {
    const end = String(text).lastIndexOf(')');
    if (end < 0) return null;
    const fields = text.slice(end + 1).trim().split(/\s+/);
    const user = Number(fields[11]), system = Number(fields[12]), start = Number(fields[19]);
    if (fields.length < 22 || [user,system,start].some((n) => !isFinite(n) || n < 0)) return null;
    return { ticks: user + system, start };
}
function parseStatus(text) {
    const uid = /^Uid:\s+\d+\s+(\d+)/m.exec(text), rss = /^VmRSS:\s+(\d+)\s+kB/m.exec(text);
    return uid ? { uid: Number(uid[1]), rss: rss ? Number(rss[1]) * 1024 : null } : null;
}
class ProcessUsage {
    constructor(root, procRoot) {
        this.root = root; this.proc = procRoot || '/proc';
        this.previous = new Map(); this.total = null; this.boot = null;
    }
    async sample() {
        const identities = S.appIdentities(this.root), apps = new Map();
        identities.apps.forEach((a) => apps.set(a.uid, Object.assign({}, a, { cpu: null, rss: 0, processes: 0, partial: false, rssCount: 0 })));
        let pids, total, denied = 0, skipped = 0, boot;
        try {
            const values = await Promise.all([list(this.proc), read(path.join(this.proc,'stat'))]);
            pids = values[0].filter((p) => /^\d+$/.test(p)); total = S.parseCpu(values[1]);
            const match = /^btime\s+(\d+)/m.exec(values[1]);boot = match ? match[1] : null;
        } catch (e) { return { apps: [], denied, skipped, error: String(e.code || e.message) }; }
        const elapsed = total && this.total && this.boot === boot ? total.total - this.total.total : 0;
        const next = new Map(); let cursor = 0;
        // Four readers bound I/O without blocking the HMI with a synchronous /proc walk.
        const worker = async () => {
            while (cursor < pids.length) {
                const pid = pids[cursor++];
                try {
                    const status = parseStatus(await read(path.join(this.proc,pid,'status')));
                    if (!status || !apps.has(status.uid)) continue;
                    const stat = parseStat(await read(path.join(this.proc,pid,'stat'))), app = apps.get(status.uid);
                    if (!stat) { app.partial = true; skipped++; continue; }
                    app.processes++;
                    if (status.rss === null) app.partial = true; else { app.rss += status.rss; app.rssCount++; }
                    const key = pid + ':' + stat.start + ':' + status.uid, previous = this.previous.get(key);
                    next.set(key,stat.ticks);
                    if (elapsed > 0 && previous !== undefined && stat.ticks >= previous) {
                        app.cpu = (app.cpu === null ? 0 : app.cpu) + (stat.ticks - previous) * 100 / elapsed;
                    } else app.partial = true;
                } catch (e) {
                    if (e.code === 'EACCES' || e.code === 'EPERM') denied++; else skipped++;
                }
            }
        };
        await Promise.all([worker(),worker(),worker(),worker()]);
        this.previous = next; this.total = total; this.boot = boot;
        const result = Array.from(apps.values()).filter((app) => app.processes > 0);
        result.forEach((app) => { if (app.cpu !== null) app.cpu = Math.max(0,Math.min(100,app.cpu)); if (!app.rssCount) app.rss = null; delete app.rssCount; });
        return { apps: result.sort((a,b) => a.uid-b.uid), denied, skipped, error: identities.error };
    }
}
module.exports = { ProcessUsage, parseStat, parseStatus };
