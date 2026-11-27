'use strict';
// redline-lead 0.4.0: the scene clips for a phone on the car's Wi-Fi (the same network the GIF player's phone page
// uses, wlan_bridge). Only while recording is on: a small read-only web page on PORT (the list, each clip, all of them
// in one file) and one firewall rule of its own (tagged TAG) letting local addresses on wlan_bridge reach that port;
// the rule goes when recording is turned off or the helper stops. Nothing can be sent to the car through it.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), child = require('child_process');
const PORT = 18884, IFACE = 'wlan_bridge', TAG = 'redline-lead-clips';
const LOCAL = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'], CHAIN = ['ip', 'filter', 'input'];
function nft(args) { return new Promise((resolve, reject) => child.execFile('nft', args, { timeout: 3000 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim())) : resolve(String(out))))); }
async function ruleOff() {
    const out = await nft(['-a', 'list', 'chain'].concat(CHAIN));
    const handles = out.split('\n').filter((l) => l.indexOf('comment "' + TAG + '"') >= 0).map((l) => (/# handle (\d+)\s*$/.exec(l) || [])[1]).filter(Boolean);
    for (const h of handles) await nft(['delete', 'rule'].concat(CHAIN, ['handle', h]));
}
async function ruleOn() {
    await ruleOff().catch(() => {});
    await nft(['insert', 'rule'].concat(CHAIN, ['iifname', '"' + IFACE + '"', 'ip', 'saddr', '{ ' + LOCAL.join(', ') + ' }', 'tcp', 'dport', String(PORT), 'accept', 'comment', '"' + TAG + '"']));
}
/** The head unit's address on the car's Wi-Fi, or null. */
function address() { const n = os.networkInterfaces()[IFACE] || []; const a = n.find((x) => x.family === 'IPv4' || x.family === 4); return a ? a.address : null; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
class Share {
    constructor(clips, log) { this.clips = clips; this.log = log || (() => {}); this.server = null; this.error = null; this.rule = null; }
    url() { const a = address(); return a && this.server ? 'http://' + a + ':' + PORT + '/' : null; }
    sync(on) {
        if (on && !this.server) {
            const s = http.createServer((q, r) => this.serve(q, r));
            s.on('error', (e) => { this.error = String(e.code || e.message); this.log('clips share: ' + this.error); });
            s.listen(PORT, '0.0.0.0'); this.server = s; this.error = null;
            ruleOn().then(() => { this.rule = 'on'; }, (e) => { this.rule = 'error: ' + e.message.slice(0, 80); this.log('clips firewall: ' + e.message); });
        } else if (!on && this.server) {
            try { this.server.close(); } catch (e) {} this.server = null;
            ruleOff().then(() => { this.rule = null; }, () => { this.rule = null; });
        }
    }
    serve(q, r) {
        const u = decodeURIComponent(String(q.url || '/').split('?')[0]), dir = this.clips.dir, list = this.clips.list();
        if (q.method !== 'GET') { r.writeHead(405); return r.end(); }
        if (u === '/all.jsonl') {
            r.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': 'attachment; filename="redline-clips.jsonl"' });
            list.forEach((c) => { try { r.write(fs.readFileSync(path.join(dir, c.name))); } catch (e) {} });
            return r.end();
        }
        // only a clip of the list (its name as listed: no other path can be asked for)
        const m = /^\/clip\/([^/]+\.jsonl)$/.exec(u);
        if (m && list.some((c) => c.name === m[1])) {
            r.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': "attachment; filename=\"clip.jsonl\"; filename*=UTF-8''" + encodeURIComponent(m[1]) });
            return fs.createReadStream(path.join(dir, m[1])).pipe(r);
        }
        if (u !== '/') { r.writeHead(404); return r.end(); }
        const kb = (n) => Math.max(1, Math.round(n / 1024)) + ' KB';
        r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        r.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Redline scene clips</title>' +
            '<style>body{font:16px sans-serif;background:#111;color:#eee;margin:16px}a{color:#5ab0ff}li{margin:8px 0}</style>' +
            '<h2>Cluster Redline 상황 기록 (' + list.length + ')</h2><p>번호순 · 지우기는 차 화면의 "기록 모두 지우기"</p><p><a href="/all.jsonl">모두 받기 (한 파일)</a></p><ul>' +
            list.slice().reverse().map((c) => '<li><a href="/clip/' + encodeURIComponent(c.name) + '">' + esc(c.name) + '</a> · ' + kb(c.size) + '</li>').join('') + '</ul>');
    }
    status() { return { url: this.url(), listening: !!this.server, rule: this.rule, error: this.error }; }
    stop() { this.sync(false); }
}
module.exports = { Share, PORT, IFACE, address };
