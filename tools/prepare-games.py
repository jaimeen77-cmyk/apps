#!/usr/bin/env python3
"""Prepare Parked Games' SDK-free Korean runtime template from an MIT Parked Games checkout.

    python3 tools/prepare-games.py --kit-root <jaimeen77-cmyk/idrive7games_fork checkout>

The checkout is copied to a temporary folder (never changed), then:
  - its apps/parked_games is replaced by this repository's apps/parked_games (the Korean edition's source);
  - app.json's translations.ko are merged into the kit's Korean catalog (kit/runtime/locales/ko.json);
  - the Korean glyph atlas is cut down to the glyphs the catalog uses (see small_korean_atlas);
  - the kit's own build.py builds the Korean package; a placeholder stands in for the BMW SDK, whose module
    never reaches the template (prepare-store.py drops node_modules);
  - tools/prepare-store.py turns it into store/runtime/parked_games.json + .tgz.part-* without the app's
    JavaScript (main.js, the top-level modules and the games/ folder come from apps/parked_games on the car).
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zlib

ROOT = Path(__file__).resolve().parent.parent
APP = 'parked_games'


def small_korean_atlas(path, text):
    """Keep only the glyphs the Korean catalog draws (every Hangul syllable in it, ASCII and the atlas's symbols).

    The car's GPU renderer (mgu-renderd) keeps every app's glyph atlases on one shared texture, two 1024 x 4096
    shelves, first come, first served, never freed. The full Korean atlas (2,557 glyphs, 1024 x 2976) fits only on a
    shelf still under 1120 px; once the games' Latin atlases (and other apps') have filled both past that, it is
    refused ("glyph atlas texture full") and every Korean text is left out while the rest still draws. Cut down to the
    syllables the catalog uses it is about a third as tall, and with its own cache key it never meets an app's full one.
    """
    data = json.loads(path.read_text(encoding='utf-8'))
    hangul = lambda c: 0xAC00 <= c <= 0xD7A3
    keep = {ord(c) for c in text if hangul(ord(c))}
    for size in data['sizes']:
        w, h = size['atlasW'], size['atlasH']
        alpha = zlib.decompress(base64.b64decode(size['alpha']))
        glyphs = {int(k): v for k, v in size['glyphs'].items() if not hangul(int(k)) or int(k) in keep}
        rows, x, y, row_h, out = [], 0, 0, 0, {}
        for code in sorted(glyphs, key=lambda c: (-glyphs[c][3], c)):
            gx, gy, gw, gh = glyphs[code][:4]
            if x + gw > w:
                x, y, row_h = 0, y + row_h + 1, 0
            out[code] = [x, y] + glyphs[code][2:]
            rows.append((gx, gy, gw, gh, x, y))
            x += gw + 1 if gw else 0
            row_h = max(row_h, gh)
        new_h = y + row_h + 1
        packed = bytearray(w * new_h)
        for gx, gy, gw, gh, nx, ny in rows:
            for r in range(gh):
                packed[(ny + r) * w + nx:(ny + r) * w + nx + gw] = alpha[(gy + r) * w + gx:(gy + r) * w + gx + gw]
        size['atlasH'] = new_h
        size['alpha'] = base64.b64encode(zlib.compress(bytes(packed), 9)).decode('ascii')
        size['glyphs'] = {str(k): out[k] for k in sorted(out)}
    data['cacheKey'] = hashlib.sha256((data.get('cacheKey', '') + ''.join(map(chr, sorted(keep)))).encode('utf-8')).hexdigest()[:16]
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    return [(s['size'], s['atlasW'], s['atlasH'], len(s['glyphs'])) for s in data['sizes']]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--kit-root', type=Path, required=True, help='Parked Games (App Kit) checkout')
    args = parser.parse_args()
    kit_root = args.kit_root.resolve()
    if not (kit_root / 'kit/tools/build.py').is_file():
        raise SystemExit('not a Parked Games checkout: ' + str(kit_root))
    spec = json.loads((ROOT / 'apps' / APP / 'app.json').read_text(encoding='utf-8'))
    words = spec.get('translations', {}).get('ko', {})
    with tempfile.TemporaryDirectory(prefix='parked-games-') as temp:
        work = Path(temp) / 'kit'
        shutil.copytree(kit_root, work, ignore=shutil.ignore_patterns('.git', 'docs', 'dist', 'node_modules'))
        shutil.rmtree(work / 'apps' / APP)
        shutil.copytree(ROOT / 'apps' / APP, work / 'apps' / APP)
        catalog = work / 'kit/runtime/locales/ko.json'
        merged = json.loads(catalog.read_text(encoding='utf-8'))
        merged.update(words)
        catalog.write_text(json.dumps(merged, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print('korean atlas:', small_korean_atlas(work / 'kit/localization/fonts/korean.json',
                                                  ''.join(merged.values()) + ''.join(
            f.read_text(encoding='utf-8') for f in (work / 'kit/runtime/locales').glob('ko.*'))))
        # The kit's build.py wants the SDK's two files; only the placeholder's absence would stop it.
        sdk = work / 'oap-sdk'
        sdk.mkdir(exist_ok=True)
        (sdk / 'index.js').write_text("throw new Error('placeholder: the Store adds the head unit SDK');\n")
        (sdk / 'package.json').write_text(json.dumps({'name': 'oap-sdk', 'version': '0.0.0'}) + '\n')
        subprocess.check_call([sys.executable, str(work / 'kit/tools/build.py'), '--language', 'ko', APP], cwd=work)
        dist = work / 'dist'
        built = sorted(dist.glob(APP + '@*-ko.*.tgz'))
        if not built:
            raise SystemExit('no Korean package in ' + str(dist))
        expected = dist / (APP + '@' + spec['version'] + '-ko.1.tgz')
        if built[-1] != expected:
            shutil.copy2(built[-1], expected)
        subprocess.check_call([sys.executable, str(ROOT / 'tools/prepare-store.py'), '--dist', str(dist),
                               '--language', 'ko', '--apps', APP], cwd=ROOT)
    commit = subprocess.run(['git', '-C', str(kit_root), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    print('parked_games: Korean template from ' + str(kit_root) + (' @ ' + commit if commit else ''))


if __name__ == '__main__':
    main()
