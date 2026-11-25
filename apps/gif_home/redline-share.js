'use strict';
/**
 * Lends the GIFs to Cluster Redline's "My design" cluster layout, on this head unit only.
 *
 * A small HTTP server on 127.0.0.1 (never another address, so nothing outside the head unit reaches it), GET only:
 *   /list           -> { app, version, files: [{ id, name, bytes, width, height, preset }] }   uploaded GIFs first, then the built-in ones
 *   /gif?id=<id>    -> the GIF's bytes (image/gif)
 * Cluster Redline copies the ones chosen into its own data folder, so it needs this only while choosing them.
 * Apps keep their data folders to themselves (GIF Home's is 0700), hence this instead of reading the files.
 */
const http = require('http'), { URL } = require('url');

const PORT = 18884, HOST = '127.0.0.1', MAX_LIST = 128;

class RedlineShare {
    // o: { list: () => [{id, name, bytes, preset}], read: (id) => Buffer, version, record }
    constructor(o) {
        this.o = o; this.error = ''; this.served = 0;
        this.server = http.createServer((req, res) => this.handle(req, res));
        this.server.on('error', (e) => { this.error = String(e && e.code || e); if (o.record) o.record('Cluster share: ' + this.error); });
    }
    start() { try { this.server.listen(PORT, HOST); } catch (e) { this.error = String(e && e.message || e); } return this; }
    stop() { try { this.server.close(); } catch (e) {} }
    handle(req, res) {
        const send = (code, body, type) => {
            const data = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
            res.writeHead(code, { 'Content-Type': type || 'application/json', 'Content-Length': data.length, 'Cache-Control': 'no-store', Connection: 'close' });
            res.end(data);
        };
        const remote = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
        if (remote !== '127.0.0.1' || req.method !== 'GET') { req.resume(); return send(403, { error: 'This head unit only' }); }
        let url;
        try { url = new URL(req.url, 'http://127.0.0.1'); } catch (e) { return send(400, { error: 'Bad request' }); }
        try {
            if (url.pathname === '/list') {
                this.served++;
                const files = this.o.list().slice(0, MAX_LIST).map((f) => ({ id: String(f.id), name: String(f.name || f.id).slice(0, 64), bytes: f.bytes | 0, width: f.width | 0, height: f.height | 0, preset: !!f.preset }));
                return send(200, { app: 'gif_home', version: this.o.version || '', files });
            }
            if (url.pathname === '/gif') {
                const id = url.searchParams.get('id') || '';
                if (!/^[A-Za-z0-9_.-]{1,80}$/.test(id) || !this.o.list().some((f) => String(f.id) === id)) return send(404, { error: 'No such GIF' });
                this.served++;
                return send(200, this.o.read(id), 'image/gif');
            }
            return send(404, { error: 'Not found' });
        } catch (e) { return send(500, { error: String(e && e.message || e).slice(0, 120) }); }
    }
}
module.exports = { RedlineShare, PORT, HOST };
