#!/usr/bin/env python3
"""Spotify Korean edition (spotify_ko) from hexlay/idrive7-custom-apps (GPL-3.0).

Two steps, both from a checkout of hexlay/idrive7-custom-apps (or a fork of it):

    python3 tools/prepare-spotify.py import   --upstream <checkout> --commit <sha>
    python3 tools/prepare-spotify.py template --upstream <checkout> --commit <sha> --kit-root <appsKOR checkout>

import   copies apps/spotify/ into this repository with the Korean edition's changes (main.js: lines measured and
         cut after translation, names from Spotify drawn as they are; app.json: storeMguHmi), writes NOTICE and
         store/apps/spotify_ko/ (id and version), and sets the version in mgu-repo.json. Every change is an exact
         replacement: an upstream main.js that no longer has the expected text stops here.
template builds the app with the upstream kit itself (kit/tools/build.py --language ko, as the MGU Store would) with
         localization/spotify.ko.json as its Korean catalog, the Hangul atlas of appsKOR (Noto Sans CJK KR, the
         2,350 KS X 1001 syllables) picked by fonts.js for Hangul, and tools/spotify-i18n.js as its i18n.js. The
         package, less its SDK and the app's own JavaScript, becomes store/runtime/spotify.tgz.part-*; the car's
         tools/store-build.js adds the current apps/spotify/ JavaScript and renames it to spotify_ko.
"""
import argparse
import gzip
import hashlib
import io
import json
import re
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
APP, STORE_ID, LANGUAGE = 'spotify', 'spotify_ko', 'ko'
APP_DIR = ROOT / 'apps' / APP
CATALOG = ROOT / 'localization' / 'spotify.ko.json'
UPSTREAM = 'hexlay/idrive7-custom-apps'
PART = 48 * 1024
KEEP = {'README.ko.md', 'screenshots'}

# names from Spotify: drawn as they are (a song called "Play" stays "Play")
NAMES = ['curTrk.title', 'trk.title', 'pl.name', 'curPl.name', 'nx.title', 'dev.name']
MAIN_PATCHES = [
    ("const qrcodegen = require('./kit/qrcodegen');\n",
     "const qrcodegen = require('./kit/qrcodegen');\n"
     "const { t: tr } = require('./kit/i18n');   // jaimeen77-cmyk/apps (한국어판)\n", 1),
    ("function fitText(cv, str, maxW, size, opts) {\n    str = String(str || '');\n",
     "function fitText(cv, str, maxW, size, opts) {\n"
     "    // jaimeen77-cmyk/apps (한국어판): translated before it is measured and cut, so a cut line is a cut translation\n"
     "    str = opts && opts.literal ? String(str || '') : tr(String(str || ''));\n", 1),
    ("cv.text(fitText(cv, curTrk.artist, mw, aSize), mx, artistY, aSize, t.text);",
     "cv.text(fitText(cv, curTrk.artist, mw, aSize, { literal: true }), mx, artistY, aSize, t.text, { literal: true });", 1),
]
NOTICE = """Spotify {version} - Korean edition (Spotify 한국어판, spotify_ko)

Source: hexlay/idrive7-custom-apps, apps/spotify (commit {commit}),
GNU General Public License v3. This is a modified version, distributed under the same license:
Korean text (localization/spotify.ko.json, tools/spotify-i18n.js), main.js lines measured and cut after
translation and names from Spotify drawn untranslated, and Store packaging by jaimeen77-cmyk/apps.
Full license text: LICENSE in the package, LICENSES/GPL-3.0-or-later.txt in the repository.
Corresponding source: https://github.com/jaimeen77-cmyk/apps

Runtime kit: hexlay/idrive7-custom-apps kit (cauliflowermossgrape/idrive7-apps), MIT (LICENSE.MIT).
Korean font: Noto Sans CJK KR, SIL Open Font License 1.1 (OFL-NotoSansKR.txt), the atlas of jaimeen77-cmyk/appsKOR.
Spotify is a trademark of Spotify AB. This app is not made or endorsed by Spotify.
"""


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')


def replace(text, old, new, count, what):
    if text.count(old) != count:
        raise SystemExit('%s: expected %d of %r, found %d (upstream changed: update tools/prepare-spotify.py)'
                         % (what, count, old[:70], text.count(old)))
    return text.replace(old, new)


def patch_main(code):
    for old, new, count in MAIN_PATCHES:
        code = replace(code, old, new, count, 'main.js')
    lines, done = code.split('\n'), set()
    for i, line in enumerate(lines):
        for name in NAMES:
            if 'fitText(cv, %s,' % name in line and "{ font: 'bold' }" in line:
                lines[i] = line.replace("{ font: 'bold' }", "{ font: 'bold', literal: true }")
                done.add(name)
    if done != set(NAMES):
        raise SystemExit('main.js: names not found: %s' % sorted(set(NAMES) - done))
    return '\n'.join(lines)


def cmd_import(a):
    src = a.upstream / 'apps' / APP
    spec = json.loads((src / 'app.json').read_text(encoding='utf-8'))
    if spec['id'] != APP:
        raise SystemExit('not the Spotify app: ' + str(src))
    # this repository's own files in apps/spotify/ stay; everything else is taken again from upstream
    APP_DIR.mkdir(parents=True, exist_ok=True)
    for f in APP_DIR.iterdir():
        if f.name not in KEEP:
            shutil.rmtree(f) if f.is_dir() else f.unlink()
    for f in sorted(src.iterdir()):
        if f.is_file() and not f.name.startswith('.') and not f.name.endswith(('_auth.json', '_push.json')):
            shutil.copy2(f, APP_DIR / f.name)
    main = APP_DIR / 'main.js'
    main.write_text(patch_main(main.read_text(encoding='utf-8')), encoding='utf-8', newline='\n')
    spec['storeMguHmi'] = spec.get('mguHmi', ['ID7'])
    write_json(APP_DIR / 'app.json', spec)
    (APP_DIR / 'NOTICE').write_text(NOTICE.format(version=spec['version'], commit=a.commit), encoding='utf-8', newline='\n')
    shutil.copyfile(a.upstream / 'LICENSE', APP_DIR / 'LICENSE')
    listing = ROOT / 'store/apps' / STORE_ID
    write_json(listing / 'app.json', {'id': STORE_ID, 'version': spec['version']})
    shutil.copy2(APP_DIR / 'icon.png', listing / 'icon.png')
    # mgu-repo.json keeps its own layout: only the version of the spotify_ko line is replaced
    repo_file = ROOT / 'mgu-repo.json'
    text = repo_file.read_text(encoding='utf-8')
    found = re.search(r'(\{"id": "%s", "version": ")([0-9.]+)(")' % STORE_ID, text)
    entry = bool(found)
    if found:
        repo_file.write_text(text[:found.start(2)] + spec['version'] + text[found.end(2):], encoding='utf-8', newline='\n')
    print('apps/%s: Spotify %s from %s@%s%s' % (APP, spec['version'], UPSTREAM, a.commit[:12],
                                               '' if entry else ' (add the spotify_ko entry to mgu-repo.json)'))


def fingerprint():
    code = ("const fs=require('fs'),b=require(process.argv[1]);"
            "process.stdout.write(b.fingerprint(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]));")
    return subprocess.check_output(['node', '-e', code, str(ROOT / 'tools/store-build.js'), str(APP_DIR / 'app.json'), APP],
                                   text=True).strip()


def cmd_template(a):
    # store-build.js fingerprints the raw bytes of this file; the car's checkout has LF endings
    if b'\r' in (ROOT / 'localization/ko-additions.tsv').read_bytes():
        raise SystemExit('localization/ko-additions.tsv has CRLF line endings: convert it to LF first')
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    spec = json.loads((APP_DIR / 'app.json').read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='spotify-ko-') as tmp:
        work = Path(tmp) / 'upstream'
        shutil.copytree(a.upstream, work, ignore=shutil.ignore_patterns('.git', 'dist', 'oap-sdk', 'node_modules'))
        # the app exactly as this repository has it (the template's UI is built from this app.json)
        shutil.rmtree(work / 'apps' / APP)
        shutil.copytree(APP_DIR, work / 'apps' / APP, ignore=lambda d, names: [n for n in names if n in KEEP])
        kit = work / 'kit/runtime'
        write_json(kit / 'locales' / (LANGUAGE + '.json'), catalog['strings'])
        for name in ('korean.json', 'OFL-NotoSansKR.txt'):
            shutil.copyfile(a.kit_root / 'kit/localization/fonts' / name, kit / 'fonts' / name)
        fonts = (kit / 'fonts.js').read_text(encoding='utf-8')
        fonts = replace(fonts, "    if (text && /[\\u3000-\\u9fff\\uff00-\\uffef]/.test(text)) name = 'cjk';\n",
                        "    // jaimeen77-cmyk/apps (한국어판): Hangul from the Korean atlas (fonts/korean.json, as appsKOR)\n"
                        "    if (text && /[\\u1100-\\u11ff\\u3130-\\u318f\\ua960-\\ua97f\\uac00-\\ud7ff]/.test(text) && family('korean')) name = 'korean';\n"
                        "    else if (text && /[\\u3000-\\u9fff\\uff00-\\uffef]/.test(text)) name = 'cjk';\n", 1, 'fonts.js')
        (kit / 'fonts.js').write_text(fonts, encoding='utf-8', newline='\n')
        shutil.copyfile(ROOT / 'tools/spotify-i18n.js', kit / 'i18n.js')
        # build.py copies an oap-sdk module into the package; a stand-in, left out of the template below
        (work / 'oap-sdk').mkdir()
        (work / 'oap-sdk/index.js').write_text('module.exports = {};\n')
        (work / 'oap-sdk/package.json').write_text('{"name": "oap-sdk", "version": "0.0.0"}\n')
        subprocess.check_call([sys.executable, 'kit/tools/build.py', '--language', LANGUAGE, APP], cwd=work)
        built = sorted((work / 'dist').glob('%s@%s-*.tgz' % (APP, spec['version'])))
        if len(built) != 1:
            raise SystemExit('expected one Korean package in dist/, found %s' % [p.name for p in built])
        own = {p.name for p in APP_DIR.glob('*.js')} | {'app.js', 'LICENSE', 'NOTICE'}
        own.discard('main.js')
        stage = Path(tmp) / 'package'
        with tarfile.open(built[0]) as source:
            for member in source:
                parts = PurePosixPath(member.name).parts
                if not parts or parts[0] != 'package' or '..' in parts or member.issym() or member.islnk():
                    raise SystemExit('unexpected archive member: ' + member.name)
                if 'node_modules' in parts:
                    continue    # never the SDK (here a stand-in): the Store adds the head unit's own
                if len(parts) == 3 and parts[1] == 'javascript' and parts[2] in own:
                    continue    # the app's JavaScript comes from apps/spotify/ on the head unit
                target = stage.joinpath(*parts[1:])
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.extractfile(member).read())
        locale_file = stage / 'javascript/kit/locale.json'
        locale = json.loads(locale_file.read_text(encoding='utf-8'))
        if locale.get('language') != LANGUAGE:
            raise SystemExit('the build is not Korean: ' + str(locale.get('language')))
        locale['rules'] = catalog['rules']
        locale_file.write_text(json.dumps(locale, ensure_ascii=False), encoding='utf-8', newline='\n')
        pkg_file = stage / 'package.json'
        pkg = json.loads(pkg_file.read_text(encoding='utf-8'))
        pkg['version'] = spec['version']     # store-build.js sets {version}; the template carries the plain one
        pkg['displayName'] = catalog['strings'].get(spec['title'], spec['title'])
        write_json(pkg_file, pkg)
        for f in stage.rglob('*.json'):
            text = f.read_text(encoding='utf-8')
            if spec['version'] + '-' in text:
                f.write_text(text.replace(spec['version'] + '-' + LANGUAGE + '.1', spec['version']), encoding='utf-8', newline='\n')
        runtime = ROOT / 'store/runtime'
        archive = Path(tmp) / 'runtime.tgz'
        with archive.open('wb') as out, gzip.GzipFile(fileobj=out, filename='', mode='wb', mtime=0) as zipped, \
                tarfile.open(fileobj=zipped, mode='w') as tar:
            for f in sorted(stage.rglob('*')):
                if f.is_file():
                    info = tarfile.TarInfo('package/' + f.relative_to(stage).as_posix())
                    data = f.read_bytes()
                    info.size, info.mode = len(data), 0o644
                    tar.addfile(info, io.BytesIO(data))
        data = archive.read_bytes()
        with tarfile.open(archive) as check:
            names = check.getnames()
        if any('node_modules' in n or '/oap-sdk/' in n for n in names):
            raise SystemExit('SDK in the template')
        for old in runtime.glob(APP + '.tgz.part-*'):
            old.unlink()
        parts = []
        for index, at in enumerate(range(0, len(data), PART)):
            name = '%s.tgz.part-%02d' % (APP, index)
            (runtime / name).write_bytes(data[at:at + PART])
            parts.append(name)
        if len(parts) > 32:
            raise SystemExit('template exceeds 32 parts')
        write_json(runtime / (APP + '.json'), {
            'schema': 1, 'id': APP, 'language': LANGUAGE, 'source_version': spec['version'],
            'ui_sha256': fingerprint(), 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts,
            'provenance': {'app': UPSTREAM, 'app_commit': a.commit, 'app_license': 'GPL-3.0',
                           'runtime': UPSTREAM + ' kit', 'license': 'MIT', 'korean_font': 'jaimeen77-cmyk/appsKOR',
                           'korean_font_commit': a.kit_commit, 'sdk_included': False}})
        print('%s: %d bytes, %d SDK-free parts; version %s' % (APP, len(data), len(parts), spec['version']))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    for name in ('import', 'template'):
        s = sub.add_parser(name)
        s.add_argument('--upstream', required=True, type=Path, help='checkout of ' + UPSTREAM)
        s.add_argument('--commit', required=True, help='its commit (provenance)')
        if name == 'template':
            s.add_argument('--kit-root', required=True, type=Path, help='appsKOR checkout (the Hangul atlas)')
            s.add_argument('--kit-commit', required=True, help='its commit (provenance)')
    a = p.parse_args()
    a.upstream = a.upstream.resolve()
    if a.cmd == 'import':
        cmd_import(a)
    else:
        a.kit_root = a.kit_root.resolve()
        cmd_template(a)
