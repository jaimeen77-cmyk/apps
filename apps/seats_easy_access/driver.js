'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { bounded } = require('./core');

const SESSION = 'de.bmw.infotainment.personalization.SessionManager';
const ACCOUNT = 'de.bmw.infotainment.personalization.UserAccount';
const REFERENCE = 'currentUserAccountReference';
const POLL_MS = 1500;
const FRESH_MS = 4500;
const STABLE_MS = 2500;

function valueOf(raw, keys) {
    if (typeof raw === 'string' || typeof raw === 'number') return String(raw).trim();
    if (raw && typeof raw === 'object') {
        for (const key of keys) {
            const value = valueOf(raw[key], keys);
            if (value) return value;
        }
    }
    return '';
}

function digest(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function targetOf(state) {
    if (!state || !state.seats.memory1.driver) return null;
    const target = state.seats.m1Target.driver;
    const axes = Object.keys(target).filter((axis) => axis !== 'wheel').sort();
    if (!axes.length) return null;
    const wheel = target.wheel || {};
    return digest(JSON.stringify([axes.map((axis) => [axis, target[axis]]),
        Object.keys(wheel).sort().map((axis) => [axis, wheel[axis]])]));
}

class Driver {
    constructor(signals, dataDir, now) {
        this.signals = signals;
        this.now = now || Date.now;
        this.file = dataDir && path.join(dataDir, 'driver-m1.json');
        this.enabled = Object.create(null);
        if (this.file) {
            try {
                const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                for (const id of Object.keys(saved)) {
                    if (/^[a-f0-9]{64}$/.test(id) && typeof saved[id] === 'string' && /^[a-f0-9]{64}$/.test(saved[id])) {
                        this.enabled[id] = saved[id];
                    }
                }
            } catch (_) { /* no usable opt-ins */ }
        }
        this.available = !!(signals && typeof signals.proxy === 'function' &&
            (!signals.hasNative || signals.hasNative()));
        this.id = null;
        this.name = null;
        this.at = -Infinity;
        this.since = -Infinity;
        this.lastRead = -Infinity;
        this.proxy = null;
        this.reading = null;
        this.closed = false;
    }

    known() { return !!this.id && this.now() - this.at <= FRESH_MS; }

    hasOptIns() { return Object.keys(this.enabled).length > 0; }

    authorization(state) {
        const target = targetOf(state);
        return this.known() && target && this.enabled[this.id] === target ? this.id + ':' + target : null;
    }

    canSet(state) { return this.known() && !!(this.enabled[this.id] || targetOf(state)); }

    ready(state) { return this.now() - this.since >= STABLE_MS ? this.authorization(state) : null; }

    toggle(state) {
        if (!this.canSet(state)) return false;
        const updated = Object.assign(Object.create(null), this.enabled);
        const target = targetOf(state);
        if (this.authorization(state) || !target) delete updated[this.id];
        else updated[this.id] = target;
        if (this.file) {
            const temp = this.file + '.tmp';
            fs.writeFileSync(temp, JSON.stringify(updated), { mode: 0o600 });
            fs.renameSync(temp, this.file);
        }
        this.enabled = updated;
        return true;
    }

    refresh(force) {
        if (!this.available || this.closed) return Promise.resolve();
        if (this.reading) return this.reading;
        if (!force && this.now() - this.lastRead < POLL_MS) return Promise.resolve();
        this.lastRead = this.now();
        this.reading = this.read().then(() => { this.reading = null; });
        return this.reading;
    }

    async read() {
        let reference = '';
        try {
            if (!this.proxy) {
                const pending = this.signals.proxy(SESSION, SESSION);
                this.proxy = await bounded(pending, 2500, 'Driver profile not available').catch((error) => {
                    pending.then(close, () => {});
                    throw error;
                });
                if (this.closed) { close(this.proxy); this.proxy = null; return; }
            }
            const raw = await bounded(this.proxy.getValue(REFERENCE, 1600), 2000, 'Driver profile read timed out');
            reference = valueOf(raw, [REFERENCE, 'value', 'id', 'reference']);
        } catch (_) { /* a missing or temporarily unavailable BMW user is unknown */ }
        if (this.closed) return;
        const id = reference && !/^(guest|anonymous|unknown|none|null|undefined)$/i.test(reference) ? digest(reference) : null;
        const changed = id !== this.id || !this.known();
        this.at = this.now();
        if (!changed) return;
        this.id = id;
        this.name = null;
        this.since = this.at;
        if (id) this.readName(reference, id, this.since);
    }

    async readName(reference, id, since) {
        let proxy;
        try {
            const pending = this.signals.proxy(ACCOUNT, reference);
            proxy = await bounded(pending, 2500, 'Driver account not available').catch((error) => {
                pending.then(close, () => {});
                throw error;
            });
            for (const field of ['name', 'firstName']) {
                if (this.closed || this.id !== id || this.since !== since) return;
                const raw = await bounded(proxy.getValue(field, 1600), 2000, 'Driver name read timed out').catch(() => null);
                const name = valueOf(raw, [field, 'value', 'name', 'firstName']).replace(/[\x00-\x1f\x7f]/g, ' ').trim();
                if (!name) continue;
                if (!this.closed && this.id === id && this.since === since) this.name = Array.from(name).slice(0, 20).join('');
                return;
            }
        } catch (_) { /* show the recognized status without a display name */ }
        finally { close(proxy); }
    }

    close() {
        this.closed = true;
        this.id = null;
        this.name = null;
        close(this.proxy);
        this.proxy = null;
    }
}

function close(proxy) {
    if (proxy && proxy.shutdown) Promise.resolve().then(() => proxy.shutdown()).catch(() => {});
}

module.exports = { Driver };
