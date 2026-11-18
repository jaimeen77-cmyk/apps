'use strict';
// Log history page: the daily averages of the last 30 days (CPU bars, memory line) and each app's average CPU / RAM,
// for all days or the one chosen (tap a day, or Next app).
const G = require('./kit/gauges');
const { t, getLanguage } = require('./kit/i18n');
const { combine } = require('./usage-history');
const { LOG_INTERVAL } = require('./usage');

const labels = {
    'Log history': { en: 'Log history', ko: '로그 이력' },
    'Daily average': { en: 'Daily average · last 30 days', ko: '1일 평균 · 최근 30일' },
    'Daily average of': { en: 'Daily average · {day}', ko: '1일 평균 · {day}' },
    'Average by app': { en: 'Average by app · last 30 days', ko: '앱별 평균 사용량 · 최근 30일' },
    'Average by app of': { en: 'Average by app · {day}', ko: '앱별 평균 사용량 · {day}' },
    'App': { en: 'App', ko: '앱' },
    'Avg CPU': { en: 'CPU %', ko: 'CPU %' },
    'Avg RAM': { en: 'RAM MB', ko: 'RAM MB' },
    'Max RAM': { en: 'Max MB', ko: '최대 MB' },
    'Whole head unit': { en: 'Whole head unit', ko: '헤드유닛 전체' },
    'Summary': { en: 'CPU {cpu} · RAM {memory} · {hours} h logged', ko: 'CPU {cpu} · RAM {memory} · 기록 {hours}시간' },
    'Days': { en: '{days} days with logs', ko: '기록 있는 날 {days}일' },
    'Reading': { en: 'Reading logs {done} / {total} ...', ko: '로그 읽는 중 {done} / {total} ...' },
    'No logs': { en: 'No usage logs yet', ko: '아직 저장된 사용량 로그가 없습니다' },
    'No logs hint': { en: 'Settings: Save CPU / memory usage logs', ko: '설정의 CPU / 메모리 사용량 로그 저장을 켜 두세요' },
    'Logging off': { en: 'Usage logging is off: no new days are added', ko: '사용량 로그 저장이 꺼져 있어 새 기록이 쌓이지 않습니다' },
    'Read error': { en: 'Cannot read the logs ({error})', ko: '로그를 읽을 수 없습니다 ({error})' },
    'Pick': { en: 'Tap a day or Next app: one day · again: all days', ko: '날짜를 누르거나 다음 앱: 그날 · 다시 누르면 전체' },
    'No app data': { en: 'No app usage in the logs', ko: '로그에 앱 사용량이 없습니다' },
    'more': { en: '+ {count} more', ko: '외 {count}개' },
    'Demo': { en: 'Demo data (not from the logs)', ko: '데모 데이터 (실제 로그 아님)' },
};
const tr = (s, values) => Object.keys(values || {}).reduce((out, k) => out.split('{' + k + '}').join(String(values[k])),
    labels[s] ? (labels[s][getLanguage()] || labels[s].en) : t(s));
const MB = 1048576;
const pct = (v) => (G.isNum(v) ? v.toFixed(1) + '%' : '--');
const shortDay = (day) => day.slice(5).replace('-', '/');

class UsageHistoryView {
    constructor(onSelect) { this.selected = null; this.onSelect = onSelect; }
    /** Next app on this page: all days -> the newest day -> ... -> the oldest -> all days */
    next(days) {
        const list = days.map((d) => d.day).reverse();
        const i = list.indexOf(this.selected);
        this.selected = i < 0 ? (this.selected === null ? list[0] || null : null) : (i + 1 < list.length ? list[i + 1] : null);
    }
    pick(day) { this.selected = this.selected === day ? null : day; if (this.onSelect) this.onSelect(); }
    draw(cv, theme, state, top, bottom, fit) {
        const days = state.days || [];
        if (this.selected && !days.some((d) => d.day === this.selected)) this.selected = null;
        const chosen = this.selected ? days.filter((d) => d.day === this.selected) : days;
        const sum = combine(chosen, LOG_INTERVAL);
        const height = bottom - top;

        /* ---- left: daily averages ---- */
        const lx = 24, lw = 900;
        G.panel(cv, theme, lx, top, lw, height, this.selected ? tr('Daily average of', { day: shortDay(this.selected) }) : tr('Daily average'));
        // legend
        cv.fillRect(lx + lw - 250, top + 26, 14, 14, theme.accent);
        cv.text('CPU', lx + lw - 228, top + 39, 16, theme.dim);
        const ram = theme.cold || theme.accent2 || theme.warn;
        cv.line(lx + lw - 160, top + 33, lx + lw - 136, top + 33, 3, ram);
        cv.text('RAM', lx + lw - 128, top + 39, 16, theme.dim);
        const px = lx + 64, py = top + 64, pw = lw - 96, ph = Math.max(60, height - 150);
        [0, 25, 50, 75, 100].forEach((v) => {
            const y = py + ph * (1 - v / 100);
            cv.line(px, y, px + pw, y, 1, theme.track);
            cv.text(v + '%', px - 10, y + 5, 13, theme.dim, { align: 'right' });
        });
        const end = state.now || Date.now(), slots = 30, slot = pw / slots;
        const index = (day) => slots - 1 - Math.round((Date.parse(new Date(end).toISOString().slice(0, 10) + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000);
        let previous = null;
        days.forEach((d) => {
            const i = index(d.day);
            if (i < 0 || i >= slots) return;
            const x = px + i * slot, on = d.day === this.selected;
            const cpu = d.cpuN ? d.cpuSum / d.cpuN : null, mem = d.memN ? d.memSum / d.memN : null;
            if (on) cv.roundRect(x + 1, py - 4, slot - 2, ph + 8, 4, theme.track);
            if (G.isNum(cpu)) {
                const h = ph * Math.max(0, Math.min(100, cpu)) / 100;
                cv.roundRect(x + slot * 0.2, py + ph - h, slot * 0.6, Math.max(2, h), 2, this.selected && !on ? theme.dim : theme.accent);
            }
            if (G.isNum(mem)) {
                const p = { x: x + slot / 2, y: py + ph * (1 - Math.max(0, Math.min(100, mem)) / 100), i };
                if (previous && p.i - previous.i === 1) cv.line(previous.x, previous.y, p.x, p.y, 3, ram);
                cv.fillRect(p.x - 3, p.y - 3, 7, 7, ram);
                previous = p;
            } else previous = null;
            if (cv.target) cv.target(x, py - 4, slot, ph + 28, () => this.pick(d.day), 'history-day-' + d.day);
        });
        [0, 7, 14, 21, 29].forEach((i) => {
            const day = new Date(Date.parse(new Date(end).toISOString().slice(0, 10) + 'T00:00:00Z') - (slots - 1 - i) * 86400000).toISOString().slice(0, 10);
            cv.text(shortDay(day), px + i * slot + slot / 2, py + ph + 22, 13, theme.dim, { align: i === 0 ? 'left' : i === 29 ? 'right' : 'center' });
        });
        const status = state.demo ? tr('Demo') : state.error ? tr('Read error', { error: state.error })
            : state.busy && state.total ? tr('Reading', { done: state.done, total: state.total })
                : !days.length ? tr('No logs') : !state.logging ? tr('Logging off') : tr('Days', { days: days.length });
        const summary = days.length ? tr('Summary', { cpu: pct(sum.cpu), memory: pct(sum.memory), hours: sum.hours.toFixed(1) }) : tr('No logs hint');
        cv.text(fit(cv, summary, 19, lw - 48, 'label'), lx + 24, top + height - 40, 19, theme.text);
        cv.text(fit(cv, status + (days.length ? ' · ' + tr('Pick') : ''), 15, lw - 48, 'label'), lx + 24, top + height - 14, 15,
            state.error || (!state.logging && !state.demo) ? theme.warn : theme.dim);

        /* ---- right: average by app ---- */
        const rx = lx + lw + 16, rw = 1576 - rx;
        G.panel(cv, theme, rx, top, rw, height, this.selected ? tr('Average by app of', { day: shortDay(this.selected) }) : tr('Average by app'));
        const cCpu = rx + rw - 250, cRam = rx + rw - 130, cMax = rx + rw - 24;
        cv.text(tr('Avg CPU'), cCpu, top + 70, 15, theme.dim, { align: 'right' });
        cv.text(tr('Avg RAM'), cRam, top + 70, 15, theme.dim, { align: 'right' });
        cv.text(tr('Max RAM'), cMax, top + 70, 15, theme.dim, { align: 'right' });
        const rows = [{ name: tr('Whole head unit'), cpu: sum.cpu, rss: sum.memoryUsed, rssMax: null, whole: true }].concat(sum.apps);
        const rowH = 38, room = Math.max(1, Math.floor((height - 96) / rowH));
        const shown = rows.length > room ? rows.slice(0, room - 1) : rows;
        const most = Math.max.apply(null, [1].concat(sum.apps.map((a) => a.cpu || 0)));
        shown.forEach((a, i) => {
            const y = top + 80 + i * rowH;
            if (i % 2 === 1) cv.fillRect(rx + 12, y, rw - 24, rowH, theme.track);
            const name = a.whole ? a.name : /^oap_\d+$/.test(a.name) ? a.name : t(a.name);
            cv.text(fit(cv, name, 19, cCpu - rx - 180, 'label'), rx + 24, y + 26, 19, theme.text);
            if (!a.whole && G.isNum(a.cpu)) {
                const bw = 70 * Math.max(0, a.cpu) / most;
                cv.roundRect(cCpu - 150, y + 16, 70, 8, 4, theme.track);
                if (bw > 1) cv.roundRect(cCpu - 150, y + 16, Math.max(8, bw), 8, 4, theme.accent);
            }
            cv.text(pct(a.cpu), cCpu, y + 26, 19, theme.text, { align: 'right' });
            cv.text(G.isNum(a.rss) ? (a.rss / MB).toFixed(a.whole ? 0 : 1) : '--', cRam, y + 26, 19, theme.text, { align: 'right' });
            cv.text(G.isNum(a.rssMax) ? (a.rssMax / MB).toFixed(1) : '--', cMax, y + 26, 17, theme.dim, { align: 'right' });
        });
        if (rows.length > shown.length) cv.text(tr('more', { count: rows.length - shown.length }), rx + 24, top + 80 + shown.length * rowH + 26, 17, theme.dim);
        if (days.length && !sum.apps.length) cv.text(tr('No app data'), rx + 24, top + 80 + rowH + 26, 18, theme.dim);
    }
}
module.exports = { UsageHistoryView, labels };
