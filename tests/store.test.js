'use strict';
// Host-only integration: actual repo-tree parser when MGU_STORE_UPDATER_JS is set.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const vm = require('vm');
const { build } = require('../tools/store-build');
const ROOT = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jam-store-test-'));
const sourceCopy = fs.mkdtempSync(path.join(ROOT, '.store-test-'));
function entries(archive) { return cp.execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n'); }
function read(archive, name) { return cp.execFileSync('tar', ['-xOzf', archive, name]); }
function json(archive, name) { return JSON.parse(read(archive, 'package/' + name)); }
function copy(from, to) { fs.mkdirSync(to, { recursive: true }); fs.readdirSync(from).forEach((n) => { const a = path.join(from, n), b = path.join(to, n); if (fs.statSync(a).isDirectory()) copy(a, b); else fs.copyFileSync(a, b); }); }
function checkPackage(file, id, version, start, language) {
    const names = entries(file);
    assert(!names.some((n) => /(^|\/)node_modules\//.test(n) || /(^|\/)oap-sdk\//.test(n)), 'published/build output must contain no SDK');
    const p = json(file, 'package.json');
    assert.strictEqual(p.name, id); assert.strictEqual(p.version, version);
    assert.deepStrictEqual(p.mguHmi, ['ID7']); assert.strictEqual(p.mguLocalOnly, true);
    assert.strictEqual(p.mguAppStartType || 'manually', start);
    assert.strictEqual(json(file, 'javascript/kit/locale.json').language, language);
    const title = json(file, 'rhmiData/variantGroups/Common/texts/en_GB.json')['SID_' + id.toUpperCase() + '_TITLE'];
    assert.strictEqual(/[가-힣]/.test(title), language === 'ko', 'RHMI title must use the chosen language');
    const spec = json(file, 'javascript/kit/app-spec.json');
    assert.strictEqual(spec.id, id);
    if (id.indexOf('cluster_redline') === 0) {
        const runtime=read(file,'package/javascript/kit/mgu.js').toString('utf8');
        assert(runtime.includes('// Jam custom settings isolation v1')&&runtime.includes('setMany(changes)'), 'Store template must carry custom-settings isolation and batched persistence');
        assert(names.includes('package/javascript/retained-scene.js')&&names.includes('package/javascript/render-state.js'),'Store source build must include retained-render helpers');
        assert.strictEqual(spec.settings.find((s) => s.key === 'displayTarget').default, 'map');
        assert.strictEqual(spec.settings.find((s) => s.key === 'widgetScale').default, 80);
        assert(!spec.settings.some((s) => ['gearPrefix', 'redlineRpm', 'maxRpm', 'torqueScale', 'powerScale'].includes(s.key)));
        assert.strictEqual(spec.settings.find((s) => s.key === 'appEnabled').default, true);
        assert(!spec.settings.some((s) => s.key === 'frameRate'));
    }
    const app = json(file, 'rhmiData/application.json').application;
    assert.strictEqual(app.name, id); assert.strictEqual(app.version, version);
    const icon = 'package/rhmiData/variantGroups/Common/images/' + app.entryPoints[0].icon;
    assert(names.includes(icon), 'RHMI icon reference must exist after id aliasing');
    return app.uuid;
}
function optionsFor(args) {
    const result = {};
    for (let i = 0; i < args.length; i += 2) result[args[i].slice(2)] = args[i + 1];
    return result;
}
async function checkSettingsEntry(file, id, version) {
    // Run the installed package's entry point and real painter, not the source
    // preview. Stub only the vehicle bridge and background worker.
    const stage = path.join(temp, id + '-entry'); fs.mkdirSync(stage);
    cp.execFileSync('tar', ['-xzf', file, '-C', stage]);
    const js = path.join(stage, 'package/javascript');
    const spec = JSON.parse(fs.readFileSync(path.join(js, 'kit/app-spec.json')));
    const { Canvas } = require(path.join(js, 'kit/canvas'));
    const { t } = require(path.join(js, 'kit/i18n'));
    const values = { frameRate: 60 }, handlers = {}, listeners = [], labels = [];
    spec.settings.forEach((s) => { values[s.key] = s.default; });
    const settings = { schema: spec.settings, get: (k) => values[k],
        set(k, v) { values[k] = v; listeners.forEach((fn) => fn(k)); },
        onChange(fn) { listeners.push(fn); } };
    const original = Canvas.prototype.text;
    Canvas.prototype.text = function (value) { labels.push(t(value)); return original.apply(this, arguments); };
    let start, frames = 0;
    const ctx = {
        spec, settings, dataDir: stage, log: { error(e) { throw e; } },
        canvas: (w, h) => new Canvas(w, h),
        ui: { text: async () => {}, image: async (name) => { assert.strictEqual(name, 'MAIN_GFX'); frames++; },
            onClick: (name, fn) => { handlers[name] = fn; } },
        onTap() {}, onTab() {}, onLayout() {}, loop() {},
    };
    try {
        const box = { require(name) {
            if (name === './kit/mgu') return { run(impl) { assert.strictEqual(impl.settingsUI,'custom');start = impl.start(ctx); } };
            if (name === './worker') return { start() { return { stop() {} }; } };
            return name[0] === '.' ? require(path.join(js, name)) : require(name);
        } };
        vm.runInNewContext(fs.readFileSync(path.join(js, 'app.js'), 'utf8'), box, { filename: 'installed-app.js' });
        await start;
        assert(frames > 0, 'installed entry must show the new settings immediately');
        assert.strictEqual(spec.version, version);
        for (const text of ['Basic settings', 'HUD display setting', 'CLUSTER display setting', 'NAV display setting', 'App auto start', 'Vehicle preset']) assert(labels.some((label) => label.toLowerCase() === t(text).toLowerCase()), text);
        assert(labels.includes('v' + version), 'visible version must match the installed package');
        assert(!handlers.BTN_SETTINGS, 'entry must not show the old status page and Settings button');
        labels.length = 0; const before=frames;handlers.BTN_HUD();
        const deadline=Date.now()+1000;while(frames===before&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
        assert(frames>before,'coalesced installed UI must deliver its next frame');
        assert(labels.includes(t('Sport mode RPM display')), 'installed HUD tab must be wired');
        assert(!spec.settings.some((s) => s.key === 'frameRate'), 'saved 60fps must not recreate the old menu');
    } finally { Canvas.prototype.text = original; }
}
(async () => {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'mgu-repo.json')));
    let sourceParser;
    if (process.env.MGU_STORE_UPDATER_JS) {
        sourceParser = require(path.join(process.env.MGU_STORE_UPDATER_JS, 'sources'));
        const catalog = await sourceParser.repoCatalog((name) => Promise.resolve(fs.readFileSync(path.join(ROOT, name))), null, 'local');
        assert.deepStrictEqual(catalog.skipped, []);
        assert.deepStrictEqual(catalog.components.map((c) => c.id).sort(), ['cluster_redline', 'cluster_redline_en', 'idrive_circuit', 'idrive_circuit_en', 'seats_easy_access', 'seats_easy_access_ko', 'storage', 'storage_en']);
        assert(catalog.components.every((c) => c.script.node === 'tools/store-build.js' && !c.script.network));
        for (const id of ['cluster_redline', 'cluster_redline_en']) {
            assert.strictEqual(catalog.components.find((c) => c.id === id).requires['cluster-render'], '0.4.0');
        }
    }
    const identities = new Set();
    for (const component of doc.components) {
        const id = component.id, spec = JSON.parse(fs.readFileSync(path.join(ROOT, component.path, 'app.json')));
        const args = component.build.args.map((a) => a.replace('{id}', id).replace('{version}', spec.version).replace('{dir}', component.path));
        const options = Object.assign(optionsFor(args), { out: path.join(temp, id) });
        const source = options.source || component.path;
        const runtimeFile = path.join(ROOT, 'store/runtime', options.template + (options.language === 'en' ? '.en' : '') + '.tgz');
        const heldFile = runtimeFile + '.test-held';
        let file;
        const hasFullTemplate = fs.existsSync(runtimeFile);
        if (hasFullTemplate) fs.renameSync(runtimeFile, heldFile);
        try { file = build(options); } finally { if (hasFullTemplate) fs.renameSync(heldFile, runtimeFile); }
        const start = options.template === 'cluster_redline' ? 'autostart' : 'manually';
        const originalUuid = checkPackage(file, id, spec.version, start, options.language);
        if (id === 'seats_easy_access') {
            const defaultFile = build(Object.assign({}, options, { language: undefined, out: path.join(temp, id + '-default') }));
            checkPackage(defaultFile, id, spec.version, start, 'en');
            assert(entries(file).includes('package/javascript/i18n.js'));
        }
        if (options.template === 'cluster_redline') await checkSettingsEntry(file, id, spec.version);
        assert(!identities.has(originalUuid), 'language variants need separate RHMI identities'); identities.add(originalUuid);
        assert(read(file, 'package/javascript/app.js').equals(fs.readFileSync(path.join(ROOT, source, 'main.js'))));
        const runtime = options.template + (options.language === 'en' ? '.en' : '');
        const templateInfo = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/runtime', runtime + '.json')));
        const templateBytes = Buffer.concat(templateInfo.parts.map((name) => fs.readFileSync(path.join(ROOT, 'store/runtime', name))));
        const runtimeNames = cp.execFileSync('tar', ['-tzf', '-'], { input: templateBytes, encoding: 'utf8' }).trim().split('\n');
        assert(!runtimeNames.includes('package/javascript/app.js'), 'template must not freeze the app source');
        if (sourceParser) {
            const tar = require(path.join(process.env.MGU_STORE_UPDATER_JS, 'tar'));
            const members = await tar.untgz(fs.readFileSync(file), 30 << 20);
            const entry = sourceParser.packageEntry(members, fs.readFileSync(file), {}, 'tgz');
            assert.strictEqual(entry.id, id); assert.strictEqual(entry.version, spec.version);
            assert.deepStrictEqual(entry.mguHmi, ['ID7']);
        }
        if (options.template === 'cluster_redline') {
            const optional = 'de.bmw.infotainment.misc.MDrive';
            const catalogFile = path.join(temp, id + '-catalog.json');
            // Firmware with/without the optional programme must both build.
            fs.writeFileSync(catalogFile, JSON.stringify({ interfaces: {} }));
            const absent = build(Object.assign({}, options, { catalog: catalogFile, out: path.join(temp, id + '-no-program') }));
            assert(!json(absent, 'manifest.json').proxies[optional]);
            // This car's field has a notifier and no getter. Requesting "rs"
            // makes the real installer reject it with UPDATE_FAILED.
            const interfaces = {}; interfaces[optional] = { fields: { dataDisplayGearbox: { notifier: { id: 32769 } } } };
            fs.writeFileSync(catalogFile, JSON.stringify({ interfaces }));
            const present = build(Object.assign({}, options, { catalog: catalogFile, out: path.join(temp, id + '-program') }));
            assert.strictEqual(json(present, 'manifest.json').proxies[optional].attributes.dataDisplayGearbox, 's');
            interfaces[optional].fields.dataDisplayGearbox = { getter: { id: 1 } };
            fs.writeFileSync(catalogFile, JSON.stringify({ interfaces }));
            const noEvents = build(Object.assign({}, options, { catalog: catalogFile, out: path.join(temp, id + '-no-events') }));
            assert(!json(noEvents, 'manifest.json').proxies[optional], 'optional programme needs a notifier, not a getter');
        }
        const alias = id + '2', dir = path.join(sourceCopy, alias);
        copy(path.join(ROOT, component.path), dir);
        const modified = Object.assign({}, spec, { id: alias });
        fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(modified));
        const aliasOptions = Object.assign({}, options, { id: alias, dir: path.relative(ROOT, dir), out: path.join(temp, alias) });
        let sourceDir = dir;
        if (options.source) {
            sourceDir = path.join(sourceCopy, id + '-shared-source'); copy(path.join(ROOT, source), sourceDir);
            aliasOptions.source = path.relative(ROOT, sourceDir);
        }
        fs.appendFileSync(path.join(sourceDir, 'main.js'), '\n// latest source supplied by the repository\n');
        const aliasFile = build(aliasOptions);
        const aliasUuid = checkPackage(aliasFile, alias, spec.version, start, options.language);
        assert.notStrictEqual(aliasUuid, originalUuid, 'aliased apps need distinct RHMI identities');
        assert(read(aliasFile, 'package/javascript/app.js').includes(Buffer.from('latest source supplied by the repository')));
        const aliasStrings = json(aliasFile, 'rhmiData/variantGroups/Common/texts/en_GB.json');
        assert(aliasStrings['SID_' + alias.toUpperCase() + '_TITLE']);
        // UI changes must never be installed with a stale generated screen or permission table.
        const sourceSpec = JSON.parse(fs.readFileSync(path.join(sourceDir, 'app.json')));
        if (sourceSpec.settings && sourceSpec.settings.length) sourceSpec.settings[0].label = 'Changed screen';
        else sourceSpec.screens[0].title = 'Changed screen';
        fs.writeFileSync(path.join(sourceDir, 'app.json'), JSON.stringify(sourceSpec));
        assert.throws(() => build(Object.assign({}, aliasOptions, { out: path.join(temp, alias + '-bad') })), /stale/);
        if (sourceParser) {
            const catalog = await sourceParser.repoCatalog((name) => Promise.resolve(fs.readFileSync(path.join(ROOT, name))), null, 'local');
            const entry = catalog.components.find((c) => c.id === id);
            assert(sourceParser.renameable(entry), 'every language variant must support Store collision ids');
            const named = Object.assign({}, entry, { path: path.relative(ROOT, path.join(sourceCopy, id)), manifest: path.relative(ROOT, path.join(sourceCopy, id, 'app.json')) });
            const files = [{ name: named.manifest, data: Buffer.from(JSON.stringify(spec)), mode: 0o644 }];
            const renamed = sourceParser.renameApp(named, files, id + '3');
            const target = path.join(ROOT, renamed.entry.path); copy(path.join(ROOT, component.path), target);
            fs.writeFileSync(path.join(target, 'app.json'), renamed.files[1].data);
            const actualOptions = Object.assign(optionsFor(renamed.entry.script.args), { out: path.join(temp, id + '3') });
            const renamedFile = build(actualOptions);
            checkPackage(renamedFile, id + '3', spec.version, start, options.language);
        }
    }
    console.log('PASS: eight Store listings including English/Korean Seats, SDK-free builds, packaged settings, distinct identities, collision-id builds, autostart and stale-UI rejection');
})().catch((e) => { console.error(e); process.exitCode = 1; }).then(() => {
    fs.rmSync(temp, { recursive: true, force: true }); fs.rmSync(sourceCopy, { recursive: true, force: true });
});
