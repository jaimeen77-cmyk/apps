'use strict';
// A small GIF decoder (Node 8, no dependencies) for the My picture layout (my-picture.js) and its PC tool
// (tools/my-pictures.js). Every frame is composed onto the GIF's screen as GIF players do (each frame's own or
// the global colour table, transparency, disposal 0-3, interlace) and kept as 16-bit colour indices into one
// combined colour table (0xFFFF: clear), so a frame costs 2 bytes a pixel.
// decode(buffer, {maxW, maxH, maxFrames}) -> {w, h, colours (Uint8Array rgb), frames: [{px: Uint16Array, delay}]}
// throws an Error with .code: 'not_gif', 'too_big', 'no_frames', 'broken'.
const CLEAR = 0xFFFF;
function fail(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

function lzw(data, minSize, count) {
    const out = new Uint8Array(count), clear = 1 << minSize, end = clear + 1;
    const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), stack = new Uint8Array(4097);
    let size = minSize + 1, mask = (1 << size) - 1, next = end + 1, prev = -1, bits = 0, acc = 0, pos = 0, o = 0;
    for (let i = 0; i < clear; i++) { suffix[i] = i; first[i] = i; }
    while (o < count) {
        while (bits < size) { if (pos >= data.length) return out; acc |= data[pos++] << bits; bits += 8; }
        let code = acc & mask; acc >>>= size; bits -= size;
        if (code === clear) { size = minSize + 1; mask = (1 << size) - 1; next = end + 1; prev = -1; continue; }
        if (code === end) break;
        if (prev === -1) { if (code >= clear) break; out[o++] = suffix[code]; prev = code; continue; }
        let sp = 0, c = code;
        if (code >= next) { if (code > next) break; stack[sp++] = first[prev]; c = prev; }
        while (c >= clear) { stack[sp++] = suffix[c]; c = prefix[c]; }
        stack[sp++] = c;
        if (next < 4096) { prefix[next] = prev; suffix[next] = c; first[next] = first[prev]; next++; if (next > mask && size < 12) { size++; mask = (1 << size) - 1; } }
        while (sp > 0 && o < count) out[o++] = stack[--sp];
        prev = code;
    }
    return out;
}

function decode(buf, opts) {
    const o = opts || {}, maxW = o.maxW || 400, maxH = o.maxH || 225, maxFrames = o.maxFrames || 20;
    if (!buf || buf.length < 13 || buf.toString('latin1', 0, 3) !== 'GIF') throw fail('not_gif', 'not a GIF file');
    const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8), flags = buf[10];
    if (!w || !h) throw fail('broken', 'empty GIF screen');
    if (w > maxW || h > maxH) throw fail('too_big', 'GIF is ' + w + ' x ' + h + ', larger than ' + maxW + ' x ' + maxH);
    let p = 13;
    const tables = [];   // combined colour table: rgb triples
    let gct = -1, gctLen = 0;
    if (flags & 0x80) { gctLen = 2 << (flags & 7); gct = 0; for (let i = 0; i < gctLen * 3; i++) tables.push(buf[p + i] || 0); p += gctLen * 3; }
    const screen = new Uint16Array(w * h).fill(CLEAR), frames = [];
    // o.box {w, h} (1.3.61): each kept frame scaled down to fit it (nearest colour, shape kept) as it is decoded, so
    // a big GIF never sits in memory at its full size (a 640 x 360, 90-frame GIF: 41 MB before, 10 MB now)
    const k = o.box ? Math.min(1, o.box.w / w, o.box.h / h) : 1, ow = Math.max(1, Math.round(w * k)), oh = Math.max(1, Math.round(h * k));
    const xs = new Uint32Array(ow), ys = new Uint32Array(oh);
    for (let x = 0; x < ow; x++) xs[x] = Math.min(w - 1, Math.floor((x + 0.5) / k));
    for (let y = 0; y < oh; y++) ys[y] = Math.min(h - 1, Math.floor((y + 0.5) / k)) * w;
    const keep = () => { if (k === 1) return screen.slice(); const px = new Uint16Array(ow * oh);
        for (let y = 0; y < oh; y++) { const row = ys[y], o2 = y * ow; for (let x = 0; x < ow; x++) px[o2 + x] = screen[row + xs[x]]; } return px; };
    let delay = 100, trans = -1, disposal = 0;
    const need = (n) => { if (p + n > buf.length) throw fail('broken', 'GIF ends early'); };
    while (p < buf.length && frames.length < maxFrames) {
        const b = buf[p++];
        if (b === 0x3B) break;
        if (b === 0x21) {
            need(1); const label = buf[p++];
            if (label === 0xF9 && buf[p] === 4) { need(6); const pf = buf[p + 1]; disposal = (pf >> 2) & 7; delay = buf.readUInt16LE(p + 2) * 10; trans = pf & 1 ? buf[p + 4] : -1; }
            while (p < buf.length) { const n = buf[p++]; if (!n) break; p += n; }
            continue;
        }
        if (b !== 0x2C) throw fail('broken', 'unexpected GIF block');
        need(9);
        const fx = buf.readUInt16LE(p), fy = buf.readUInt16LE(p + 2), fw = buf.readUInt16LE(p + 4), fh = buf.readUInt16LE(p + 6), ff = buf[p + 8]; p += 9;
        let base = gct, len = gctLen;
        if (ff & 0x80) { len = 2 << (ff & 7); need(len * 3); base = tables.length / 3; for (let i = 0; i < len * 3; i++) tables.push(buf[p + i]); p += len * 3; }
        if (base < 0) throw fail('broken', 'GIF frame without colours');
        need(1); const minSize = buf[p++];
        if (minSize < 1 || minSize > 11) throw fail('broken', 'bad LZW size');
        const parts = []; let total = 0;
        while (p < buf.length) { const n = buf[p++]; if (!n) break; need(n); parts.push(buf.slice(p, p + n)); total += n; p += n; }
        const data = Buffer.concat(parts, total), idx = lzw(data, minSize, fw * fh);
        const before = disposal === 3 ? screen.slice() : null;
        // interlaced rows come in four passes
        const rows = [];
        if (ff & 0x40) { [[0, 8], [4, 8], [2, 4], [1, 2]].forEach(([s, st]) => { for (let r = s; r < fh; r += st) rows.push(r); }); } else for (let r = 0; r < fh; r++) rows.push(r);
        for (let k = 0; k < fh; k++) {
            const y = fy + rows[k]; if (y >= h) continue;
            for (let x = 0; x < fw; x++) {
                const sx = fx + x; if (sx >= w) continue;
                const c = idx[k * fw + x]; if (c === trans || c >= len) continue;
                screen[y * w + sx] = base + c;
            }
        }
        // 1.3.58: down to 50 ms a frame (the cluster's 20 frames a second); 0 or 10 ms means 100 ms, as browsers play them
        frames.push({ px: keep(), delay: delay <= 10 ? 100 : Math.max(50, delay) });
        // what the next frame starts from
        if (disposal === 2) { for (let y = fy; y < Math.min(h, fy + fh); y++) screen.fill(CLEAR, y * w + fx, y * w + Math.min(w, fx + fw)); }
        else if (disposal === 3 && before) screen.set(before);
        delay = 100; trans = -1; disposal = 0;
    }
    if (!frames.length) throw fail('no_frames', 'GIF has no frames');
    return { w: ow, h: oh, colours: Uint8Array.from(tables), frames, source: { w, h, frames: frames.length } };
}

// Quick facts without decoding the pixels (the PC tool's check): size and frame count.
function probe(buf) {
    if (!buf || buf.length < 13 || buf.toString('latin1', 0, 3) !== 'GIF') return null;
    const w = buf.readUInt16LE(6), h = buf.readUInt16LE(8), flags = buf[10];
    let p = 13 + (flags & 0x80 ? (2 << (flags & 7)) * 3 : 0), frames = 0;
    while (p < buf.length) {
        const b = buf[p++];
        if (b === 0x3B) break;
        if (b === 0x21) { p++; while (p < buf.length) { const n = buf[p++]; if (!n) break; p += n; } continue; }
        if (b !== 0x2C) break;
        const ff = buf[p + 8]; p += 9; if (ff & 0x80) p += (2 << (ff & 7)) * 3; p++;
        while (p < buf.length) { const n = buf[p++]; if (!n) break; p += n; }
        frames++;
    }
    return { w, h, frames };
}
module.exports = { decode, probe, CLEAR };
