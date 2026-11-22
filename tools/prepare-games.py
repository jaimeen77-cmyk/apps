#!/usr/bin/env python3
"""Prepare Parked Games' SDK-free Korean runtime template from an MIT Parked Games checkout.

    python3 tools/prepare-games.py --kit-root <jaimeen77-cmyk/idrive7games_fork checkout>

The checkout is copied to a temporary folder (never changed), then:
  - its apps/parked_games is replaced by this repository's apps/parked_games (the Korean edition's source);
  - app.json's translations.ko are merged into the kit's Korean catalog (kit/runtime/locales/ko.json);
  - the kit's own build.py builds the Korean package; a placeholder stands in for the BMW SDK, whose module
    never reaches the template (prepare-store.py drops node_modules);
  - tools/prepare-store.py turns it into store/runtime/parked_games.json + .tgz.part-* without the app's
    JavaScript (main.js, the top-level modules and the games/ folder come from apps/parked_games on the car).
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
APP = 'parked_games'


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
