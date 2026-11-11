#!/usr/bin/env python3
"""Ensure selected-app copying and conflict checks do not partly change a target."""
import json
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT


def run(target, *args):
    return subprocess.run([sys.executable, str(ROOT / 'tools/install-overlay.py'), str(target)] + list(args),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


with tempfile.TemporaryDirectory(prefix='jam-overlay-test-') as temporary:
    target = Path(temporary)
    (target / 'apps').mkdir()
    (target / 'kit/tools').mkdir(parents=True)
    shutil.copy2(UPSTREAM / 'kit/tools/build.py', target / 'kit/tools/build.py')
    shutil.copy2(UPSTREAM / 'kit/tools/make_kit.py', target / 'kit/tools/make_kit.py')
    (target / 'deploy').mkdir()
    shutil.copy2(UPSTREAM / 'deploy/mgu-app-install.sh', target / 'deploy/mgu-app-install.sh')
    # Missing Korean support must be detected before even the first app is copied.
    assert run(target).returncode != 0
    assert not (target / 'apps/idrive_circuit').exists()
    (target / 'kit/runtime/locales').mkdir(parents=True)
    shutil.copy2(UPSTREAM / 'kit/runtime/mgu.js', target / 'kit/runtime/mgu.js')
    locale = target / 'kit/runtime/locales/ko.json'
    locale.write_text('{"Existing":"기존"}', encoding='utf-8')
    # Storage needs the kit's widget build and canvas helpers; refused before any copy without them.
    assert run(target, '--apps', 'storage').returncode != 0
    assert not (target / 'apps/storage').exists()
    shutil.copy2(UPSTREAM / 'kit/runtime/canvas.js', target / 'kit/runtime/canvas.js')
    assert run(target, '--apps', 'cluster_redline').returncode == 0
    assert (target / 'apps/cluster_redline/app.json').is_file()
    assert '// Jam custom settings isolation v1' in (target / 'kit/runtime/mgu.js').read_text()
    assert not (target / 'apps/idrive_circuit').exists()
    assert json.loads(locale.read_text(encoding='utf-8'))['Existing'] == '기존'
    # An unchanged overlay may be applied twice without requiring --force.
    assert run(target, '--apps', 'cluster_redline').returncode == 0
    source = target / 'apps/cluster_redline/main.js'
    source.write_text('// owner changes')
    assert run(target).returncode != 0
    assert not (target / 'apps/idrive_circuit').exists(), 'No partial copy on conflict'
    assert source.read_text() == '// owner changes'
    assert run(target, '--force').returncode == 0
    assert source.read_bytes() == (ROOT / 'apps/cluster_redline/main.js').read_bytes()
    assert (target / 'apps/idrive_circuit/app.json').is_file()
    assert (target / 'apps/storage/sysinfo.js').is_file() and not (target / 'apps/storage/screenshots').exists()
    assert json.loads(locale.read_text(encoding='utf-8'))['Free for apps'] == '앱 설치 여유 공간'
    before = locale.read_bytes()
    assert run(target, '--no-ko').returncode == 0
    assert locale.read_bytes() == before
print('PASS: selected overlay (Circuit, Cluster Redline, Storage), Storage kit check, Korean prerequisites before writes, idempotency, no partial conflict copy, explicit replacement and --no-ko')
