'use strict';
/**
 * MGU Monitor — 헤드유닛 저장공간·CPU·메모리 조회 및 앱 자체 사용률 로그.
 *
 *   Disks  유닛의 각 파일시스템(df): 여유/사용/크기, 사용률 색 막대. 앱이 설치된
 *          파티션은 APPS 로 표시. 오른쪽에 '앱용 여유'와 RAM.
 *   Apps   /var/opt/public/oap 아래 앱별 폴더 용량, 큰 것부터.
 *   Usage  CPU / 메모리: 최근 30분 그래프, 앱별 CPU·RSS.
 *   Log history  저장된 30일 로그의 1일 평균과 앱별 평균 사용량(usage-history.js).
 *
 *   + 알림: 앱 파티션 사용률이 설정 임계(기본 80%)를 넘으면
 *       · 화면 상단 빨강 배너
 *       · 홈 화면 위젯이 빨강으로 (= 플랫폼이 허용하는 '알림'. 시스템 팝업 API는 없음)
 *   + 에뮬 데모: 차가 아닌 곳에서는 대표값을 보여줘 화면을 맞출 수 있다.
 *
 * 데이터 수집(sysinfo.js)은 커뮤니티 mgu_storage 데모에서 채택. 알림·위젯·데모는 여기 추가.
 */
const fs = require('fs');
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha, ScaledCanvas } = require('./kit/canvas');
const S = require('./sysinfo');
const BG = require('./bg');
const { UsageMonitor, memoryPercent, INTERVAL, WINDOW } = require('./usage');
const { ProcessUsage } = require('./process-usage');
const { UsageView } = require('./usage-view');
const { UsageHistory, demoDays } = require('./usage-history');
const { UsageHistoryView, labels: historyLabels } = require('./usage-history-view');
const { getLanguage } = require('./kit/i18n');
const { t } = require('./kit/i18n');
const tr = (text, values) => Object.keys(values || {}).reduce((out, key) => out.split('{' + key + '}').join(String(values[key])), t(text));

const W = 1600, H = 520;
const PAGES = ['disks', 'apps', 'usage', 'history'];
const TABS = ['Disks', 'Apps', 'CPU / Memory'].map((s) => tr(s))
    .concat([historyLabels['Log history'][getLanguage()] || historyLabels['Log history'].en]);
const DISK_MS = 10000;
const GB = 1024 * 1024 * 1024, MB = 1024 * 1024;

/* ---------- 에뮬레이터 데모(차가 아닌 곳에서 대표값) ---------- */
const onCar = () => { try { return fs.existsSync('/var/opt'); } catch (e) { return false; } };
function demoDisks(which) {
    const p = which === 'warn' ? 78 : which === 'crit' ? 95 : 44;
    const optSize = Math.round(7.3 * GB), optUsed = Math.round(optSize * p / 100), optAvail = optSize - optUsed;
    const list = [
        { dev: '/dev/mmcblk0p3', mount: '/', type: 'ext4', ro: true, size: 2 * GB, used: Math.round(1.8 * GB), avail: Math.round(0.2 * GB), alsoAt: [] },
        { dev: '/dev/mmcblk0p10', mount: '/var/opt', type: 'ext4', ro: false, size: optSize, used: optUsed, avail: optAvail, alsoAt: [] },
        { dev: '/dev/sda1', mount: '/var/opt/hdshare', type: 'ext4', ro: false, size: 90 * GB, used: Math.round(10.8 * GB), avail: Math.round(79.2 * GB), alsoAt: [] },
    ];
    return { disks: { list: list, how: 'demo', error: '' }, mem: { total: 2 * GB, avail: Math.round(0.8 * GB), used: Math.round(1.2 * GB), swapTotal: 0, swapFree: 0 }, up: 3600 * 5 };
}
function demoApps() {
    return { list: [
        { folder: 'oap_12201', name: 'App platform (MainApp)', bytes: 220 * MB, files: 0, denied: 0 },
        { folder: 'oap_12210', name: 'Redline', bytes: 48 * MB, files: 0, denied: 0 },
        { folder: 'oap_12211', name: 'G-Force', bytes: 22 * MB, files: 0, denied: 0 },
        { folder: 'oap_12212', name: 'MGU Monitor', bytes: 6 * MB, files: 0, denied: 0 },
    ], error: '', scanning: false, done: 4, total: 4, t: Date.now() };
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;

        const m = /^(.*\/oap)\/(oap_\d+)(\/|$)/.exec(ctx.dataDir || '');
        const ROOT = process.env.STORAGE_OAP_ROOT || (m ? m[1] : '/var/opt/public/oap');
        const OWN = m ? m[2] : null;

        const alertOf = () => { const v = Number(settings.get('alertPct')); return isFinite(v) && v > 0 ? v : 80; };
        const demoMode = () => settings.get('demo');
        const useDemo = () => { const d = demoMode(); return (d && d !== 'auto') ? d : (!onCar() ? 'ok' : null); };
        const usage = new UsageMonitor(ctx.dataDir);
        let processUsage = new ProcessUsage(ROOT), usageBusy = false, lastMode;
        const sampleUsage = async () => {
            if (usageBusy) return;
            usageBusy = true;
            try {
                const mode = useDemo();
                if (mode !== lastMode) { processUsage = new ProcessUsage(ROOT); lastMode = mode; }
                const processes = mode ? null : await processUsage.sample();
                if (mode === useDemo()) usage.sample(Date.now(), mode, settings.get('usageLogging'), processes);
            } finally { usageBusy = false; }
        };
        const usageView = new UsageView(() => render());
        // Log history: daily averages from the saved usage logs (read in the background, a day's file once)
        const history = new UsageHistory(ctx.dataDir);
        const historyView = new UsageHistoryView(() => render());
        const refreshHistory = () => {
            if (useDemo() || history.busy) return;
            usage.logger.flush();
            history.refresh(Date.now()).then((ok) => { if (!ok && history.error) log.warn('usage history: ' + history.error); if (PAGES[page] === 'history') render(); })
                .catch((e) => log.warn('usage history: ' + e));
        };
        const historyState = () => {
            const now = Date.now();
            return useDemo() ? { days: demoDays(now), demo: true, now, logging: true }
                : { days: history.days, busy: history.busy, done: history.done, total: history.total, error: history.error, logging: usage.logging, now };
        };
        await sampleUsage();
        const usageTimer = setInterval(sampleUsage, INTERVAL);
        process.on('exit', () => { clearInterval(usageTimer); usage.logger.flush(); });

        /* ---------- data ---------- */
        let disks = { list: [], how: '', error: '', t: 0 }, mem = null, up = null, diskBusy = false, isDemo = false;
        async function readDisks() {
            if (diskBusy) return;
            diskBusy = true;
            try {
                const dm = useDemo();
                if (dm) {
                    const d = demoDisks(dm);
                    disks = Object.assign(d.disks, { t: Date.now() }); mem = d.mem; up = d.up; isDemo = true;
                } else {
                    const r = await S.fileSystems();
                    if (r.error && !disks.t) log.warn(r.error);
                    disks = Object.assign(r, { t: Date.now() }); mem = S.memory(); up = S.uptime(); isDemo = false;
                }
            } catch (e) { log.warn('df: ' + e); }
            diskBusy = false;
        }
        readDisks();

        let apps = { list: [], error: '', scanning: false, done: 0, total: 0, t: 0 };
        async function scanApps() {
            if (apps.scanning) return;
            if (useDemo()) { apps = demoApps(); return; }
            apps = Object.assign({}, apps, { scanning: true, done: 0, total: 0 });
            const t0 = Date.now();
            try {
                const r = await S.appFolders(ROOT, (done, total) => { apps.done = done; apps.total = total; });
                apps = { list: r.list, error: r.error, scanning: false, done: apps.total, total: apps.total, t: Date.now() };
                log.info('app folders: ' + r.list.length + ' in ' + (Date.now() - t0) + ' ms' + (r.error ? ' (' + r.error + ')' : ''));
            } catch (e) {
                apps = Object.assign({}, apps, { scanning: false, error: String(e) });
                log.warn('app scan: ' + e);
            }
        }

        /* ---------- formatting ---------- */
        const base = () => (settings.get('units') === 'dec' ? 1000 : 1024);
        function size(b) {
            if (!G.isNum(b)) return ['--', ''];
            if (b === 0) return ['0', 'KB'];
            const k = base(), u = [['GB', k * k * k], ['MB', k * k], ['KB', k]];
            for (const [name, f] of u) {
                if (b >= f * 0.95 || name === 'KB') {
                    const v = b / f;
                    return [v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2), name];
                }
            }
            return [String(b), 'B'];
        }
        const sz = (b) => size(b).join(' ');
        const pct = (a, b) => (b ? a / b * 100 : 0);
        const fullCol = (t, p, ro) => (ro ? t.dim : p >= alertOf() ? t.crit : p >= 75 ? t.warn : t.accent);
        const fit = (cv, s, px, w, font) => {
            if (cv.textWidth(s, px, { font }) <= w) return s;
            while (s.length > 4 && cv.textWidth(s + '...', px, { font }) > w) s = s.slice(0, -1);
            return s + '...';
        };

        function shown() {
            const appFs = S.fsOf(disks.list, ROOT);
            const list = disks.list.filter((r) => r === appFs || ((settings.get('showRam') || !S.RAM.has(r.type)) && (settings.get('showRo') || !r.ro)));
            list.sort((a, b) => (b === appFs) - (a === appFs) || a.ro - b.ro || b.size - a.size);
            return { list, appFs };
        }
        const appPct = () => { const { appFs } = shown(); return appFs ? pct(appFs.used, appFs.size) : 0; };
        const over = () => !!shown().appFs && appPct() >= alertOf();

        /* ---------- drawing ---------- */
        let page = Math.max(0, PAGES.indexOf(settings.get('page')));
        let lastDraw = 0;

        function bar(cv, t, x, y, w, h, frac, color) {
            cv.roundRect(x, y, w, h, Math.min(4, h / 2), t.track);
            const f = Math.max(0, Math.min(1, frac));
            if (f * w > 2) cv.roundRect(x, y, Math.max(h, f * w), h, Math.min(4, h / 2), color);
        }

        function drawBanner(cv, t, y, h) {
            const { appFs } = shown(), p = appFs ? pct(appFs.used, appFs.size) : 0;
            cv.roundRect(24, y, 1552, h, 8, withAlpha(t.crit, 0.18));
            cv.fillRect(24, y, 7, h, t.crit);
            cv.text(tr('STORAGE HIGH - apps {percent}% used - {free} free', { percent: p.toFixed(0), free: appFs ? sz(appFs.avail) : '--' }),
                48, y + h / 2 + 9, 26, t.text, { font: 'bold', spacing: 0.5 });
        }

        function drawDisks(cv, t, top) {
            const bottom = G.BOTTOM, { list, appFs } = shown();
            const L = G.panel(cv, t, 24, top, 1060, bottom - top, 'File systems');
            const rowH = 74, rtop = top + 62, fitRows = Math.max(1, Math.floor((L.h - 70) / rowH));
            if (!list.length) {
                cv.text(disks.t ? (disks.error || 'No file systems found') : 'Reading...', 48, rtop + 40, 24, disks.error ? t.warn : t.dim);
            }
            const rows = list.length > fitRows ? list.slice(0, fitRows - 1) : list;
            rows.forEach((r, i) => {
                const y = rtop + i * rowH, p = pct(r.used, r.size), c = fullCol(t, p, r.ro);
                let nx = 48;
                const name = r.mount === '/var/opt' ? '/var/opt  (' + tr('App storage') + ')' : r.mount === '/' ? '/  (' + tr('system') + ')' : r.mount;
                nx += cv.text(fit(cv, name, 24, 470, 'bold'), nx, y + 24, 24, t.text, { font: 'bold' }) + 14;
                if (r === appFs) nx += G.pill(cv, t, nx, y + 2, 78, 28, 'APPS', { size: 16 }) + 10;
                if (r.ro) G.pill(cv, t, nx, y + 2, 120, 28, 'READ-ONLY', { size: 16, color: 'dim' });
                cv.text(tr('{size} free', { size: sz(r.avail) }), 1060, y + 24, 24, r.ro ? t.dim : t.text, { align: 'right', font: 'bold' });
                cv.text(tr('{used} of {total}', { used: sz(r.used), total: sz(r.size) }) + '  ·  ' + p.toFixed(0) + '%', 1060, y + 52, 18, t.dim, { align: 'right' });
                const extra = [r.type, r.dev.length < 40 ? r.dev : '', r.alsoAt.length ? tr('also at {count} other paths', { count: r.alsoAt.length }) : ''].filter(Boolean).join('  ·  ');
                cv.text(fit(cv, extra, 18, 560, 'label'), 48, y + 52, 18, t.dim);
                bar(cv, t, 48, y + 62, 1012, 6, p / 100, c);
            });
            if (list.length > rows.length) {
                const rest = list.slice(rows.length);
                cv.text(tr('+ {count} more: {paths}', { count: rest.length, paths: rest.map((r) => r.mount).join(', ') }), 48, rtop + rows.length * rowH + 28, 20, t.dim);
            }
            // the cafe mark, bottom right of the file-system panel, only below the last line
            const used = rtop + (rows.length + (list.length > rows.length ? 1 : 0)) * rowH;
            if (L.y + L.h - used >= 80) BG.mark(cv, 1060, L.y + L.h - 16);

            const x = 1108, w = 468, gap = 16, th = (bottom - top - gap) / 2;
            const ny = Math.min(150, th * 0.6);     // 큰 숫자 y: 패널이 좁아지면(배너 등) 위로 당겨 캡션과 안 겹치게
            G.panel(cv, t, x, top, w, th, 'Free for apps');
            if (appFs) {
                const [n, u] = size(appFs.avail), p = pct(appFs.used, appFs.size);
                const vw = cv.text(n, x + 24, top + ny, 96, p >= alertOf() ? t.crit : t.text, { font: 'num' });
                cv.text(u, x + 34 + vw, top + ny, 30, t.dim);
                bar(cv, t, x + 24, top + ny + 20, w - 48, 10, p / 100, fullCol(t, p, false));
                cv.text(fit(cv, tr('total {size} - {percent}% used', { size: sz(appFs.size), percent: p.toFixed(0) }) + ' · ' + appFs.mount, 20, w - 48, 'label'), x + 24, top + th - 16, 20, t.dim);
            } else cv.text(disks.t ? tr('not found ({path})', { path: ROOT }) : tr('Reading...'), x + 24, top + 120, 22, t.dim);

            const my = top + th + gap;
            G.panel(cv, t, x, my, w, th, 'Memory (RAM)');
            if (mem) {
                const [n, u] = size(mem.avail), p = pct(mem.used, mem.total);
                const vw = cv.text(n, x + 24, my + ny, 96, p >= 90 ? t.crit : t.text, { font: 'num' });
                cv.text(tr('{size} free', { size: u }), x + 34 + vw, my + ny, 30, t.dim);
                bar(cv, t, x + 24, my + ny + 20, w - 48, 10, p / 100, fullCol(t, p, false));
                const upTxt = G.isNum(up) ? ' · ' + tr('up {hours}h {minutes}m', { hours: Math.floor(up / 3600), minutes: Math.floor(up % 3600 / 60) }) : '';
                cv.text(fit(cv, tr('used {used} of {total}', { used: sz(mem.used), total: sz(mem.total) }) + upTxt, 20, w - 48, 'label'), x + 24, my + th - 16, 20, t.dim);
            } else cv.text('not available', x + 24, my + 120, 22, t.dim);
        }

        function drawApps(cv, t, top) {
            const bottom = G.BOTTOM;
            const L = G.panel(cv, t, 24, top, 1552, bottom - top, 'Installed apps');
            const list = apps.list, total = list.reduce((a, r) => a + r.bytes, 0);
            const status = apps.scanning ? tr('Scanning {done} / {total} ...', { done: apps.done, total: apps.total || '?' })
                : apps.error ? tr('Cannot open {path} ({error})', { path: ROOT, error: apps.error })
                    : apps.t ? tr('{count} apps - {size} in all', { count: list.length, size: sz(total) }) : tr('Press Refresh to measure');
            cv.text(status, 1552, top + 36, 22, apps.error ? t.warn : t.dim, { align: 'right', font: 'bold' });
            if (!list.length) return;
            const rowH = 40, rtop = top + 66, per = Math.max(1, Math.floor((L.h - 80) / rowH)), cols = 2, colW = 740;
            const fitN = per * cols;
            const rows = list.length > fitN ? list.slice(0, fitN - 1) : list;
            const max = list[0].bytes || 1;
            rows.forEach((r, i) => {
                const c = Math.floor(i / per), k = i % per;
                const x = 48 + c * (colW + 24), y = rtop + k * rowH;
                if (k % 2 === 1) cv.fillRect(x - 8, y, colW + 16, rowH, t.track);
                const own = r.folder === OWN;
                const label = r.name || (r.folder === 'oap_12201' ? tr('App platform (MainApp)') : r.folder);
                const name = label + (own ? '  (' + tr('this app') + ')' : '');
                cv.text(fit(cv, name, 22, 390, 'label'), x, y + 28, 22, r.name || r.folder === 'oap_12201' ? t.text : t.dim);
                cv.text(r.folder.replace('oap_', ''), x + 470, y + 28, 18, t.dim, { align: 'right' });
                bar(cv, t, x + 490, y + 17, 110, 8, r.bytes / max, t.accent);
                cv.text(sz(r.bytes) + (r.denied || r.partial ? ' *' : ''), x + colW, y + 28, 22, r.denied || r.partial ? t.dim : t.text, { align: 'right', font: 'bold' });
            });
            if (list.length > rows.length) {
                const rest = list.slice(rows.length), i = rows.length, c = Math.floor(i / per), k = i % per;
                cv.text(tr('+ {count} smaller: {size}', { count: rest.length, size: sz(rest.reduce((a, r) => a + r.bytes, 0)) }), 48 + c * (colW + 24), rtop + k * rowH + 28, 22, t.dim);
            }
            const note = list.some((r) => r.denied || r.partial);
            if (note) cv.text(tr('* incomplete measurement: at least this much'), 1552, bottom - 14, 18, t.dim, { align: 'right' });
            // the cafe mark, bottom right, only where the second column has room under its last line
            const filled = rows.length + (list.length > rows.length ? 1 : 0), second = Math.max(0, filled - per);
            const base = L.y + L.h - 16 - (note ? 30 : 0);
            if (base - 60 >= rtop + second * rowH) BG.mark(cv, 1552, base);
        }

        function drawUsage(cv, t, top) {
            usageView.draw(cv, t, usage, top, G.BOTTOM, fit);
        }

        function drawHistory(cv, t, top) {
            historyView.draw(cv, t, historyState(), top, G.BOTTOM, fit);
        }

        async function render() {
            const now = Date.now();
            if (now - lastDraw > 2000 || now - disks.t > DISK_MS) readDisks();
            if (PAGES[page] === 'apps' && !apps.t && !apps.scanning) scanApps();
            if (PAGES[page] === 'history' && !history.busy && now - history.read >= 60000) refreshHistory();
            lastDraw = now;
            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
            // the photo from the menu's left edge (right of the HMI's back arrow column on the full-screen layout)
            // and under the tab bar, scaled into that area
            BG.paint(cv, W, H, BG.left(cv), BG.top(cv, G.BAR_H));
            const alert = over();
            const BH = 50, top = G.TOP + (alert ? BH + 8 : 0);
            if (alert) drawBanner(cv, t, G.TOP + 2, BH);
            (PAGES[page] === 'history' ? drawHistory : PAGES[page] === 'usage' ? drawUsage : PAGES[page] === 'apps' ? drawApps : drawDisks)(cv, t, top);
            const badges = [];
            const latest = usage.history[usage.history.length - 1];
            const percentText = (v) => G.isNum(v) ? v.toFixed(1) + '%' : '--';
            badges.push({ text: 'CPU ' + percentText(latest && latest.cpu) + ' | RAM ' + percentText(latest ? memoryPercent(latest) : null) });
            const culprit = latest && (latest.apps.find((a) => a.trend.leakSuspected) || latest.apps.find((a) => a.trend.cpuRising || a.trend.memoryRising));
            if (culprit) badges.push({ text: (culprit.trend.leakSuspected ? tr('Memory leak suspected') : culprit.trend.cpuRising ? tr('CPU rising') : tr('Memory rising')) + ': ' + String(culprit.name).slice(0,16) });
            else if (latest && latest.trend.leakSuspected) badges.push({ text: tr('Memory leak suspected') });
            else if (latest && latest.trend.memoryRising) badges.push({ text: tr('Memory rising') });
            else if (latest && latest.trend.cpuRising) badges.push({ text: tr('CPU rising') });
            if (alert) badges.push({ text: tr('LOW {percent}%', { percent: appPct().toFixed(0) }) });
            if (isDemo) badges.push({ text: tr('DEMO') });
            G.frame(cv, t, TABS, page, badges);
            await ui.image('MAIN_GFX', cv);
        }

        /* ---------- 홈 화면 위젯 ---------- */
        // CPU·메모리 최근 30분 그래프(10초 수집 이력 usage.history) + 아래 한 줄로 앱 저장공간.
        // 문구는 app.json(UI 템플릿 지문)에 넣지 않고 여기서 언어별로 둡니다.
        const widgetLabels = {
            'last 30m': { en: 'last 30 min', ko: '최근 30분' },
            'storage': { en: 'App storage {percent}% · {size} free', ko: '앱 저장공간 {percent}% · {size} 여유' },
            'small': { en: 'CPU {cpu} · RAM {ram}', ko: 'CPU {cpu} · 메모리 {ram}' },
            'RAM': { en: 'RAM', ko: '메모리' },
        };
        const wtr = (key, values) => Object.keys(values || {}).reduce((out, k) => out.split('{' + k + '}').join(String(values[k])),
            widgetLabels[key][getLanguage()] || widgetLabels[key].en);
        const wcan = {}, wprev = {}, wkey = {};
        function setCells(inst, cells) {
            const prev = wprev[inst.spawnId] || (wprev[inst.spawnId] = {});
            Object.keys(cells).forEach((k) => {
                const v = JSON.stringify(cells[k][0]);
                if (prev[k] === v) return;
                prev[k] = v;
                ctx.widget.set(inst.spawnId, k, cells[k][0], cells[k][1]);
            });
        }
        // one usage graph: header (label, current value) and the last 30 minutes as a filled line, 0..100%
        function widgetChart(cv, t, y, label, note, value, color, warn) {
            const x = 26, w = 332, top = y + 12, h = 58;
            const latest = usage.history[usage.history.length - 1];
            const now = latest ? latest.time : Date.now();
            cv.text(label, x, y, 18, t.dim);
            if (note) cv.text(note, x + cv.textWidth(label, 18) + 10, y, 13, t.dim);
            const current = latest ? value(latest) : null;
            cv.text(G.isNum(current) ? current.toFixed(0) + '%' : '--', x + w, y + 4, 28, warn ? t.warn : t.text, { align: 'right', font: 'num' });
            cv.roundRect(x, top, w, h, 6, withAlpha('#ffffff', 0.05));
            cv.line(x, top + h / 2, x + w, top + h / 2, 1, withAlpha('#ffffff', 0.08));
            let segment = [];
            const flush = () => {
                if (segment.length > 1) {
                    cv.fill(segment.concat([[segment[segment.length - 1][0], top + h], [segment[0][0], top + h]]), withAlpha(color, 0.25));
                    cv.polyline(segment, 2, color);
                } else if (segment.length === 1) cv.fillRect(segment[0][0] - 1.5, segment[0][1] - 1.5, 3, 3, color);
                segment = [];
            };
            let previous = null;
            usage.history.forEach((s) => {
                const v = value(s);
                if (!G.isNum(v)) { flush(); previous = null; return; }
                if (previous !== null && s.time - previous > INTERVAL * 1.5) flush();
                const px = x + 2 + (w - 4) * Math.max(0, 1 - (now - s.time) / WINDOW);
                segment.push([px, top + h * (1 - Math.max(0, Math.min(100, v)) / 100)]);
                previous = s.time;
            });
            flush();
        }
        function renderWidget(inst) {
            const { appFs } = shown();
            const p = appFs ? pct(appFs.used, appFs.size) : null;
            const alert = p !== null && p >= alertOf();
            const latest = usage.history[usage.history.length - 1];
            const cpu = latest ? latest.cpu : null, ram = latest ? memoryPercent(latest) : null;
            const percentText = (v) => (G.isNum(v) ? v.toFixed(0) + '%' : '--');
            const cells = { Title: [(alert ? '! ' : '') + tr('MGU Monitor'), 'Text'] };
            if (alert || (!latest && appFs)) {
                // the storage alert keeps the small widget's text and bar
                Object.assign(cells, {
                    TextRecordings: [tr('App storage {percent}% - free {size}', { percent: p.toFixed(0), size: sz(appFs.avail) }), 'Text'],
                    ProgressbarVisible: [true, 'Bool'], Progress: [Math.round(p), 'Float'],
                });
            } else if (latest) {
                Object.assign(cells, {
                    TextRecordings: [wtr('small', { cpu: percentText(cpu), ram: percentText(ram) }), 'Text'],
                    ProgressbarVisible: [G.isNum(ram), 'Bool'],
                });
                if (G.isNum(ram)) cells.Progress = [Math.round(ram), 'Float'];
            }
            if (latest || appFs) setCells(inst, cells);
            if (!inst.big) return null;
            const t = ctx.theme();
            // redraw only when something shown changed (a new 10-second sample, the disks, theme or language)
            const key = [latest ? latest.time : 0, usage.history.length, p === null ? '' : p.toFixed(1), appFs ? appFs.avail : '', alert, settings.get('theme'), getLanguage()].join('|');
            if (wkey[inst.spawnId] === key && wcan[inst.spawnId]) return null;
            wkey[inst.spawnId] = key;
            const sw = ctx.spec.startWidget || {}, size2 = sw.size || [384, 256], w = size2[0], h = size2[1], scale = sw.scale || 2;
            const cv = (wcan[inst.spawnId] || (wcan[inst.spawnId] = new ScaledCanvas(w, h, scale))).clear([0, 0, 0, 0]);
            cv.roundRect(6, 6, w - 12, h - 12, 18, withAlpha(t.panelTop, 0.96));
            if (!latest) {
                cv.text(tr('Reading...'), w / 2, h / 2, 24, t.dim, { align: 'center' });
            } else {
                const trend = latest.trend || {};
                widgetChart(cv, t, 36, 'CPU', wtr('last 30m'), (s) => s.cpu, t.accent, trend.cpuRising);
                widgetChart(cv, t, 132, wtr('RAM'), '', memoryPercent, t.cold || t.accent2, trend.memoryRising || trend.leakSuspected);
            }
            if (appFs && p !== null) {
                const line = (alert ? '! ' : '') + wtr('storage', { percent: p.toFixed(0), size: sz(appFs.avail) });
                cv.text(line, 26, 232, 16, alert ? t.crit : t.dim, { font: 'bold' });
            }
            return cv.canvas;
        }

        /* ---------- wiring ---------- */
        ui.onClick('BTN_ACTION', () => { readDisks(); if (PAGES[page] === 'apps') { apps.t = 0; scanApps(); } if (PAGES[page] === 'history') { history.read = 0; refreshHistory(); } return render(); });
        ui.onClick('BTN_PAGE', () => { page = (page + 1) % PAGES.length; return render(); });
        // Next app: the next app's graphs; on Log history the next day (all days -> newest -> ... -> all days)
        ui.onClick('BTN_APP', () => { if (PAGES[page] === 'history') historyView.next(historyState().days); else { page = 2; usageView.next(usage); } return render(); });
        ctx.onTab((i) => { if (i >= 0 && i < PAGES.length) page = i; return render(); });
        settings.onChange((k) => {
            if (k === 'page') page = Math.max(0, PAGES.indexOf(settings.get('page')));
            if (k === 'demo') sampleUsage();
            if (k === 'usageLogging') { usage.logging = settings.get('usageLogging') !== false; if (!usage.logging) usage.logger.flush(); }
        });

        if (ctx.widget) {
            ctx.widget.loop(() => 1, renderWidget);
            ctx.widget.onChange((why) => {
                if (why === 'resized' || why === 'placed') Object.keys(wprev).forEach((k) => delete wprev[k]);
                // the image again after any change of the widget (placed, shown, resized)
                Object.keys(wkey).forEach((k) => delete wkey[k]);
                // 앱 화면을 안 열고 위젯만 올려둔 경우에도 알림이 뜨도록, 배치/표시 때 즉시 갱신
                if (why === 'placed' || why === 'shown') readDisks();
            });
            // 화면이 닫혀 render 루프가 안 도는 동안에도 위젯 값이 갱신되도록 주기 조회(저장량은 천천히 변함)
            const wtimer = setInterval(() => { if (ctx.widget.active()) readDisks(); }, 30000);
            process.on('exit', () => clearInterval(wtimer));
        }

        ctx.loop('MAIN', 5, render);
        log.info('app root ' + ROOT + (OWN ? ', this app ' + OWN : '') + (onCar() ? '' : ' (off-car: demo)'));
        render().catch((e) => log.warn('first render: ' + e));
    },
});
