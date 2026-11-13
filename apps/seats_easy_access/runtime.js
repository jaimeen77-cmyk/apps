'use strict';
const fs = require('fs');
const path = require('path');
const { ComfortClient } = require('./core');
const { DemoClient } = require('./demo');
const { IgnitionM1 } = require('./ignition-m1');
// 0.6.11: no diagnostic log is kept (the Logs tab is gone); the M1 steps are no longer recorded anywhere.
const NO_LOG = { add() {} };
function start(ctx, options) {
    const o = options || {};
    const demo = o.demo === undefined ? !fs.existsSync('/etc/oap/someip/someip-interfaces.json') : o.demo;
    const client = o.client || (demo ? new DemoClient() : new ComfortClient());
    const settings = ctx.settings || { get() { return false; }, set() {} };
    // the history file older versions kept in the app's data folder: removed, nothing writes it any more
    if (!demo && ctx.dataDir) { try { fs.unlinkSync(path.join(ctx.dataDir, 'seats-diagnostics.json')); } catch (_) {} }
    const auto = new IgnitionM1(client, settings, NO_LOG, { now: o.now });
    let closed = false, reading = false;
    async function poll() {
        if (closed || reading) return;
        reading = true;
        try { await client.refresh(); if (!closed) await auto.tick(); }
        catch (_) {} // lost/status failures: nothing restarts and no seat moves
        finally { reading = false; }
    }
    // Independent of the visible-page loop: keep receiving power events while the screen is hidden.
    const timer = setInterval(poll, 1000);
    if (timer.unref) timer.unref();
    function close() {
        if (closed) return;
        closed = true; clearInterval(timer); auto.cancel('M1 cancelled: app shutdown'); client.close();
    }
    if (ctx.app && ctx.app.on) ctx.app.on('shutdown', close);
    poll();
    return { client, settings, auto, demo, close, poll };
}
module.exports = { start };
