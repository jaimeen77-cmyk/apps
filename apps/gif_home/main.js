'use strict';

const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const { Canvas } = require('./kit/canvas');
const { setImage, makeLayer, dropLayer } = require('./kit/record');
const { open } = require('./kit/pack');
const { decode } = require('./gif');
const qrcode = require('./qr_vendor');
const { GifUploadServer, localAddresses, bridgeStatus, PORT, IFACE } = require('./upload');
const { compensateWidget } = require('./widget_tone');
const { Library, MODES, atomic } = require('./library');
const { Playback } = require('./playback');
const { diagnostics } = require('./diagnostics');
// jaimeen77-cmyk/apps: the Animation screen (ANIM) through the GPU renderer
const { area: animArea, History, playbackSettings } = require('./animation');
const { listSheet } = require('./kit/sheet');

const W = 1600, H = 520, PIXEL_IMAGE = 23401, ANIM_IMAGE = 23402;
const PRESETS = [
    ['demo', 'Animated BMW logo', 'demo.json'],
    ['drift', 'Pixel drift: Night City', 'drift_city.json'],
    ['sunset', 'Pixel drive: Sunset', 'sunset_drive.json'],
    ['garage', 'Pixel art: Neon Garage', 'garage_nights.json'],
    ['tunnel', 'Pixel art: Midnight Run', 'tunnel_run.json']
];
const PRESET_IDS = PRESETS.map(p => p[0]);
const MODE_NAMES = ['Single GIF', 'Random – Selected GIFs', 'Random – Group', 'Sequential', 'Random – All'];
const NEEDS_BRIDGE = target => target.interface === IFACE || target.priority === 2;

function rectFor(srcW, srcH, x, y, w, h, mode) {
    const scale = mode === 'contain' ? Math.min(w / srcW, h / srcH) : Math.max(w / srcW, h / srcH);
    const dw = Math.round(srcW * scale), dh = Math.round(srcH * scale);
    return { x: Math.round(x + (w - dw) / 2), y: Math.round(y + (h - dh) / 2), w: dw, h: dh };
}

function qrLayer(link) {
    const code = qrcode(0, 'M');
    code.addData(link); code.make();
    const n = code.getModuleCount(), step = Math.floor(312 / (n + 8));
    const off = Math.floor((320 - n * step) / 2);
    return makeLayer(320, 320, r => {
        r.fillRect(0, 0, 320, 320, '#fff');
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
            if (code.isDark(y, x)) r.fillRect(off + x * step, off + y * step, step, step, '#000');
    });
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        const diag = diagnostics(ctx.dataDir, log);
        let logVersion = 0;
        const record = message => { logVersion++; diag.record(message); };
        record('GIF Home startup');
        const library = new Library(ctx.dataDir, PRESET_IDS,
            { source: settings.get('source'), paused: settings.get('pause') }, record);
        const resources = open(path.join(__dirname, 'resources'));
        function gifBytes(id) {
            const preset = PRESETS.find(item => item[0] === id);
            if (!preset) return library.read(id);
            const value = resources.json(preset[2]);
            if (!value || !value.base64) throw new Error('Built-in animation unavailable');
            return Buffer.from(value.base64, 'base64');
        }
        const presets = PRESETS.map(p => ({ id: p[0], name: p[1] }));
        const files = () => library.state.files.concat(presets);
        const label = id => { const f = files().find(item => item.id === id); return f ? f.name : 'None'; };
        const player = new Playback(id => decode(gifBytes(id)), record, PRESET_IDS[0]);
        const cursorFile = path.join(ctx.dataDir, 'playback-cursor.json');
        let resume = null, lastSave = 0, cursorDirty = false;
        try {
            if (fs.statSync(cursorFile).size < 1024) resume = JSON.parse(fs.readFileSync(cursorFile, 'utf8')).id;
        } catch (_) {}
        // jaimeen77-cmyk/apps: five pages (Page cycles them) and Diagnostics (its own button)
        const panels = ['Widget preview', 'Widget settings', 'Animation', 'Animation settings', 'Phone Connection', 'Diagnostics'];
        const PREVIEW = 0, WSET = 1, ANIMPAGE = 2, ASET = 3, PHONE = 4, DIAG = 5, PAGES = 5;
        let panel = 0, row = 0, logOffset = 0, confirmClear = false, dirty = true, screenKey = '';
        let widgetIndex = Object.create(null), frame = -1, notice = '';
        const history = new History(30);
        const phone = { enabled: false, addresses: [], index: 0, bridge: '', ready: false,
            detail: '', qr: null, link: '', export: false, searching: false };
        function update(skip, persist) {
            const speed = settings.get('speed') === 'slow' ? 0.5 : settings.get('speed') === 'fast' ? 1.5 : 1;
            const previous = player.id, now = Date.now();
            frame = player.update(library.state, files().map(f => f.id), now, speed, skip, resume);
            resume = null;
            if (previous !== player.id) { history.left(previous); dirty = true; cursorDirty = true; }
            if (cursorDirty && (persist || now - lastSave >= 5000)) {
                lastSave = now;
                cursorDirty = false;
                try { atomic(cursorFile, JSON.stringify({ id: player.id })); }
                catch (_) { record('Could not save playback position'); }
            }
            return frame;
        }
        function snapshot() {
            const playbackNotice = !player.gif ? 'No decodable GIF' :
                !eligible().includes(player.id) ? 'Selection unavailable. Playing the built-in fallback.' : '';
            return Object.assign({}, library.state, { presets, active: player.id, activeName: label(player.id),
                error: library.error, playbackNotice });
        }
        function eligible() {
            const p = library.state.playback;
            const g = library.state.groups.find(item => item.id === p.group);
            return p.mode === 'single' ? [p.single] : p.mode === 'all' ? files().map(f => f.id) :
                p.mode === 'group' ? (g ? g.ids : []) : p.selected;
        }
        function apply(action, check) {
            if (action && action.type === 'next' && library.state.playback.mode === 'single') {
                const ids = files().map(f => f.id);
                const current = ids.indexOf(library.state.playback.single);
                action = { type: 'activate', id: ids[(current + 1) % ids.length], revision: action.revision };
            }
            if (action && action.type === 'next') update(true, true);
            else {
                library.change(action, check);
                update(false, true);
            }
            dirty = true;
        }
        /** Previous: in Single mode the library's previous GIF; otherwise the GIF played before (mode unchanged). */
        function previousGif() {
            const p = library.state.playback;
            if (p.mode === 'single') {
                const ids = files().map(f => f.id);
                const current = ids.indexOf(p.single);
                return apply({ type: 'activate', id: ids[(current - 1 + ids.length) % ids.length] });
            }
            const ok = eligible();
            const id = history.back(player.id, item => ok.includes(item));
            if (id && player.set(id, Date.now())) { record('Previous: ' + id); cursorDirty = true; update(false, true); }
            dirty = true;
        }
        const upload = new GifUploadServer({
            record, api: {
                state: snapshot,
                preview: gifBytes,
                diagnostics: diag.entries,
                upload(bytes, name) {
                    library.add(bytes, name, false);
                    update(); dirty = true;
                },
                action(action) { apply(action, true); }
            }
        });

        function clearQr() {
            if (phone.qr) dropLayer(phone.qr);
            phone.qr = null; phone.link = ''; dirty = true;
        }
        function refreshQr() {
            const link = phone.ready ? upload.link(phone.export ? '/diagnostics' : '/') : '';
            if (link === phone.link) return;
            clearQr();
            if (link) {
                try { phone.qr = qrLayer(link); phone.link = link; }
                catch (_) { phone.detail = 'Could not generate QR code'; record(phone.detail); }
            }
        }
        async function checkBridge() {
            if (phone.searching || !phone.enabled || !upload.target) return;
            phone.searching = true;
            const target = upload.target;
            try {
                const bridge = NEEDS_BRIDGE(target) ? await bridgeStatus() : null;
                if (target !== upload.target) return;
                const exists = localAddresses().some(a => a.ip === target.ip && a.interface === target.interface &&
                    a.netmask === target.netmask);
                const ready = bridge && bridge.ready === true && Date.now() - bridge.checkedAt < 10000;
                const status = !bridge ? 'Not required' : ready ? 'Ready' : 'Error';
                const detail = !exists ? 'Selected address is no longer available. Rescan.' :
                    !upload.listening ? 'HTTP server is not listening' :
                    !upload.active ? 'QR session expired. Rescan to pair again.' :
                    bridge && !ready ? (bridge.error || 'Firewall not ready. Waiting for helper.') : '';
                if (phone.bridge !== status || phone.detail !== detail) {
                    record('Network bridge: ' + status + (detail ? ' · ' + detail : ''));
                    dirty = true;
                }
                phone.bridge = status;
                phone.detail = detail;
                phone.ready = !detail;
                refreshQr();
            } finally { phone.searching = false; }
        }
        async function connect(next) {
            if (phone.connecting) return;
            phone.connecting = true;
            panel = PHONE;
            phone.enabled = true; phone.export = false; phone.ready = false;
            phone.bridge = ''; phone.detail = 'Searching for local Wi-Fi'; clearQr();
            upload.end();
            try {
                const previous = phone.addresses[phone.index];
                phone.addresses = localAddresses();
                const old = previous ? phone.addresses.findIndex(a => a.ip === previous.ip) : -1;
                phone.index = next && phone.addresses.length ? (old + 1) % phone.addresses.length : 0;
                const target = phone.addresses[phone.index];
                if (!target) {
                    phone.detail = 'No private IPv4 address. Connect the phone to the MGU Wi-Fi.';
                    record(phone.detail);
                    return;
                }
                await upload.start();
                upload.begin(target);
                await checkBridge();
            } catch (_) {
                phone.detail = upload.serverError || 'HTTP server is not listening on TCP ' + PORT;
                record(phone.detail);
            } finally { phone.connecting = false; dirty = true; }
        }
        function stopPhone() {
            phone.enabled = false; phone.ready = false; phone.bridge = ''; phone.detail = 'Phone session stopped';
            clearQr();
            record(phone.detail);
            return upload.close();
        }

        function drawFrame(cv, width, height, widget) {
            if (!player.gif || frame < 0) return;
            const gif = player.gif, img = gif.frames[frame];
            const r = rectFor(gif.width, gif.height, 0, 0, width, height, settings.get('fit'));
            if (widget) cv.drawImage(img.data, gif.width, gif.height, r.x, r.y, r.w, r.h);
            else {
                setImage(PIXEL_IMAGE, gif.width, gif.height, img.data);
                cv.image(PIXEL_IMAGE, r.x, r.y, r.w, r.h);
            }
        }
        function widgetImage(inst) {
            const key = String(inst.spawnId);
            update();
            const stamp = player.id + ':' + (inst.big ? frame : label(player.id));
            if (!inst.visible || widgetIndex[key] === stamp) return null;
            if (!inst.big) {
                ctx.widget.set(inst.spawnId, 'Title', 'GIF Home', 'Text');
                ctx.widget.set(inst.spawnId, 'TextRecordings', label(player.id), 'Text');
                ctx.widget.set(inst.spawnId, 'TextCam', 'Tap to open', 'Text');
                widgetIndex[key] = stamp;
                return null;
            }
            try {
                const dims = ctx.spec.startWidget.size || [384, 256];
                const cv = new Canvas(dims[0], dims[1]).clear('#080911');
                drawFrame(cv, dims[0], dims[1], true);
                if (frame < 0) cv.text('NO GIF', dims[0] / 2, dims[1] / 2, 28, '#fff', { align: 'center' });
                compensateWidget(cv, settings.get('widgetTone') || 'neutral');
                widgetIndex[key] = stamp;
                return cv;
            } catch (_) {
                record('Widget frame could not be rendered');
                return null;
            }
        }

        const intervalLabel = p => p.seconds ? p.seconds + ' s' : 'One full GIF pass';
        const cycle = (list, value, by) => list[(Math.max(0, list.indexOf(value)) + (by || 1) + list.length) % list.length];
        const settingSpec = key => (ctx.spec.settings || []).find(item => item.key === key);
        const optionLabel = key => {
            const s = settingSpec(key);
            const o = s && (s.options || []).find(item => item[0] === settings.get(key));
            return o ? o[1] : String(settings.get(key));
        };
        const cycleSetting = key => settings.set(key, cycle(settingSpec(key).options.map(o => o[0]), settings.get(key)));
        /** Widget settings: what the phone page sets (playback), and the GIFs in the selected list. */
        function widgetRows() {
            const p = library.state.playback, group = library.state.groups.find(g => g.id === p.group);
            const all = files();
            const rows = [
                { text: 'Mode · ' + MODE_NAMES[MODES.indexOf(p.mode)],
                    act: () => apply({ type: 'playback', mode: cycle(MODES, p.mode) }) },
                { text: 'Single GIF · ' + label(p.single),
                    act: () => apply({ type: 'playback', single: cycle(all.map(f => f.id), p.single) }) },
                { text: 'Group · ' + (group ? group.name : 'None'),
                    act: () => apply({ type: 'playback', group: cycle([null].concat(library.state.groups.map(g => g.id)), p.group || null) }) },
                { text: 'Interval · ' + intervalLabel(p),
                    act: () => apply({ type: 'playback', seconds: cycle([0, 5, 10, 15, 30], p.seconds) }) },
                { text: p.paused ? 'Resume playback' : 'Pause playback', act: () => apply({ type: 'playback', paused: !p.paused }) },
                { text: 'Next GIF', act: () => apply({ type: 'next' }) },
            ];
            all.forEach(f => {
                const on = p.selected.includes(f.id);
                rows.push({ text: (on ? '[x] ' : '[  ] ') + f.name + (f.id === player.id ? '  · Playing' : ''),
                    act: () => apply({ type: 'playback', selected: on ? p.selected.filter(id => id !== f.id) : p.selected.concat([f.id]) }) });
            });
            return rows;
        }
        const gpuReady = () => !!(ctx.display && ctx.display.gpu && ctx.display.gpu.ready);
        /** Animation settings: how the Animation screen draws (the shared playback is under Widget settings). */
        function animRows() {
            return [
                { text: 'Picture fit · ' + optionLabel('fit'), act: () => cycleSetting('fit') },
                { text: 'Animation speed · ' + optionLabel('speed'), act: () => cycleSetting('speed') },
                { text: 'Animation screen · ' + optionLabel('renderer'), act: () => cycleSetting('renderer') },
                { text: 'Open the animation screen', act: () => ui.open('ANIM') },
            ];
        }
        const rowsFor = n => (n === WSET ? widgetRows() : n === ASET ? animRows() : []);
        // the widget's shape (384 x 256), as large as the page allows
        const WIDGET_BOX = { x: 500, y: 20, w: 600, h: 400 };
        function drawFrameIn(cv, box) {
            if (!player.gif || frame < 0) return false;
            const gif = player.gif, img = gif.frames[frame];
            const r = rectFor(gif.width, gif.height, box.x, box.y, box.w, box.h, settings.get('fit'));
            setImage(PIXEL_IMAGE, gif.width, gif.height, img.data);
            cv.image(PIXEL_IMAGE, r.x, r.y, r.w, r.h);
            return true;
        }
        async function render() {
            update();
            if (phone.link && !upload.active) { clearQr(); phone.detail = 'QR session expired. Rescan to pair again.'; }
            const key = JSON.stringify([panel, row, logOffset, panel === PREVIEW || panel === ANIMPAGE ? frame : 0, player.id,
                library.state.revision, panel === DIAG ? logVersion : 0, panel === PHONE ? [upload.phoneAt, upload.lastError, upload.lastRequest] : null,
                panel === ASET || panel === ANIMPAGE ? [settings.get('fit'), settings.get('speed'), settings.get('renderer'), gpuReady()] : null]);
            if (key === screenKey && !dirty) return;
            screenKey = key; dirty = false;
            const cv = ctx.canvas(W, H).clear('#090b13');
            const line = (s, y, x, size, ink) => cv.text(String(s).slice(0, x > 800 ? 44 : 112),
                x || 40, y, size || 27, ink || '#d9e5f9');
            if (panel === PREVIEW) {
                cv.fillRect(WIDGET_BOX.x, WIDGET_BOX.y, WIDGET_BOX.w, WIDGET_BOX.h, '#080911');
                if (!drawFrameIn(cv, WIDGET_BOX)) line('No GIF', 230, 720);
                line('Next item: next GIF · Select: pause / resume', 412, 40, 20, '#96acc4');
            }
            if (panel === WSET || panel === ASET) {
                const rows = rowsFor(panel), first = Math.floor(row / 7) * 7;
                rows.slice(first, first + 7).forEach((entry, i) => line((row === first + i ? '> ' : '   ') + entry.text, 80 + i * 46));
                line(panel === WSET
                    ? library.state.playback.selected.length + ' selected GIFs · ' + eligible().length + ' in current mode'
                    : 'GPU renderer (mgu-renderd) · ' + (gpuReady() ? 'Connected' : 'Not running'), 412, 40, 22, '#96acc4');
            }
            if (panel === ANIMPAGE) {
                const box = { x: 760, y: 30, w: 800, h: 380 };
                cv.fillRect(box.x, box.y, box.w, box.h, '#000000');
                drawFrameIn(cv, box);
                line('The GIF across the screen at its own speed', 110, 40, 27, '#ffffff');
                line('Select: open the animation screen', 170, 40, 24);
                line('Next item: next GIF', 215, 40, 24);
                line('GPU renderer (mgu-renderd) · ' + (gpuReady() ? 'Connected' : 'Not running'), 290, 40, 22, '#96acc4');
            }
            if (panel === PHONE) {
                const target = upload.target;
                line('HTTP server · ' + (upload.listening ? 'Running' : (upload.serverError || 'Not listening')), 91);
                line('Network bridge · ' + (phone.bridge || 'Waiting'), 135);
                line('Selected IP / Port · ' + (target ? target.ip + ':' + upload.port + ' (' + target.interface + ')' : 'None'), 179);
                line('QR session · ' + (upload.active ? 'Active' : 'Expired / inactive'), 223);
                line('Phone connection · ' + (upload.active && phone.ready && upload.phoneAt !== null ? 'Connected' : 'Not verified'), 267);
                line('Last request · ' + (upload.lastRequest || 'Phone request not received'), 311, 40, 23);
                line('Last error · ' + (upload.lastError || phone.detail || 'None'), 353, 40, 23, '#ffd4ad');
                line(phone.export ? 'Scan to download diagnostic JSON' : phone.link ? 'Scan with iPhone Camera' : phone.detail, 399, 40, 23);
                if (phone.qr) cv.blit(phone.qr, 1220, 65);
            }
            if (panel === DIAG) {
                const entries = diag.entries().slice().reverse();
                entries.slice(logOffset, logOffset + 8).forEach((entry, i) =>
                    line(entry.time.slice(11, 19) + '  ' + entry.message, 80 + i * 38, 40, 22));
                line(confirmClear ? 'Press Select again to clear the log' :
                    'Next item pages the log. Select clears it. Export is available under Phone.', 412, 40, 22);
            }
            cv.fillRect(0, H - 80, W, 80, [7, 9, 19, 235]);
            line(panels[panel] + (panel < PAGES ? '  ' + (panel + 1) + '/' + PAGES : ''), H - 33, 40, 28, '#fff');
            line(label(player.id) + '  |  ' + MODE_NAMES[MODES.indexOf(library.state.playback.mode)], H - 33, 480, 24);
            if (notice || library.error) line(notice || library.error, H - 8, 480, 16, '#ffd4ad');
            try { await ui.image('MAIN_GFX', cv); }
            catch (e) { record('Preview frame could not be sent to HMI'); dirty = true; throw e; }
        }
        function setPanel(next) {
            panel = next; row = 0; logOffset = 0; confirmClear = false; notice = ''; dirty = true;
        }
        function nextRow() {
            if (panel === PHONE) return connect(phone.addresses.length > 1);
            if (panel === DIAG) {
                logOffset = logOffset + 8 >= diag.entries().length ? 0 : logOffset + 8;
                confirmClear = false;
            } else if (panel === PREVIEW || panel === ANIMPAGE) apply({ type: 'next' });
            else row = (row + 1) % Math.max(1, rowsFor(panel).length);
            dirty = true;
        }
        function select() {
            const p = library.state.playback;
            try {
                if (panel === PREVIEW) apply({ type: 'playback', paused: !p.paused });
                if (panel === WSET || panel === ASET) {
                    const entry = rowsFor(panel)[row];
                    if (entry) entry.act();
                }
                if (panel === ANIMPAGE) ui.open('ANIM');
                if (panel === PHONE && upload.active && phone.ready && upload.phoneAt !== null) {
                    phone.export = !phone.export; refreshQr();
                } else if (panel === PHONE) return connect(false);
                if (panel === DIAG) {
                    if (confirmClear) { diag.clear(); logOffset = 0; }
                    confirmClear = !confirmClear;
                }
                notice = '';
            } catch (e) {
                notice = e.code ? 'Storage error (' + e.code + ')' : e.message;
                record('Local action failed: ' + notice);
            }
            dirty = true;
        }

        update();
        settings.onChange(key => {
            screenKey = ''; widgetIndex = Object.create(null);
            if (key === 'widgetBackground' || key === 'widgetTone') updateWidgetBackground();
        });
        // Page: the five pages in turn (from Diagnostics, back to the first)
        ui.onClick('BTN_PAGE', () => setPanel(panel >= PAGES - 1 ? 0 : panel + 1));
        ui.onClick('BTN_PHONE', () => {
            if (panel !== PHONE && phone.enabled && upload.active) return setPanel(PHONE);
            if (panel !== PHONE) setPanel(PHONE);
            if (!phone.enabled || !upload.active) return connect(false);
            return stopPhone();
        });
        ui.onClick('BTN_NEXT', nextRow);
        ui.onClick('BTN_SELECT', select);
        ui.onClick('BTN_DIAG', () => setPanel(DIAG));
        ui.onVisible((name, visible) => { if (name === 'MAIN' && visible) dirty = true; });
        ctx.loop('MAIN', 4, render);

        // Animation screen: the GIF alone, as large as the screen allows, at its own speed with the GPU
        // renderer (the kit calls renderAnim once per screen refresh there); a few frames a second without it.
        let animKey = '';
        async function renderAnim() {
            update();
            const cv = ctx.canvas(W, H).clear('#000000');
            const a = animArea(cv.place, W, H);
            if (player.gif && frame >= 0) {
                const gif = player.gif, key = player.id + ':' + frame;
                // only a new frame is sent to the renderer again
                if (key !== animKey) { setImage(ANIM_IMAGE, gif.width, gif.height, gif.frames[frame].data); animKey = key; }
                const r = rectFor(gif.width, gif.height, a.x, a.y, a.w, a.h, settings.get('fit'));
                cv.image(ANIM_IMAGE, r.x, r.y, r.w, r.h);
            } else cv.text('No GIF', a.x + a.w / 2, a.y + a.h / 2, 34, '#ffffff', { align: 'center' });
            if (!(cv.place && cv.place.full)) {
                cv.fillRect(0, 0, W, 40, [0, 0, 0, 170]);
                cv.text('GPU renderer (mgu-renderd) is not running: a few frames a second only', 20, 28, 20, '#ffd4ad');
            }
            await ui.image('ANIM_GFX', cv);
        }
        ctx.loop('ANIM', 4, renderAnim);
        const animSettings = playbackSettings({
            state: () => library.state, apply: action => { try { apply(action); } catch (e) { record('Animation setting failed: ' + e.message); } },
            files, modes: MODES, modeNames: MODE_NAMES, settings, spec: ctx.spec,
        });
        ui.onClick('BTN_ANIM', () => ui.open('ANIM'));
        ui.onClick('BTN_PREVGIF', () => { try { previousGif(); } catch (e) { record('Previous failed: ' + e.message); } });
        ui.onClick('BTN_NEXTGIF', () => { try { apply({ type: 'next' }); } catch (e) { record('Next failed: ' + e.message); } });
        ui.onClick('BTN_ANIM_SETTINGS', () => {
            // drawn over the animation where the kit runs the screen (GPU renderer); otherwise the Playback page
            if (ctx.sheet && ctx.sheet(listSheet(animSettings, 'Animation settings'))) return;
            ui.open('MAIN');
            setPanel(WSET);
        });
        setInterval(() => { checkBridge().catch(() => record('Network status check failed')); }, 2500);
        // The playlist advances even when neither preview nor widget is visible.
        setInterval(() => update(), 250);

        function updateWidgetBackground() {
            if (!ctx.widget) return;
            const enabled = !!settings.get('widgetBackground') && settings.get('widgetTone') !== 'neutral';
            ctx.widget.instances().forEach(inst => ctx.widget.set(inst.spawnId, 'background', enabled, 'Bool'));
        }
        if (ctx.widget) {
            ctx.widget.loop(() => Math.max(1, Math.min(6, Number(settings.get('widgetFps')) || 4)), widgetImage);
            ctx.widget.onChange(() => { widgetIndex = Object.create(null); updateWidgetBackground(); });
        }
    }
});

module.exports = { rectFor, qrLayer };
