'use strict';
// Cluster Redline "My picture" layout: checks your three GIFs and copies them to the car.
//   node tools/my-pictures.js --source <folder>                                   check only
//   node tools/my-pictures.js --source <folder> --car <ip> --key <ssh key file>   check, then copy
// The folder holds stop.gif (standing still), drive.gif (moving forward) and reverse.gif (reverse gear); any of
// them may be left out (the layout then shows its own picture for that scene).
// Limits (as the car reads them, apps/cluster_redline/my-picture.js): 400 x 225 pixels, 20 frames, 1 MB a file.
// Recommended: 320 x 180 (16:9), 10-16 frames, under 500 KB. Frames play at their GIF delays, at most 10 a second.
// Copying uses your existing car SSH connection (root@<ip>, the same key as tools/collect-cluster-redline.ps1)
// into every installed Cluster Redline's data folder, /var/opt/public/oap/oap_*/data/my-pictures/ (the app makes
// it at start). The key file is only passed to ssh / scp; nothing reads or stores it. Nothing else on the car changes.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const GIF = require('../apps/cluster_redline/gif-decode');
const { LIMIT, NAMES } = require('../apps/cluster_redline/my-picture');
const SCENE = { stop: 'standing still', drive: 'moving forward', reverse: 'reverse gear' };

function args(argv) { const o = {}; for (let i = 2; i < argv.length; i++) { const m = /^--(\w+)$/.exec(argv[i]); if (m) o[m[1]] = argv[i + 1] && !/^--/.test(argv[i + 1]) ? argv[++i] : true; } return o; }
function check(file) {
    if (!fs.existsSync(file)) return { ok: false, missing: true, why: 'not there (the layout shows its own picture)' };
    const buf = fs.readFileSync(file), kb = Math.round(buf.length / 1024), p = GIF.probe(buf);
    if (!p) return { ok: false, why: 'not a GIF file' };
    const facts = p.w + ' x ' + p.h + ', ' + p.frames + ' frames, ' + kb + ' KB';
    if (buf.length > LIMIT.maxBytes) return { ok: false, why: facts + ': over 1 MB' };
    if (p.w > LIMIT.maxW || p.h > LIMIT.maxH) return { ok: false, why: facts + ': larger than ' + LIMIT.maxW + ' x ' + LIMIT.maxH + ' (shrink it, e.g. to 320 x 180)' };
    try { GIF.decode(buf, LIMIT); } catch (e) { return { ok: false, why: facts + ': cannot be read (' + e.message + ')' }; }
    const notes = [];
    if (p.frames > LIMIT.maxFrames) notes.push('only the first ' + LIMIT.maxFrames + ' frames play');
    if (Math.abs(p.w / p.h - 16 / 9) > 0.05) notes.push('not 16:9, shown letterboxed');
    if (buf.length > 500 * 1024) notes.push('over the recommended 500 KB');
    return { ok: true, why: facts + (notes.length ? ' (' + notes.join('; ') + ')' : '') };
}
function main() {
    const o = args(process.argv);
    if (!o.source || o.source === true) { console.log('usage: node tools/my-pictures.js --source <folder> [--car <ip> --key <ssh key file>]'); process.exit(2); }
    const src = path.resolve(o.source), results = {};
    console.log('My picture GIFs in ' + src + ':');
    NAMES.forEach((n) => { const r = check(path.join(src, n + '.gif')); results[n] = r; console.log('  ' + (r.ok ? 'OK  ' : r.missing ? '--  ' : 'NO  ') + n + '.gif (' + SCENE[n] + '): ' + r.why); });
    const send = NAMES.filter((n) => results[n].ok);
    if (NAMES.some((n) => !results[n].ok && !results[n].missing)) { console.log('Fix the files marked NO first.'); process.exit(1); }
    if (!o.car) { console.log(send.length ? 'All good. Add --car <ip> --key <ssh key file> to copy them to the car.' : 'No GIFs to copy.'); return; }
    if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(String(o.car))) { console.log('--car must be the IPv4 address of your car SSH connection.'); process.exit(2); }
    if (!o.key || !fs.existsSync(String(o.key))) { console.log('--key must point to your existing SSH private key file.'); process.exit(2); }
    if (!send.length) { console.log('No GIFs to copy.'); return; }
    const ssh = ['-i', path.resolve(String(o.key)), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'], host = 'root@' + o.car;
    const ls = spawnSync('ssh', ssh.concat([host, 'ls -d /var/opt/public/oap/oap_*/data/my-pictures 2>/dev/null']), { encoding: 'utf8' });
    if (ls.status !== 0 && !ls.stdout) { console.log('SSH failed: ' + (ls.stderr || '').trim() + '\nCheck your normal car SSH connection first.'); process.exit(1); }
    const dirs = ls.stdout.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\/var\/opt\/public\/oap\/oap_[^/]+\/data\/my-pictures$/.test(s));
    if (!dirs.length) { console.log('No my-pictures folder on the car: install Cluster Redline 1.3.49 or later and start it once.'); process.exit(1); }
    dirs.forEach((d) => {
        const cp = spawnSync('scp', ssh.concat(send.map((n) => path.join(src, n + '.gif')).concat([host + ':' + d + '/'])), { encoding: 'utf8' });
        console.log((cp.status === 0 ? 'Copied ' : 'Copy FAILED ') + send.map((n) => n + '.gif').join(', ') + ' to ' + d + (cp.status === 0 ? '' : ': ' + (cp.stderr || '').trim()));
    });
    console.log('The car picks them up within 5 seconds (choose the My picture layout in Redline app layouts).');
}
main();
