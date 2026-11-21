'use strict';
// Runs the real packaged canvas controller with the shared recording engine.
const assert = require('assert');
const path = require('path');
const EventEmitter = require('events');
const net = require('net');
const js = path.resolve(process.argv[2], 'source/javascript');
const record = require(path.join(js, 'kit/record'));
const themes = require(path.join(js, 'kit/themes'));
const { start } = require(path.join(js, 'screen'));
const handlers = {}, frames = [], hidden = [];
let tab, focus = true, focused, touch;
const originalConnection = net.createConnection;
let connections = 0;
net.createConnection = () => { connections++; throw new Error('Preview must never open a vehicle socket'); };
(async () => {
    const values = {};
    const ctx = {
        settings: { get(k) { return values[k]; }, set(k, v) { values[k] = v; } },
        app: new EventEmitter(), theme: () => themes.theme('dark'), log: { error(e) { throw e; } },
        display: { own: () => true, focusKey: 'tgt:SLV_PLUS', ccuLast: { k: 0, pb: 0, df: 0 },
            _ccu(v) { this.ccuLast = { k: v.frontRotaryEncoderOperation, pb: v.frontRotaryEncoderPushButton,
                df: v.frontRotaryEncoderDeflection }; } },
        canvas: (w, h) => {
            const cv = new record.Recorder(w, h), text = cv.text;
            cv.capturedText = [];
            cv.text = function (value) { this.capturedText.push(String(value)); return text.apply(this, arguments); };
            return cv;
        }, hideButton(id) { hidden.push(id); }, onLayout() {},
        onTouch(fn) { touch = fn; },
        onTab(fn) { tab = fn; }, loop() { return { stop() {} }; },
        ui: { onClick(name, fn) { handlers[name] = fn; }, isVisible: () => true, hasFocus: () => focus,
            onVisible() {}, onFocus(fn) { focused = fn; }, async image(name, cv) {
                assert.equal(name, 'MAIN_GFX'); frames.push(cv);
            } },
    };
    const screen = await start(ctx, { demo: true });
    assert.equal(connections, 0);
    try {
        assert.ok(frames.length > 0, 'must draw without a Comfort service');
        assert.ok(frames[0].words().length > 100, 'frame must contain real graphics');
        assert.ok(record.layerById.size >= 2, 'seat and backdrop layers must be present');
        for (const layer of record.layerById.values()) {
            const words = layer.words;
            for (let i = 0; i < words.length;) {
                assert.equal(words[i++], record.OP.GRAD);
                const stops = words[i + 4];
                assert.ok(stops > 0 && stops <= 64, 'native renderer gradient-stop limit');
                i += 5 + stops * 2;
            }
        }
        assert.ok(!frames[frames.length - 1].targets.some((t) => t.key === 'BTN_ROOM'));
        await tab(1);
        assert.equal(screen.easy.selectedSeat, 'passenger');
        assert.ok(frames[frames.length - 1].targets.some((t) => t.key === 'BTN_ROOM'));
        await handlers.BTN_ROOM(); assert.equal(screen.client.state.seats.roomOut, true);
        await handlers.BTN_ROOM(); assert.equal(screen.client.state.seats.roomOut, false);
        await handlers.BTN_AUTO(); assert.equal(screen.client.state.settings.easyExit, true);
        await tab(0);
        await handlers.BTN_IGNITION_M1(); assert.equal(screen.auto.enabled(), true);
        assert.equal(screen.client.state.settings.easyExit, false, 'M1 turns off automatic Easy Access for both seats');
        assert.equal(screen.auto.pending, null, 'enabling does not move a seat');
        await handlers.BTN_AUTO();
        assert.equal(screen.client.state.settings.easyExit, false, 'automatic Easy Access cannot be re-enabled while M1 is on');
        await handlers.BTN_IGNITION_M1(); assert.equal(screen.auto.enabled(), false);
        assert.equal(screen.client.state.settings.easyExit, false, 'turning M1 off does not turn on automatic Easy Access');
        await handlers.BTN_AUTO();
        assert.equal(screen.client.state.settings.easyExit, true, 'automatic Easy Access can be enabled explicitly afterward');
        await tab(1);
        await handlers.BTN_MINUS(); assert.equal(screen.client.state.seats.pos.passenger.SLV, 99);
        await handlers.BTN_SAVE(); assert.equal(screen.easy.saveMemory, true);
        await handlers.BTN_M1(); assert.equal(screen.easy.saveMemory, false);
        await handlers.BTN_STOP();
        // 0.6.11: two tabs only, no Logs page, and the retired log buttons stay hidden
        assert.ok(!frames[frames.length - 1].targets.some((t) => /^BTN_LOG/.test(t.key)));
        assert.ok(hidden.includes('BTN_LOGS') && hidden.includes('BTN_LOG_SOURCE'));
        assert.equal(screen.comfortLog, undefined);
        await tab(0);
        assert.equal(screen.easy.selectedSeat, 'driver');
        assert.ok(frames.length > 5);
        assert.equal(connections, 0);
    } finally { await screen.close(); }
    // Comfort's own way back after easy exit (job 'back') must survive the app leaving the screen and shutting down;
    // a move the app asked for is still stopped then.
    const { DemoClient } = require(path.join(js, 'demo'));
    class Recording extends DemoClient {
        constructor() { super(); this.sent = []; }
        async send(command) { this.sent.push(command); return super.send(command); }
    }
    const car = new Recording(), stops = () => car.sent.filter((q) => q.op === 'stop').length;
    car.state.seats.memories.driver[0] = null;
    ctx.signals = { async proxy(iface) {
        return { async getValue() { return iface.endsWith('SessionManager') ? 'screen-fixture' : 'MIN'; }, shutdown() {} };
    } };
    focus = true;
    const real = await start(ctx, { demo: false, client: car });
    await new Promise((resolve) => setImmediate(resolve));
    await real.render(true);
    assert.ok(frames[frames.length - 1].capturedText.includes('MIN'), 'the recognized driver’s name is drawn');
    await handlers.BTN_SAVE();
    await handlers.BTN_M1();
    car.state.seats.pos.driver.SLV = 150;
    await handlers.BTN_EXIT_SAVE();
    assert.deepStrictEqual(car.sent[car.sent.length - 1], { op: 'memory', seat: 'driver', slot: 1, save: true });
    await handlers.BTN_EXIT();
    assert.deepStrictEqual(car.sent[car.sent.length - 1], { op: 'memory', seat: 'driver', slot: 1, save: false });
    await handlers.BTN_IGNITION_M1();
    assert.equal(real.auto.enabled(), true);
    assert.equal(real.auto.pending, null, 'enabling for the recognized profile is not a recall');
    car.state.seats.job = 'back'; car.emit('state', car.state);
    focus = false; focused('MAIN');
    assert.equal(stops(), 0, 'leaving the screen must not stop Comfort\'s way back');
    focus = true; focused('MAIN');
    car.state.seats.job = null; car.emit('state', car.state);
    car.state.seats.pos.driver = {};
    await real.render(true);
    assert.equal(touch(1, 1015, 330), true, 'a motor-only seat still supports held adjustment');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(car.sent.filter((q) => q.op === 'jog').length >= 2, 'the hold refreshes its Comfort command');
    touch(3, 1015, 330);
    assert.equal(stops(), 1, 'releasing sends stop');
    await new Promise((resolve) => setImmediate(resolve));
    await real.render(true);
    const controller = (press) => ctx.display._ccu({ frontRotaryEncoderOperation: 0,
        frontRotaryEncoderPushButton: press, frontRotaryEncoderDeflection: 0 });
    const before = car.sent.filter((q) => q.op === 'jog').length;
    controller(1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(car.sent.filter((q) => q.op === 'jog').length >= before + 2, 'holding the controller keeps adjusting');
    controller(0);
    assert.equal(stops(), 2, 'releasing the controller sends stop');
    await new Promise((resolve) => setImmediate(resolve));
    car.state.seats.pos.driver = { SLV: 100 };
    await handlers.BTN_M3();
    car.state.seats.job = 'memory'; car.emit('state', car.state);
    focus = false; focused('MAIN');
    assert.equal(stops(), 3, 'leaving the screen stops a move the app asked for');
    car.state.seats.job = 'back'; car.emit('state', car.state);
    await real.close();
    assert.equal(stops(), 3, 'shutting down must not stop Comfort\'s way back');
    assert.equal(connections, 0);
    console.log('PASS packaged canvas, compatible seat graphics, tabs, Make room, memory, stop, socket-free preview and door moves left to Comfort');
})().catch((e) => { console.error(e); process.exitCode = 1; }).then(() => { net.createConnection = originalConnection; });
