'use strict';
const assert = require('assert');
const EventEmitter = require('events');
const { IgnitionM1 } = require('../ignition-m1');
const { ownMoves, stateOf } = require('../core');
function fixture(values) {
    let now = 10000;
    const listeners = [], data = Object.assign({ ignitionM1: true, m1OffSeen: false }, values);
    const settings = { get: (k) => data[k], set(k, v) { data[k] = v; listeners.forEach((fn) => fn(k, v)); },
        onChange(fn) { listeners.push(fn); } };
    const client = new EventEmitter(); client.sent = []; client.close = () => {};
    client.state = stateOf({ state: { carOn: true, parked: true, seats: {
        axes: { driver: ['SLV'], passenger: [] }, pos: { driver: { SLV: 123 }, passenger: {} },
        memories: { driver: [{ SLV: 456 }] }, job: null, moving: null,
    } } });
    client.send = async (m) => { client.sent.push(m); };
    client.refresh = async () => { client.emit('state', client.state); return client.state; };
    const logs = [];
    const auto = new IgnitionM1(client, settings, { add: (p) => logs.push(p.join(' ')) }, { now: () => now });
    const emit = (changes) => { Object.assign(client.state, changes); client.emit('state', client.state); };
    const advance = async (ms) => { now += ms; await auto.tick(); };
    const cycle = () => { emit({ carOn: false }); emit({ carOn: true }); };
    return { client, settings, auto, emit, advance, cycle, logs };
}
(async () => {
    let f = fixture();
    f.emit({}); await f.advance(6000);
    assert.equal(f.client.sent.length, 0, 'starting an already-on car is not a trigger');
    f.cycle(); await f.advance(5000); assert.equal(f.client.sent.length, 0, 'old five-second trigger must not fire');
    await f.advance(9999); assert.equal(f.client.sent.length, 0);
    await f.advance(1);
    assert.deepStrictEqual(f.client.sent, [{ op: 'memory', seat: 'driver', slot: 0, save: false }]);
    await f.advance(10000); f.emit({}); await f.advance(1000);
    assert.equal(f.client.sent.length, 1, 'no duplicate recalls from repeated power/status events');
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

    for (const reason of ['driving', 'off', 'lost', 'manual', 'no memory', 'no position', 'timeout']) {
        f = fixture(); f.cycle();
        if (reason === 'driving') f.emit({ parked: false });
        if (reason === 'off') f.emit({ carOn: false });
        if (reason === 'lost') f.client.emit('lost');
        if (reason === 'manual') f.auto.cancel('manual');
        if (reason === 'no memory') f.client.state.seats.memory1.driver = false;
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
    let clock = 10000;
    const runtime = require('../runtime').start({ settings: f.settings }, { demo: true, client: f.client, now: () => clock });
    try {
        await new Promise((resolve) => setImmediate(resolve));
        f.emit({ carOn: false }); f.emit({ carOn: true });
        clock += 15000; await runtime.poll();
        assert.equal(f.client.sent.length, 1, 'background recall needs no open screen');
    } finally { runtime.close(); }
    // arrival check: a recall that ends short (the seat module held its motors) is tried once more, never a third time
    const job = (f, run, slv) => { f.client.state.seats.job = run ? 'memory' : null; f.client.state.seats.jobSeat = run ? 'driver' : null;
        if (slv !== undefined) f.client.state.seats.pos.driver.SLV = slv; f.client.emit('state', f.client.state); };
    f = fixture(); f.cycle(); await f.advance(15000);
    assert.equal(f.client.sent.length, 1);
    job(f, true); job(f, false, 130);                          // ended 326 counts short
    assert.ok(f.logs.some((s) => s.includes('M1 short of target #1') && s.includes('SLV +326')), f.logs.join('\n'));
    await f.advance(7000); assert.equal(f.client.sent.length, 1, 'waits before the retry');
    await f.advance(1000); await f.advance(2000); await f.advance(1);
    assert.equal(f.client.sent.length, 2, 'one retry after the wait and 2 s of idle Comfort');
    assert.ok(f.logs.some((s) => s.includes('retry: calling driver memory again')));
    job(f, true); job(f, false, 140);                          // still short
    assert.ok(f.logs.some((s) => s.includes('still short after retry')));
    await f.advance(60000); await f.advance(5000);
    assert.equal(f.client.sent.length, 2, 'never a third recall');

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
    console.log('PASS ignition M1: delayed one-shot, idle/parked/memory guards, cancellation, restart, screen-hide ownership, arrival check and one retry');
})().catch((e) => { console.error(e); process.exitCode = 1; });
