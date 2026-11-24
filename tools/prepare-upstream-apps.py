#!/usr/bin/env python3
"""Generate the Korean SDK-free RHMI/runtime templates for apps taken from NamelsMissing/mgu-apps.

GIF Home (gif_home) is built the way MGU Monitor is
(tools/prepare-storage.py): the UI, the runtime kit and the Korean font come from an MIT App Kit
checkout (jaimeen77-cmyk/appsKOR); no SDK build, no oap-sdk and no node_modules. The app's own
JavaScript is not in the template: tools/store-build.js adds the current apps/<id>/ source at
install time. Korean text comes from app.json "translations"."ko" (settings, buttons and every
line the app draws go through the kit's i18n).

    python tools/prepare-upstream-apps.py --kit-root <appsKOR checkout> --kit-commit <sha> [gif_home]
"""
import argparse
import copy
import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
APPS = {
    'gif_home': {'author': 'NamelsMissing/mgu-apps (GPL-3.0); Korean edition jaimeen77-cmyk', 'cpuLimit': 60, 'memoryKB': 196608},
}
LANGUAGE = 'ko'


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def localized(original):
    words = original['translations'][LANGUAGE]
    tr = lambda value: words.get(value, value)
    spec = copy.deepcopy(original)
    spec['title'] = tr(spec['title'])
    spec['description'] = tr(spec['description'])
    if spec.get('startWidget'):
        spec['startWidget']['name'] = tr(spec['startWidget']['name'])
    for screen in spec['screens']:
        screen['title'] = tr(screen['title'])
        for button in screen.get('buttons', []):
            button[1] = tr(button[1])
    for setting in spec.get('settings', []):
        setting['label'] = tr(setting['label'])
        for option in setting.get('options', []):
            option[1] = tr(option[1])
    return spec, words


def patch_widget_text(module, app_id):
    """Home-widget text (GIF names can be Korean) through the UTF-8 StringBundle, as MGU Monitor does."""
    code = module.read_text(encoding='utf-8')
    old = "        if ((type || 'Text') === 'Text') value = widgetText(value);\n        return Promise.resolve(this.comp.setValue(Number(spawnId), cell, value, type || 'Text'))"
    new = ("        if ((type || 'Text') === 'Text') {\n"
           "            if (!this._koText) this._koText = new HmiText();\n"
           "            return Promise.resolve(this._koText.set(this.comp, '" + app_id.upper() + "_WIDGET', Number(spawnId), cell, value))\n"
           "                .catch((e) => log.warn('widget ' + cell + ': ' + e));\n"
           "        }\n"
           "        return Promise.resolve(this.comp.setValue(Number(spawnId), cell, value, type || 'Text'))")
    if code.count(old) != 1 or 'HmiText' not in code:
        raise ValueError('Unsupported widget runtime')
    module.write_text(code.replace(old, new), encoding='utf-8', newline='\n')


def generate(kit_root, kit_commit, app_id):
    # store-build.js fingerprints the raw bytes of this file; the car's checkout has LF endings.
    if b'\r' in (ROOT / 'localization/ko-additions.tsv').read_bytes():
        raise SystemExit('localization/ko-additions.tsv has CRLF line endings (Windows checkout); '
                         'convert it to LF first, or the car will reject the templates as stale')
    sys.path.insert(0, str(kit_root / 'kit/tools'))
    loader = importlib.util.spec_from_file_location('upstream_kit_build', kit_root / 'kit/tools/build.py')
    kit = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(kit)
    app_dir = ROOT / 'apps' / app_id
    original = json.loads((app_dir / 'app.json').read_text(encoding='utf-8'))
    if original['id'] != app_id:
        raise ValueError('app.json id mismatch')
    extra = APPS[app_id]
    spec, words = localized(original)
    runtime_root = ROOT / 'store/runtime'
    runtime_root.mkdir(exist_ok=True, parents=True)
    with tempfile.TemporaryDirectory(prefix=app_id + '-resources-') as tmp:
        package = Path(tmp) / 'package'
        package.mkdir()
        rt = package / 'javascript/kit'
        shutil.copytree(kit_root / 'kit/runtime', rt)
        # No SDK/native modules are copied; every JS import remains external.
        if (rt / 'locales').exists():
            shutil.rmtree(rt / 'locales')
        for atlas in ['cjk.json', 'gear_barlow.json', 'OFL-Barlow.txt']:
            (rt / 'fonts' / atlas).unlink(missing_ok=True)
        for file in ['korean.json', 'OFL-NotoSansKR.txt']:
            shutil.copyfile(kit_root / 'kit/localization/fonts' / file, rt / 'fonts' / file)
        locale = json.loads((kit_root / 'kit/runtime/locales/ko.json').read_text(encoding='utf-8'))
        locale.update(words)
        write(rt / 'locale.json', {'language': LANGUAGE, 'strings': locale})
        xml, ui, strings, states = kit.build_ui(spec, LANGUAGE)
        kit.unicode_resources(ui, strings, LANGUAGE)
        xml8, ui8, strings8, states8 = kit.build_ui(copy.deepcopy(spec), LANGUAGE, 'ID8')
        kit.unicode_resources(ui8, strings8, LANGUAGE, 'SID_CN_STATIC8_')
        if states8 != states:
            raise ValueError('iDrive 8 description must keep the iDrive 7 state ids')
        strings.update(strings8)
        runtime_spec = {k: spec.get(k) for k in ['id', 'title', 'version', 'screens', 'settings', 'config', 'startWidget']}
        runtime_spec['stateIds'] = states
        write(rt / 'app-spec.json', runtime_spec)
        if spec.get('startWidget'):
            patch_widget_text(rt / 'mgu.js', app_id)
        pkg = {'name': app_id, 'displayName': spec['title'], 'version': original['version'], 'description': spec['description'],
               'main': 'javascript/app.js', 'private': False, 'author': extra['author'], 'license': 'GPL-3.0',
               'mguHmi': original.get('storeMguHmi', ['ID7']), 'mguLocalOnly': True, 'engines': {'node': '>=8.7.0'},
               'oapAppSettings': {'maxDiskUsage': original.get('maxDiskUsage', 20971520), 'cpuLimit': extra['cpuLimit'],
                                  'memoryThresholdKB': extra['memoryKB'], 'priority': 'PRIO_LOW', 'visibility': 'FOREGROUND',
                                  'latencyClass': 'FOREGROUND', 'loggingId': original['loggingId'], 'userLoginRequired': False,
                                  'backgroundPriority': 200, 'someipManifest': 'manifest.json'}}
        write(package / 'package.json', pkg)
        write(package / 'manifest.json', kit.manifest_for(copy.deepcopy(original)))
        write(package / 'npm-shrinkwrap.json', {'name': app_id, 'version': original['version'], 'lockfileVersion': 1})
        write(package / 'config/base.json', {'rhmiLoadingEnabled': True, 'entryPointLoadingEnabled': True, 'settings': {app_id: {}}})
        shutil.copyfile(kit_root / 'kit/platform/permissions.json', package / 'permissions.json')
        shutil.copyfile(kit_root / 'LICENSE', package / 'LICENSE.idrive7-apps')
        shutil.copyfile(ROOT / 'LICENSES/GPL-3.0-or-later.txt', package / 'LICENSE.GPL-3.0')
        rhmi = package / 'rhmiData'
        icon_name = app_id + '_icon.png'
        description = {'schemaVersion': '1.3.0', 'application': {
            'uuid': kit.u(app_id, 'app'), 'type': 'OnlineApp', 'name': app_id, 'vendor': 'custom', 'version': original['version'],
            'defaultLanguage': 'en_GB', 'stringBundleUuid': kit.u(app_id, 'strings'), 'resourceBundleUuid': kit.u(app_id, 'resources'),
            'entryPoints': [{'name': app_id.upper() + '_ENTRY', 'uuid': kit.u(app_id, 'entry'), 'textId': kit.sid(app_id, 'TITLE'),
                             'icon': icon_name, 'insertionStateId': 20974, 'insertionFocusId': 2, 'insertionMode': 'INSERT_BELOW',
                             'insertionOrder': 0, 'insertionPriority': 0, 'previewType': 'NONE', 'bookmarkable': True, 'private': False,
                             'appearance': 'DEFAULT', 'isGroupHeader': False, 'insertionGroup': 0}],
            'uiDescriptions': [{'applicationFilePath': './uiDescriptions/%s/application.xml' % h,
                                'uiDescriptionFilePath': './uiDescriptions/%s/uiDescription.json' % h, 'hmi': [h]} for h in ('ID7', 'ID8')],
            'variantGroups': [{'stringsPath': './variantGroups/Common/texts', 'resourcesPath': './variantGroups/Common/images',
                               'hmi': ['ID7', 'ID8'], 'brands': ['BMW']}]}}
        write(rhmi / 'application.json', description)
        write(rhmi / 'uiDescriptions/ID7/uiDescription.json', ui)
        (rhmi / 'uiDescriptions/ID7/application.xml').write_text(xml, encoding='utf-8')
        write(rhmi / 'uiDescriptions/ID8/uiDescription.json', ui8)
        (rhmi / 'uiDescriptions/ID8/application.xml').write_text(xml8, encoding='utf-8')
        for tag in kit.LANGS:
            write(rhmi / 'variantGroups/Common/texts' / (tag + '.json'), strings)
        image = rhmi / 'variantGroups/Common/images' / icon_name
        image.parent.mkdir(parents=True)
        if (app_dir / 'icon.png').is_file():
            shutil.copyfile(app_dir / 'icon.png', image)
        else:
            subprocess.check_call(['node', str(kit_root / 'kit/tools/make_icon.js'), original.get('iconGlyph', spec['title'][:2]), str(image)])
        if spec.get('startWidget'):
            kit.build_start_widget(spec, app_id, str(image), str(Path(tmp) / 'widget-installed'), str(package / 'rhmiDataStartWidget'))
            for file in (package / 'rhmiDataStartWidget/variantGroups/Common/texts').glob('*.json'):
                bundle = json.loads(file.read_text(encoding='utf-8'))
                bundle.update({'SID_CN_DYNAMIC_%04d' % i: '' for i in range(256)})
                write(file, bundle)
        archive = Path(tmp) / 'runtime.tgz'
        with archive.open('wb') as output, gzip.GzipFile(fileobj=output, filename='', mode='wb', mtime=0) as zipped, \
                tarfile.open(fileobj=zipped, mode='w') as tar:
            for file in sorted(package.rglob('*')):
                if not file.is_file():
                    continue
                data = file.read_bytes()
                rel = 'package/' + file.relative_to(package).as_posix()
                if 'node_modules' in file.parts or '/oap-sdk/' in rel:
                    raise ValueError('SDK in template')
                info = tarfile.TarInfo(rel)
                info.size = len(data)
                info.mode = 0o644
                tar.addfile(info, io.BytesIO(data))
        data = archive.read_bytes()
        runtime = app_id
        parts = []
        for old in runtime_root.glob(runtime + '.tgz.part-*'):
            old.unlink()
        for index, at in enumerate(range(0, len(data), 48 * 1024)):
            name = runtime + '.tgz.part-' + str(index).zfill(2)
            (runtime_root / name).write_bytes(data[at:at + 48 * 1024])
            parts.append(name)
        if len(parts) > 32:
            raise ValueError('Runtime exceeds supported part count')
        command = "const fs=require('fs'),b=require(process.argv[1]);process.stdout.write(b.fingerprint(JSON.parse(fs.readFileSync(process.argv[2])), process.argv[3]));"
        fingerprint = subprocess.check_output(['node', '-e', command, str(ROOT / 'tools/store-build.js'),
                                               str(app_dir / 'app.json'), app_id], text=True).strip()
        write(runtime_root / (runtime + '.json'), {
            'schema': 1, 'id': app_id, 'language': LANGUAGE, 'source_version': original['version'],
            'ui_sha256': fingerprint, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'parts': parts,
            'provenance': {'app': 'NamelsMissing/mgu-apps', 'app_license': 'GPL-3.0', 'runtime': 'jaimeen77-cmyk/appsKOR',
                           'commit': kit_commit, 'license': 'MIT', 'sdk_included': False}})
        print(runtime + ': ' + str(len(data)) + ' bytes, ' + str(len(parts)) + ' SDK-free parts; version ' + original['version'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--kit-root', required=True, type=Path)
    parser.add_argument('--kit-commit', required=True, help='appsKOR commit the kit root was taken from (provenance)')
    parser.add_argument('apps', nargs='*', choices=sorted(APPS))
    a = parser.parse_args()
    for app in a.apps or sorted(APPS):
        generate(a.kit_root.resolve(), a.kit_commit, app)
