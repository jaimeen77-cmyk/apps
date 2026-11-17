#!/usr/bin/env python3
"""Generate Storage's SDK-free RHMI/runtime templates from an MIT App Kit checkout."""
import argparse
import copy
import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def generate(kit_root):
    sys.path.insert(0, str(kit_root / 'kit/tools'))
    loader = importlib.util.spec_from_file_location('storage_kit_build', kit_root / 'kit/tools/build.py')
    kit = importlib.util.module_from_spec(loader); loader.loader.exec_module(kit)
    original = json.loads((ROOT / 'apps/storage/app.json').read_text())
    words = original['translations']['ko']
    runtime_root = ROOT / 'store/runtime'; runtime_root.mkdir(exist_ok=True, parents=True)
    for language in ['ko', 'en']:
        spec = copy.deepcopy(original)
        tr = lambda value: words.get(value, value) if language == 'ko' else value
        spec['title'] = tr(spec['title']); spec['description'] = tr(spec['description'])
        spec['startWidget']['name'] = tr(spec['startWidget']['name'])
        for screen in spec['screens']:
            screen['title'] = tr(screen['title'])
            for button in screen.get('buttons', []): button[1] = tr(button[1])
        for setting in spec['settings']:
            setting['label'] = tr(setting['label'])
            for option in setting.get('options', []): option[1] = tr(option[1])
        with tempfile.TemporaryDirectory(prefix='storage-resources-') as tmp:
            package = Path(tmp) / 'package'; package.mkdir()
            rt = package / 'javascript/kit'
            shutil.copytree(kit_root / 'kit/runtime', rt)
            # No SDK/native modules are copied; every JS import remains external.
            for folder in ['locales']:
                if (rt / folder).exists(): shutil.rmtree(rt / folder)
            for atlas in ['cjk.json', 'gear_barlow.json', 'OFL-Barlow.txt']:
                (rt / 'fonts' / atlas).unlink(missing_ok=True)
            if language == 'ko':
                for file in ['korean.json', 'OFL-NotoSansKR.txt']:
                    shutil.copyfile(kit_root / 'kit/localization/fonts' / file, rt / 'fonts' / file)
            locale = {} if language == 'en' else json.loads((kit_root / 'kit/runtime/locales/ko.json').read_text())
            if language == 'ko': locale.update(words)
            write(rt / 'locale.json', {'language': language, 'strings': locale})
            xml, ui, strings, states = kit.build_ui(spec, language)
            kit.unicode_resources(ui, strings, language)
            runtime_spec = {k: spec.get(k) for k in ['id', 'title', 'version', 'screens', 'settings', 'config', 'startWidget']}
            runtime_spec['stateIds'] = states
            write(rt / 'app-spec.json', runtime_spec)
            # Storage widgets use their own UTF-8 StringBundle, with reserved
            # dynamic handles. Other apps' runtimes are never changed.
            module = rt / 'mgu.js'; code = module.read_text()
            old = "        if ((type || 'Text') === 'Text') value = widgetText(value);\n        return Promise.resolve(this.comp.setValue(Number(spawnId), cell, value, type || 'Text'))"
            new = "        if ((type || 'Text') === 'Text') {\n            if (!this._storageText) this._storageText = new HmiText();\n            return Promise.resolve(this._storageText.set(this.comp, 'STORAGE_WIDGET', Number(spawnId), cell, value))\n                .catch((e) => log.warn('widget ' + cell + ': ' + e));\n        }\n        return Promise.resolve(this.comp.setValue(Number(spawnId), cell, value, type || 'Text'))"
            if code.count(old) != 1: raise ValueError('Unsupported widget runtime')
            module.write_text(code.replace(old, new))
            pkg = {'name': 'storage', 'displayName': spec['title'], 'version': original['version'], 'description': spec['description'], 'main': 'javascript/app.js',
                'private': False, 'author': 'jaimeen77-cmyk', 'license': 'SEE NOTICE', 'mguHmi': ['ID7'], 'mguLocalOnly': True,
                'engines': {'node': '>=8.7.0'}, 'oapAppSettings': {'maxDiskUsage': 134217728, 'cpuLimit': 35,
                    'memoryThresholdKB': 131072, 'priority': 'PRIO_LOW', 'visibility': 'FOREGROUND', 'latencyClass': 'FOREGROUND',
                    'loggingId': original['loggingId'], 'userLoginRequired': False, 'backgroundPriority': 200, 'someipManifest': 'manifest.json'}}
            write(package / 'package.json', pkg)
            write(package / 'manifest.json', kit.manifest_for(copy.deepcopy(original)))
            write(package / 'npm-shrinkwrap.json', {'name': 'storage', 'version': original['version'], 'lockfileVersion': 1})
            write(package / 'config/base.json', {'rhmiLoadingEnabled': True, 'entryPointLoadingEnabled': True, 'settings': {'storage': {}}})
            shutil.copyfile(kit_root / 'kit/platform/permissions.json', package / 'permissions.json')
            shutil.copyfile(kit_root / 'LICENSE', package / 'LICENSE.idrive7-apps')
            rhmi = package / 'rhmiData'; description = {'schemaVersion': '1.3.0', 'application': {
                'uuid': kit.u('storage','app'), 'type': 'OnlineApp', 'name': 'storage', 'vendor': 'custom', 'version': original['version'],
                'defaultLanguage': 'en_GB', 'stringBundleUuid': kit.u('storage','strings'), 'resourceBundleUuid': kit.u('storage','resources'),
                'entryPoints': [{'name':'STORAGE_ENTRY','uuid':kit.u('storage','entry'),'textId':kit.sid('storage','TITLE'),
                    'icon':'storage_icon.png','insertionStateId':20974,'insertionFocusId':2,'insertionMode':'INSERT_BELOW','insertionOrder':0,
                    'insertionPriority':0,'previewType':'NONE','bookmarkable':True,'private':False,'appearance':'DEFAULT','isGroupHeader':False,'insertionGroup':0}],
                'uiDescriptions':[{'applicationFilePath':'./uiDescriptions/ID7/application.xml','uiDescriptionFilePath':'./uiDescriptions/ID7/uiDescription.json','hmi':['ID7']}],
                'variantGroups':[{'stringsPath':'./variantGroups/Common/texts','resourcesPath':'./variantGroups/Common/images','hmi':['ID7'],'brands':['BMW']}]}}
            write(rhmi / 'application.json', description)
            write(rhmi / 'uiDescriptions/ID7/uiDescription.json', ui)
            (rhmi / 'uiDescriptions/ID7/application.xml').write_text(xml)
            for tag in kit.LANGS: write(rhmi / 'variantGroups/Common/texts' / (tag + '.json'), strings)
            image = rhmi / 'variantGroups/Common/images/storage_icon.png'; image.parent.mkdir(parents=True)
            shutil.copyfile(ROOT / 'apps/storage/icon.png', image)
            kit.build_start_widget(spec, 'storage', str(image), str(Path(tmp) / 'widget-installed'), str(package / 'rhmiDataStartWidget'))
            for file in (package / 'rhmiDataStartWidget/variantGroups/Common/texts').glob('*.json'):
                bundle = json.loads(file.read_text()); bundle.update({'SID_CN_DYNAMIC_%04d' % i: '' for i in range(256)});write(file, bundle)
            runtime = 'storage' + ('.en' if language == 'en' else '')
            archive = Path(tmp) / 'runtime.tgz'
            with archive.open('wb') as output, gzip.GzipFile(fileobj=output,filename='',mode='wb',mtime=0) as zipped, tarfile.open(fileobj=zipped,mode='w') as tar:
                for file in sorted(package.rglob('*')):
                    if not file.is_file(): continue
                    data = file.read_bytes(); rel = 'package/' + file.relative_to(package).as_posix()
                    if 'node_modules' in file.parts or '/oap-sdk/' in rel: raise ValueError('SDK in template')
                    info = tarfile.TarInfo(rel);info.size=len(data);info.mode=0o644
                    import io
                    tar.addfile(info, io.BytesIO(data))
            data = archive.read_bytes(); parts = []
            for old in runtime_root.glob(runtime + '.tgz.part-*'): old.unlink()
            for index, at in enumerate(range(0,len(data),48*1024)):
                name = runtime + '.tgz.part-' + str(index).zfill(2)
                (runtime_root / name).write_bytes(data[at:at+48*1024]);parts.append(name)
            if len(parts)>32: raise ValueError('Runtime exceeds supported part count')
            command = "const fs=require('fs'),b=require(process.argv[1]);process.stdout.write(b.fingerprint(JSON.parse(fs.readFileSync(process.argv[2])), 'storage'));"
            fingerprint = subprocess.check_output(['node','-e',command,str(ROOT / 'tools/store-build.js'),str(ROOT / 'apps/storage/app.json')],text=True).strip()
            write(runtime_root / (runtime + '.json'), {'schema':1,'id':'storage','language':language,'source_version':original['version'],
                'ui_sha256':fingerprint,'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'parts':parts,
                'provenance':{'runtime':'jaimeen77-cmyk/appsKOR','commit':'ce660077eb89b59bdaf318a63f8c0a388af383f4','license':'MIT','sdk_included':False}})
            print(runtime + ': ' + str(len(data)) + ' bytes, ' + str(len(parts)) + ' SDK-free parts; version ' + original['version'])

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--kit-root',required=True,type=Path)
    generate(parser.parse_args().kit_root.resolve())
