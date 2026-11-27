'use strict';
// redline-lead 0.8.0: Cluster Redline's logs for a phone, read only, while the app asks for it ({t: 'cmd', share: true,
// dir: its data folder}). A small page on PORT gives two files of that folder and nothing else:
//   nav-probe.log    what the navigation sent (Received turns → Record to a file)
//   road-alerts.log  the cut-in / pedestrian warnings recorded (QR log collection → Warning recording, Save a miss)
// each with its older part (<name>.1) put first, and both together as redline-logs.tar.gz. One firewall rule of its own
// (tagged TAG) lets private addresses reach that port; both go when the app stops asking or leaves. Nothing can be sent
// to the car. (0.4.0 served scene clips; 0.5.0-0.7.0 nav-probe.log only.)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), child = require('child_process');
// 18885: 18884 is the GIF player's (127.0.0.1, lending GIFs to Cluster Redline); sharing it, one of the two could not listen
const PORT = 18885, BRIDGE = 'wlan_bridge', TAG = 'redline-lead-share';
const LOCAL = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'], CHAIN = ['ip', 'filter', 'input'];
// the only folder: an OAP app's data folder; the only files in it
const DIR_OK = /^\/var\/opt\/public\/oap\/oap_\d+\/data$/;
const FILES = ['nav-probe.log', 'road-alerts.log'];
// (0.5.0's form, kept for the check: a file must be one of FILES in such a folder)
const ALLOWED = /^\/var\/opt\/public\/oap\/oap_\d+\/data\/(nav-probe|road-alerts)\.log$/;
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
/** The folder a command names (dir, or 0.5.0's file), or null when it is not an app's data folder. */
function folderOf(c) {
    if (c && typeof c.dir === 'string' && DIR_OK.test(c.dir)) return c.dir;
    if (c && typeof c.file === 'string' && ALLOWED.test(c.file)) return path.dirname(c.file);
    return null;
}
// a plain file only (no symlink, read without following one: root reads the app's folder), at most 8 MB; null otherwise
function readPlain(p) {
    let fd = null;
    try {
        fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        const st = fs.fstatSync(fd); if (!st.isFile() || st.size > 8 * 1024 * 1024) return null;
        const b = Buffer.alloc(st.size); let o = 0; while (o < b.length) { const n = fs.readSync(fd, b, o, b.length - o, o); if (!n) break; o += n; }
        return b.slice(0, o);
    } catch (e) { return null; } finally { if (fd !== null) try { fs.closeSync(fd); } catch (e) {} }
}
function sizePlain(p) { try { const st = fs.lstatSync(p); return st.isFile() ? st.size : null; } catch (e) { return null; } }
// a minimal ustar archive of [{name, data}]
function tar(entries) {
    const parts = [];
    entries.forEach((e) => {
        const h = Buffer.alloc(512), put = (s, o, n) => h.write(s, o, n, 'ascii'), oct = (v, n) => v.toString(8).padStart(n - 1, '0') + '\0';
        put(e.name, 0, 100); put(oct(0o644, 8), 100, 8); put(oct(0, 8), 108, 8); put(oct(0, 8), 116, 8); put(oct(e.data.length, 12), 124, 12);
        put(oct(Math.floor(Date.now() / 1000), 12), 136, 12); h.fill(' ', 148, 156); put('0', 156, 1); put('ustar\0', 257, 6); put('00', 263, 2);
        let sum = 0; for (let i = 0; i < 512; i++) sum += h[i]; put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
        parts.push(h, e.data, Buffer.alloc((512 - (e.data.length % 512)) % 512));
    });
    parts.push(Buffer.alloc(1024));
    return Buffer.concat(parts);
}
class Share {
    constructor(log) { this.log = log || (() => {}); this.server = null; this.dir = null; this.error = null; this.rule = null; }
    // c: the app's command ({share, dir} or 0.5.0's {share, file})
    sync(on, c) {
        const dir = on ? folderOf(c) : null;
        if (on && c && !dir) { this.error = 'folder not allowed'; on = false; }
        if (on && dir) this.dir = dir;
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
    // a log with its older part first; null when neither is there
    read(name) {
        if (!this.dir || FILES.indexOf(name) < 0) return null;
        const parts = [name + '.1', name].map((n) => readPlain(path.join(this.dir, n))).filter(Boolean);
        return parts.length ? Buffer.concat(parts) : null;
    }
    sizes() { const out = {}; FILES.forEach((n) => { let k = null; [n + '.1', n].forEach((p) => { const z = this.dir ? sizePlain(path.join(this.dir, p)) : null; if (z !== null) k = (k || 0) + z; }); out[n] = k; }); return out; }
    serve(q, r) {
        const u = String(q.url || '/').split('?')[0].replace(/^\//, '');
        if (q.method !== 'GET') { r.writeHead(405); return r.end(); }
        if (FILES.indexOf(u) >= 0) {
            const b = this.read(u); if (!b) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + u + '"', 'Content-Length': b.length });
            return r.end(b);
        }
        if (u === 'redline-logs.tar.gz') {
            const entries = FILES.map((n) => ({ name: n, data: this.read(n) })).filter((e) => e.data);
            if (!entries.length) { r.writeHead(404); return r.end(); }
            const gz = zlib.gzipSync(tar(entries));
            r.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': 'attachment; filename="redline-logs.tar.gz"', 'Content-Length': gz.length });
            return r.end(gz);
        }
        if (u !== '') { r.writeHead(404); return r.end(); }
        const s = this.sizes(), kb = (n) => Math.max(1, Math.round(n / 1024)) + ' KB';
        const row = (n, label) => '<p>' + label + '<br>' + (s[n] === null ? '<span class="no">아직 없음</span>' : '<a href="/' + n + '">' + n + ' 받기</a> · ' + kb(s[n])) + '</p>';
        const any = FILES.some((n) => s[n] !== null);
        r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        r.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redline logs</title>' +
            '<style>body{font:17px sans-serif;background:#111;color:#eee;margin:16px;line-height:1.5}a{color:#5ab0ff;font-size:20px}.no{color:#999}.all{display:inline-block;margin-top:8px;padding:10px 16px;border:1px solid #5ab0ff;border-radius:8px}</style>' +
            '<h2>Cluster Redline · QR 로그 수집</h2>' + row('nav-probe.log', '받은 회전 정보') + row('road-alerts.log', '끼어들기·보행자 경고 기록') +
            (any ? '<p><a class="all" href="/redline-logs.tar.gz">모두 받기 (redline-logs.tar.gz)</a></p>' : ''));
    }
    status() { const l = addresses(); return { listening: !!this.server, urls: this.server ? l.map((a) => ({ iface: a.iface, url: 'http://' + a.ip + ':' + PORT + '/' })) : [], sizes: this.dir ? this.sizes() : null, size: this.dir ? this.sizes()['nav-probe.log'] : null, rule: this.rule, error: this.error }; }
    stop() { this.sync(false); }
}
module.exports = { Share, PORT, ALLOWED, DIR_OK, FILES, addresses, tar, folderOf, readPlain };
