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
// Serves /run/redline-lead/lead.sock (0666, JSON lines). Subscribes only while a client is connected.
const net = require('net'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const DIR = process.env.REDLINE_LEAD_DIR || '/run/redline-lead', SOCK = path.join(DIR, 'lead.sock');
const BIN = process.env.REDLINE_SOMEIP || path.join(__dirname, 'redline-someip');
const SPECS = ['0xf139:1:2:1:0x8001,0x8002', '0x3539:1:1:1:0x8001:f', '0x3539:1:1:2:0x8002:f'];
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

const state = { cam: { rx: 0, lead: null, n: null, at: null }, radar: { rx: 0, front: null, gap: null, at: null }, avail: {}, child: 'off', error: null };
let child = null, buf = '', rec = null, pos = null, clients = new Set(), stopTimer = null, sendTimer = null, restartTimer = null;
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
        if (rec && pos && rec.ns === pos.ns && rec.s === pos.s) { state.cam.lead = leadOf(rec, pos); state.cam.n = rec.n; state.cam.at = now; }
    } else if (p[1] === '0x3539') {
        state.radar.rx++; state.radar.at = now;
        if (p[2] === '0x8002') state.radar.front = decodeFront(b); else if (p[2] === '0x8001') state.radar.gap = decodeGap(b);
    }
    schedule();
}
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
function message() { return JSON.stringify({ t: 'lead', at: Date.now(), child: state.child, error: state.error, avail: state.avail, cam: state.cam, radar: state.radar }) + '\n'; }
function schedule() { if (sendTimer || !clients.size) return; sendTimer = setTimeout(() => { sendTimer = null; const m = message(); clients.forEach((s) => { try { s.write(m); } catch (e) {} }); }, SEND_MS); }

function serve() {
    try { fs.mkdirSync(DIR); } catch (e) {}   // (systemd's RuntimeDirectory makes it; Node 8 has no recursive)
    try { fs.unlinkSync(SOCK); } catch (e) {}
    const server = net.createServer((s) => {
        clients.add(s); if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; } startChild(); s.write(message());
        s.on('error', () => {}); s.on('data', () => {});
        s.on('close', () => { clients.delete(s); if (!clients.size && !stopTimer) stopTimer = setTimeout(() => { stopTimer = null; if (!clients.size) stopChild(); }, IDLE_STOP_MS); });
    });
    server.listen(SOCK, () => { try { fs.chmodSync(SOCK, 0o666); } catch (e) {} log('listening ' + SOCK); });
    setInterval(() => { if (clients.size) schedule(); }, 1000);   // a heartbeat with the counts, also when nothing comes
    const bye = () => { stopChild(); try { fs.unlinkSync(SOCK); } catch (e) {} setTimeout(() => process.exit(0), 300); };
    process.on('SIGTERM', bye); process.on('SIGINT', bye);
}
if (require.main === module) serve();
module.exports = { decodeRecognition, decodePosition, decodeFront, decodeGap, leadOf, SPECS };
