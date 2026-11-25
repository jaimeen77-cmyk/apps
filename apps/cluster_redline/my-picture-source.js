'use strict';
// My design (1.3.50): the GIFs come from the GIF player (gif_home 0.4.3+), which lends them on this head unit only
// (its redline-share.js: http://127.0.0.1:18884, GET /list and /gif?id=). The ones chosen for the three scenes are
// copied into this app's data folder, my-pictures/ (<scene>.mpic, fitted to the picture's box by my-picture.js), where
// my-picture.js reads them; so the GIF player is needed only while choosing. Read only towards the GIF player; nothing
// leaves the head unit.
const http = require('http'), fs = require('fs'), path = require('path');
const MP = require('./my-picture');
const PORT = 18884, HOST = '127.0.0.1', TIMEOUT_MS = 4000;
// the picture's box on the cluster (the Car layout's picture: 320 x 180) and the limits (my-picture.js)
const RECOMMENDED = MP.BOX;

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
/** Whether a GIF can be used (before it is fetched): 'ok', 'too_large' (bytes) or 'too_big' (width / height). Any
 *  size up to the GIF player's own limits is fitted to the picture's box when it is copied (my-picture.js fit). */
function fits(f) {
    if (f.bytes && f.bytes > MP.SOURCE.maxBytes) return 'too_large';
    if (f.width && f.height && (f.width > MP.SOURCE.maxW || f.height > MP.SOURCE.maxH)) return 'too_big';
    return 'ok';
}
/** Whether a GIF's size is changed when it is copied (bigger than the box). */
const resized = (f) => !!(f.width && f.height && (f.width > MP.BOX.w || f.height > MP.BOX.h));
/**
 * Copies the chosen GIFs (choice: {stop, drive, reverse}: an id, or '' for none) into my-pictures/, each fitted to the
 * picture's box (<scene>.mpic); done({stop: {ok, w, h, frames, source} | {error}, ...}). The drive GIF is required
 * (done({error: 'need_drive'}) without it): a scene without its own GIF shows it. A GIF that cannot be used is not
 * kept (its old copy stays).
 */
function fetchChosen(dataDir, choice, done) {
    if (!choice || !choice.drive) return done({ error: 'need_drive' });
    const dir = path.join(dataDir, 'my-pictures'), out = {};
    try { fs.mkdirSync(dir); } catch (e) {}
    const names = MP.NAMES.slice(), drop = (n) => ['.mpic', '.gif'].forEach((x) => { try { fs.unlinkSync(path.join(dir, n + x)); } catch (e) {} });
    const next = () => {
        const n = names.shift(); if (!n) { MP.scan(Date.now(), true); return done(out); }
        const id = choice[n];
        if (!id) { drop(n); out[n] = { none: true }; return next(); }
        get('/gif?id=' + encodeURIComponent(id), MP.SOURCE.maxBytes, (e, b) => {
            if (e) { out[n] = { error: e.message }; return next(); }
            let p; try { p = MP.prepare(b); } catch (x) { out[n] = { error: x.code || 'broken' }; return next(); }
            const file = path.join(dir, n + '.mpic');
            try { fs.writeFileSync(file + '.tmp', p.file); fs.renameSync(file + '.tmp', file); try { fs.unlinkSync(path.join(dir, n + '.gif')); } catch (x) {}
                out[n] = { ok: true, w: p.w, h: p.h, frames: p.frames, source: p.source }; } catch (x) { out[n] = { error: 'write_failed' }; }
            next();
        });
    };
    next();
}
module.exports = { list, fits, resized, fetchChosen, RECOMMENDED, PORT };
