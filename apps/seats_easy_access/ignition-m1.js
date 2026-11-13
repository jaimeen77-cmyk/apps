'use strict';
// One driver M1 recall per observed power cycle, checked on arrival and tried once more when it fell short (the seat
// module can hold its motors right after the engine starts: Comfort then sees no progress and takes it for the end
// stop, so only a relay click is heard). No timers survive a lost connection.
const TOL = 80;            // counts: twice Comfort's own arrival tolerance (40)
const WAIT_MS = 8000;      // after power-on, before the first recall (car: 6 s too early, the seat module ignored it; 10 s and 15 s arrived)
const RETRY_MS = 2000;     // after a short M1, wait this long (and Comfort idle as long) before the one retry
const ATTEMPTS = 2;
class IgnitionM1 {
    constructor(client, settings, log, options) {
        const o = options || {};
        this.client = client; this.settings = settings; this.log = log;
        this.now = o.now || Date.now;
        // Capture before the screen's manual-move tracker wraps send. A screen hide must not stop this recall.
        this.send = client.send.bind(client);
        this.pending = null; this.busy = false;
        this.verify = null;   // a sent recall being watched: { at, seen, attempt, target }
        this.retry = null;    // the one retry waiting: { due, attempt }
        this.lastPower = null;
        client.on('state', (s) => this.observe(s));
        client.on('lost', () => { this.cancel('M1 cancelled: Comfort disconnected'); this.lastPower = null; });
        if (settings.onChange) settings.onChange((key) => {
            if (key === 'ignitionM1' && !this.enabled()) this.cancel('M1 cancelled: option off');
        });
    }
    enabled() { return this.settings.get('ignitionM1') === true; }
    cancel(reason) {
        if (this.pending || this.retry) { this.pending = null; this.retry = null; this.log.add([reason]); }
    }
    /** axes of the stored M1 more than TOL counts away from where the seat reports it: "SLV +250" */
    short(s) {
        const target = s.seats.m1Target.driver, pos = s.seats.pos.driver;
        return Object.keys(target).filter((a) => typeof pos[a] === 'number' && Math.abs(target[a] - pos[a]) > TOL)
            .map((a) => a + ' ' + (target[a] - pos[a] > 0 ? '+' : '') + (target[a] - pos[a]));
    }
    /** watch the recall just sent until Comfort's memory job ends: arrived, or one retry */
    check(s) {
        const v = this.verify; if (!v) return;
        const running = s.seats.job === 'memory' && s.seats.jobSeat === 'driver';
        if (running) { v.seen = true; return; }
        if (!v.seen) {
            if (this.now() - v.at > 10000) { this.verify = null; this.log.add(['M1 check: no memory job observed']); }
            return;
        }
        this.verify = null;
        const off = this.short(s), took = ((this.now() - v.at) / 1000).toFixed(1) + ' s';
        if (!off.length) return this.log.add(['M1 arrived', '#' + v.attempt, took]);
        if (v.attempt >= ATTEMPTS) return this.log.add(['M1 still short after retry', off.join(', ')]);
        this.retry = { due: this.now() + RETRY_MS, attempt: v.attempt + 1, idleAt: null };
        this.log.add(['M1 short of target', '#' + v.attempt, took, off.join(', '), 'M1 retry in ' + RETRY_MS / 1000 + ' s']);
    }
    observe(s) {
        if (!s.carOn) {
            this.cancel('M1 cancelled: power off');
            if (this.enabled() && this.settings.get('m1OffSeen') !== true) this.settings.set('m1OffSeen', true);
        } else if (this.lastPower !== true) {
            const offSeen = this.settings.get('m1OffSeen') === true;
            if (offSeen) this.settings.set('m1OffSeen', false);
            if (this.enabled() && offSeen) {
                const now = this.now();
                this.pending = { due: now + WAIT_MS, deadline: now + 45000, idleAt: null, waiting: false };
                this.log.add(['M1 power-on detected: waiting ' + WAIT_MS / 1000 + ' seconds']);
            }
        }
        this.lastPower = s.carOn;
        this.check(s);
        if (this.retry) {
            if (!s.parked) return this.cancel('M1 retry cancelled: car not stationary');
            if (s.seats.job || s.seats.moving) this.retry.idleAt = null;
            else if (this.retry.idleAt === null) this.retry.idleAt = this.now();
        }
        if (!this.pending) return;
        if (!s.parked) return this.cancel('M1 cancelled: car not stationary');
        if (s.seats.job || s.seats.moving) this.pending.idleAt = null;
        else if (this.pending.idleAt === null) this.pending.idleAt = this.now();
    }
    async tick() {
        if (this.retry && !this.busy) return this.again();
        if (!this.pending || this.busy) return;
        if (!this.enabled()) return this.cancel('M1 cancelled: option off');
        const p = this.pending, now = this.now();
        if (now > p.deadline) return this.cancel('M1 cancelled: readiness timeout');
        if (now < p.due) return;
        this.busy = true;
        try {
            const s = await this.client.refresh();
            if (this.pending !== p || !this.enabled()) return;
            if (!s.carOn || !s.parked) return this.cancel('M1 cancelled: power or stationary condition changed');
            if (this.now() > p.deadline) return this.cancel('M1 cancelled: readiness timeout');
            if (s.seats.job || s.seats.moving || p.idleAt === null || this.now() - p.idleAt < 3000) {
                if (!p.waiting) { p.waiting = true; this.log.add(['M1 waiting for Comfort seat job to finish']); }
                return;
            }
            if (!s.seats.memory1.driver) return this.cancel('M1 cancelled: save driver M1 first');
            if (!s.seats.axes.driver.length || !Object.keys(s.seats.pos.driver).length)
                return this.cancel('M1 cancelled: driver position unavailable');
            this.pending = null; // consume before sending: errors must not cause repeated movement commands
            this.log.add(['M1 calling driver memory']);
            await this.recall(1);
        } catch (e) {
            this.cancel('M1 cancelled: status unavailable');
            this.log.add(['M1 request failed', e.message]);
        } finally { this.busy = false; }
    }
    async recall(attempt) {
        this.verify = { at: this.now(), seen: false, attempt };
        try { await this.send({ op: 'memory', seat: 'driver', slot: 0, save: false }); }
        catch (e) { this.verify = null; throw e; }
        this.log.add(['M1 command sent: checking arrival', '#' + attempt]);
    }
    /** the one retry: the same guards as the first recall, and Comfort idle for 2 s */
    async again() {
        const r = this.retry;
        if (!this.enabled()) return this.cancel('M1 retry cancelled: option off');
        if (this.now() < r.due) return;
        this.busy = true;
        try {
            const s = await this.client.refresh();
            if (this.retry !== r) return;
            if (!s.carOn || !s.parked) return this.cancel('M1 retry cancelled: power or stationary condition changed');
            if (s.seats.job || s.seats.moving || r.idleAt === null || this.now() - r.idleAt < 2000) {
                if (this.now() - r.due > 30000) this.cancel('M1 retry cancelled: Comfort stayed busy');
                return;
            }
            if (!this.short(s).length) { this.retry = null; return this.log.add(['M1 retry not needed: seat now at M1']); }
            this.retry = null;   // consumed before sending: never a third recall
            this.log.add(['M1 retry: calling driver memory again']);
            await this.recall(r.attempt);
        } catch (e) {
            this.retry = null;
            this.log.add(['M1 retry failed', e.message]);
        } finally { this.busy = false; }
    }
}
module.exports = { IgnitionM1 };
