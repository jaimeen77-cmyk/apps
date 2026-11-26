'use strict';
// The car ahead from the car's own Drive assist view (1.3.68), for the HUD headway badge on cars that do not offer
// de.bmw.dass.GapVehicleAhead to apps (the user's: "not offered" on instance 1) but show the cars around in the
// cluster's assisted driving view. Two broadcasts that view is built from:
//   de.bmw.dass.AssistedDrivingViewFunctionInput.assistedDrivingViewFunctionInputIbVip
//       the cruise control: its state, the object it follows (assistedDrivingViewACCTargetObjectId) and that one's
//       distance (assistedDrivingViewACCTargetDistance)
//   de.bmw.dass.pad.communication.ObjectListSuAAR.suAARObjectList
//       the objects around: objectID, objectPosition {x ahead, y to the left}, objectPrediction.laneAssignment
// The followed object is the cruise control's target, else the nearest in our lane. The names come from the car's
// catalog, as appsKOR's Cluster Layouts reads them (dap.js, MIT); this code is written anew. Not yet seen on a car:
// the units of x and y are not known, so the raw values go to the Lead-car headway screen, and a value over 300 is
// read as centimetres, otherwise metres (a car followed is 0.4-260 m away). Read only: nothing is ever sent.
const ACC_IF = 'de.bmw.dass.AssistedDrivingViewFunctionInput', ACC_EV = 'assistedDrivingViewFunctionInputIbVip';
const OBJ_IF = 'de.bmw.dass.pad.communication.ObjectListSuAAR', OBJ_EV = 'suAARObjectList';
const SOURCES = [[ACC_IF, ACC_EV], [OBJ_IF, OBJ_EV]];
const STALE_MS = 3000;
const isNum = (v) => typeof v === 'number' && isFinite(v);
const nameOf = (v) => (v && typeof v === 'object' ? (v.name !== undefined ? v.name : v.value) : v);
// the first value under key, however deep the binding wraps it
function find(v, key, depth) {
    if (!v || typeof v !== 'object' || (depth || 0) > 6) return undefined;
    if (Object.prototype.hasOwnProperty.call(v, key)) return v[key];
    for (const k of Object.keys(v)) { const r = find(v[k], key, (depth || 0) + 1); if (r !== undefined) return r; }
    return undefined;
}
function objectsIn(v, out, depth) {
    out = out || [];
    if (Array.isArray(v)) v.forEach((e) => objectsIn(e, out, (depth || 0) + 1));
    else if (v && typeof v === 'object' && (depth || 0) < 6) {
        if ('objectID' in v && v.objectPosition) out.push(v);
        else Object.keys(v).forEach((k) => objectsIn(v[k], out, (depth || 0) + 1));
    }
    return out;
}
/** A raw position as metres: over 300 centimetres, else metres. */
const metres = (raw) => (isNum(raw) ? (Math.abs(raw) > 300 ? raw * 0.01 : raw) : null);
// our lane: EGO (or the enum's number 3), or, without an assignment, within 1.6 m to the side
function ourLane(lane, y) {
    const n = nameOf(lane);
    if (typeof n === 'string') return n === 'EGO';
    if (isNum(n)) return n === 3;
    return isNum(y) && Math.abs(y) < 1.6;
}
/** The object list as [{id, x, y, ours, rawX, rawY}] (x, y in metres), only those ahead. */
function decodeObjects(v) {
    return objectsIn(v).map((o) => {
        const p = o.objectPosition || {}, x = metres(p.x), y = metres(p.y);
        return { id: o.objectID, x, y, ours: ourLane((o.objectPrediction || {}).laneAssignment, y), rawX: p.x, rawY: p.y };
    }).filter((o) => isNum(o.x) && o.x > 0 && o.x < 260);
}
/** The cruise control's part: {target, distance (raw), state (raw)}. */
function decodeAcc(v) {
    return { target: find(v, 'assistedDrivingViewACCTargetObjectId'), distance: find(v, 'assistedDrivingViewACCTargetDistance'), state: nameOf(find(v, 'assistedDrivingViewStateXcc')) };
}
/** The car followed: the cruise control's target, else the nearest in our lane; null: none. */
function pickLead(list, target) {
    if (isNum(target) && target > 0) { const t = list.find((o) => o.id === target); if (t) return t; }
    return list.filter((o) => o.ours).sort((a, b) => a.x - b.x)[0] || null;
}

class AssistView {
    // onLead(metres, id, now) / onNone(now): the car followed, or none, each time the object list comes
    constructor(signals, log, instanceOf, clock, onLead, onNone) {
        this.signals = signals; this.log = log || { warn() {}, info() {} }; this.instanceOf = instanceOf || (() => '1'); this.clock = clock || Date.now;
        this.onLead = onLead || (() => {}); this.onNone = onNone || (() => {});
        this.subs = {}; this.instances = {}; this.state = 'off'; this.token = 0; this.received = { acc: 0, objects: 0 }; this.acc = null; this.accAt = null;
        this.raw = { objects: null, lead: null, target: null, accDistance: null, accState: null }; this.leadAt = null;
    }
    sync(on) {
        if (!on) { if (this.state !== 'off') { this.token++; Object.keys(this.subs).forEach((k) => { try { this.subs[k].shutdown(); } catch (e) {} }); this.subs = {}; } this.state = 'off'; return; }
        if (this.state !== 'off') return;
        const token = ++this.token, wanted = SOURCES.filter(([iface]) => { try { return !!this.signals.loadConfig(iface); } catch (e) { return false; } });
        if (!wanted.length) { this.state = 'not_installed'; return; }
        this.state = 'subscribed'; this.startedAt = this.clock();
        wanted.forEach(([iface, ev]) => {
            const h = {}; h[ev] = (v) => { if (token === this.token) (iface === ACC_IF ? this.sampleAcc(v, this.clock()) : this.sampleObjects(v, this.clock())); };
            const inst = String(this.instanceOf(iface) || '1'); this.instances[iface] = inst;
            Promise.resolve().then(() => this.signals.watch(iface, inst, h, this.log, {})).then((s) => {
                if (token !== this.token) { try { s.shutdown(); } catch (e) {} return; }
                this.subs[iface] = s;
            }, (e) => { if (token === this.token) this.error = String(e && e.message || e).slice(0, 120); });
        });
    }
    sampleAcc(v, now) {
        this.received.acc++; const a = decodeAcc(v); this.acc = a; this.accAt = now;
        this.raw.target = a.target === undefined ? null : a.target; this.raw.accDistance = a.distance === undefined ? null : a.distance; this.raw.accState = a.state === undefined ? null : a.state;
    }
    sampleObjects(v, now) {
        this.received.objects++;
        const list = decodeObjects(v), target = this.acc && this.accAt !== null && now - this.accAt < STALE_MS ? this.acc.target : null, lead = pickLead(list, target);
        this.raw.objects = list.length; this.raw.lead = lead ? { id: lead.id, x: lead.rawX, y: lead.rawY } : null;
        if (lead) { this.leadAt = now; this.onLead(lead.x, isNum(lead.id) ? lead.id : null, now); } else this.onNone(now);
    }
    status() {
        const offered = Object.keys(this.subs).filter((k) => this.subs[k] && this.subs[k].available).length;
        // each source (1.3.69): offered to the app or not, and on which instance; null: not subscribed (not in the catalog)
        const one = (iface) => this.subs[iface] ? { offered: !!this.subs[iface].available, instance: this.instances[iface] || null, error: this.subs[iface].error || null } : null;
        return { state: this.state, offered, sources: Object.keys(this.subs).length, acc: one(ACC_IF), objects: one(OBJ_IF), received: Object.assign({}, this.received), raw: Object.assign({}, this.raw) };
    }
}
module.exports = { AssistView, decodeObjects, decodeAcc, pickLead, metres, SOURCES, ACC_IF, ACC_EV, OBJ_IF, OBJ_EV };
