'use strict';
// My design (1.3.50): the GIFs come from the GIF player (gif_home 0.4.3+), which lends them on this head unit only
// (its redline-share.js: http://127.0.0.1:18884, GET /list and /gif?id=). The ones chosen for the three scenes are
// copied into this app's data folder, my-pictures/ (stop.gif, drive.gif, reverse.gif), where my-picture.js reads
// them; so the GIF player is needed only while choosing. Each GIF is checked against my-picture.js's limits before
// it is kept. Read only towards the GIF player; nothing leaves the head unit.
const http = require('http'), fs = require('fs'), path = require('path');
const MP = require('./my-picture'), GIF = require('./gif-decode');
const PORT = 18884, HOST = '127.0.0.1', TIMEOUT_MS = 4000;
// the picture's box on the cluster (the Car layout's picture: 320 x 180) and the limits (my-picture.js)
const RECOMMENDED = { w: 320, h: 180 };

function get(p, max, done) {
    let finished = false;const end = (e, v) => { if (!finished) { finished = true; done(e, v); } };
    const req = http.get({ host: HOST, port: PORT, path: p, agent: false, timeout: TIMEOUT_MS }, (res) => {
        const parts = []; let n = 0;
        res.on('data', (d) => { n += d.length; if (n > max) { req.abort(); end(new Error('too_large')); } else parts.push(d); });
        res.on('end', () => res.statusCode === 200 ? end(null, Buffer.concat(parts)) : end(new Error('http_' + res.statusCode)));
    });
    req.on('timeout', () => { req.abort(); end(new Error('timeout')); });
    req.on('error', (e) => end(new Error(e && e.code === 'ECONNREFUSED' ? 'not_running' : 'unreachable')));
}
/** The GIF player's GIFs: done(error, [{id, name, bytes, width, height, preset}]). */
function list(done) {
    get('/list', 256 * 1024, (e, b) => {
        if (e) return done(e);
        let v = null; try { v = JSON.parse(b.toString('utf8')); } catch (x) {}
        if (!v || !Array.isArray(v.files)) return done(new Error('bad_reply'));
        done(null, v.files.filter((f) => f && typeof f.id === 'string').map((f) => ({ id: f.id, name: String(f.name || f.id), bytes: f.bytes | 0, width: f.width | 0, height: f.height | 0, preset: !!f.preset })));
    });
}
/** Whether a GIF's size fits (before it is fetched): 'ok', 'too_large' (bytes) or 'too_big' (width / height). */
function fits(f) {
    if (f.bytes && f.bytes > MP.LIMIT.maxBytes) return 'too_large';
    if (f.width && f.height && (f.width > MP.LIMIT.maxW || f.height > MP.LIMIT.maxH)) return 'too_big';
    return 'ok';
}
/**
 * Copies the chosen GIFs (choice: {stop, drive, reverse}: an id, or '' for the Car layout's own picture) into
 * my-pictures/; done({stop: 'ok' | error, ...}). A GIF that does not fit or decode is not kept (its old one stays).
 */
function fetchChosen(dataDir, choice, done) {
    const dir = path.join(dataDir, 'my-pictures'), out = {};
    try { fs.mkdirSync(dir); } catch (e) {}
    const names = MP.NAMES.slice();
    const next = () => {
        const n = names.shift(); if (!n) { MP.scan(Date.now(), true); return done(out); }
        const id = choice && choice[n], file = path.join(dir, n + '.gif');
        if (!id) { try { fs.unlinkSync(file); } catch (e) {} out[n] = 'none'; return next(); }
        get('/gif?id=' + encodeURIComponent(id), MP.LIMIT.maxBytes, (e, b) => {
            if (e) { out[n] = e.message; return next(); }
            try { GIF.decode(b, MP.LIMIT); } catch (x) { out[n] = x.code || 'broken'; return next(); }
            try { fs.writeFileSync(file + '.tmp', b); fs.renameSync(file + '.tmp', file); out[n] = 'ok'; } catch (x) { out[n] = 'write_failed'; }
            next();
        });
    };
    next();
}
module.exports = { list, fits, fetchChosen, RECOMMENDED, PORT };
