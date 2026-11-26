'use strict';
// The car ahead from Cluster Redline's root helper (native/redline-lead, a separate Store tool, 1.3.74). On the user's
// car the head unit's SOME/IP policy keeps the driving assistant's services from this app's uid ("not offered"), but
// uid 0 receives them: the front camera's object list and the radar's GapVehicleAhead. The helper subscribes them as
// root (read only) and serves what it decodes on /run/redline-lead/lead.sock, one JSON line at a time:
//   {t: 'lead', at, child, avail: {'0xf139': bool, ...}, cam: {rx, lead: {m, y, id, type} | null, n, at},
//    radar: {rx, front: {id, gapX, qualifier, ...} | null, gap: {qualifier, status, gap, ...} | null, at}}
// Without the helper (not installed): 'absent', tried again every 10 s while the badge is on.
const SOCK = '/run/redline-lead/lead.sock', RETRY_MS = 10000;
class LeadHelper {
    // onMessage(msg, now): each line; clock: the caller's monotonic ms
    constructor(onMessage, clock, connect) {
        this.onMessage = onMessage || (() => {}); this.clock = clock || Date.now;
        this.connect = connect || ((path) => require('net').connect(path));
        this.sock = null; this.state = 'off'; this.retryAt = 0; this.buf = ''; this.last = null; this.lastAt = null; this.lines = 0; this.on = false;
    }
    sync(on, now) {
        this.on = !!on;
        if (!on) { if (this.sock) { try { this.sock.destroy(); } catch (e) {} } this.sock = null; this.state = 'off'; return; }
        if (this.sock || (now !== undefined && now < this.retryAt)) return;
        let s; try { s = this.connect(SOCK); } catch (e) { this.state = 'absent'; this.retryAt = (now || 0) + RETRY_MS; return; }
        this.sock = s; this.state = 'connecting'; this.buf = '';
        s.on('connect', () => { if (this.sock === s) this.state = 'connected'; });
        s.on('data', (d) => {
            if (this.sock !== s) return; this.state = 'connected'; this.buf += d;
            let i; while ((i = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1); let m = null; try { m = JSON.parse(l); } catch (e) {} if (m && m.t === 'lead') { this.last = m; this.lastAt = this.clock(); this.lines++; try { this.onMessage(m, this.lastAt); } catch (e) {} } }
            if (this.buf.length > 65536) this.buf = '';
        });
        const gone = () => { if (this.sock !== s) return; this.sock = null; this.state = this.lines ? 'lost' : 'absent'; this.retryAt = this.clock() + RETRY_MS; };
        s.on('error', gone); s.on('close', gone);
    }
    status() {
        const m = this.last || {};
        return { state: this.state, lines: this.lines, child: m.child || null, avail: m.avail || {}, cam: m.cam ? { rx: m.cam.rx, n: m.cam.n, lead: m.cam.lead } : null,
            radar: m.radar ? { rx: m.radar.rx, gapX: m.radar.front ? m.radar.front.gapX : null, qualifier: m.radar.front ? m.radar.front.qualifier : null, id: m.radar.front ? m.radar.front.id : null } : null };
    }
}
module.exports = { LeadHelper, SOCK };
