'use strict';
// The car ahead from the front camera's object list (1.3.73), for the HUD headway badge on cars that offer neither the
// radar's service nor the Drive assist view's sources to apps (the user's: all "not offered"), while the same camera's
// traffic sign recognition does reach the app. Two broadcasts of de.bmw.environmentalmodel.ObjectRecognitionFrontCamera2:
//   ObjectRecognition   numberOfObjects, eventDataQualifier, objectRecognitionInfo[20]: objectID (255 none),
//                       statusMeasurement (0 new, 1 measured, 2 predicted), classificationType (0 pedestrian, 1 cyclist,
//                       2 motorbike, 3 car, 4 truck / bus / van, 5 other vehicle, 6 unknown), drivingTubeMapping (1: in our
//                       lane; 2, 4 the lanes beside ...)
//   ObjectPosition      numberOfObjects, objectPositionInfo[20]: objectPositionInfoInvalidFlags (bits 0, 1: x, y not valid),
//                       positionX (metres ahead), positionY (metres to the side)
// The same object at the same index of both. The car followed: the nearest vehicle in our lane. The layout is the car's
// catalog's (as BimmerVision's published perception schema lists it; facts only, written anew). Read only.
const IFACE = 'de.bmw.environmentalmodel.ObjectRecognitionFrontCamera2', REC = 'ObjectRecognition', POS = 'ObjectPosition';
const PAIR_MS = 400, MIN_M = 0.4, MAX_M = 250;
const isNum = (v) => typeof v === 'number' && isFinite(v);
const nameOf = (v) => (v && typeof v === 'object' ? (v.name !== undefined ? v.name : v.value) : v);
function find(v, key, depth) {
    if (!v || typeof v !== 'object' || (depth || 0) > 6) return undefined;
    if (Object.prototype.hasOwnProperty.call(v, key)) return v[key];
    for (const k of Object.keys(v)) { const r = find(v[k], key, (depth || 0) + 1); if (r !== undefined) return r; }
    return undefined;
}
const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
const inLane = (t) => { const n = nameOf(t); return n === 1 || n === 'OBJECT_IN_EGO_LANE'; };
const VEHICLE = [2, 3, 4, 5, 6, 'BIKE_MOTORBIKE_MOPED', 'CAR_WITH_OR_WITHOUT_TRAILER', 'TRUCK_BUS_VAN', 'OTHER_VEHICLE_CUSTOMARY_ROAD_USER_ACCORDING_TO_SCENE_CATALOGUE', 'UNKNOWN'];
const MEASURED = [0, 1, 2, 'ELEMENT_MEASURED_FIRST_TIME_ELEMENT_NEW', 'ELEMENT_MEASURED', 'ELEMENT_PREDICTED'];
const BAD_QUALIFIER = [2, 255, 'EVENT_DATA_NOT_AVAILABLE', 'EVENT_DATA_INVALID_OR_TIMEOUT'];
/** The objects both lists describe: [{id, x, y, type, lane (in ours)}], only those with a valid place ahead. */
function objectsOf(rec, pos) {
    const n = Math.min(20, Number(find(rec, 'numberOfObjects')) || 0, Number(find(pos, 'numberOfObjects')) || 0);
    if (BAD_QUALIFIER.indexOf(nameOf(find(rec, 'eventDataQualifier'))) >= 0 || BAD_QUALIFIER.indexOf(nameOf(find(pos, 'eventDataQualifier'))) >= 0) return [];
    const a = asArray(find(rec, 'objectRecognitionInfo')), b = asArray(find(pos, 'objectPositionInfo')), out = [];
    for (let i = 0; i < n; i++) {
        const r = a[i], p = b[i];
        if (!r || !p) continue;
        const id = Number(nameOf(r.objectID)), flags = Number(p.objectPositionInfoInvalidFlags) || 0, x = Number(p.positionX), y = Number(p.positionY);
        if (id === 255 || (flags & 3) || !isNum(x) || !isNum(y) || MEASURED.indexOf(nameOf(r.statusMeasurement)) < 0) continue;
        out.push({ id, x, y, type: nameOf(r.classificationType), lane: inLane(r.drivingTubeMapping) });
    }
    return out;
}
/** The car followed: the nearest vehicle in our lane, MIN_M..MAX_M ahead; null: none. */
function leadOf(list) {
    return list.filter((o) => o.lane && o.x >= MIN_M && o.x <= MAX_M && VEHICLE.indexOf(o.type) >= 0).sort((p, q) => p.x - q.x)[0] || null;
}

class CameraObjects {
    // onLead(metres, id, now) / onNone(now): each time a matching pair of lists comes
    constructor(signals, log, instanceOf, clock, onLead, onNone) {
        this.signals = signals; this.log = log || { warn() {}, info() {} }; this.instanceOf = instanceOf || (() => '1'); this.clock = clock || Date.now;
        this.onLead = onLead || (() => {}); this.onNone = onNone || (() => {});
        this.sub = null; this.state = 'off'; this.token = 0; this.instance = null; this.startedAt = 0;
        this.received = { rec: 0, pos: 0 }; this.last = { rec: null, recAt: null, pos: null, posAt: null }; this.raw = { objects: null, lead: null };
    }
    sync(on) {
        if (!on) { if (this.state !== 'off') { this.token++; if (this.sub) { try { this.sub.shutdown(); } catch (e) {} } this.sub = null; } this.state = 'off'; return; }
        if (this.state !== 'off') return;
        let installed = false; try { installed = !!this.signals.loadConfig(IFACE); } catch (e) {}
        if (!installed) { this.state = 'not_installed'; return; }
        const token = ++this.token, h = {};
        h[REC] = (v) => { if (token === this.token) this.sample('rec', v, this.clock()); };
        h[POS] = (v) => { if (token === this.token) this.sample('pos', v, this.clock()); };
        this.state = 'subscribed'; this.startedAt = this.clock(); this.instance = String(this.instanceOf(IFACE) || '1');
        Promise.resolve().then(() => this.signals.watch(IFACE, this.instance, h, this.log, {})).then((s) => {
            if (token !== this.token) { try { s.shutdown(); } catch (e) {} return; }
            this.sub = s;
        }, (e) => { if (token === this.token) this.error = String(e && e.message || e).slice(0, 120); });
    }
    sample(kind, v, now) {
        this.received[kind]++; this.last[kind] = v; this.last[kind + 'At'] = now;
        const L = this.last;
        if (!L.rec || !L.pos || Math.abs(L.recAt - L.posAt) > PAIR_MS) return;
        const list = objectsOf(L.rec, L.pos), lead = leadOf(list);
        this.raw.objects = list.length; this.raw.lead = lead ? { id: lead.id, x: Math.round(lead.x * 10) / 10, y: Math.round(lead.y * 10) / 10, type: lead.type } : null;
        if (lead) this.onLead(lead.x, lead.id, now); else this.onNone(now);
    }
    status() {
        return { state: this.state, offered: this.sub ? !!this.sub.available : null, instance: this.instance, error: this.error || null,
            received: Object.assign({}, this.received), raw: Object.assign({}, this.raw) };
    }
}
module.exports = { CameraObjects, objectsOf, leadOf, IFACE, REC, POS };
