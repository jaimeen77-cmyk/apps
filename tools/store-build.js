'use strict';
// MGU Store repo-tree builder. Node 8, unprivileged, no network; the head unit's oap-sdk module goes in when the Store provides it.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
function fingerprint(spec, template) {
    const identity = Object.assign({}, spec, { id: template }); delete identity.version;
    return sha(canonical(identity) + '\n' + sha(fs.readFileSync(path.join(ROOT, 'localization/ko-additions.tsv'))));
}
function walk(dir) {
    let files = [];
    fs.readdirSync(dir).forEach((name) => {
        const file = path.join(dir, name), stat = fs.lstatSync(file);
        if (stat.isDirectory()) files = files.concat(walk(file));
        else if (stat.isFile()) files.push(file);
        else throw new Error('Only regular files are allowed: ' + file);
    });
    return files;
}
function clean(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((name) => {
        const file = path.join(dir, name);
        if (fs.lstatSync(file).isDirectory()) clean(file); else fs.unlinkSync(file);
    });
    fs.rmdirSync(dir);
}
function uuidFor(id, original) {
    const b = crypto.createHash('sha256').update('idrive7-jam-store:' + id + ':' + original.toLowerCase()).digest().slice(0, 16);
    b[6] = (b[6] & 15) | 0x50; b[8] = (b[8] & 63) | 0x80;
    const h = b.toString('hex'); return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}
// Optional read-only inputs must be supported by this unit's catalog.
// Mutate only our app manifest; the vehicle catalog is never changed or copied.
function filterOptionalProxies(manifest, catalog, optional) {
    if(optional&&['de.bmw.infotainment.vehicle.CDS2','de.bmw.infotainment.KombiIF','com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu'].some(i=>optional[i]))require('../apps/cluster_redline/aux-info').filterAux(manifest,catalog);
    const proxies = manifest.proxies || {}, interfaces = catalog.interfaces || {};
    const program = 'de.bmw.infotainment.misc.MDrive';
    const guidance = 'de.bmw.infotainment.navigation.guiding.Guidance';
    const field = (name, key) => interfaces[name] && interfaces[name].fields && interfaces[name].fields[key];
    const gearbox = field(program, 'dataDisplayGearbox');
    if (!gearbox || !gearbox.notifier) delete proxies[program];
    const route = field(guidance, 'guidanceState');
    const instances = catalog.instanceIDs && catalog.instanceIDs[guidance];
    const named = instances && Object.prototype.hasOwnProperty.call(instances, 'Main_Instance') && instances.Main_Instance != null;
    if (optional && optional[guidance] && (!route || !route.getter || !route.getter.id || !named)) delete proxies[guidance];
    if (optional && optional[guidance] && proxies[guidance]) {
        const attrs=proxies[guidance].attributes||{};
        ['guidanceState','guidingProvider','conclusiveDart'].forEach((key)=>{
            const item=field(guidance,key);
            if(!item||!item.getter||!item.getter.id)delete attrs[key];
            else if(attrs[key]&&(!item.notifier||!item.notifier.id))attrs[key]=attrs[key].replace(/s/g,'');
        });
    }
    // Circuit builds do not download the Redline sources. Only load its
    // projection helper when this app actually requests an optional manager.
    if (optional && Object.keys(optional).some((name) => /\.(AndroidAutoProjectedManager|CarPlayManager)$/.test(name))) {
        require('../apps/cluster_redline/projection-config').filterProjections(manifest, catalog, optional);
    }
    if(optional&&optional['de.bmw.infotainment.navigation.guiding.GuidanceRenderedContent'])require('../apps/cluster_redline/hud-guidance-config').filterRendered(manifest,catalog,optional);
    if(optional&&optional['de.bmw.infotainment.navigation.guiding.GuidanceEventList'])require('../apps/cluster_redline/route-events-config').filterRouteEvents(manifest,catalog,optional);
    if(optional&&optional['de.bmw.infotainment.navigation.projectedmodeguiding.ProjectedModeGuiding'])require('../apps/cluster_redline/lane-config').filterLanes(manifest,catalog,optional);
    return manifest;
}
// The general pass of the App Kit's build.py fit_to_unit (issue #145), as the Store does for the kit's own
// apps when it builds them on the head unit: whatever this unit's interface catalog lacks (an iDrive 8
// firmware's differs from the iDrive 7 one the runtime template was prepared without) is taken out, so the
// installer accepts the app: missing fields, methods, broadcasts and named instances; a field's r / s / w
// without its getter / notifier / setter; an absent interface only when app.json marks it "_optional".
// Returns { what is missing: what the app loses } for javascript/kit/missing-interfaces.json; {} without a catalog.
function fitToUnit(manifest, signals, catalog) {
    const have = catalog && catalog.interfaces, instanceIds = catalog && catalog.instanceIDs;
    if (!have || typeof have !== 'object' || !Object.keys(have).length) return {};
    const proxies = manifest.proxies || {}, missing = {}, reason = {};
    Object.keys(signals || {}).forEach((i) => { if (signals[i] && signals[i]._optional) reason[i] = signals[i]._optional; });
    const names = (x) => Array.isArray(x) ? x.filter((e) => e && typeof e === 'object').map((e) => e.name) : Object.keys(x || {});
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    Object.keys(signals || {}).forEach((iface) => {
        const entry = proxies[iface];
        if (entry === undefined) return;
        const unit = have[iface];
        if (!isObj(unit)) {
            if (reason[iface]) { delete proxies[iface]; missing[iface] = reason[iface]; }
            return;
        }
        if (!isObj(entry)) return;
        let gone = [];
        const inst = entry.instances;
        if (isObj(instanceIds) && inst !== undefined && inst !== null && inst !== '*') {
            const known = instanceIds[iface], asked = Array.isArray(inst) ? inst : [inst];
            const lost = asked.filter((n) => String(n).indexOf('${') < 0 && !(isObj(known) && known[String(n)]));
            if (lost.length) {
                gone = gone.concat(lost.map((n) => 'instance ' + n));
                const keep = asked.filter((n) => lost.indexOf(n) < 0);
                if (!keep.length) {
                    delete proxies[iface];
                    missing[iface + ': ' + gone.join(', ')] = reason[iface] || 'these signals';
                    return;
                }
                entry.instances = Array.isArray(inst) ? keep : keep[0];
            }
        }
        const attrs = entry.attributes;
        if (isObj(attrs)) {
            const fields = isObj(unit.fields) ? unit.fields : {};
            Object.keys(attrs).forEach((n) => {
                const f = fields[n], mode = attrs[n];
                if (!isObj(f) || typeof mode !== 'string') return;
                const need = { r: 'getter', s: 'notifier', w: 'setter' };
                const left = mode.split('').filter((c) => 'rsw'.indexOf(c) < 0 || need[c] in f).join('');
                if (left !== mode) {
                    gone.push(n + ' (' + mode.split('').filter((c) => left.indexOf(c) < 0).join('') + ')');
                    if (left) attrs[n] = left; else delete attrs[n];
                }
            });
            if (!Object.keys(attrs).length) delete entry.attributes;
        }
        [['attributes', 'fields'], ['methods', 'methods'], ['broadcasts', 'events']].forEach((kp) => {
            const asked = entry[kp[0]];
            if (!asked || (Array.isArray(asked) ? !asked.length : !Object.keys(asked).length)) return;
            const known = names(unit[kp[1]]);
            const list = Array.isArray(asked) ? asked : Object.keys(asked);
            const lost = list.filter((n) => known.indexOf(n) < 0);
            if (!lost.length) return;
            gone = gone.concat(lost);
            if (Array.isArray(asked)) entry[kp[0]] = asked.filter((n) => known.indexOf(n) >= 0);
            else { const kept = {}; Object.keys(asked).forEach((n) => { if (known.indexOf(n) >= 0) kept[n] = asked[n]; }); entry[kp[0]] = kept; }
            const now = entry[kp[0]];
            if (Array.isArray(now) ? !now.length : !Object.keys(now).length) delete entry[kp[0]];
        });
        if (gone.length) {
            missing[iface + ': ' + gone.join(', ')] = reason[iface] || 'these signals';
            const used = (k) => entry[k] && (Array.isArray(entry[k]) ? entry[k].length : Object.keys(entry[k]).length);
            if (!['attributes', 'methods', 'broadcasts'].some(used)) delete proxies[iface];
        }
    });
    return missing;
}
function build(options) {
    const template = options.template, id = options.id, version = options.version;
    let language = options.language;
    if (language && ['ko', 'en'].indexOf(language) < 0) throw new Error('Language must be ko or en');
    if (!ID.test(template || '') || !ID.test(id || '') || !VERSION.test(version || '')) throw new Error('Valid --template, --id and numeric --version are required');
    const appDir = path.resolve(ROOT, options.dir || '');
    if (appDir.indexOf(ROOT + path.sep) !== 0) throw new Error('App directory must be inside the repository');
    const spec = JSON.parse(fs.readFileSync(path.join(appDir, 'app.json'), 'utf8'));
    if (spec.id !== id || spec.version !== version) throw new Error('Build identity/version must match the selected app manifest');
    const sourceDir = options.source ? path.resolve(ROOT, options.source) : appDir;
    if (sourceDir.indexOf(ROOT + path.sep) !== 0) throw new Error('Source directory must be inside the repository');
    const sourceSpec = JSON.parse(fs.readFileSync(path.join(sourceDir, 'app.json'), 'utf8'));
    if (sourceSpec.version !== version || (options.source && sourceSpec.id !== template)) throw new Error('Language variant must match the current source id/version');
    language = language || sourceSpec.storeDefaultLanguage || 'ko';
    const runtime = template + (language === 'en' ? '.en' : '');
    const metadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/runtime', runtime + '.json'), 'utf8'));
    if (metadata.id !== template || metadata.language !== language || metadata.ui_sha256 !== fingerprint(sourceSpec, template)) {
        throw new Error('Generated UI/locale is stale. Maintainer: rebuild this language and run tools/prepare-store.py.');
    }
    let archive = path.join(ROOT, 'store/runtime', runtime + '.tgz');
    const parts = metadata.parts;
    if (parts && (!Array.isArray(parts) || !parts.length || parts.length > 32 || parts.some((name) => typeof name !== 'string' || name.indexOf(runtime + '.tgz.part-') !== 0 || path.basename(name) !== name))) throw new Error('Invalid runtime part list');
    const data = parts ? Buffer.concat(parts.map((name) => fs.readFileSync(path.join(ROOT, 'store/runtime', name)))) : fs.readFileSync(archive);
    if (data.length !== metadata.size || sha(data) !== metadata.sha256) throw new Error('Runtime template checksum mismatch');
    const out = path.resolve(options.out || process.env.MGU_OUT || '');
    if (!options.out && !process.env.MGU_OUT) throw new Error('MGU_OUT or --out is required');
    if (!fs.existsSync(out)) fs.mkdirSync(out);
    if (fs.readdirSync(out).length) throw new Error('Output directory must be empty');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jam-store-build-'));
    try {
        if (parts) { archive = path.join(work, 'runtime.tgz'); fs.writeFileSync(archive, data); }
        const names = cp.execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
        if (names.some((n) => n.indexOf('package/') !== 0 || n.split('/').some((p) => p === '..' || p === 'node_modules'))) throw new Error('Unsafe runtime template');
        cp.execFileSync('tar', ['-xzf', archive, '-C', work]);
        const stage = path.join(work, 'package');
        if (walk(stage).some((f) => f.split(path.sep).indexOf('node_modules') >= 0)) throw new Error('SDK/native modules must not be distributed');
        // Compile the current app source into the prepared runtime/UI, not a frozen app bundle.
        fs.readdirSync(sourceDir).forEach((name) => {
            const file = path.join(sourceDir, name);
            if (!fs.statSync(file).isFile()) return;
            if (/\.(js|wasm|wad|pack)$/.test(name) || name === 'LICENSE' || name === 'NOTICE') {
                fs.writeFileSync(path.join(stage, 'javascript', name === 'main.js' ? 'app.js' : name), fs.readFileSync(file));
            }
        });
        if (!fs.existsSync(path.join(stage, 'javascript/app.js'))) throw new Error('App main.js is missing');
        const icon = path.join(sourceDir, 'icon.png');
        if (fs.existsSync(icon)) fs.writeFileSync(path.join(stage, 'rhmiData/variantGroups/Common/images', template + '_icon.png'), fs.readFileSync(icon));
        const packageFile = path.join(stage, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8')), oldVersion = pkg.version;
        const identityFiles = walk(stage).filter((f) => {
            const rel = path.relative(stage, f).split(path.sep).join('/');
            return /\.(json|xml)$/.test(f) && (rel.indexOf('rhmiData/') === 0 || rel.indexOf('rhmiDataStartWidget/') === 0 ||
                ['package.json', 'npm-shrinkwrap.json', 'manifest.json', 'permissions.json', 'config/base.json', 'javascript/kit/app-spec.json'].indexOf(rel) >= 0);
        });
        const uuids = Object.create(null);
        if (id !== template) identityFiles.filter((f) => path.basename(f) === 'application.json').forEach((f) => {
            (fs.readFileSync(f, 'utf8').match(UUID) || []).forEach((uuid) => { uuids[uuid.toLowerCase()] = uuidFor(id, uuid); });
        });
        identityFiles.forEach((file) => {
            let text = fs.readFileSync(file, 'utf8').split(oldVersion).join(version);
            if (id !== template) text = text.replace(UUID, (u) => uuids[u.toLowerCase()] || u)
                .split(template.toUpperCase()).join(id.toUpperCase()).split(template).join(id);
            fs.writeFileSync(file, text);
        });
        // Asset filenames must follow rewritten RHMI entry-point references for aliased ids.
        if (id !== template) walk(stage).forEach((file) => {
            const base = path.basename(file);
            if (base.indexOf(template) >= 0) fs.renameSync(file, path.join(path.dirname(file), base.split(template).join(id)));
        });
        const ready = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
        ready.name = id; ready.version = version; ready.mguHmi = ['ID7', 'ID8']; ready.mguLocalOnly = true;
        fs.writeFileSync(packageFile, JSON.stringify(ready, null, 2) + '\n');
        // Missing optional inputs must not prevent installing the app. Native
        // navigation uses a getter only; a notifier-only field cannot establish
        // fresh inactive state for safe HUD recovery.
        let catalog = {};
        try { catalog = JSON.parse(fs.readFileSync(options.catalog || '/etc/oap/someip/someip-interfaces.json', 'utf8')); }
        catch (e) { if (options.catalog) throw e; }
        const optional = {};
        Object.keys(sourceSpec.signals || {}).forEach((name) => {
            if (sourceSpec.signals[name]._optional) optional[name] = true;
        });
        const manifestFile = path.join(stage, 'manifest.json');
        const manifest = filterOptionalProxies(JSON.parse(fs.readFileSync(manifestFile, 'utf8')), catalog, optional);
        const missing = fitToUnit(manifest, sourceSpec.signals, catalog);
        Object.keys(missing).forEach((what) => console.log('  this unit has no ' + what + ' - built without it: ' + missing[what]));
        if (Object.keys(missing).length && fs.existsSync(path.join(stage, 'javascript/kit')))
            fs.writeFileSync(path.join(stage, 'javascript/kit/missing-interfaces.json'), JSON.stringify(missing, null, 1));
        fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
        // As the App Kit's build.py does with the Store's "sdk": "oap-sdk": the oap-sdk module the Store made on
        // this head unit from its own donor goes into the package (it is never in this repository). Without it
        // (not on a head unit) the package is as before, and the installer makes the module itself.
        const sdk = path.join(ROOT, 'oap-sdk');
        if (fs.existsSync(path.join(sdk, 'index.js')) && fs.existsSync(path.join(sdk, 'package.json'))) {
            const dest = path.join(stage, 'node_modules', 'oap-sdk');
            [path.join(stage, 'node_modules'), dest].forEach((d) => { if (!fs.existsSync(d)) fs.mkdirSync(d); });
            ['index.js', 'package.json'].forEach((n) => fs.writeFileSync(path.join(dest, n), fs.readFileSync(path.join(sdk, n))));
        }
        const target = path.join(out, id + '@' + version + '.tgz');
        cp.execFileSync('tar', ['-czf', target, '-C', work, 'package']);
        console.log('Built ' + language + ' Store app (' + (fs.existsSync(path.join(stage, 'node_modules', 'oap-sdk')) ? 'with the head unit\'s oap-sdk' : 'SDK-free') + '): ' + target);
        return target;
    } finally { clean(work); }
}
function cli(args) {
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        if (!/^--(?:template|id|version|dir|out|language|source|catalog)$/.test(args[i]) || args[i + 1] === undefined) throw new Error('Usage: --template <source-id> --id <id> --version <x.y.z> --dir <app-folder> [--language ko|en] [--source <source-folder>] [--catalog <vehicle-catalog>] [--out <empty-folder>]');
        options[args[i].slice(2)] = args[i + 1];
    }
    build(options);
}
if (require.main === module) { try { cli(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
module.exports = { build, canonical, fingerprint, uuidFor, filterOptionalProxies, fitToUnit };
