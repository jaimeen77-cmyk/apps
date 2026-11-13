'use strict';
/**
 * Storage — 헤드유닛이 얼마나 찼는지 차 화면에서 바로 본다(읽기 전용).
 *
 *   Disks  유닛의 각 파일시스템(df): 여유/사용/크기, 사용률 색 막대. 앱이 설치된
 *          파티션은 APPS 로 표시. 오른쪽에 '앱용 여유'와 RAM.
 *   Apps   /var/opt/public/oap 아래 앱별 폴더 용량, 큰 것부터.
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
const { t } = require('./kit/i18n');
const tr = (text, values) => Object.keys(values || {}).reduce((out, key) => out.split('{' + key + '}').join(String(values[key])), t(text));

const W = 1600, H = 520;
const PAGES = ['disks', 'apps'];
const TABS = ['Disks', 'Apps'].map((s) => tr(s));
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
        { folder: 'oap_12212', name: 'Storage', bytes: 6 * MB, files: 0, denied: 0 },
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

        async function render() {
            const now = Date.now();
            if (now - lastDraw > 2000 || now - disks.t > DISK_MS) readDisks();
            if (PAGES[page] === 'apps' && !apps.t && !apps.scanning) scanApps();
            lastDraw = now;
            const t = ctx.theme(), cv = ctx.canvas(W, H).clear(t.bg);
            // the photo from the menu's left edge (right of the HMI's back arrow column on the full-screen layout)
            // and under the tab bar, scaled into that area
            BG.paint(cv, W, H, BG.left(cv), BG.top(cv, G.BAR_H));
            const alert = over();
            const BH = 50, top = G.TOP + (alert ? BH + 8 : 0);
            if (alert) drawBanner(cv, t, G.TOP + 2, BH);
            (PAGES[page] === 'apps' ? drawApps : drawDisks)(cv, t, top);
            const badges = [];
            if (alert) badges.push({ text: tr('LOW {percent}%', { percent: appPct().toFixed(0) }) });
            if (isDemo) badges.push({ text: tr('DEMO') });
            G.frame(cv, t, TABS, page, badges);
            await ui.image('MAIN_GFX', cv);
        }

        /* ---------- 홈 화면 위젯 ---------- */
        const wcan = {}, wprev = {};
        const widgetColor = (p, t) => (p >= alertOf() ? t.crit : p >= 75 ? t.warn : '#2fb56b');
        function setCells(inst, cells) {
            const prev = wprev[inst.spawnId] || (wprev[inst.spawnId] = {});
            Object.keys(cells).forEach((k) => {
                const v = JSON.stringify(cells[k][0]);
                if (prev[k] === v) return;
                prev[k] = v;
                ctx.widget.set(inst.spawnId, k, cells[k][0], cells[k][1]);
            });
        }
        function renderWidget(inst) {
            const { appFs } = shown();
            const p = appFs ? pct(appFs.used, appFs.size) : null;
            const alert = p !== null && p >= alertOf();
            if (appFs) {
                setCells(inst, {
                    Title: [(alert ? '! ' : '') + tr('Storage'), 'Text'],
                    TextRecordings: [tr('App storage {percent}% - free {size}', { percent: p.toFixed(0), size: sz(appFs.avail) }), 'Text'],
                    ProgressbarVisible: [true, 'Bool'],
                    Progress: [Math.round(p), 'Float'],
                });
            }
            if (!inst.big) return null;
            const sw = ctx.spec.startWidget || {}, size2 = sw.size || [384, 256], w = size2[0], h = size2[1], scale = sw.scale || 2;
            const t = ctx.theme();
            const cv = (wcan[inst.spawnId] || (wcan[inst.spawnId] = new ScaledCanvas(w, h, scale))).clear([0, 0, 0, 0]);
            cv.roundRect(6, 6, w - 12, h - 12, 18, withAlpha(t.panelTop, 0.96));
            if (appFs === undefined || appFs === null || p === null) { cv.text('No data', w / 2, h / 2, 26, t.dim, { align: 'center' }); return cv.canvas; }
            const col = widgetColor(p, t);
            cv.text('APP STORAGE', 28, 42, 20, t.dim, { font: 'bold', spacing: 1.5 });
            const ps = p.toFixed(0);
            cv.text(ps, 26, 130, 92, alert ? t.crit : t.text, { font: 'num' });
            const pw = cv.textWidth(ps, 92, { font: 'num' });
            cv.text('%', 26 + pw + 10, 130, 36, t.dim);
            cv.text(tr('free {size} / {total}', { size: sz(appFs.avail), total: sz(appFs.size) }), 28, 170, 22, t.dim, { font: 'bold' });
            const bx = 28, by = 200, bw = w - 56, bh = 20;
            cv.roundRect(bx, by, bw, bh, bh / 2, withAlpha('#ffffff', 0.12));
            const fw = Math.max(0, Math.round(bw * Math.min(100, p) / 100));
            if (fw > 0) cv.roundRect(bx, by, fw, bh, bh / 2, col);
            if (alert) cv.text('FULL', w - 28, 42, 22, t.crit, { align: 'right', font: 'bold', spacing: 1 });
            return cv.canvas;
        }

        /* ---------- wiring ---------- */
        ui.onClick('BTN_ACTION', () => { readDisks(); if (PAGES[page] === 'apps') { apps.t = 0; scanApps(); } return render(); });
        ui.onClick('BTN_PAGE', () => { page = (page + 1) % PAGES.length; return render(); });
        ctx.onTab((i) => { page = i; return render(); });
        settings.onChange((k) => { if (k === 'page') page = Math.max(0, PAGES.indexOf(settings.get('page'))); });

        if (ctx.widget) {
            ctx.widget.loop(() => 1, renderWidget);
            ctx.widget.onChange((why) => {
                if (why === 'resized' || why === 'placed') Object.keys(wprev).forEach((k) => delete wprev[k]);
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
