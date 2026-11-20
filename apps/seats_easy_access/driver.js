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
const MEMORY_SLOTS = [0, 1, 2];
const HASH = /^[a-f0-9]{64}$/;

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

function targetOf(state, slot) { return state && state.seats.memories.driver[slot]; }

function targetKey(target, supportedAxes) {
    if (!target) return null;
    const axes = Object.keys(target).filter((axis) => axis !== 'wheel' && (!supportedAxes || supportedAxes.includes(axis))).sort();
    if (!axes.length) return null;
    const wheel = target.wheel || {};
    return digest(JSON.stringify([axes.map((axis) => [axis, target[axis]]),
        Object.keys(wheel).sort().map((axis) => [axis, wheel[axis]])]));
}

function atPosition(target, position, tolerance, exact) {
    if (!target) return false;
    const axes = Object.keys(position.driver);
    const wheel = Object.keys(target.wheel || {});
    return axes.length > 0 && axes.every((axis) => Math.abs(target[axis] - position.driver[axis]) <= tolerance) &&
        (!exact || (axes.length === Object.keys(target).filter((axis) => axis !== 'wheel').length &&
            wheel.length === Object.keys(position.wheel).length)) &&
        wheel.every((axis) => (!exact && position.wheel[axis] === undefined) ||
            Math.abs(target.wheel[axis] - position.wheel[axis]) <= tolerance);
}

class Driver {
    constructor(signals, dataDir, now) {
        this.signals = signals;
        this.now = now || Date.now;
        this.file = dataDir && path.join(dataDir, 'driver-m1.json');
        this.profiles = Object.create(null);
        this.legacy = Object.create(null);
        if (this.file) {
            try {
                const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                for (const id of Object.keys(saved)) {
                    const entry = saved[id];
                    if (!HASH.test(id)) continue;
                    if (typeof entry === 'string' && HASH.test(entry)) this.legacy[id] = entry;
                    else if (entry && MEMORY_SLOTS.includes(entry.slot) && !this.reserved(entry.slot) &&
                        (entry.target === null || (typeof entry.target === 'string' && HASH.test(entry.target)))) {
                        this.profiles[id] = { slot: entry.slot, target: entry.target, enabled: entry.enabled === true };
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

    hasOptIns() { return Object.values(this.profiles).some((entry) => entry.enabled); }

    reserved(slot) { return Object.values(this.profiles).some((entry) => entry.slot === slot); }

    personalM1(state) {
        const entry = this.known() && this.profiles[this.id];
        return entry && entry.target && entry.target === targetKey(targetOf(state, entry.slot)) ? entry : null;
    }

    authorization(state) {
        const entry = this.personalM1(state);
        return entry && entry.enabled ? entry : null;
    }

    canSet(state) {
        return this.known() && (!!this.personalM1(state) || !!(this.profiles[this.id] && this.profiles[this.id].enabled));
    }

    ready(state) { return this.now() - this.since >= STABLE_MS ? this.authorization(state) : null; }

    toggle(state) {
        if (!this.canSet(state)) return false;
        const entry = this.profiles[this.id];
        this.write(this.id, Object.assign({}, entry, { enabled: !entry.enabled }));
        return true;
    }

    write(id, entry) {
        const profiles = Object.assign(Object.create(null), this.profiles, { [id]: entry });
        const legacy = Object.assign(Object.create(null), this.legacy);
        delete legacy[id];
        if (this.file) {
            const temp = this.file + '.tmp';
            fs.writeFileSync(temp, JSON.stringify(Object.assign({}, legacy, profiles)), { mode: 0o600 });
            fs.renameSync(temp, this.file);
        }
        this.profiles = profiles;
        this.legacy = legacy;
    }

    adoptLegacy(state) {
        if (this.reserved(0) || !Object.keys(this.legacy).length) return;
        const memory = targetOf(state, 0);
        const key = targetKey(memory, state.seats.axes.driver);
        const owners = Object.keys(this.legacy).filter((id) => this.legacy[id] === key);
        if (owners.length === 1) this.write(owners[0], { slot: 0, target: targetKey(memory), enabled: true });
    }

    async saveM1(client, state) {
        const id = this.id;
        let entry = this.profiles[id];
        if (!entry) {
            const slot = MEMORY_SLOTS.find((index) => !this.reserved(index) && targetOf(state, index) === null);
            if (slot === undefined) throw new Error('개인 M1을 저장할 빈 Comfort 메모리가 없습니다.');
            entry = { slot, target: null, enabled: false };
            // Reserve first so a failed or interrupted save keeps the same slot on retry.
            this.write(id, entry);
        }
        const slot = entry.slot;
        const previous = targetKey(targetOf(state, slot));
        await client.send({ op: 'memory', seat: 'driver', slot, save: true });
        let received, lost;
        const written = new Promise((resolve, reject) => {
            received = (status) => {
                const target = targetOf(status, slot), key = targetKey(target);
                // Comfort refreshes its counters while saving. A seat moved by the physical switch can have stale
                // displayed counters until that read, so compare the memory with the ensuing status.
                if (key && key !== previous && atPosition(target, status.seats.pos, 40, false)) resolve(key);
            };
            lost = () => reject(new Error('Comfort 연결이 끊겼습니다.'));
            client.on('state', received);
            client.once('lost', lost);
            received(client.state);
        });
        let target;
        const timeoutMessage = 'Comfort에서 개인 M1 저장을 확인하지 못했습니다.';
        try { target = await bounded(written, 12000, timeoutMessage); }
        catch (error) {
            const current = targetOf(client.state, slot);
            if (error.message !== timeoutMessage || !previous || previous !== targetKey(current) ||
                !atPosition(current, client.state.seats.pos, 0, true)) throw error;
            target = previous;
        }
        finally { client.removeListener('state', received); client.removeListener('lost', lost); }
        this.write(id, { slot, target, enabled: entry.enabled });
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
