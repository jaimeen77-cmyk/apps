'use strict';
const S = require('./sysinfo');
const { UsageLog } = require('./usage-log');
const INTERVAL = 30000, LOG_INTERVAL = 30000, WINDOW = 30 * 60000;
const FIVE_MINUTES = 5 * 60000;
const valid = (v) => typeof v === 'number' && isFinite(v);
const memoryPercent = (s) => s.memory && s.memory.total > 0 ? s.memory.used * 100 / s.memory.total : null;
// Sustained increases are indicators, not proof of a process memory leak.
function trends(history, policy) {
    const p = Object.assign({ memory: memoryPercent, rise: 5, sustain: 3, leak: 10, step: 2 }, policy || {});
    const result = { cpuDelta: null, memoryDelta: null, cpuRising: false, memoryRising: false, leakSuspected: false };
    if (!history.length) return result;
    const last = history[history.length - 1], now = last.time;
    const at = (time) => history.find((s) => Math.abs(s.time - time) <= INTERVAL / 2);
    const base = at(now - FIVE_MINUTES), recent = history.filter((s) => s.time >= now - 2 * INTERVAL);
    const window = history.filter((s) => s.time >= now - 3 * FIVE_MINUTES);
    const continuous = (since) => {
        const list = window.filter((s) => s.time >= since);
        return list.length > 1 && list.every((s, i) => !i || s.time - list[i - 1].time <= INTERVAL * 1.5);
    };
    if (base && continuous(base.time)) {
        if (valid(base.cpu) && valid(last.cpu)) result.cpuDelta = last.cpu - base.cpu;
        if (valid(p.memory(base)) && valid(p.memory(last))) result.memoryDelta = p.memory(last) - p.memory(base);
        result.cpuRising = result.cpuDelta >= 15 && recent.length >= 3 && recent.every((s) => valid(s.cpu) && s.cpu >= base.cpu + 10);
        result.memoryRising = result.memoryDelta >= p.rise && recent.length >= 3 && recent.every((s) => valid(p.memory(s)) && p.memory(s) >= p.memory(base) + p.sustain);
    }
    const checkpoints = [3, 2, 1, 0].map((n) => at(now - n * FIVE_MINUTES));
    if (checkpoints.every((s) => s && valid(p.memory(s))) && window.every((s) => valid(p.memory(s))) && continuous(now - 3 * FIVE_MINUTES)) {
        const values = checkpoints.map(p.memory);
        result.leakSuspected = values[3] - values[0] >= p.leak && values.every((v, i) => !i || v - values[i - 1] >= p.step);
    }
    return result;
}
function appTrend(history, app) {
    const samples = history.map((s) => {
        const found = (s.apps || []).find((a) => a.uid === app.uid && a.name === app.name);
        return { time: s.time, cpu: found && !found.partial ? found.cpu : null, rss: found && !found.partial ? found.rss : null };
    });
    return trends(samples, { memory: (s) => valid(s.rss) ? s.rss / 1048576 : null, rise: 16, sustain: 8, leak: 32, step: 8 });
}
class UsageMonitor {
    constructor(dataDir, source) {
        this.source = source || S;
        this.logger = new UsageLog(dataDir);
        this.history = []; this.previous = null; this.demo = null;
        this.lastLog = null; this.logging = true;
    }
    sample(now, demo, logging, processes) {
        const mode = demo || null;
        if (mode !== this.demo || (this.history.length && now < this.history[this.history.length - 1].time)) {
            this.history = []; this.previous = null; this.lastLog = null;
        }
        this.demo = mode; this.logging = logging !== false;
        const gap = this.history.length && now - this.history[this.history.length - 1].time > INTERVAL * 1.5;
        if (gap) this.previous = null;
        let sample;
        if (mode) {
            const total = 2 * 1024 * 1024 * 1024, phase = now / 18000;
            const cpu = Math.max(0, Math.min(100, (mode === 'crit' ? 84 : 24) + Math.sin(phase) * 12));
            const used = Math.round(total * (0.60 + Math.sin(phase / 3) * 0.07));
            sample = { time: now, cpu, memory: { total, used, avail: total - used }, uptime: 18000, demo: true };
        } else {
            const current = this.source.cpu();
            sample = { time: now, cpu: S.cpuPercent(this.previous, current), memory: this.source.memory(), uptime: this.source.uptime(), demo: false };
            this.previous = current;
        }
        sample.apps = mode ? [
            { uid:12201, name:'App platform (MainApp)', cpu:8, rss:80*1048576, processes:2, partial:false },
            { uid:12210, name:'Redline', cpu:Math.max(0,sample.cpu-8), rss:48*1048576, processes:1, partial:false },
        ] : ((processes && processes.apps) || []);
        if (!mode && gap) sample.apps.forEach((app) => { app.cpu = null; app.partial = true; });
        sample.coverage = mode ? { denied:0, skipped:0, error:'' } : Object.assign({ denied:0, skipped:0, error:'' }, processes || {});
        delete sample.coverage.apps;
        this.history.push(sample);
        this.history = this.history.filter((s) => s.time >= now - WINDOW).slice(-61);
        sample.trend = trends(this.history);
        sample.apps.forEach((app) => { app.trend = appTrend(this.history,app); });
        if (!mode && !this.logging) this.logger.prune(now);
        if (!mode && this.logging && (this.lastLog === null || now < this.lastLog || now - this.lastLog >= LOG_INTERVAL)) {
            // Advance even on error: retry at the next 30-second sample.
            this.logger.append(sample); this.lastLog = now;
        }
        return sample;
    }
}
module.exports = { UsageMonitor, trends, appTrend, memoryPercent, INTERVAL, LOG_INTERVAL, WINDOW };
