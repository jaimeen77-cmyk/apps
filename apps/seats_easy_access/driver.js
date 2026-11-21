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
const EXIT = 'powerOffExit';

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

function validEntry(entry) {
    return entry && MEMORY_SLOTS.includes(entry.slot) &&
        (entry.target === null || (typeof entry.target === 'string' && HASH.test(entry.target)));
}

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
        this.exit = null;
        this.exitDrivers = new Set();
        if (this.file) {
            try {
                const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
                for (const id of Object.keys(saved)) {
                    const entry = saved[id];
                    if (!HASH.test(id)) continue;
                    if (typeof entry === 'string' && HASH.test(entry)) this.legacy[id] = entry;
                    else if (validEntry(entry) && !this.reserved(entry.slot)) {
                        this.profiles[id] = { slot: entry.slot, target: entry.target, enabled: entry.enabled === true };
                    }
                }
                const ids = Array.isArray(saved.exitDrivers) ? saved.exitDrivers :
                    Object.keys(this.profiles).filter((id) => this.profiles[id].enabled);
                this.exitDrivers = new Set(ids.filter((id) => typeof id === 'string' && HASH.test(id)));
                const exit = saved[EXIT];
                if (validEntry(exit) && !this.reserved(exit.slot)) this.exit = { slot: exit.slot, target: exit.target };
            } catch (_) { /* no usable opt-ins */ }
        }
        this.available = !!(signals && typeof signals.proxy === 'function' &&
            (!signals.hasNative || signals.hasNative()));
        this.id = null;
        this.name = null;
        this.at = -Infinity;
        this.since = -Infinity;
        this.lastRead = -Infinity;
        this.nextNameRead = 0;
        this.nameRequest = null;
        this.replaceSlot = null;
        this.proxy = null;
        this.reading = null;
        this.closed = false;
    }

    known() { return !!this.id && this.now() - this.at <= FRESH_MS; }

    hasOptIns() { return Object.values(this.profiles).some((entry) => entry.enabled); }

    reserved(slot) { return (this.exit && this.exit.slot === slot) || Object.values(this.profiles).some((entry) => entry.slot === slot); }

    verified(entry, state) { return entry && entry.target && entry.target === targetKey(targetOf(state, entry.slot)) ? entry : null; }

    toggleExit(state) {
        if (!this.known()) return false;
        const ids = new Set(this.exitDrivers);
        if (ids.has(this.id)) ids.delete(this.id);
        else if (this.powerOffExit(state)) ids.add(this.id);
        else return false;
        this.persist(this.profiles, this.legacy, this.exit, ids);
        return true;
    }

    powerOffExit(state) {
        const entry = this.verified(this.exit, state);
        return entry && Number.isFinite(targetOf(state, entry.slot).SLV) ? entry : null;
    }

    personalM1(state) {
        return this.verified(this.known() && this.profiles[this.id], state);
    }

    authorization(state) {
        return this.known() ? this.authorizedProfile(this.id, state) : null;
    }

    authorizedProfile(id, state) {
        const entry = this.verified(this.profiles[id], state);
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
        this.persist(profiles, legacy, this.exit);
    }

    persist(profiles, legacy, exit, exitDrivers = this.exitDrivers) {
        if (this.file) {
            const temp = this.file + '.tmp';
            const saved = Object.assign({}, legacy, profiles);
            saved.exitDrivers = Array.from(exitDrivers);
            if (exit) saved[EXIT] = exit;
            fs.writeFileSync(temp, JSON.stringify(saved), { mode: 0o600 });
            fs.renameSync(temp, this.file);
        }
        this.profiles = profiles;
        this.legacy = legacy;
        this.exit = exit;
        this.exitDrivers = exitDrivers;
    }

    adoptLegacy(state) {
        if (this.reserved(0) || !Object.keys(this.legacy).length) return;
        const memory = targetOf(state, 0);
        const key = targetKey(memory, state.seats.axes.driver);
        const owners = Object.keys(this.legacy).filter((id) => this.legacy[id] === key);
        if (owners.length === 1) {
            const id = owners[0], legacy = Object.assign({}, this.legacy);
            delete legacy[id];
            this.persist(Object.assign({}, this.profiles, { [id]: { slot: 0, target: targetKey(memory), enabled: true } }),
                legacy, this.exit, new Set([...this.exitDrivers, id]));
        }
    }

    saveM1(client, state) {
        const id = this.id;
        let entry = this.profiles[id];
        const free = MEMORY_SLOTS.filter((slot) => !this.reserved(slot));
        if (!entry && free.length && free.every((slot) => targetOf(state, slot))) {
            const slot = free.find((index) => index !== 0 || !Object.keys(this.legacy).length);
            if (slot === undefined) throw new Error('저장할 빈 Comfort 메모리가 없습니다.');
            const key = targetKey(targetOf(state, slot)), prior = this.replaceSlot;
            if (!prior || prior.id !== id || prior.slot !== slot || prior.key !== key || this.now() > prior.until) {
                this.replaceSlot = { id, slot, key, until: this.now() + 30000 };
                throw new Error('공용 M' + (slot + 1) + ' 덮어쓰기: 30초 안에 메모리 저장 → M1을 다시 누르세요.');
            }
            entry = { slot, target: null };
            this.write(id, Object.assign({ enabled: false }, entry));
        }
        this.replaceSlot = null;
        return this.saveMemory(client, state, entry, (entry) => this.write(id,
            Object.assign({ enabled: !!(this.profiles[id] && this.profiles[id].enabled) }, entry)));
    }

    savePowerOffExit(client, state) {
        if (!Number.isFinite(state.seats.pos.driver.SLV)) throw new Error('운전석 전후 위치를 확인할 수 없습니다.');
        return this.saveMemory(client, state, this.exit, (entry) => this.persist(this.profiles, this.legacy, entry));
    }

    async saveMemory(client, state, entry, write) {
        if (!entry) {
            const slot = MEMORY_SLOTS.find((index) => !this.reserved(index) && targetOf(state, index) === null);
            if (slot === undefined) throw new Error('저장할 빈 Comfort 메모리가 없습니다.');
            entry = { slot, target: null };
            // Reserve first so a failed or interrupted save keeps the same slot on retry.
            write(entry);
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
        const timeoutMessage = 'Comfort에서 메모리 저장을 확인하지 못했습니다.';
        try { target = await bounded(written, 12000, timeoutMessage); }
        catch (error) {
            const current = targetOf(client.state, slot);
            if (error.message !== timeoutMessage || !previous || previous !== targetKey(current) ||
                !atPosition(current, client.state.seats.pos, 0, true)) throw error;
            target = previous;
        }
        finally { client.removeListener('state', received); client.removeListener('lost', lost); }
        write({ slot, target });
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
        if (changed) {
            this.id = id;
            this.name = null;
            this.since = this.at;
            this.replaceSlot = null;
            this.nextNameRead = 0;
            this.nameRequest = null;
        }
        if (id && !this.name && !this.nameRequest && this.at >= this.nextNameRead) {
            const request = this.readName(reference, id, this.since);
            this.nameRequest = request;
            this.nextNameRead = this.at + 5000;
            request.then(() => { if (this.nameRequest === request) this.nameRequest = null; });
        }
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
