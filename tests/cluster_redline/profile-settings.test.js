'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { settings } = require('../../apps/cluster_redline/policy');
const project = path.resolve(process.argv[2] || '');
const stage = path.resolve(process.argv[3] || path.join(project, 'dist/cluster_redline'));
if (!process.argv[2]) throw new Error('Pass the original idrive7-apps project path');
const { headUnit } = require(path.join(project, 'kit/tools/hu-stub'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cluster-profile-'));
// Saved shift threshold survives; retired scales/prefixes must no longer override presets.
fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ shiftRpm: 6200, redlineRpm: 6800, maxRpm: 8000, gearPrefix: 'S', torqueScale: 1500, autoSport: false, frameRate: 60 }));
let frames = 0;
const hu = headUnit(stage, { dataDir: dir, image: async () => { frames++; }, log: { info() {}, warn() {}, error() {} } });
function effective() {
    const raw = {}; hu.spec.settings.forEach((s) => { raw[s.key] = hu.settings.get(s.key); }); return settings(raw);
}
(async () => {
    try {
        hu.start(); await new Promise((r) => setTimeout(r, 30));
        assert(frames > 0, 'actual app entry must draw settings on startup');
        assert.strictEqual(effective().appEnabled, false, 'legacy OFF must survive upgrade');
        const listeners = process.listenerCount('exit');
        hu.settings.set('appEnabled', true); assert.strictEqual(process.listenerCount('exit'), listeners + 1);
        hu.settings.set('appEnabled', false); assert.strictEqual(process.listenerCount('exit'), listeners, 'OFF must stop its worker and remove the shutdown listener');
        assert.strictEqual(effective().shiftRpm, 6200);
        assert.strictEqual(effective().frameRate, 20, 'saved 60fps must not override the fixed ceiling');
        assert.strictEqual(effective().redlineRpm, 6000); assert.strictEqual(effective().maxRpm, 7000);
        assert.strictEqual(effective().gearPrefix, undefined); assert.strictEqual(effective().torqueScale, 500);
        assert.strictEqual(effective().sportClusterOutput,'redline');assert.strictEqual(effective().sportHudOutput,'stock');
        const chooseNext=()=>{hu.handlers.BTN_VALUE_UP();hu.handlers.BTN_NEXT();hu.handlers.BTN_VALUE_UP();};
        // Basic tab: auto start, app, settings per driver (1.3.13), door-open warning (1.3.19), then the vehicle preset
        hu.handlers.BTN_NEXT();hu.handlers.BTN_NEXT();hu.handlers.BTN_NEXT();hu.handlers.BTN_NEXT();chooseNext();assert.strictEqual(effective().engineProfile,'diesel');assert.strictEqual(effective().shiftRpm,4200);
        hu.handlers.BTN_NEXT();chooseNext();assert.strictEqual(effective().powerUnit,'kW');
        hu.handlers.BTN_NEXT();chooseNext();assert.strictEqual(effective().torqueUnit,'kgfm');
        hu.handlers.BTN_NEXT();chooseNext();assert.strictEqual(effective().shiftRpm,2000);
        hu.handlers.BTN_HUD();hu.handlers.BTN_VALUE_UP();hu.handlers.BTN_PREVIOUS();hu.handlers.BTN_VALUE_UP();assert.strictEqual(effective().sportHudOutput,'redline');
        hu.handlers.BTN_NAV();hu.handlers.BTN_VALUE_UP();hu.handlers.BTN_NEXT();hu.handlers.BTN_VALUE_UP();assert.strictEqual(effective().navDisplayMode,'excludeSport');
        hu.handlers.BTN_CLUSTER();hu.handlers.BTN_VALUE_UP();hu.handlers.BTN_NEXT();hu.handlers.BTN_VALUE_UP();assert.strictEqual(effective().sportClusterOutput,'stock');
        const saved=JSON.parse(fs.readFileSync(path.join(dir,'settings.json')));
        for(const key of ['appEnabled','engineProfile','powerUnit','torqueUnit','shiftRpm','sportHudOutput','sportClusterOutput','navDisplayMode','hudAlertStyle','clusterAlertStyle'])assert.strictEqual(saved[key],hu.settings.get(key),'persisted '+key);
        assert.strictEqual(saved._outputsV,1);
        assert(!hu.spec.settings.some(s => ['gearPrefix','redlineRpm','maxRpm','torqueScale','powerScale','autoSport','frameRate'].includes(s.key)));
        console.log('PASS: actual bilingual-ready entry/UI, legacy OFF and fixed 20fps migration, preset reset, four tabs and persisted per-display/NAV choices');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    process.exit(0);
})().catch((e) => { console.error(e); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
