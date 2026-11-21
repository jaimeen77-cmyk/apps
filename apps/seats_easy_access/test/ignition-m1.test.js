'use strict';
const assert = require('assert');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Driver } = require('../driver');
const { IgnitionM1 } = require('../ignition-m1');
const { EasyAccess, ownMoves, stateOf } = require('../core');
function fixture(values, makeDriver) {
    let now = 10000;
    const listeners = [], data = Object.assign({ ignitionM1: true, m1OffSeen: false }, values);
    const settings = { get: (k) => data[k], set(k, v) { data[k] = v; listeners.forEach((fn) => fn(k, v)); },
        onChange(fn) { listeners.push(fn); } };
    const client = new EventEmitter(); client.sent = []; client.close = () => {};
    client.state = stateOf({ state: { carOn: true, parked: true, seats: {
        axes: { driver: ['SLV'], passenger: [] }, pos: { driver: { SLV: 123 }, passenger: {} },
        memories: { driver: [{ SLV: 456 }] }, job: null, moving: null,
    } } });
    client.send = async (m) => {
        client.sent.push(m);
        if (m.op === 'memory' && m.save) client.state.seats.memories[m.seat][m.slot] = Object.assign({}, client.state.seats.pos[m.seat]);
    };
    client.refresh = async () => { client.emit('state', client.state); return client.state; };
    const logs = [];
    const driver = makeDriver && makeDriver(() => now);
    const auto = new IgnitionM1(client, settings, { add: (p) => logs.push(p.join(' ')) }, { now: () => now, driver });
    const emit = (changes) => { Object.assign(client.state, changes); client.emit('state', client.state); };
    const advance = async (ms) => { now += ms; await auto.tick(); };
    const cycle = () => { emit({ carOn: false }); emit({ carOn: true }); };
    return { client, settings, auto, driver, emit, advance, cycle, logs };
}
(async () => {
    let f = fixture();
    f.emit({}); await f.advance(6000);
    assert.equal(f.client.sent.length, 0, 'starting an already-on car is not a trigger');
    f.cycle(); await f.advance(2999); assert.equal(f.client.sent.length, 0, 'waits three seconds after power-on');
    assert.ok(f.logs.some((s) => s.includes('waiting 3 seconds')));
    await f.advance(1);
    assert.deepStrictEqual(f.client.sent, [{ op: 'memory', seat: 'driver', slot: 0, save: false }]);
    for (let attempt = 2; attempt <= 5; attempt++) {
        await f.advance(1999); f.emit({}); assert.equal(f.client.sent.length, attempt - 1);
        await f.advance(1); f.emit({}); await f.advance(0);
        assert.equal(f.client.sent.length, attempt, 'ignored recall retries every two idle seconds');
    }
    await f.advance(2000); f.emit({}); await f.advance(0);
    assert.equal(f.client.sent.length, 5, 'bounded even if no job ever appears');
    assert.ok(f.logs.some((s) => s.includes('checking arrival')));

    f = fixture({ ignitionM1: false }); f.cycle(); await f.advance(6000);
    f.settings.set('ignitionM1', true); await f.advance(6000);
    assert.equal(f.client.sent.length, 0, 'enabling the option while on does not recall');
    f.cycle(); f.settings.set('ignitionM1', false); await f.advance(6000);
    assert.equal(f.client.sent.length, 0, 'turning the option off cancels waiting');

    f = fixture(); f.cycle(); f.client.state.seats.job = 'back';
    await f.advance(16000); assert.equal(f.client.sent.length, 0, 'never interrupt Comfort');
    f.client.state.seats.job = null; f.emit({});
    await f.advance(2999); assert.equal(f.client.sent.length, 0);
    await f.advance(1); assert.equal(f.client.sent.length, 1, 'wait for stable idle after Comfort finishes');

    f = fixture(); f.cycle();
    f.client.state.settings.easyExit = true;
    await f.advance(8000);
    assert.equal(f.client.sent.length, 0, 'wait for Comfort to report automatic Easy Access off');
    f.client.state.settings.easyExit = false;
    await f.advance(1000);
    assert.equal(f.client.sent.length, 1);

    for (const reason of ['driving', 'off', 'lost', 'manual', 'no memory', 'no position', 'timeout']) {
        f = fixture(); f.cycle();
        if (reason === 'driving') f.emit({ parked: false });
        if (reason === 'off') f.emit({ carOn: false });
        if (reason === 'lost') f.client.emit('lost');
        if (reason === 'manual') f.auto.cancel('manual');
        if (reason === 'no memory') f.client.state.seats.memories.driver[0] = null;
        if (reason === 'no position') f.client.state.seats.pos.driver = {};
        await f.advance(reason === 'timeout' ? 45001 : 16000);
        assert.equal(f.client.sent.length, 0, reason + ' must prevent recall');
    }
    f = fixture({ m1OffSeen: true }); f.emit({}); await f.advance(15000);
    assert.equal(f.client.sent.length, 1, 'an observed off state survives a process restart');
    assert.equal(f.settings.get('m1OffSeen'), false);

    f = fixture(); const moves = ownMoves(f.client); f.cycle(); await f.advance(15000);
    f.client.state.seats.job = 'memory'; f.client.emit('state', f.client.state);
    await moves.stop();
    assert.equal(f.client.sent.length, 1, 'screen-hide tracking does not stop automatic M1');

    f = fixture(); f.client.refresh = async () => { throw new Error('offline'); };
    f.cycle(); await f.advance(15000); await f.advance(1000);
    assert.equal(f.client.sent.length, 0); assert.equal(f.auto.pending, null);

    f = fixture(); f.cycle();
    let release;
    f.client.refresh = () => new Promise((resolve) => { release = resolve; });
    const checking = f.advance(15000);
    f.auto.cancel('manual'); release(f.client.state); await checking;
    assert.equal(f.client.sent.length, 0, 'manual cancellation wins during status read');

    f = fixture();
    f.client.send = async () => { throw new Error('send failure'); };
    // The sender is intentionally captured on construction, so construct against the failing sender.
    f.client.removeAllListeners();
    const failing = new IgnitionM1(f.client, f.settings, { add() {} }, { now: () => 20000 });
    f.emit({ carOn: false }); f.emit({ carOn: true });
    failing.pending.due = 0; failing.pending.idleAt = 0;
    await failing.tick(); assert.equal(failing.pending, null);
    await failing.tick(); assert.equal(failing.pending, null, 'failed send is consumed');

    // A background runtime has no ui/visible-page loop, yet can recall after the next power cycle.
    f = fixture();
    f.client.removeAllListeners();
    f.client.state.settings.easyExit = true;
    const send = f.client.send;
    f.client.send = async (command) => {
        if (command.op === 'set') f.client.state.settings.easyExit = command.settings.easyExit;
        return send(command);
    };
    let clock = 10000;
    const runtime = require('../runtime').start({ settings: f.settings }, { demo: true, client: f.client, now: () => clock });
    try {
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepStrictEqual(f.client.sent.shift(), { op: 'set', settings: { easyExit: false } },
            'an existing M1 opt-in switches off automatic Easy Access on startup');
        f.emit({ carOn: false }); f.emit({ carOn: true });
        clock += 15000; await runtime.poll();
        assert.equal(f.client.sent.length, 1, 'background recall needs no open screen');
    } finally { runtime.close(); }
    // arrival check: a recall that ends short (the seat module held its motors) is retried while still off target
    const job = (f, run, slv) => { f.client.state.seats.job = run ? 'memory' : null; f.client.state.seats.jobSeat = run ? 'driver' : null;
        if (slv !== undefined) f.client.state.seats.pos.driver.SLV = slv; f.client.emit('state', f.client.state); };
    f = fixture(); f.cycle(); await f.advance(15000);
    assert.equal(f.client.sent.length, 1);
    job(f, true); job(f, false, 130);                          // ended 326 counts short
    assert.ok(f.logs.some((s) => s.includes('M1 short of target #1') && s.includes('SLV +326')), f.logs.join('\n'));
    assert.ok(f.logs.some((s) => s.includes('M1 retry in 2 s')));
    await f.advance(1999); assert.equal(f.client.sent.length, 1, 'waits two seconds before the retry');
    await f.advance(1);
    assert.equal(f.client.sent.length, 2, 'one retry after the wait and 2 s of idle Comfort');
    assert.ok(f.logs.some((s) => s.includes('retry: calling driver memory again')));
    job(f, true); job(f, false, 140);                          // still short
    await f.advance(2000); assert.equal(f.client.sent.length, 3);
    job(f, true); await f.advance(5000); f.emit({});
    assert.equal(f.client.sent.length, 3); job(f, false, 456);
    await f.advance(60000); await f.advance(5000);
    assert.equal(f.client.sent.length, 3, 'arrival ends retries');

    f = fixture(); f.cycle(); await f.advance(8000);
    job(f, true); job(f, false, 130);
    f.client.state.settings.easyExit = true;
    await f.advance(3000);
    assert.equal(f.client.sent.length, 1, 'a retry also waits for the shared switch to be off');
    f.client.state.settings.easyExit = false;
    await f.advance(1000);
    assert.equal(f.client.sent.length, 2);

    f = fixture(); f.cycle(); await f.advance(15000);
    job(f, true); job(f, false, 440);                          // within tolerance of 456
    assert.ok(f.logs.some((s) => s.includes('M1 arrived #1')));
    await f.advance(20000); assert.equal(f.client.sent.length, 1, 'arrived: no retry');

    for (const reason of ['driving', 'off', 'manual']) {
        f = fixture(); f.cycle(); await f.advance(15000);
        job(f, true); job(f, false, 130);
        if (reason === 'driving') f.emit({ parked: false });
        if (reason === 'off') f.emit({ carOn: false });
        if (reason === 'manual') f.auto.cancel('M1 cancelled: manual control');
        await f.advance(9000); await f.advance(3000); await f.advance(1);
        assert.equal(f.client.sent.length, 1, reason + ' cancels the retry');
    }

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seat-driver-test-'));
    let active = 'driver A';
    const makeDriver = (now) => new Driver({
        async proxy(iface, id) {
            return {
                async getValue(field) {
                    if (iface.endsWith('SessionManager')) {
                        if (active === null) throw new Error('BMW profile unavailable');
                        return { currentUserAccountReference: { value: active } };
                    }
                    return { [field]: id === 'driver A' ? '민수' : '지연' };
                },
                shutdown() {},
            };
        },
    }, dataDir, now);
    {
        let time = 0, nameReady = false;
        const profile = new Driver({ proxy: async (iface) => ({ getValue: async () =>
            iface.endsWith('SessionManager') ? 'profile-2' : nameReady ? 'Driver Two' : '' }) }, null, () => time);
        await profile.refresh(true); await profile.nameRequest;
        assert.ok(profile.known()); assert.equal(profile.name, null);
        nameReady = true; time = 3000; await profile.refresh(true);
        time = 5000; await profile.refresh(true); await profile.nameRequest;
        assert.equal(profile.name, 'Driver Two');
        profile.close();
    }
    const file = path.join(dataDir, 'driver-m1.json');
    async function savePersonalM1(f, position) {
        f.client.state.seats.pos.driver.SLV = position;
        const screen = new EasyAccess(f.client, f.driver);
        screen.setForeground(true);
        screen.armMemorySave();
        await screen.memory(0);
        return screen;
    }
    try {
        f = fixture({ m1OffSeen: true }, makeDriver);
        await f.driver.refresh(true);
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(f.driver.name, '민수');
        f.emit({}); await f.advance(10000);
        assert.equal(f.client.sent.length, 0, 'an older unscoped opt-in must not move a seat');
        await f.driver.refresh(true);
        assert.equal(f.auto.toggle(f.client.state), false, 'the driver must save a personal M1 before enabling it');
        f.client.state.seats.memories.driver = [null, null, { SLV: 900 }];
        await savePersonalM1(f, 456);
        assert.deepStrictEqual(f.client.sent.shift(), { op: 'memory', seat: 'driver', slot: 0, save: true });
        assert.equal(f.auto.toggle(f.client.state), true);
        assert.equal(f.auto.enabled(), true);
        assert.ok(!/driver A|민수/.test(fs.readFileSync(file, 'utf8')), 'store no raw driver ID or name');
        await f.advance(12000);
        assert.equal(f.client.sent.length, 0, 'opting in while powered on is not a trigger');
        f.driver.close();

        f = fixture({}, makeDriver);
        f.client.state.seats.memories.driver[2] = { SLV: 900 };
        await f.driver.refresh(true);
        f.cycle(); await f.advance(3000);
        assert.equal(f.client.sent.length, 1, 'the recognized driver keeps the opt-in across a restart');
        job(f, true); job(f, false, 130);
        active = 'driver B';
        await f.advance(2000);
        assert.equal(f.client.sent.length, 1, 'a driver change prevents retrying another driver’s movement');
        f.cycle(); await f.advance(8000); await f.advance(3000);
        assert.equal(f.client.sent.length, 1, 'another driver does not inherit M1 authorization');

        const originalSend = f.client.send;
        f.client.send = async (command) => {
            if (command.op === 'memory' && command.save) f.client.state.seats.pos.driver.SLV = 700;
            return originalSend(command);
        };
        const second = await savePersonalM1(f, 530);
        f.client.send = originalSend;
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 1, save: true });
        assert.deepStrictEqual(f.client.state.seats.memories.driver, [{ SLV: 456 }, { SLV: 700 }, { SLV: 900 }]);
        assert.equal(f.auto.toggle(f.client.state), true);
        f.cycle(); await f.advance(3000);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 1, save: false },
            'driver B starts in their own M1 slot');
        job(f, true); job(f, false, 500);
        await f.advance(2000);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 1, save: false },
            'a short recall retries driver B’s slot');
        await second.memory(0);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 1, save: false },
            'the driver M1 button recalls the same personal memory');
        await assert.rejects(() => second.memory(1), /개인 M1에 사용/);

        active = 'driver C';
        await f.driver.refresh(true);
        await assert.rejects(() => savePersonalM1(f, 500), /공용 M3/);
        assert.deepStrictEqual(f.client.state.seats.memories.driver, [{ SLV: 456 }, { SLV: 700 }, { SLV: 900 }],
            'a full store cannot overwrite another profile or the existing M3');

        active = 'driver A';
        await f.driver.refresh(true);
        f.cycle(); await f.advance(3000);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 0, save: false },
            'switching back restores driver A’s M1');
        f.client.state.seats.memories.driver[0].SLV = 600;
        f.cycle(); await f.advance(8000); await f.advance(3000);
        assert.equal(f.client.sent.length, 1, 'a changed shared M1 is never used under the old opt-in');

        f.client.state.seats.memories.driver[0].SLV = 456;
        f.cycle(); active = null; await f.advance(8000);
        assert.equal(f.client.sent.length, 1, 'a failed fresh profile read cannot trigger auto-M1');
        assert.equal(f.driver.known(), false);
        f.driver.close();

        active = 'driver A';
        f = fixture({}, makeDriver);
        f.client.state.seats.memories.driver[1] = { SLV: 700 };
        await f.driver.refresh(true);
        const exitScreen = new EasyAccess(f.client, f.driver);
        exitScreen.setForeground(true);
        f.client.state.seats.pos.driver.SLV = 950;
        await exitScreen.save('driver');
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 2, save: true });
        assert.equal(f.driver.powerOffExit(f.client.state).slot, 2);
        f.driver.close();

        // The full power cycle needs no door event and reloads all three positions after restarting the app.
        f = fixture({}, makeDriver);
        f.client.state.seats.memories.driver = [{ SLV: 456 }, { SLV: 700 }, { SLV: 950 }];
        await f.driver.refresh(true);
        f.emit({ carOn: false }); await f.advance(1000);
        assert.equal(f.client.sent.length, 0, 'starting with the car already off does not move the seat');
        f.emit({ carOn: true }); f.emit({ carOn: false });
        await f.advance(0);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 2, save: false },
            'power-off recalls the shared exit position without queuing Comfort’s door return');
        await f.advance(1000);
        assert.equal(f.client.sent.length, 0, 'repeated off reports cannot repeat the exit move');

        // Comfort can publish the driver's memory job slightly after the app sends the command.
        job(f, true);
        active = 'driver B';
        await f.driver.refresh(true);
        f.emit({ carOn: true });
        assert.equal(f.client.sent.pop().op, 'stop', 'power-on stops a still-running exit movement');
        job(f, false);
        await f.advance(3000);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 1, save: false },
            'driver B returns to their own M1 on power-on');

        f.emit({ carOn: false, parked: false }); await f.advance(1000);
        assert.equal(f.client.sent.length, 0, 'power-off cannot move the seat without positive stationary status');
        f.emit({ parked: true, carOn: true }); await f.advance(1000);
        assert.equal(f.client.sent.length, 0, 'turning the car back on cancels a waiting exit move');
        await f.driver.refresh(true);
        f.emit({ carOn: false }); await f.advance(0);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 2, save: false });
        active = 'driver A';
        await f.driver.refresh(true);
        f.emit({ carOn: true });
        await f.advance(3000);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 0, save: false },
            'driver A also returns to their own M1 from the same shared exit position');

        // The BMW profile provider may disappear just before Comfort reports ignition off.
        active = null;
        await f.driver.refresh(true);
        f.emit({ carOn: false }); await f.advance(0);
        assert.deepStrictEqual(f.client.sent.pop(), { op: 'memory', seat: 'driver', slot: 2, save: false });
        f.driver.close();

        // A previous common memory can be repurposed only by an explicit repeated save.
        const common = fixture({}, (now) => new Driver(null, null, now));
        common.driver.id = 'test'; common.driver.at = 10000;
        common.driver.exit = { slot: 1, target: null };
        common.driver.profiles.other = { slot: 0, target: null, enabled: true };
        common.client.state.seats.memories.driver = [{ SLV: 100 }, { SLV: 200 }, { SLV: 300 }];
        assert.throws(() => common.driver.saveM1(common.client, common.client.state), /공용 M3/);
        assert.equal(common.client.sent.length, 0);
        await common.driver.saveM1(common.client, common.client.state);
        assert.deepStrictEqual(common.client.state.seats.memories.driver, [{ SLV: 100 }, { SLV: 200 }, { SLV: 123 }]);
        const digest = (input) => crypto.createHash('sha256').update(input).digest('hex');
        const oldTarget = digest(JSON.stringify([[['SLV', 456]], []]));
        const old = { [digest('driver A')]: oldTarget, [digest('driver B')]: oldTarget };
        fs.writeFileSync(file, JSON.stringify(old));
        active = 'driver A';
        f = fixture({}, makeDriver);
        await f.driver.refresh(true);
        f.driver.adoptLegacy(f.client.state);
        assert.equal(f.auto.armed(), false, 'a shared legacy opt-in cannot assign ownership to the wrong driver');
        f.driver.close();
        delete old[digest('driver B')];
        fs.writeFileSync(file, JSON.stringify(old));
        f = fixture({}, makeDriver);
        await f.driver.refresh(true);
        f.driver.adoptLegacy(f.client.state);
        assert.equal(f.auto.enabled(), true, 'the sole matching legacy owner keeps their saved settings');
        assert.equal(f.driver.personalM1(f.client.state).slot, 0);
        f.driver.close();
    } finally {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        fs.rmdirSync(dataDir);
    }
    console.log('PASS power-off exit, driver-specific ignition M1, retry, and parked/profile guards');
})().catch((e) => { console.error(e); process.exitCode = 1; });
