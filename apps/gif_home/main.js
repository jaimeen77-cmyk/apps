'use strict';

const fs = require('fs');
const path = require('path');
const mgu = require('./kit/mgu');
const { Canvas } = require('./kit/canvas');
const { setImage, makeLayer, dropLayer, Recorder } = require('./kit/record');
const { open } = require('./kit/pack');
const { decode } = require('./gif');
const qrcode = require('./qr_vendor');
const { GifUploadServer, localAddresses, bridgeStatus, PORT, IFACE } = require('./upload');
const { compensateWidget } = require('./widget_tone');
const { Library, MODES, atomic } = require('./library');
const { Playback } = require('./playback');
const { diagnostics } = require('./diagnostics');
// jaimeen77-cmyk/apps: the Animation screen (ANIM) through the GPU renderer
const { area: animArea, History, playbackSettings, frameAt, SPEEDS } = require('./animation');
const { listSheet } = require('./kit/sheet');
const { C, backdrop, header, rows, lines, fitText, button } = require('./look');
const { t, getLanguage } = require('./kit/i18n');
const G = require('./kit/gauges');

const W = 1600, H = 520, PIXEL_IMAGE = 23401, ANIM_IMAGE = 23402, BACK_IMAGE = 23403, THUMB_IMAGE = 23404;
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
        // jaimeen77-cmyk/apps: four pages (Page cycles them) and Diagnostics (its own button)
        const panels = ['Widget preview', 'Widget settings', 'Animation', 'Phone Connection', 'Diagnostics'];
        const PREVIEW = 0, WSET = 1, ANIMPAGE = 2, PHONE = 3, DIAG = 4, PAGES = 4;
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

        const intervalLabel = p => p.seconds ? p.seconds + ' seconds' : 'One full GIF pass';
        const cycle = (list, value, by) => list[(Math.max(0, list.indexOf(value)) + (by || 1) + list.length) % list.length];
        const settingSpec = key => (ctx.spec.settings || []).find(item => item.key === key);
        const optionLabel = key => {
            const s = settingSpec(key);
            const o = s && (s.options || []).find(item => item[0] === settings.get(key));
            return o ? o[1] : String(settings.get(key));
        };
        const cycleSetting = key => settings.set(key, cycle(settingSpec(key).options.map(o => o[0]), settings.get(key)));
        const gpuReady = () => !!(ctx.display && ctx.display.gpu && ctx.display.gpu.ready);
        const modeName = p => MODE_NAMES[MODES.indexOf(p.mode)];
        // Each page's rows: title, the line below it, the value button on the right, what Select does.
        function previewRows() {
            const p = library.state.playback;
            return [
                { title: 'Now playing', sub: label(player.id), value: 'Next GIF', act: () => apply({ type: 'next' }) },
                { title: 'Playback', sub: p.paused ? 'Paused' : 'Playing', value: p.paused ? 'Resume' : 'Pause',
                    act: () => apply({ type: 'playback', paused: !p.paused }) },
            ];
        }
        function widgetRows() {
            const p = library.state.playback, group = library.state.groups.find(g => g.id === p.group);
            const all = files();
            const rows = [
                { title: 'Mode', sub: eligible().length + ' in current mode', value: modeName(p),
                    act: () => apply({ type: 'playback', mode: cycle(MODES, p.mode) }) },
                { title: 'Single GIF', sub: 'Used in the Single GIF mode', value: label(p.single),
                    act: () => apply({ type: 'playback', single: cycle(all.map(f => f.id), p.single) }) },
                { title: 'Group', sub: 'Used in the Random – Group mode', value: group ? group.name : 'None',
                    act: () => apply({ type: 'playback', group: cycle([null].concat(library.state.groups.map(g => g.id)), p.group || null) }) },
                { title: 'Switch after', sub: 'Other modes: the next GIF after this', value: intervalLabel(p),
                    act: () => apply({ type: 'playback', seconds: cycle([0, 5, 10, 15, 30], p.seconds) }) },
                { title: 'Widget picture fit', sub: 'Home widget only', value: optionLabel('fit'), act: () => cycleSetting('fit') },
                { title: 'Widget speed', sub: 'Home widget only', value: optionLabel('speed'), act: () => cycleSetting('speed') },
                { title: 'Playback', sub: p.paused ? 'Paused' : 'Playing', value: p.paused ? 'Resume' : 'Pause',
                    act: () => apply({ type: 'playback', paused: !p.paused }) },
                { title: 'Next GIF', sub: label(player.id), value: 'Next', act: () => apply({ type: 'next' }) },
            ];
            // the playlist (the selected list, in order): made in its own window (the picker)
            rows.push({ title: 'Playlist · ' + p.selected.length + ' GIFs', sub: p.selected.map(label).join(', '),
                value: 'Make playlist', act: openPicker });
            return rows;
        }
        // The playlist picker: every GIF; pressing one gives it the next number, pressing it again takes it out
        // (the others close up). Confirm plays just those, in that order (Sequential); Cancel keeps the old list.
        let picker = null;
        const PICK_ACTIONS = 3;     // Confirm, Clear all, Cancel: the first rows
        function openPicker() {
            picker = { picks: library.state.playback.selected.filter(id => files().some(f => f.id === id)) };
            row = PICK_ACTIONS;
            dirty = true;
        }
        function closePicker() {
            picker = null;
            row = widgetRows().length - 1;      // back on the Playlist row
            dirty = true;
        }
        function pickerRows() {
            const picks = picker.picks;
            const rows = [
                { title: 'Confirm', sub: picks.length ? picks.length + ' GIFs, in this order (Sequential)' : 'Pick GIFs below first',
                    value: picks.length ? 'Confirm' : '-', picked: picks.length > 0, act: () => {
                        if (!picks.length) return;
                        apply({ type: 'playback', selected: picks.slice(), mode: 'sequential' });
                        closePicker();
                    } },
                { title: 'Clear all', sub: 'Start the order again', value: 'Clear', act: () => { picker.picks = []; } },
                { title: 'Cancel', sub: 'Keep the playlist as it was', value: 'Cancel', act: closePicker },
            ];
            files().forEach(f => {
                const n = picks.indexOf(f.id) + 1;
                rows.push({ title: f.name, value: n ? String(n) : 'Pick', picked: n > 0, act: () => {
                    picker.picks = n ? picks.filter(id => id !== f.id) : picks.concat([f.id]);
                } });
            });
            return rows;
        }
        // The picker's preview: the first picture of the GIF the focus is on (decoded once per GIF)
        let thumb = { id: null, gif: null };
        function thumbFor(id) {
            if (thumb.id !== id) {
                thumb = { id, gif: null };
                try { thumb.gif = decode(gifBytes(id)); } catch (_) { record('Preview could not open GIF: ' + id); }
                if (thumb.gif) { const g = thumb.gif; setImage(THUMB_IMAGE, g.width, g.height, g.frames[0].data); }
            }
            return thumb.gif;
        }
        function animPageRows() {
            return [
                { title: 'Open the animation screen', sub: 'The GIF across the screen at its own speed', value: 'Open', act: () => ui.open('ANIM') },
                { title: 'Next GIF', sub: label(player.id), value: 'Next', act: () => apply({ type: 'next' }) },
                { title: 'GPU renderer (mgu-renderd)', sub: gpuReady() ? 'Smooth, up to one frame per screen refresh' : 'Without it: a few frames a second',
                    value: gpuReady() ? 'Connected' : 'Not running' },
                { title: 'Animation screen', sub: 'GPU renderer (mgu-renderd) or without it', value: optionLabel('renderer'),
                    act: () => cycleSetting('renderer') },
            ];
        }
        const rowsFor = n => (n === PREVIEW ? previewRows() : n === WSET ? (picker ? pickerRows() : widgetRows()) : n === ANIMPAGE ? animPageRows() : []);
        // the widget's shape (384 x 256)
        const WIDGET_BOX = { x: 84, y: 100, w: 600, h: 400 }, ANIM_BOX = { x: 84, y: 104, w: 720, h: 400 };
        let backdropKey = '';
        function drawFrameIn(cv, box, still, shape) {
            if (!player.gif || frame < 0) return false;
            const gif = player.gif, img = gif.frames[still ? 0 : frame];
            const r = rectFor(gif.width, gif.height, box.x, box.y, box.w, box.h, still ? 'cover' : shape || settings.get('fit'));
            const id = still ? BACK_IMAGE : PIXEL_IMAGE, key = player.id + ':' + (still ? 0 : frame);
            if (!still || key !== backdropKey) { setImage(id, gif.width, gif.height, img.data); if (still) backdropKey = key; }
            cv.image(id, r.x, r.y, r.w, r.h);
            return true;
        }
        async function render() {
            update();
            if (phone.link && !upload.active) { clearQr(); phone.detail = 'QR session expired. Rescan to pair again.'; }
            const key = JSON.stringify([panel, row, logOffset, panel === PREVIEW || panel === ANIMPAGE ? frame : 0, player.id,
                library.state.revision, panel === DIAG ? logVersion : 0, panel === PHONE ? [upload.phoneAt, upload.lastError, upload.lastRequest] : null,
                [settings.get('fit'), settings.get('speed'), settings.get('animSpeed'), settings.get('renderer'), gpuReady()], notice, library.error, picker ? picker.picks : null]);
            if (key === screenKey && !dirty) return;
            screenKey = key; dirty = false;
            const cv = ctx.canvas(W, H);
            // the current GIF's first picture, dimmed, behind every page
            backdrop(cv, W, H, (x, y, w, h) => drawFrameIn(cv, { x, y, w, h }, true));
            header(cv, W, panels.slice(0, PAGES), panel < PAGES ? panel : -1, 'v' + ctx.spec.version);
            if (panel === PREVIEW) {
                cv.fillRect(WIDGET_BOX.x, WIDGET_BOX.y, WIDGET_BOX.w, WIDGET_BOX.h, '#080911');
                if (!drawFrameIn(cv, WIDGET_BOX)) cv.text('No GIF', WIDGET_BOX.x + WIDGET_BOX.w / 2, WIDGET_BOX.y + 210, 30, C.dim, { align: 'center' });
                rows(cv, previewRows(), row, { x: 720, y: 96, w: 818 }, 92);
            }
            if (panel === WSET && !picker) rows(cv, widgetRows(), row, {}, 69);
            if (panel === WSET && picker) {
                rows(cv, pickerRows(), row, { x: 78, y: 96, w: 900 }, 69);
                const box = { x: 1010, y: 132, w: 528, h: 270 };
                // the GIF the focus is on; on Confirm / Clear / Cancel the first one picked
                const f = files()[row - PICK_ACTIONS], id = f ? f.id : picker.picks[0];
                cv.text('Make playlist', box.x, 118, 22, C.dim);
                cv.fillRect(box.x, box.y, box.w, box.h, '#000000');
                const g = id && thumbFor(id);
                if (g) { const r = rectFor(g.width, g.height, box.x, box.y, box.w, box.h, 'contain'); cv.image(THUMB_IMAGE, r.x, r.y, r.w, r.h); }
                const order = picker.picks.map((pick, i) => (i + 1) + '. ' + label(pick));
                if (!order.length) cv.text('Press GIFs in the order to play them', box.x, box.y + box.h + 34, 21, C.dim);
                [order.slice(0, 2), order.slice(2, 4)].forEach((part, k) => {
                    if (!part.length) return;
                    const more = k === 1 && order.length > 4 ? '   + ' + (order.length - 4) : '';
                    cv.text(fitText(cv, part.join('   '), 21, box.w - (more ? 70 : 0)) + more, box.x, box.y + box.h + 34 + k * 32, 21, C.sub);
                });
                cv.text('Page: next 6', box.x + box.w, 118, 20, C.faint, { align: 'right' });
            }
            if (panel === ANIMPAGE) {
                cv.fillRect(ANIM_BOX.x, ANIM_BOX.y, ANIM_BOX.w, ANIM_BOX.h, '#000000');
                drawFrameIn(cv, ANIM_BOX, false, 'contain');
                rows(cv, animPageRows(), row, { x: 840, y: 96, w: 698 }, 92);
            }
            if (panel === PHONE) {
                const target = upload.target;
                lines(cv, [
                    ['HTTP server', upload.listening ? 'Running' : (upload.serverError || 'Not listening')],
                    ['Network bridge', phone.bridge || 'Waiting'],
                    ['Selected IP / Port', target ? target.ip + ':' + upload.port + ' (' + target.interface + ')' : 'None'],
                    ['QR session', upload.active ? 'Active' : 'Expired / inactive'],
                    ['Phone connection', upload.active && phone.ready && upload.phoneAt !== null ? 'Connected' : 'Not verified'],
                    ['Last request', upload.lastRequest || 'Phone request not received'],
                    ['Last error', upload.lastError || phone.detail || 'None', C.warn],
                ], { x: 100, y: 136, w: 1000, split: 300, step: 46 });
                const hint = phone.export ? 'Scan to download diagnostic JSON' : phone.link ? 'Scan with iPhone Camera' : phone.detail;
                if (hint) cv.text(hint, 100, 474, 24, C.sub);
                if (phone.qr) { cv.roundRect(1196, 104, 340, 340, 10, '#ffffff'); cv.blit(phone.qr, 1206, 114); }
                else {
                    cv.roundRect(1196, 104, 340, 340, 10, C.button);
                    cv.text('Select: show the QR code', 1366, 280, 22, C.dim, { align: 'center' });
                }
            }
            if (panel === DIAG) {
                cv.text('Diagnostics', 100, 128, 30, C.text);
                const entries = diag.entries().slice().reverse();
                entries.slice(logOffset, logOffset + 7).forEach((entry, i) =>
                    cv.text(String(entry.time.slice(11, 19) + '  ' + entry.message).slice(0, 112), 100, 176 + i * 40, 22, C.sub));
                cv.text(confirmClear ? 'Press Select again to clear the log' :
                    'Next item pages the log. Select clears it. Export is available under Phone.', 100, 480, 22, C.dim);
            }
            if (notice || library.error) cv.text(String(notice || library.error).slice(0, 110), 1530, 506, 18, C.warn, { align: 'right' });
            try { await ui.image('MAIN_GFX', cv); }
            catch (e) { record('Preview frame could not be sent to HMI'); dirty = true; throw e; }
        }
        function setPanel(next) {
            picker = null;
            panel = next; row = 0; logOffset = 0; confirmClear = false; notice = ''; dirty = true;
        }
        function nextRow() {
            if (panel === PHONE) return connect(phone.addresses.length > 1);
            if (panel === DIAG) {
                logOffset = logOffset + 7 >= diag.entries().length ? 0 : logOffset + 7;
                confirmClear = false;
            } else row = (row + 1) % Math.max(1, rowsFor(panel).length);
            dirty = true;
        }
        function select() {
            try {
                if (panel < PHONE) {
                    const entry = rowsFor(panel)[row];
                    if (entry && entry.act) entry.act();
                }
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
        // (in the playlist picker: the list's next 6 rows)
        ui.onClick('BTN_PAGE', () => {
            if (picker) { row = (row + 6) % pickerRows().length; dirty = true; return; }
            setPanel(panel >= PAGES - 1 ? 0 : panel + 1);
            // page 3 is the Animation screen itself (BACK there comes back to this page; Page goes on to 4)
            if (panel === ANIMPAGE) ui.open('ANIM');
        });
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
        let animKey = '', tabsUntil = 0, fullRec = null;
        // Full view (the panel's 전체보기 button): the GIF alone across the screen, no tabs, panel or bar;
        // a tap anywhere (or the controller's press) brings the menus back.
        let fullView = false;
        // kept here, not in app.json (whose text is part of the Store's UI template)
        const FULL_VIEW = getLanguage() === 'ko' ? '전체보기' : 'Full view';
        function enterFull() { fullView = true; tabsUntil = 0; }
        function leaveFull() { if (!fullView) return false; fullView = false; showTabs(false); return true; }
        // The Animation screen: the GIF on the left (a 3:2 GIF fills its 1080 x 720 of the 1920 x 720 screen), on
        // the right its name, Previous / Next and the animation speed as buttons. The tabs and the bottom bar step
        // aside (with the GPU renderer the screen is "chrome": false, as a game's); a tap on the GIF shows them for
        // a while (tap again: hidden), as do the bottom buttons and opening the screen.
        const TABS_SHOWN_MS = 5000;
        const tabsShown = () => !fullView && (Date.now() < tabsUntil || !!(ctx.display && ctx.display.sheet));
        function showTabs(toggle) {
            tabsUntil = toggle && Date.now() < tabsUntil ? 0 : Date.now() + TABS_SHOWN_MS;
        }
        // switching "chrome" is a new placement for the renderer, as when the layout setting changes
        function chrome(show) {
            const d = ctx.display;
            if (!d || !d.screen || d.screen.name !== 'ANIM' || (d.screen.chrome !== false) === show) return;
            if (show) delete d.screen.chrome; else d.screen.chrome = false;
            try { if (d.gpu && d.gpu.ready && typeof d._place === 'function') d._place(); }
            catch (e) { record('Full screen switch failed: ' + e.message); }
        }
        /** The right-hand panel's buttons: Previous / Next, and the Animation screen's own speed. */
        function animButtons() {
            return [
                { key: 'prev', value: 'Previous', arrow: -1, run: () => previousGif() },
                { key: 'next', value: 'Next', arrow: 1, run: () => apply({ type: 'next' }) },
                { key: 'speed', title: 'Animation speed', value: optionLabel('animSpeed'), run: () => cycleSetting('animSpeed') },
                { key: 'full', value: FULL_VIEW, run: enterFull },
            ];
        }
        /** The split screen drawn on r (its own pixels) inside box; returns the buttons' rects, in the same pixels. */
        /** The current GIF, the whole of it, fitted into box (black around it). */
        function drawGif(r, box) {
            r.fillRect(box.x, box.y, box.w, box.h, '#000000');
            if (player.gif && frame >= 0) {
                // the GIF the widget plays, at the Animation screen's own speed, the whole of it in the left part
                const gif = player.gif, clock = player.pauseAt !== null ? player.pauseAt : Date.now();
                const at = frameAt(gif, Math.max(0, clock - player.start) * (SPEEDS[settings.get('animSpeed')] || 1));
                const key = player.id + ':' + at;
                // only a new frame is sent to the renderer again
                if (key !== animKey) { setImage(ANIM_IMAGE, gif.width, gif.height, gif.frames[at].data); animKey = key; }
                const g = rectFor(gif.width, gif.height, box.x, box.y, box.w, box.h, 'contain');
                r.image(ANIM_IMAGE, g.x, g.y, g.w, g.h);
            } else r.text(t('No GIF'), box.x + box.w / 2, box.y + box.h / 2, 34 * box.h / 720, '#ffffff', { align: 'center' });
        }
        function drawSplit(r, box) {
            const u = box.h / 720;
            // the GIF's part is 3:2 (1080 x 720 of the 1920 x 720 screen: a 540 x 360 GIF fits it exactly)
            const gw = Math.min(Math.round(box.w * 0.6), Math.round(box.h * 3 / 2));
            drawGif(r, { x: box.x, y: box.y, w: gw, h: box.h });
            const px = box.x + gw, pw = box.w - gw, m = Math.round(32 * u), x0 = px + m, w0 = pw - 2 * m;
            r.fillRect(px, box.y, pw, box.h, C.bg);
            r.fillRect(px, box.y, Math.max(1, Math.round(2 * u)), box.h, C.rule);
            let y = box.y + Math.round(30 * u);
            r.text(t('Now playing'), x0, y + 24 * u, 24 * u, C.dim);
            r.text(fitText(r, label(player.id), Math.round(36 * u), w0), x0, y + 70 * u, Math.round(36 * u), C.text);
            y += Math.round(120 * u);
            const list = animButtons(), rects = [];
            // Previous / Next: large, side by side
            const bh = Math.round(190 * u), gap = Math.round(20 * u), half = Math.floor((w0 - gap) / 2);
            list.slice(0, 2).forEach((b, i) => {
                const bx = x0 + i * (half + gap);
                button(r, bx, y, half, bh, b.value, false, false, Math.round(40 * u));
                // an arrow beside the label, drawn (the Korean font has no arrow characters)
                const s = Math.round(18 * u), cy = y + bh / 2, ax = b.arrow < 0 ? bx + Math.round(44 * u) : bx + half - Math.round(44 * u);
                r.polyline([[ax - b.arrow * s, cy - s], [ax + b.arrow * s, cy], [ax - b.arrow * s, cy + s]], Math.max(2, Math.round(5 * u)), C.text);
                rects.push({ b, x: bx, y, w: half, h: bh });
            });
            y += bh + Math.round(40 * u);
            // the Animation screen's own speed
            const sp = list[2], rh = Math.round(110 * u), bw = Math.round(w0 * 0.5), bhh = rh - Math.round(20 * u);
            r.text(fitText(r, sp.title, Math.round(30 * u), w0 - bw - 20 * u), x0, y + rh / 2 + 11 * u, Math.round(30 * u), C.text);
            button(r, x0 + w0 - bw, y + Math.round(10 * u), bw, bhh, sp.value, false, false, Math.round(30 * u));
            rects.push({ b: sp, x: x0 + w0 - bw, y: y + Math.round(10 * u), w: bw, h: bhh });
            // Full view: the GIF alone across the screen
            y += rh + Math.round(10 * u);
            const fv = list[3], fh = Math.round(96 * u);
            button(r, x0, y, w0, fh, fv.value, false, false, Math.round(32 * u));
            rects.push({ b: fv, x: x0, y, w: w0, h: fh });
            // which GIFs, in what order: Widget settings (in orange)
            r.text(fitText(r, 'The animation order follows Widget settings', Math.round(24 * u), w0), x0, box.y + box.h - Math.round(34 * u), Math.round(24 * u), C.warn);
            return rects;
        }
        async function renderAnim() {
            update();
            const shown = tabsShown();
            chrome(shown);
            const cv = ctx.canvas(W, H).clear('#000000');
            const pl = cv.place, gpuFull = !!(pl && pl.full);
            let rects, toPage = q => q;
            if (fullView) {
                // only the GIF: across the whole screen with the GPU renderer, else the whole page image
                if (gpuFull) {
                    if (!fullRec || fullRec.w !== pl.w || fullRec.h !== pl.h) fullRec = new Recorder(pl.w, pl.h);
                    fullRec.reset();
                    drawGif(fullRec, { x: 0, y: 0, w: pl.w, h: pl.h });
                    cv.xf(1, 0, 0).append(fullRec).xf();
                } else drawGif(cv, { x: 0, y: 0, w: W, h: H });
                // the whole screen is one target: a tap or the controller's press brings the menus back
                cv.targets = [{ key: 'anim-menu', x: 0, y: 0, w: W, h: H, run: leaveFull }];
                await ui.image('ANIM_GFX', cv);
                return;
            }
            if (gpuFull && !shown) {
                // the whole screen is ours: drawn in screen pixels (a game's way), the buttons' rects back in page px
                if (!fullRec || fullRec.w !== pl.w || fullRec.h !== pl.h) fullRec = new Recorder(pl.w, pl.h);
                fullRec.reset();
                rects = drawSplit(fullRec, { x: 0, y: 0, w: pl.w, h: pl.h });
                cv.xf(1, 0, 0).append(fullRec).xf();
                toPage = q => ({ x: (q.x - pl.ox) / pl.scale, y: (q.y - pl.oy) / pl.scale, w: q.w / pl.scale, h: q.h / pl.scale });
            } else {
                // between the kit's header and bar (GPU, tabs shown), or the HMI's own image (below the tabs drawn here)
                const box = gpuFull ? animArea(pl, W, H) : shown ? animArea(null, W, H) : { x: 0, y: 0, w: W, h: H };
                rects = drawSplit(cv, box);
            }
            // taps on the buttons, and the iDrive controller's knob through them (where the kit runs the screen)
            cv.targets = rects.map(q => Object.assign({ key: 'anim-' + q.b.key, run: () => {
                try { q.b.run(); } catch (e) { record('Animation button failed: ' + e.message); }
            } }, toPage(q)));
            // the page tabs on top, Animation selected: in the kit's header with the GPU renderer (a tab tapped there
            // goes to that page, ctx.onTab), drawn here as on the other pages without it
            if (shown) {
                const tabs = panels.slice(0, PAGES), badge = 'v' + ctx.spec.version;
                if (cv.chrome) G.frame(cv, ctx.theme(), tabs, ANIMPAGE, [{ text: badge }]);
                else if (!gpuFull) header(cv, W, tabs, ANIMPAGE, badge);
            }
            await ui.image('ANIM_GFX', cv);
        }
        ctx.loop('ANIM', 4, renderAnim);
        // a tap on the animation (where the kit runs the screen) shows or hides the tabs; opening it shows them a moment
        if (ctx.onTap) ctx.onTap(() => { if (ui.isVisible('ANIM') && !leaveFull()) showTabs(true); });
        // opened again: the split screen with its menus
        ui.onVisible((name, visible) => { if (name === 'ANIM' && visible) { fullView = false; showTabs(false); } });
        if (ctx.onTab) ctx.onTab(i => { if (i !== ANIMPAGE && i < PAGES) { ui.open('MAIN'); setPanel(i); } });
        const animSettings = playbackSettings({
            state: () => library.state, apply: action => { try { apply(action); } catch (e) { record('Animation setting failed: ' + e.message); } },
            files, modes: MODES, modeNames: MODE_NAMES, settings, spec: ctx.spec,
        });
        // (each bottom button also brings the tabs back a moment: without the GPU renderer there is no tap)
        ui.onClick('BTN_PREVGIF', () => { if (leaveFull()) return; showTabs(false); try { previousGif(); } catch (e) { record('Previous failed: ' + e.message); } });
        ui.onClick('BTN_NEXTGIF', () => { if (leaveFull()) return; showTabs(false); try { apply({ type: 'next' }); } catch (e) { record('Next failed: ' + e.message); } });
        ui.onClick('BTN_ANIM_SETTINGS', () => {
            if (leaveFull()) return;
            showTabs(false);
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
