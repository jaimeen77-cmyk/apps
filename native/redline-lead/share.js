'use strict';
// redline-lead 0.5.0: Cluster Redline's nav-probe.log (what the navigation sent, recorded while the user switches it on)
// for a phone, read only. While the app asks for it ({t: 'cmd', share: true, file}), a small page on PORT gives the
// file, and one firewall rule of its own (tagged TAG) lets private addresses reach that port; both go when the app
// stops asking or leaves. Only that one file of the app's data folder can ever be given; nothing can be sent to the car.
// (0.4.0 served scene clips; those are gone.)
const http = require('http'), fs = require('fs'), os = require('os'), child = require('child_process');
// 18885: 18884 is the GIF player's (127.0.0.1, lending GIFs to Cluster Redline); sharing it, one of the two could not listen
const PORT = 18885, BRIDGE = 'wlan_bridge', TAG = 'redline-lead-share';
const LOCAL = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'], CHAIN = ['ip', 'filter', 'input'];
// the only file that can be given: an OAP app's nav-probe.log
const ALLOWED = /^\/var\/opt\/public\/oap\/oap_\d+\/data\/nav-probe\.log$/;
function nft(args) { return new Promise((resolve, reject) => child.execFile('nft', args, { timeout: 3000 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim())) : resolve(String(out))))); }
async function ruleOff() {
    const out = await nft(['-a', 'list', 'chain'].concat(CHAIN));
    const handles = out.split('\n').filter((l) => /comment "redline-lead-(share|clips)"/.test(l)).map((l) => (/# handle (\d+)\s*$/.exec(l) || [])[1]).filter(Boolean);
    for (const h of handles) await nft(['delete', 'rule'].concat(CHAIN, ['handle', h]));
}
// any interface (the car's own Wi-Fi, or a Wi-Fi the car joined), private senders only
async function ruleOn() {
    await ruleOff().catch(() => {});
    await nft(['insert', 'rule'].concat(CHAIN, ['ip', 'saddr', '{ ' + LOCAL.join(', ') + ' }', 'tcp', 'dport', String(PORT), 'accept', 'comment', '"' + TAG + '"']));
}
const octets = (a) => String(a).split('.').map(Number);
const isPrivate = (a) => { const p = octets(a); return p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168); };
/** The head unit's private IPv4 addresses, the car's own Wi-Fi (wlan_bridge) first: [{iface, ip}]. */
function addresses() {
    let all = {}; try { all = os.networkInterfaces(); } catch (e) {}
    const list = [];
    Object.keys(all).forEach((n) => (all[n] || []).forEach((a) => { if ((a.family === 'IPv4' || a.family === 4) && !a.internal && isPrivate(a.address)) list.push({ iface: n, ip: a.address }); }));
    return list.sort((a, b) => (a.iface === BRIDGE ? 0 : 1) - (b.iface === BRIDGE ? 0 : 1)).filter((a, i, l) => l.findIndex((o) => o.ip === a.ip) === i);
}
class Share {
    constructor(log) { this.log = log || (() => {}); this.server = null; this.file = null; this.error = null; this.rule = null; }
    sync(on, file) {
        if (on && file && !ALLOWED.test(file)) { this.error = 'file not allowed'; on = false; }
        if (on) this.file = file;
        if (on && !this.server) {
            const s = http.createServer((q, r) => this.serve(q, r));
            s.on('error', (e) => { this.error = String(e.code || e.message); this.log('share: ' + this.error); });
            s.listen(PORT, '0.0.0.0'); this.server = s; this.error = null;
            ruleOn().then(() => { this.rule = 'on'; }, (e) => { this.rule = 'error: ' + e.message.slice(0, 80); this.log('share firewall: ' + e.message); });
        } else if (!on && this.server) {
            try { this.server.close(); } catch (e) {} this.server = null;
            ruleOff().then(() => { this.rule = null; }, () => { this.rule = null; });
        }
    }
    size() { try { return fs.statSync(this.file).size; } catch (e) { return null; } }
    serve(q, r) {
        const u = String(q.url || '/').split('?')[0];
        if (q.method !== 'GET') { r.writeHead(405); return r.end(); }
        const size = this.file ? this.size() : null;
        if (u === '/nav-probe.log') {
            if (size === null) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="nav-probe.log"' });
            return fs.createReadStream(this.file).pipe(r);
        }
        if (u !== '/') { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        r.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redline nav-probe</title>' +
            '<style>body{font:17px sans-serif;background:#111;color:#eee;margin:16px}a{color:#5ab0ff;font-size:20px}</style>' +
            '<h2>Cluster Redline · 받은 회전 정보 로그</h2>' + (size === null ? '<p>아직 기록이 없습니다 (차 화면: 길안내 표시 → 받은 회전 정보 → 파일로 기록 켜짐)</p>' :
            '<p><a href="/nav-probe.log">nav-probe.log 받기</a> · ' + Math.max(1, Math.round(size / 1024)) + ' KB</p>'));
    }
    status() { const l = addresses(); return { listening: !!this.server, urls: this.server ? l.map((a) => ({ iface: a.iface, url: 'http://' + a.ip + ':' + PORT + '/' })) : [], size: this.file ? this.size() : null, rule: this.rule, error: this.error }; }
    stop() { this.sync(false); }
}
module.exports = { Share, PORT, ALLOWED, addresses };
