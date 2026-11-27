#!/usr/bin/env node
'use strict';
// redline-lead (Cluster Redline's helper, root): the car ahead for the HUD headway badge on cars whose SOME/IP policy
// keeps the driving assistant's services from apps (Cluster Redline's uid sees them "not offered"; uid 0 receives them,
// tested on the user's car 2026-11-26). It runs redline-someip (our own subscriber, read only) and decodes:
//   0xF139 ObjectRecognitionFrontCamera2 (major 2, eventgroup 1)
//     0x8001 ObjectRecognition: length u16, counter u16, dataID u32, crc u32, timestamp {ns u32, s u32, sync u8},
//            eventDataQualifier u8, extendedQualifier u8, numberOfObjects u8, 20 x {statusMeasurement, statusMovement,
//            classificationType, modeLateral, drivingTubeMapping, objectID, referencePoint} (u8 each)
//     0x8002 ObjectPosition: the same header without extendedQualifier, numberOfObjects u8,
//            20 x {invalidFlags u8, positionX f32, positionY f32} (metres), then the dimensions
//   0x3539 GapVehicleAhead (major 1): 0x8001 GapVehicleDrivingAhead {qualifier, status, gap u8, type, lamp},
//            0x8002 DataFrontVehicle {objectID u8, speedX, speedY, gapX, gapY u16, qualifier, extQualifier}
// all big endian (SOME/IP); the layouts are the car's catalog's (as BimmerVision's published schema lists them), the
// length fields checked against them. The car followed: the nearest vehicle the camera puts in our lane.
//   0xD024 LaneBoundaries (0.2.0): the lane lines the camera sees (decodeLanes)
// 0.3.0: also every object the camera measures (cam.objects: id, class, place, lane), not only the car followed: for
// Cluster Redline's lead car departure (the car in front when the camera's lane is unknown) and the warnings to come
// 0.6.0: the car's GPS position while the app asks for it ({t: 'cmd', position: true}): 0xFB0C Positioning (major 4,
// instance 128 = Main_Instance; tested on the user's car 2026-11-28: offered to uid 0, not to the app),
//   0x8001 currentLocation (eventgroup 1, a field: PositioningTypes.CurrentLocation, the map-matched position)
//   0x8004 rawPositionData (eventgroup 4: RawGNSSPositionData {fixType, utcDateTime, heading, position})
// each holding a Wgs84Coordinate3D {coordinatesValid bool, heightValid bool, longitude double, latitude double, height}
// (decodeWgs finds it). A second redline-someip runs only while asked; the position is never written anywhere.
// Serves /run/redline-lead/lead.sock (0666, JSON lines). Subscribes only while a client is connected.
const net = require('net'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const DIR = process.env.REDLINE_LEAD_DIR || '/run/redline-lead', SOCK = path.join(DIR, 'lead.sock');
const BIN = process.env.REDLINE_SOMEIP || path.join(__dirname, 'redline-someip');
// 0.5.0: the app's nav-probe.log for a phone (share.js), while the app asks for it (0.4.0's scene clips are gone)
const VERSION = '0.6.0', { Share } = require('./share');
const SPECS = ['0xf139:1:2:1:0x8001,0x8002', '0x3539:1:1:1:0x8001:f', '0x3539:1:1:2:0x8002:f', '0xd024:1:1:3:0x8003'];
const POS_SPECS = ['0xfb0c:128:4:1:0x8001:f', '0xfb0c:128:4:4:0x8004:f'];
const VEHICLE = [2, 3, 4, 5, 6], MEASURED = [0, 1, 2], IDLE_STOP_MS = 15000, SEND_MS = 100;
const log = (s) => { try { process.stdout.write(new Date().toISOString() + ' ' + s + '\n'); } catch (e) {} };

function decodeRecognition(b) {
    if (b.length < 24) return null;
    const n = Math.min(20, b[23]), out = [];
    for (let i = 0; i < n && 24 + i * 7 + 7 <= b.length; i++) { const o = 24 + i * 7;
        out.push({ status: b[o], movement: b[o + 1], type: b[o + 2], lateral: b[o + 3], tube: b[o + 4], id: b[o + 5], ref: b[o + 6] }); }
    return { ns: b.readUInt32BE(12), s: b.readUInt32BE(16), qualifier: b[21], ext: b[22], n, objects: out };
}
function decodePosition(b) {
    if (b.length < 23) return null;
    const n = Math.min(20, b[22]), out = [];
    for (let i = 0; i < n && 23 + i * 9 + 9 <= b.length; i++) { const o = 23 + i * 9;
        out.push({ flags: b[o], x: b.readFloatBE(o + 1), y: b.readFloatBE(o + 5) }); }
    return { ns: b.readUInt32BE(12), s: b.readUInt32BE(16), qualifier: b[21], n, objects: out };
}
function decodeFront(b) {
    if (b.length < 11) return null;
    return { id: b[0], speedX: b.readUInt16BE(1), speedY: b.readUInt16BE(3), gapX: b.readUInt16BE(5), gapY: b.readUInt16BE(7), qualifier: b[9], ext: b[10] };
}
// 0xD024 LaneBoundaries (0.2.0), eventgroup 3, event 0x8003: length u16, counter u16, dataID u32, crc u32, timestamp u32,
// eventDataQualifier u8, extendedQualifier u8, laneRecognitionFront {flags u8, widthEgoLane f32, routing u8, visibility u8},
// laneBoundaryFront 4 x 53 bytes {flags u8, status u8, existence f32, vCurv f32, vCurvChange f32, modelQualifier u8,
// point {flags u8, x f32, y f32}, base {flags u8, angle f32, curvature f32}, seg1 {flags u8, curvChange f32, validLength f32},
// seg2 {...}, id u8, accuracy u8}, laneBoundaryPropertiesFront 4 x 34 bytes {flags u8, width f32, typeInfo {flags u8, type u8,
// existence f32, elevated u8, elevation f32, entranceExit u8, pattern {flags u8, length f32, ratio f32}}, mergeSplit {flags u8,
// kind u8, distance f32, toID u8}, color u8}, then the rear boundaries and the deviations (not read). 1193 bytes (length 1201,
// checked on the user's car). y: metres to the left of the car's axis at x metres ahead.
function decodeLanes(b) {
    if (b.length < 373) return null;
    const lines = [];
    for (let i = 0; i < 4; i++) {
        const o = 25 + i * 53, q = 237 + i * 34;
        const line = { status: b[o + 1], existence: b.readFloatBE(o + 2), model: b[o + 14], x: b.readFloatBE(o + 16), y: b.readFloatBE(o + 20),
            angle: b.readFloatBE(o + 25), curvature: b.readFloatBE(o + 29), length: b.readFloatBE(o + 38), id: b[o + 51],
            type: b[q + 6], color: b[q + 33], pflags: b[q], width: b.readFloatBE(q + 1) };
        if (line.model >= 2 || line.status > 5 || !isFinite(line.y) || Math.abs(line.y) > 10 || !(line.existence > 0.3)) continue;
        Object.keys(line).forEach((k) => { if (typeof line[k] === 'number' && !Number.isInteger(line[k])) line[k] = Math.round(line[k] * 1000) / 1000; });
        lines.push(line);
    }
    return { qualifier: b[16], ext: b[17], width: Math.round(b.readFloatBE(19) * 100) / 100, routing: b[23], visibility: b[24], lines };
}
/** Every object the camera measures now (0.3.0): {id, type, x (m ahead), y (m left), tube (1 our lane, 2 / 4 the lanes
 *  beside ...), mv (statusMovement), lat (modeLateral)}; the same instant's two lists, as leadOf. */
function objectsOf(rec, pos) {
    if (!rec || !pos || rec.ns !== pos.ns || rec.s !== pos.s || rec.qualifier >= 2 || pos.qualifier >= 2) return [];
    const out = [];
    for (let i = 0; i < Math.min(rec.objects.length, pos.objects.length); i++) {
        const r = rec.objects[i], p = pos.objects[i];
        if (r.id === 255 || MEASURED.indexOf(r.status) < 0 || (p.flags & 3) || !isFinite(p.x) || !isFinite(p.y) || p.x < -5 || p.x > 250) continue;
        out.push({ id: r.id, type: r.type, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, tube: r.tube, mv: r.movement, lat: r.lateral });
    }
    return out.sort((a, b) => a.x - b.x);
}
function decodeGap(b) { return b.length < 5 ? null : { qualifier: b[0], status: b[1], gap: b[2], type: b[3], lamp: b[4] }; }
/** The nearest vehicle the camera puts in our lane: {m, y, id, type, n} or null; the pair must be of one instant. */
function leadOf(rec, pos) {
    if (!rec || !pos || rec.ns !== pos.ns || rec.s !== pos.s || rec.qualifier >= 2 || pos.qualifier >= 2) return null;
    let best = null;
    for (let i = 0; i < Math.min(rec.objects.length, pos.objects.length); i++) {
        const r = rec.objects[i], p = pos.objects[i];
        if (r.id === 255 || MEASURED.indexOf(r.status) < 0 || r.tube !== 1 || VEHICLE.indexOf(r.type) < 0 || (p.flags & 3)) continue;
        if (!isFinite(p.x) || p.x < 0.4 || p.x > 250) continue;
        if (!best || p.x < best.m) best = { m: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, id: r.id, type: r.type };
    }
    return best;
}
// A Wgs84Coordinate3D inside b: {lat, lon, valid, off, endian} or null. The first place where a bool byte, a bool byte,
// then two doubles read as a longitude and a latitude on Earth (not 0 / 0); big endian (SOME/IP) first.
function decodeWgs(b) {
    if (!b || b.length < 18) return null;
    // coordinatesValid set first (a fix), then any; big endian first
    for (const valid of [1, 0]) for (const be of [true, false]) {
        for (let o = 0; o + 18 <= b.length; o++) {
            if (b[o] !== valid || b[o + 1] > 1) continue;
            const lon = be ? b.readDoubleBE(o + 2) : b.readDoubleLE(o + 2), lat = be ? b.readDoubleBE(o + 10) : b.readDoubleLE(o + 10);
            // on Earth, both away from 0 (other bytes read as doubles are mostly tiny, huge or not numbers)
            if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || Math.abs(lat) < 1e-4 || Math.abs(lon) < 1e-4) continue;
            return { lat, lon, valid: valid === 1, off: o, endian: be ? 'be' : 'le' };
        }
    }
    return null;
}

const state = { lane: { rx: 0, data: null, at: null }, cam: { rx: 0, lead: null, n: null, at: null, objects: [] }, radar: { rx: 0, front: null, gap: null, at: null }, avail: {}, child: 'off', error: null,
    position: { on: false, child: 'off', rx: 0, avail: null, map: null, raw: null } };
const share = new Share(log);
let posChild = null, posBuf = '', posWanted = false, child = null, buf = '', rec = null, pos = null, clients = new Set(), stopTimer = null, sendTimer = null, restartTimer = null;
function onLine(l) {
    const p = l.split(' ');
    if (p[0] === 'ok') { state.child = 'registered'; return; }
    if (p[0] === 'av') { state.avail[p[1]] = p[3] === '1'; return; }
    if (p[0] === 'error') { state.error = l.slice(0, 120); return; }
    if (p[0] !== 'ev' || p.length < 4) return;
    let b; try { b = Buffer.from(p[3], 'hex'); } catch (e) { return; }
    const now = Date.now();
    if (p[1] === '0xf139') {
        state.cam.rx++;
        if (p[2] === '0x8001') rec = decodeRecognition(b); else if (p[2] === '0x8002') pos = decodePosition(b);
        if (rec && pos && rec.ns === pos.ns && rec.s === pos.s) { state.cam.lead = leadOf(rec, pos); state.cam.objects = objectsOf(rec, pos); state.cam.n = rec.n; state.cam.at = now; }
    } else if (p[1] === '0xd024') {
        state.lane.rx++; if (p[2] === '0x8003') { state.lane.data = decodeLanes(b); state.lane.at = now; }
    } else if (p[1] === '0x3539') {
        state.radar.rx++; state.radar.at = now;
        if (p[2] === '0x8002') state.radar.front = decodeFront(b); else if (p[2] === '0x8001') state.radar.gap = decodeGap(b);
    }
    schedule();
}
function onPosLine(l) {
    const p = l.split(' '), P = state.position;
    if (p[0] === 'ok') { P.child = 'registered'; return; }
    if (p[0] === 'av') { if (p[1] === '0xfb0c') P.avail = p[3] === '1'; return; }
    if (p[0] === 'error') { P.child = 'error'; return; }
    if (p[0] !== 'ev' || p.length < 4 || p[1] !== '0xfb0c') return;
    let b; try { b = Buffer.from(p[3], 'hex'); } catch (e) { return; }
    P.rx++; const w = decodeWgs(b), at = Date.now();
    const v = w ? { lat: w.lat, lon: w.lon, valid: w.valid, off: w.off, endian: w.endian, len: b.length, at } : { lat: null, lon: null, valid: false, len: b.length, at };
    if (p[2] === '0x8001') P.map = v; else if (p[2] === '0x8004') { v.fix = b[0] <= 3 ? b[0] : null; P.raw = v; }
    schedule();
}
function startPos() {
    if (posChild) return;
    try { posChild = spawn(BIN, POS_SPECS, { stdio: ['pipe', 'pipe', 'inherit'] }); } catch (e) { state.position.child = 'error'; return; }
    const c = posChild; state.position.child = 'starting'; posBuf = '';
    c.stdout.on('data', (d) => { if (posChild !== c) return; posBuf += d; let i; while ((i = posBuf.indexOf('\n')) >= 0) { const l = posBuf.slice(0, i); posBuf = posBuf.slice(i + 1); onPosLine(l.trim()); } if (posBuf.length > 1e6) posBuf = ''; });
    c.on('error', () => { state.position.child = 'error'; });
    c.on('exit', () => { if (posChild === c) { posChild = null; state.position.child = 'off'; } });
}
function stopPos() { const c = posChild; posChild = null; state.position.child = 'off'; state.position.map = null; state.position.raw = null; state.position.rx = 0; state.position.avail = null;
    if (!c) return; try { c.stdin.end(); } catch (e) {} setTimeout(() => { try { c.kill('SIGTERM'); } catch (e) {} }, 1000); }
// the app asks again every second while it wants the position; 5 s without asking ends it
let posAskedAt = 0;
function syncPos(on) { posWanted = on; state.position.on = on; if (on) { posAskedAt = Date.now(); startPos(); } else stopPos(); }
function startChild() {
    if (child) return;
    try { child = spawn(BIN, SPECS, { stdio: ['pipe', 'pipe', 'inherit'] }); } catch (e) { state.error = String(e.message || e); return; }
    state.child = 'starting'; buf = ''; rec = null; pos = null;
    child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); onLine(l.trim()); } if (buf.length > 1e6) buf = ''; });
    child.on('error', (e) => { state.error = String(e.message || e); });
    child.on('exit', (c) => { log('redline-someip exited ' + c); child = null; state.child = 'off';
        if (clients.size && !restartTimer) restartTimer = setTimeout(() => { restartTimer = null; if (clients.size) startChild(); }, 5000); });
    log('redline-someip started');
}
function stopChild() { if (!child) return; try { child.stdin.end(); } catch (e) {} const c = child; setTimeout(() => { try { c.kill('SIGTERM'); } catch (e) {} }, 1000); }
function message() { return JSON.stringify({ t: 'lead', v: VERSION, at: Date.now(), child: state.child, error: state.error, avail: state.avail, cam: state.cam, radar: state.radar, lane: state.lane, share: share.status(), position: state.position.on ? state.position : undefined }) + '\n'; }
// the app's commands (0.5.0), one JSON line each: {t: 'cmd', share: bool, file: its nav-probe.log}
function command(l) { let c = null; try { c = JSON.parse(l); } catch (e) { return; } if (!c || c.t !== 'cmd') return;
    if (typeof c.share === 'boolean') share.sync(c.share, typeof c.file === 'string' ? c.file : null);
    if (typeof c.position === 'boolean') syncPos(c.position); }
function schedule() { if (sendTimer || !clients.size) return; sendTimer = setTimeout(() => { sendTimer = null; const m = message(); clients.forEach((s) => { try { s.write(m); } catch (e) {} }); }, SEND_MS); }

function serve() {
    try { fs.mkdirSync(DIR); } catch (e) {}   // (systemd's RuntimeDirectory makes it; Node 8 has no recursive)
    try { fs.unlinkSync(SOCK); } catch (e) {}
    const server = net.createServer((s) => {
        clients.add(s); if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } startChild(); s.write(message());
        let cb = ''; s.on('error', () => {}); s.on('data', (d) => { cb += d; let i; while ((i = cb.indexOf('\n')) >= 0) { const l = cb.slice(0, i); cb = cb.slice(i + 1); command(l); } if (cb.length > 65536) cb = ''; });
        s.on('close', () => { clients.delete(s); if (!clients.size && !stopTimer) stopTimer = setTimeout(() => { stopTimer = null; if (!clients.size) { stopChild(); share.sync(false); syncPos(false); } }, IDLE_STOP_MS); });
    });
    server.listen(SOCK, () => { try { fs.chmodSync(SOCK, 0o666); } catch (e) {} log('listening ' + SOCK); });
    setInterval(() => { if (clients.size) schedule(); if (posWanted && Date.now() - posAskedAt > 5000) syncPos(false); }, 1000);   // a heartbeat with the counts, also when nothing comes
    const bye = () => { stopChild(); stopPos(); share.stop(); try { fs.unlinkSync(SOCK); } catch (e) {} setTimeout(() => process.exit(0), 300); };
    process.on('SIGTERM', bye); process.on('SIGINT', bye);
}
if (require.main === module) serve();
module.exports = { VERSION, decodeRecognition, decodePosition, decodeFront, decodeGap, decodeLanes, leadOf, objectsOf, decodeWgs, SPECS, POS_SPECS };
