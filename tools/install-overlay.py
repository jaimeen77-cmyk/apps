#!/usr/bin/env python3
"""Copy selected Jam app sources and their shared tools into an upstream checkout."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import sys

HERE = Path(__file__).resolve().parent.parent
APPS = ('idrive_circuit', 'cluster_redline', 'storage')
# Kit features Storage needs from the target: the home-screen widget build step
# and the canvas helpers its screens use.
STORAGE_NEEDS = (('kit/tools/build.py', 'startWidget'), ('kit/runtime/canvas.js', 'ScaledCanvas'), ('kit/runtime/canvas.js', 'withAlpha'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path)
    parser.add_argument('--apps', nargs='+', choices=APPS, default=list(APPS))
    parser.add_argument('--force', action='store_true', help='replace conflicting selected app/tool files')
    parser.add_argument('--no-ko', action='store_true', help='leave the target Korean catalog unchanged')
    args = parser.parse_args()
    target = args.target.expanduser().resolve()
    selected = list(dict.fromkeys(args.apps))
    if target == HERE or not (target / 'kit/tools/build.py').is_file() or not (target / 'apps').is_dir():
        parser.error('Target must be a separate upstream idrive7-apps checkout')
    if 'storage' in selected:
        missing = [need for path, need in STORAGE_NEEDS
                   if not (target / path).is_file() or need not in (target / path).read_text(encoding='utf-8', errors='replace')]
        if missing:
            parser.error('Target kit cannot build storage (missing ' + ', '.join(missing) + '); update the target kit or leave out --apps storage')
    files = []
    for app in selected:
        # apps/<id>/screenshots are documentation; the kit build would pack any folder into the app
        files.extend(p.relative_to(HERE) for p in (HERE / 'apps' / app).rglob('*')
                     if p.is_file() and p.relative_to(HERE / 'apps' / app).parts[0] != 'screenshots')
        images = HERE / 'screenshots' / app
        if images.is_dir():
            files.extend(p.relative_to(HERE) for p in images.rglob('*') if p.is_file())
        if app == 'idrive_circuit':
            files += [Path('kit/icons/idrive_circuit.svg'), Path('kit/tools/test_idrive_circuit.js')]
        elif app == 'cluster_redline':
            files.extend(p.relative_to(HERE) for p in (HERE / 'tests/cluster_redline').glob('*.js'))
    files += [Path('tools') / p for p in ('cluster-redline-preview.js', 'cluster-redline-preflight.js',
                                       'cluster-redline-settings-preview.js', 'collect-cluster-redline.ps1', 'collect-redline-install.ps1', 'install-overlay.py', 'upstream-integration.py')]
    files += [Path('tests') / p for p in ('metadata.test.js', 'standard-installer.test.py',
                                       'standard-kit.test.py', 'overlay.test.py', 'collect-cluster-redline.test.py', 'collect-redline-install.test.py', 'cluster-redline-manifest.test.py', 'hud-slot-request.test.py', 'cluster-slot-takeover.test.py', 'native-hud-guidance.test.py', 'native-cluster-recovery.test.py', 'optional-guidance.test.py', 'optional-auxiliary.test.py', 'optional-lanes.test.py')]
    files += [Path(p) for p in (
        'docs/INSTALL.ko.md',
        'docs/INSTALL.md',
        'docs/USER-GUIDE.ko.md',
        'docs/USER-GUIDE.md',
        'localization/ko-additions.tsv',
        'LICENSES/MPL-2.0.txt',
        'LICENSES/GPL-3.0-or-later.txt',
        'NOTICE.cluster-redline.md',
        'patches/cluster-render-0.4.0-parked-recovery.patch',
    )]
    conflicts = [str(p) for p in files if (target / p).exists() and
                 ((target / p).is_dir() or (target / p).read_bytes() != (HERE / p).read_bytes())]
    if conflicts and not args.force:
        parser.error('Inspect conflicting files, then use --force to replace them: ' + ', '.join(conflicts))
    ko = target / 'kit/runtime/locales/ko.json'
    if not args.no_ko and not ko.is_file():
        parser.error('Korean runtime is missing; apply Korean support before merging translations')
    integration_spec = importlib.util.spec_from_file_location('jam_integration', HERE / 'tools/upstream-integration.py')
    integration = importlib.util.module_from_spec(integration_spec)
    integration_spec.loader.exec_module(integration)
    try:
        planned = integration.plan_upstream(target)
    except ValueError as error:
        parser.error(str(error))
    for relative in files:
        destination = target / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(HERE / relative, destination)
    for path, content in planned.items():
        path.write_bytes(content.encode('utf-8'))
        print('integrate', path)
    if not args.no_ko:
        additions = dict(line.split('\t', 1) for line in (HERE / 'localization/ko-additions.tsv').read_text(encoding='utf-8').splitlines()
                         if line and not line.startswith('#') and '\t' in line)
        if 'storage' in selected:
            # Storage keeps its Korean words in its own app.json (as the Store build reads them).
            additions.update(json.loads((HERE / 'apps/storage/app.json').read_text(encoding='utf-8')).get('translations', {}).get('ko', {}))
        words = json.loads(ko.read_text(encoding='utf-8'))
        words.update(additions)
        tsv = target / 'kit/runtime/locales/ko.tsv'
        if tsv.is_file():
            rows = dict(line.split('\t', 1) for line in tsv.read_text(encoding='utf-8').splitlines()
                        if line and not line.startswith('#') and '\t' in line)
            rows.update(additions)
            tsv.write_text(''.join(key + '\t' + value + '\n' for key, value in rows.items()), encoding='utf-8')
        ko.write_text(json.dumps(words, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Installed source overlay:', ', '.join(selected))
    print('Use normal commands in the target folder:')
    print('  python kit/tools/build.py --language ko --preview-only ' + ' '.join(selected))
    print('  python kit/tools/make_kit.py --language ko  # all apps')
    print('  deploy/push-to-car.ps1 or deploy/push-to-car.sh check / install')


if __name__ == '__main__':
    main()
