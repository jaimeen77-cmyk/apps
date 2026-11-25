"""Turns rendered frames into the app's palette indices (to_indices, used by render3d.py's sprites mode).
Run on its own it exports the flat 2D versions from make_set.py (kept for reference):
OW x OH frames, NF per state, one shared 256-colour palette, each state's indices deflated and base64'd.
usage: python make_sprites.py OUT.js"""
import base64, json, sys, zlib
import make_set as M

OW, OH, NF = 240, 135, 8
M.NF = NF
M.S = (OW * 2) / M.W           # draw the 540x304 design at 2x the output size, then average 2x2
M.w, M.h = OW * 2, OH * 2
STATES = ['cruise', 'accel', 'brake', 'reverse', 'turn']

BAYER = M.BAYER

def to_indices(buf):
    R, G, B = buf
    w = M.w
    out = bytearray(OW * OH)
    for y in range(OH):
        brow = BAYER[y & 3]
        for x in range(OW):
            i0 = (2 * y) * w + 2 * x; i1 = i0 + w
            r = min(255, max(0, (R[i0] + R[i0 + 1] + R[i1] + R[i1 + 1]) * 0.25))
            g = min(255, max(0, (G[i0] + G[i0 + 1] + G[i1] + G[i1 + 1]) * 0.25))
            b = min(255, max(0, (B[i0] + B[i0 + 1] + B[i1] + B[i1 + 1]) * 0.25))
            d = brow[x & 3] / 16.0 - 0.47
            if max(r, g, b) - min(r, g, b) < 14:
                k = int((r + g + b) / 765 * 39 + 0.5 + d); k = 0 if k < 0 else (39 if k > 39 else k)
                out[y * OW + x] = 216 + k
                continue
            ri = int(r / 51 + 0.5 + d); ri = 0 if ri < 0 else (5 if ri > 5 else ri)
            gi = int(g / 51 + 0.5 + d); gi = 0 if gi < 0 else (5 if gi > 5 else gi)
            bi = int(b / 51 + 0.5 + d); bi = 0 if bi < 0 else (5 if bi > 5 else bi)
            out[y * OW + x] = ri * 36 + gi * 6 + bi
    return bytes(out)

def main():
    out = sys.argv[1]
    data = {}
    total = 0
    for s in STATES:
        frames = M.render_frames(s)
        raw = b''.join(to_indices(b) for b in frames)
        z = zlib.compress(raw, 9)
        total += len(z)
        data[s] = base64.b64encode(z).decode('ascii')
    pal = base64.b64encode(M.palette()).decode('ascii')
    lines = [
        "'use strict';",
        "// Generated: the Car picture of the G-force meter (car-meter.js). Original drawings (a generic white-over-black",
        "// 1980s hatchback at night, no logos or lettering). " + str(OW) + "x" + str(OH) + ", " + str(NF) + " frames a state,",
        "// one 256-colour palette (rgb), each state's palette indices deflated (zlib) and base64'd. Do not edit by hand.",
        "module.exports={W:" + str(OW) + ",H:" + str(OH) + ",N:" + str(NF) + ",palette:" + json.dumps(pal) + ",",
    ]
    lines.append(" states:{" + ",\n  ".join(s + ":" + json.dumps(data[s]) for s in STATES) + "}};")
    with open(out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write("\n".join(lines) + "\n")
    print("wrote", out, "deflated bytes", total)

if __name__ == '__main__':
    main()
