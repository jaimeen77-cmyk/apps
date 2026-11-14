"""Exercise the actual SSH payload with fixture files; no car or SSH required."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
source = (ROOT / 'tools/collect-cluster-redline.ps1').read_text(encoding='utf-8')
script = re.search(r"\$remoteScript = @'\n(.*?)\n'@", source, re.S).group(1)
script.encode('ascii')  # Safe with Windows PowerShell 5.1's default native stdin encoding.
subprocess.run(['sh', '-n'], input=script, text=True, check=True)


def write(root, name, content):
    file = root / name.lstrip('/')
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content, encoding='utf-8')


def snapshot(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in root.rglob('*') if p.is_file()}


def capture(root):
    # The extra LF is added by the wrapper; CRLF mimics the Windows pipe suffix.
    result = subprocess.run(['sh', '-s', '--', str(root), '2', '0'],
                            input=script + '\n\r\n', text=True, capture_output=True, timeout=5)
    assert result.returncode == 0, result.stderr
    return result.stdout


with tempfile.TemporaryDirectory(prefix='cluster-log-') as temporary:
    root = Path(temporary)
    write(root, '/var/opt/cluster-render/current/component.json', json.dumps({'id': 'cluster-render', 'version': '0.3.11'}))
    write(root, '/var/opt/cluster-render/component.json', json.dumps({'id': 'cluster-render', 'version': '9.9.9'}))
    write(root, '/var/opt/cluster-render/current/cluster-render.conf', 'map_take_over_stock = 1\npanel_take_over_stock = 0\nhud_slot = 0x323\nhud_take_over_stock = 0\ntargets = map,panel,hud\n')
    write(root, '/var/opt/cluster-render/cluster-render.local.conf', 'map_take_over_stock = 0\nhud_take_over_stock = 1\n')
    write(root, '/run/cluster-render/status.txt', 'target map: parked behind stock\n')
    write(root, '/var/opt/cluster-render/log/cluster-render.log', 'target map: take-over 1: next no sooner than 1.5 s\n')
    for uid in ('12501', '12502'):
        write(root, '/var/opt/public/oap/oap_' + uid + '/data/cluster-redline-status.json',
              json.dumps({'targetName': 'map', 'targetState': 'parked', 'requested': True, 'uid_test': uid}))
    write(root, '/var/opt/public/oap/oap_12501/data/speed-probe-1.log', '{"ev":"archive-one"}\n')
    write(root, '/var/opt/public/oap/oap_12501/data/speed-probe-2.log', '{"ev":"archive-two"}\n')
    before = snapshot(root)
    report = capture(root)
    assert snapshot(root) == before, 'Collector changed fixture files'
    assert '0.3.11' in report and '9.9.9' not in report, 'Must report active metadata before stale fallback'
    assert report.count('=== SAMPLE ') == 2
    assert report.count('target map: parked behind stock') == 2
    assert 'map_take_over_stock = 1' in report and 'map_take_over_stock = 0' in report
    assert 'hud_slot = 0x323' in report and 'targets = map,panel,hud' in report
    assert 'hud_take_over_stock = 0' in report and 'hud_take_over_stock = 1' in report, 'HUD defaults and owner overrides must be captured without changing them'
    assert report.count('take-over 1') == 2, 'Before and after tails'
    assert '12501' in report and '12502' in report, 'Must capture co-installed instances'
    assert 'CAPTURE END' in report
    assert 'speed-probe-1.log' in report and 'archive-one' in report
    assert 'speed-probe-2.log' in report and 'archive-two' in report

with tempfile.TemporaryDirectory(prefix='cluster-log-missing-') as temporary:
    root = Path(temporary)
    report = capture(root)
    for name in ['RENDERER_METADATA_NOT_FOUND', 'RENDERER_STATUS_NOT_FOUND', 'APP_STATUS_NOT_FOUND', 'RENDERER_LOG_NOT_FOUND']:
        assert name in report, name
    assert not list(root.rglob('*')), 'Missing paths must not be created'

print('PASS: actual read-only SSH payload, active version, config overrides, both app instances, repeated status, before/after logs, missing paths and Windows stdin newline')
