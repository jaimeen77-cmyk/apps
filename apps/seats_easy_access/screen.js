'use strict';
const { EasyAccess, ownMoves } = require('./core');
const { translator, korean } = require('./i18n');
const { t } = require('./kit/i18n');
const { makeLayer } = require('./kit/record');
const G = require('./kit/gauges');
const BG = require('./bg');
const seat = require('./seat-image');
const Runtime = require('./runtime');
// the HMI's back arrow column (x 0..84 of the 1920 px screen): the photo starts right of it, where the menu does
const HMI_LEFT = 84, TAB_BAR = 38;

async function start(ctx, options) {
    const opts = options || {}, translate = translator(opts.language), pre = korean(opts.language), tr = (value) => translate(t(pre(value)));
    const runtime = ctx.background || Runtime.start(ctx, opts);
    const { client, auto, driver, demo } = runtime;
    const moves = ownMoves(client);
    const easy = new EasyAccess(client, driver);
    // Native/Iterio renderers do not accept the upstream OP_IMAGE upload.
    // Cache the photo as gradient columns, as Storage does for its background.
    const pixels = seat.pixels();
    const seatWidth = 220, seatHeight = 330;
    const seatLayer = makeLayer(seatWidth, seatHeight, (r) => {
        for (let x = 0; x < seatWidth; x += 1) {
            for (let top = 0; top < seatHeight; top += 60) {
                const height = Math.min(60, seatHeight - top), stops = [];
                // Pixel-resolution bands, each within the GPU's 64-stop limit.
                for (let k = 0; k <= height; k++) {
                    const y = k;
                    const sx = Math.min(seat.w - 1, Math.floor(x * seat.w / seatWidth));
                    const sy = Math.min(seat.h - 1, Math.floor((top + y) * seat.h / seatHeight));
                    const offset = (sy * seat.w + sx) * 4;
                    stops.push([y / height, [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]]]);
                }
                if (stops.some((stop) => stop[1][3] > 0)) r.gradientRect(x, top, 1, height, stops);
            }
        }
    });
    let axis = 'SLV', last = '', rendering = null, closed = false, page = 0;
    let jogTargets = [], touchJog = null, controllerJog = null;
    // the HMI bar buttons of the Logs tab (removed in 0.6.11) are still declared in app.json: kept hidden
    const RETIRED = ['BTN_LOGS', 'BTN_LOG_SOURCE', 'BTN_LOG_HOLD', 'BTN_LOG_OLDER', 'BTN_LOG_NEWER', 'BTN_LOG_REFRESH'];
    const axes = ['SLV', 'SHV', 'LNV', 'SNV', 'KHV'];
    const labels = { SLV: ['◀', '▶', 'Fore / aft'], SHV: ['▼', '▲', 'Height'],
        LNV: ['◀', '▶', 'Backrest'], SNV: ['▼', '▲', 'Cushion'], KHV: ['▼', '▲', 'Headrest'] };
    function foreground() {
        const on = demo || (!!ctx.ui.isVisible('MAIN') && (!ctx.ui.hasFocus || ctx.ui.hasFocus('MAIN')));
        if (easy.foreground !== on) {
            easy.setForeground(on);
            if (!on) (endJog() || moves.stop()).catch(() => {});   // never Comfort's own door moves
        }
    }
    async function act(fn) {
        foreground();
        try { await fn(); } catch (e) { easy.message = e.message; }
        last = ''; await render();
    }
    function cycleAxis() {
        const supported = client.state ? client.state.seats.axes[easy.selectedSeat] : [];
        const list = axes.filter((a) => supported.indexOf(a) >= 0);
        axis = list[(list.indexOf(axis) + 1) % list.length] || 'SLV';
    }
    function startJog(target) {
        try {
            auto.cancel('M1 cancelled: manual control');
            easy.beginJog(target.axis, target.dir, true);
            return true;
        } catch (_) { return false; }
    }
    function endJog() {
        touchJog = null;
        controllerJog = null;
        return easy.endJog();
    }
    const actions = {
        BTN_IGNITION_M1: async () => {
            if (!easy.foreground || easy.pending || easy.selectedSeat !== 'driver') return;
            if (driver) {
                const shown = driver.id;
                await driver.refresh(true);
                if (shown !== driver.id) return;
            }
            if (easy.foreground && !easy.pending && easy.selectedSeat === 'driver' && auto.toggle(client.state)) await runtime.poll();
        },
        BTN_DRIVER: () => { easy.selectSeat('driver'); page = 0; },
        BTN_PASSENGER: () => { easy.selectSeat('passenger'); page = 1; },
        BTN_REFRESH: () => easy.refresh(),
        BTN_AUTO: () => {
            if (auto.armed() && client.state && !client.state.settings.easyExit) {
                throw new Error('자동 Easy Access를 켜려면 시동 시 M1 복귀를 끄세요.');
            }
            return easy.toggle();
        },
        BTN_AXIS: cycleAxis,
        BTN_MINUS: () => easy.jog(axis, -1), BTN_PLUS: () => easy.jog(axis, 1),
        BTN_SAVE: () => easy.armMemorySave(), BTN_M1: () => easy.memory(0),
        BTN_M2: () => easy.memory(1), BTN_M3: () => easy.memory(2),
        BTN_EXIT_SAVE: () => easy.save(easy.selectedSeat), BTN_EXIT: () => easy.move(easy.selectedSeat),
        BTN_ROOM: () => easy.makeRoom(), BTN_STOP: () => easy.stop(),
    };
    Object.keys(actions).forEach((id) => {
        const fn = actions[id];
        if (/^BTN_(MINUS|PLUS|SAVE|M[123]|EXIT|EXIT_SAVE|ROOM|STOP)$/.test(id)) actions[id] = () => {
            auto.cancel('M1 cancelled: manual control'); return fn();
        };
        ctx.ui.onClick(id, () => act(actions[id]));
        if (ctx.hideButton) ctx.hideButton(id);
    });
    if (ctx.hideButton) RETIRED.forEach((id) => ctx.hideButton(id));
    function render(force) {
        if (closed) return Promise.resolve();
        if (rendering) return force ? rendering.then(() => render(true)) : rendering;
        const state = client.state, who = easy.selectedSeat;
        const m1On = auto.enabled(state), m1Toggle = auto.canToggle(state), m1Armed = auto.armed();
        const driverText = driver && (driver.known() ? driver.name || tr('BMW 운전자 인식됨') : tr('BMW 운전자 미인식'));
        const personalM1 = driver && !!driver.personalM1(state);
        const exitSaved = driver && !!driver.powerOffExit(state);
        const commonExit = who === 'passenger' || !driver || (!driver.exit && !m1Armed);
        const reserved = driver ? [driver.reserved(1), driver.reserved(2)] : [false, false];
        const signature = JSON.stringify([state, client.at, who, easy.message, easy.pending, easy.foreground,
            easy.saveMemory, axis, page, m1On, m1Toggle, m1Armed, driverText, personalM1, exitSaved, commonExit, reserved]);
        if (!force && signature === last) return Promise.resolve();
        last = signature;
        const cv = ctx.canvas(1600, 520).clear('#11161c');
        const theme = Object.assign({}, ctx.theme(), { sel: '#e6404a' });
        const frame = () => G.frame(cv, theme, [tr('운전석'), tr('조수석')], page,
            demo ? [{ text: tr('PREVIEW'), color: '#f3bc56' }] : []);
        // full-screen placement: the page's left edge lies under the HMI's back arrow column, so the photo
        // starts where the menu does (the column's edge) and under the tab bar, not cut by the column
        const place = cv.place, left = place && place.full ? Math.max(0, Math.ceil((HMI_LEFT - place.ox) / place.scale)) : 0;
        BG.paint(cv, 1600, 520, left, TAB_BAR);
        // Lighter veil than before so the BMW Coding photo shows, as on Cluster Redline's settings screen.
        cv.fillRect(left, TAB_BAR, 1600 - left, 520 - TAB_BAR, [7, 11, 17, 105]);
        // profile mark (Korean edition) in the free space between the seat and the automatic Easy Access switch.
        const autoLabel = tr('자동 Easy Access') + (m1Armed ? ' · ' + tr('M1 우선') : '');
        const autoWidth = cv.textWidth ? cv.textWidth(autoLabel, 23, { literal: true }) : 230;
        BG.mark(cv, Math.min(1238, 1440 - autoWidth - 28), 100);
        cv.blit(seatLayer, 650, 48);
        const stationary = state ? (state.parked ? tr('정차') : tr('주행 중')) : tr('상태 없음');
        cv.fillRect(38, 62, 4, 25, '#e6404a');
        cv.text(tr(who === 'driver' ? '운전석' : '조수석') + ' · ' + stationary, 58, 83, 23, '#dbe2e9', { literal: true });
        const ready = easy.foreground && !!state && !easy.pending;
        function button(id, label, x, y, w, h, enabled, selected, fn) {
            const color = id === 'BTN_STOP' ? '#b51d2c' : selected ? '#5e3039' : '#20262c';
            const circle = w === h, radius = circle ? h / 2 : 14;
            const featured = id === 'BTN_EXIT_SAVE' || id === 'BTN_ROOM';
            cv.card(x, y, w, h, radius, [[0, enabled ? (featured ? '#44383f' : '#3d4146') : '#22262b'], [0.5, enabled ? color : '#1a1f26'], [1, enabled ? '#10151a' : '#181d23']]);
            cv.strokeRoundRect(x, y, w, h, radius, 1, id === 'BTN_STOP' || featured ? '#cf4c57' : enabled ? '#8a8d91' : '#39434f');
            const ink = enabled ? '#ffffff' : '#7a8592';
            if (/^[◀▶▲▼]$/.test(label)) {
                const cx = x + w / 2, cy = y + h / 2;
                const points = label === '◀' ? [[6, -10], [-6, 0], [6, 10]] : label === '▶' ? [[-6, -10], [6, 0], [-6, 10]] :
                    label === '▲' ? [[-10, 6], [0, -6], [10, 6]] : [[-10, -6], [0, 6], [10, -6]];
                cv.line(cx + points[0][0], cy + points[0][1], cx + points[1][0], cy + points[1][1], 3, ink);
                cv.line(cx + points[1][0], cy + points[1][1], cx + points[2][0], cy + points[2][1], 3, ink);
            } else cv.text(tr(label), x + w / 2, y + h / 2 + 8, featured ? 24 : 21, ink, { align: 'center', literal: true });
            if (enabled) cv.target(x, y, w, h, () => act(fn || actions[id]), id, radius);
        }
        cv.text(autoLabel, 1440, 76, 23, '#dbe2e9', { align: 'right', literal: true });
        const automatic = state && state.settings.easyExit;
        cv.card(1460, 49, 91, 40, 20, [[0, automatic ? '#f24954' : '#676b70'], [1, automatic ? '#920f20' : '#25292f']]);
        cv.roundRect(automatic ? 1516 : 1466, 53, 32, 32, 16, '#f7f7f7');
        if (ready) cv.target(1160, 45, 400, 48, () => act(actions.BTN_AUTO), 'BTN_AUTO', 20);
        if (who === 'driver') {
            button('BTN_IGNITION_M1', tr('Ignition M1') + ': ' + tr(m1On ? 'On' : 'Off'), 1200, 115, 350, 46,
                ready && m1Toggle, m1On);
            if (driverText) cv.text(driverText, 1540, 188, 20, '#c2ccd7', { align: 'right', literal: true });
            if (driver && driver.known()) {
                cv.text(tr(personalM1 ? '개인 M1 저장됨' : '개인 M1을 저장하세요'), 1540, 218, 20, '#c2ccd7', { align: 'right', literal: true });
                cv.text(tr(exitSaved ? '시동 종료 하차 위치 저장됨' : '시동 종료 하차 위치를 저장하세요'), 1540, 247, 20,
                    '#c2ccd7', { align: 'right', literal: true });
            }
        }
        const controls = [ ['KHV', 470, 135], ['LNV', 994, 160], ['SNV', 255, 300], ['SHV', 440, 285], ['SLV', 995, 310] ];
        jogTargets = [];
        controls.forEach((row) => {
            const a = row[0], x = row[1], y = row[2];
            const supported = state && state.seats.axes[who].indexOf(a) >= 0;
            const enabled = ready && supported && !easy.actionReady(who, false, false);
            cv.text(tr(labels[a][2]), x + 61, y - 13, 21, '#d4dce5', { align: 'center', literal: true });
            // the photo faces left, so ◀ is forward. Comfort's +1 is forward (car: fore/aft -1 went back) and up,
            // so on the two ◀ ▶ axes (fore/aft, backrest) the left arrow sends +1; ▼ ▲ keep -1 / +1.
            (a === 'SLV' || a === 'LNV' ? [1, -1] : [-1, 1]).forEach((dir, i) => {
                const bx = x + 68 * i;
                const id = a + (i ? '_PLUS' : '_MINUS');
                if (enabled) jogTargets.push({ id, axis: a, dir, x: bx, y, size: 54 });
                button(id, labels[a][i], bx, y, 54, 54, enabled, false, () => {
                    auto.cancel('M1 cancelled: manual control');
                    return easy.jog(a, dir);
                });
            });
        });
        const memory = ready && !easy.actionReady(who, true);
        cv.fillRect(28, 445, 1544, 1, [230, 235, 242, 65]);
        ['M1', 'M2', 'M3'].forEach((label, i) => button('BTN_' + label, label, 55 + i * 155, 462, 140, 46,
            memory && (i === 0 || who === 'passenger' || !reserved[i - 1]), false));
        button('BTN_SAVE', 'Save memory', 540, 462, 200, 46, memory, easy.saveMemory);
        button('BTN_EXIT_SAVE', 'Save exit', 200, 387, 555, 50, memory, false);
        button('BTN_EXIT', 'Easy Access', 765, 462, 270, 46,
            memory && (commonExit ? state.seats.exit[who] : exitSaved), false);
        button('BTN_ROOM', state && state.seats.roomOut ? 'Return passenger' : 'Make room', 785, 387, 555, 50,
            memory && who === 'passenger', false);
        button('BTN_REFRESH', 'Refresh', 1060, 462, 210, 46, !easy.pending, false);
        button('BTN_STOP', 'STOP', 1295, 462, 240, 46, easy.foreground, false);
        const message = tr(easy.message);
        const clipped = message.length > 58 ? message.slice(0, 55) + '…' : message;
        cv.text(clipped, 58, 112, 17, '#c2ccd7', { literal: true });
        frame();
        rendering = Promise.resolve(ctx.ui.image('MAIN_GFX', cv)).then(() => { rendering = null; }, (e) => { rendering = null; throw e; });
        return rendering;
    }
    easy.on('change', () => { render().catch((e) => ctx.log.error(e)); });
    ctx.onTab(async (index) => {
        await endJog();
        await act(actions[index === 1 ? 'BTN_PASSENGER' : 'BTN_DRIVER']);
    });
    ctx.onLayout(() => { endJog(); return render(true); });
    if (ctx.onTouch) ctx.onTouch((phase, x, y) => {
        const hit = (r) => x >= r.x && x < r.x + r.size && y >= r.y && y < r.y + r.size;
        if (phase !== 1) {
            if (touchJog && (phase === 3 || !hit(touchJog))) endJog();
            return false;
        }
        if (closed) return false;
        foreground();
        const target = jogTargets.find(hit);
        if (!target || !startJog(target)) return false;
        touchJog = target;
        return true;
    });
    const display = ctx.display;
    const handleController = display && display._ccu;
    if (typeof handleController === 'function' && typeof display.own === 'function') {
        // This kit sends raw press/release to Display. Keep its focus and navigation,
        // and handle only presses on a focused jog button ourselves.
        display._ccu = function (event) {
            const previous = this.ccuLast;
            const current = { k: Number(event.frontRotaryEncoderOperation),
                pb: Number(event.frontRotaryEncoderPushButton), df: Number(event.frontRotaryEncoderDeflection) };
            const down = (button) => button === 1 || button === 2;
            const steady = previous && previous.k === current.k && previous.df === current.df;
            const own = this.own() && !this.sheet;
            if (controllerJog && (!down(current.pb) || !steady || !own || this.focusKey !== controllerJog)) endJog();
            if (own && steady && down(current.pb) && !down(previous.pb) && !closed) {
                foreground();
                const target = jogTargets.find((item) => this.focusKey === 'tgt:' + item.id);
                if (target && startJog(target)) {
                    controllerJog = this.focusKey;
                    this.ccuLast = current;
                    return;
                }
            }
            return handleController.call(this, event);
        };
    }
    if (ctx.ui.onVisible) ctx.ui.onVisible((name) => {
        if (name === 'MAIN') { foreground(); last = ''; render(); }
    });
    if (ctx.ui.onFocus) ctx.ui.onFocus((name) => { if (name === 'MAIN') foreground(); });
    const loop = ctx.loop('MAIN', 4, () => {
        foreground();
        return render();
    });
    runtime.beforeClose(async () => {
        closed = true; if (loop && loop.stop) loop.stop();
        if (handleController) display._ccu = handleController;
        await (endJog() || moves.stop()).catch(() => {});
    });
    foreground();
    await render(true);
    await easy.refresh().catch(() => {});
    return { easy, client, render, close: runtime.close, demo, auto };
}
module.exports = { start };
