#!/usr/bin/env node
'use strict';
// redline-lead's camera objects recorded for a while (0.3.0), to see how pedestrians, cyclists and cut-ins come on the
// car: node log-objects.js [seconds=20] [file=/var/opt/public/redline-objects.log]. Each line: the time, then the
// objects (id, class, x ahead, y left, lane) and the car followed. It only reads the helper's socket (read only).
const net = require('net'), fs = require('fs');
const secs = Number(process.argv[2]) || 20, file = process.argv[3] || '/var/opt/public/redline-objects.log';
const out = fs.createWriteStream(file, { flags: 'a' }); let lines = 0, buf = '';
const s = net.connect('/run/redline-lead/lead.sock');
s.on('error', (e) => { console.log('helper not reachable: ' + e.message); process.exit(1); });
s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1);
    try { const m = JSON.parse(l), c = m.cam || {}; out.write(new Date(m.at).toISOString() + ' ' + JSON.stringify({ n: c.n, lead: c.lead, objects: c.objects || [] }) + '\n'); lines++; } catch (e) {} } });
setTimeout(() => { s.destroy(); out.end(() => { console.log(lines + ' lines -> ' + file); process.exit(0); }); }, secs * 1000);
