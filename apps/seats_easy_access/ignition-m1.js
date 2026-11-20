'use strict';
// Early ignition recalls may be ignored while the seat module starts up.
const TOL = 80;
const WAIT_MS = 3000;
const RETRY_MS = 2000;
const ATTEMPTS = 5;
const EXIT_WINDOW_MS = 6000;
const POWERED_DRIVER_MS = 4500;
class IgnitionM1 {
    constructor(client, settings, log, options) {
        const o = options || {};
        this.client = client; this.settings = settings; this.log = log;
        this.now = o.now || Date.now;
        this.driver = o.driver;
        // Capture before the screen's manual-move tracker wraps send. A screen hide must not stop this recall.
        this.send = client.send.bind(client);
        this.pending = null; this.busy = false;
        this.verify = null;   // a sent recall being watched: { at, seen, attempt, target }
        this.retry = null;    // next retry waiting: { due, attempt }
        this.lastPower = null;
        this.poweredDriver = null;
        this.pendingExit = null;
        this.exitMotion = null;
        client.on('state', (s) => this.observe(s));
        client.on('lost', () => {
            this.cancel('Seat automation cancelled: Comfort disconnected');
            this.lastPower = this.poweredDriver = this.exitMotion = null;
        });
        if (settings.onChange) settings.onChange((key) => {
            if (key === 'ignitionM1' && !this.enabled()) this.cancel('M1 cancelled: option off');
        });
    }
    enabled(state) {
        return this.driver ? !!this.driver.authorization(state || this.client.state) : this.settings.get('ignitionM1') === true;
    }
    armed() { return this.driver ? this.driver.hasOptIns() : this.enabled(); }
    canToggle(state) { return !this.driver || this.driver.canSet(state); }
    toggle(state) {
        if (this.driver) {
            if (!this.driver.toggle(state)) return false;
        } else this.settings.set('ignitionM1', !this.enabled());
        this.settings.set('m1OffSeen', false);
        this.cancel('M1 cancelled: option changed');
        return true;
    }
    cancel(reason) {
        if (!this.pending && !this.retry && !this.verify && !this.pendingExit) return;
        this.pending = this.retry = this.verify = this.pendingExit = null;
        this.log.add([reason]);
    }
    /** axes of the stored M1 more than TOL counts away from where the seat reports it: "SLV +250" */
    short(s, slot) {
        const target = s.seats.memories.driver[slot] || {}, pos = s.seats.pos.driver;
        return Object.keys(target).filter((a) => typeof pos[a] === 'number' && Math.abs(target[a] - pos[a]) > TOL)
            .map((a) => a + ' ' + (target[a] - pos[a] > 0 ? '+' : '') + (target[a] - pos[a]));
    }
    /** watch the recall just sent until Comfort's memory job ends: arrived, or schedule another attempt */
    check(s) {
        const v = this.verify; if (!v) return;
        if (this.driver && this.driver.authorization(s) !== v.authorization) {
            this.cancel('M1 cancelled: driver or target changed');
            return;
        }
        if (!s.carOn || !s.parked || this.now() > v.deadline) return this.cancel('M1 verification cancelled');
        if (s.seats.job || s.seats.moving) {
            v.idleAt = null;
            if (s.seats.job === 'memory' && s.seats.jobSeat === 'driver') v.seen = true;
            return;
        }
        if (v.idleAt === null) v.idleAt = this.now();
        if (!v.seen && this.now() - v.idleAt < RETRY_MS) return;
        this.verify = null;
        const off = this.short(s, v.slot), took = ((this.now() - v.at) / 1000).toFixed(1) + ' s';
        if (!off.length) return this.log.add(['M1 arrived', '#' + v.attempt, took]);
        if (v.attempt >= ATTEMPTS) return this.log.add(['M1 still short after retry', off.join(', ')]);
        this.retry = { due: v.idleAt + RETRY_MS, attempt: v.attempt + 1, idleAt: v.idleAt,
            authorization: v.authorization, slot: v.slot, deadline: v.deadline };
        this.log.add(['M1 short of target', '#' + v.attempt, took, off.join(', '), 'M1 retry in ' + RETRY_MS / 1000 + ' s']);
    }
    observe(s) {
        this.checkExitMotion(s);
        if (!s.carOn) {
            if (this.lastPower !== false) {
                this.cancel('M1 cancelled: power off');
                if (this.lastPower === true) this.scheduleExit(s);
                this.poweredDriver = null;
            }
            if (s.parked && this.armed() && this.settings.get('m1OffSeen') !== true) this.settings.set('m1OffSeen', true);
        } else if (this.lastPower !== true) {
            this.pendingExit = null;
            const offSeen = this.settings.get('m1OffSeen') === true;
            if (offSeen) this.settings.set('m1OffSeen', false);
            if (this.armed() && offSeen) {
                const now = this.now();
                this.pending = { due: now + WAIT_MS, deadline: now + 45000, idleAt: null, waiting: false };
                this.log.add(['M1 power-on detected: waiting ' + WAIT_MS / 1000 + ' seconds']);
            }
        }
        this.lastPower = s.carOn;
        if (s.carOn && this.driver && this.driver.known()) {
            const profile = this.driver.authorization(s);
            this.poweredDriver = profile ? { id: this.driver.id, profile, at: this.driver.at } : null;
        }
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
        if (this.pendingExit && !this.busy) return this.runExit();
        if (this.retry && !this.busy) return this.again();
        if (!this.pending || this.busy) return;
        if (!this.armed()) return this.cancel('M1 cancelled: option off');
        const p = this.pending, now = this.now();
        if (now > p.deadline) return this.cancel('M1 cancelled: readiness timeout');
        if (now < p.due) return;
        this.busy = true;
        try {
            if (this.driver) await this.driver.refresh(true);
            if (this.pending !== p || !this.armed()) return;
            const s = await this.client.refresh();
            if (this.pending !== p || !this.armed()) return;
            if (!s.carOn || !s.parked) return this.cancel('M1 cancelled: power or stationary condition changed');
            if (this.now() > p.deadline) return this.cancel('M1 cancelled: readiness timeout');
            if (s.settings.easyExit) return;
            const authorization = this.driver && this.driver.ready(s);
            if (this.driver && !authorization) return;
            const slot = authorization ? authorization.slot : 0;
            if (s.seats.job || s.seats.moving || p.idleAt === null || this.now() - p.idleAt < 3000) {
                if (!p.waiting) { p.waiting = true; this.log.add(['M1 waiting for Comfort seat job to finish']); }
                return;
            }
            if (!s.seats.memories.driver[slot]) return this.cancel('M1 cancelled: save driver M1 first');
            if (!s.seats.axes.driver.length || !Object.keys(s.seats.pos.driver).length)
                return this.cancel('M1 cancelled: driver position unavailable');
            this.pending = null; // consume before sending: errors must not cause repeated movement commands
            this.log.add(['M1 calling driver memory']);
            await this.recall(1, authorization, slot, p.deadline);
        } catch (e) {
            this.cancel('M1 cancelled: status unavailable');
            this.log.add(['M1 request failed', e.message]);
        } finally { this.busy = false; }
    }

    scheduleExit(s) {
        if (!this.driver) return;
        const exit = this.driver.powerOffExit(s), now = this.now();
        const recent = this.poweredDriver;
        // BMW can stop reporting the profile while the engine is shutting down.
        // Only use the last recognized driver briefly and within this same power cycle.
        const known = this.driver.known();
        const id = known ? this.driver.id : recent && now - recent.at <= POWERED_DRIVER_MS ? recent.id : null;
        const profile = id && this.driver.authorizedProfile(id, s);
        if (exit && profile && (known || profile === recent.profile)) this.pendingExit = { id, profile, exit, deadline: now + EXIT_WINDOW_MS };
    }

    async runExit() {
        const p = this.pendingExit;
        if (this.now() > p.deadline) { this.pendingExit = null; return; }
        this.busy = true;
        try {
            const s = await this.client.refresh();
            if (this.pendingExit !== p) return;
            if (s.carOn || this.now() > p.deadline || this.driver.powerOffExit(s) !== p.exit ||
                this.driver.authorizedProfile(p.id, s) !== p.profile || (this.driver.known() && this.driver.id !== p.id)) {
                this.pendingExit = null;
                return;
            }
            if (!s.parked || s.settings.easyExit || s.seats.job || s.seats.moving || !Number.isFinite(s.seats.pos.driver.SLV)) return;
            this.pendingExit = null;
            // A plain memory recall never queues Comfort's own "return to previous position".
            this.exitMotion = { at: this.now(), seen: false };
            await this.send({ op: 'memory', seat: 'driver', slot: p.exit.slot, save: false });
        } catch (_) { this.pendingExit = this.exitMotion = null; }
        finally { this.busy = false; }
    }

    checkExitMotion(s) {
        const motion = this.exitMotion;
        if (!motion) return;
        if (s.seats.job === 'memory' && s.seats.jobSeat === 'driver') {
            motion.seen = true;
            if (!s.parked || s.carOn) {
                this.exitMotion = null;
                this.send({ op: 'stop' }).catch(() => {});
            }
        } else if (motion.seen || this.now() - motion.at > 3000) this.exitMotion = null;
    }
    async recall(attempt, authorization, slot, deadline) {
        const at = this.now();
        this.verify = { at, idleAt: at, seen: false, attempt, authorization, slot, deadline };
        try { await this.send({ op: 'memory', seat: 'driver', slot, save: false }); }
        catch (e) { this.verify = null; throw e; }
        this.log.add(['M1 command sent: checking arrival', '#' + attempt]);
    }
    /** Each retry uses the same guards as the first recall, and Comfort idle for 2 s */
    async again() {
        const r = this.retry;
        if (!this.armed()) return this.cancel('M1 retry cancelled: option off');
        if (this.now() < r.due) return;
        if (this.now() > r.deadline) return this.cancel('M1 retry cancelled: Comfort stayed busy');
        this.busy = true;
        try {
            if (this.driver) await this.driver.refresh(true);
            if (this.retry !== r) return;
            const s = await this.client.refresh();
            if (this.retry !== r) return;
            if (this.now() > r.deadline) return this.cancel('M1 retry timed out');
            if (!s.carOn || !s.parked) return this.cancel('M1 retry cancelled: power or stationary condition changed');
            if (this.driver && this.driver.ready(s) !== r.authorization) {
                return this.cancel('M1 retry cancelled: driver or target changed');
            }
            if (s.settings.easyExit || s.seats.job || s.seats.moving || r.idleAt === null || this.now() - r.idleAt < 2000) return;
            if (!this.short(s, r.slot).length) { this.retry = null; return this.log.add(['M1 retry not needed: seat now at M1']); }
            this.retry = null;
            this.log.add(['M1 retry: calling driver memory again']);
            await this.recall(r.attempt, r.authorization, r.slot, r.deadline);
        } catch (e) {
            this.retry = null;
            this.log.add(['M1 retry failed', e.message]);
        } finally { this.busy = false; }
    }
}
module.exports = { IgnitionM1 };
