'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { settings } = require('../../apps/cluster_redline/policy');
const { Outputs } = require('../../apps/cluster_redline/outputs');
const source = fs.readFileSync(path.join(__dirname, '../../apps/cluster_redline/worker.js'), 'utf8');

async function scenario(live, version, backend, withProgram, stopEarly, target, withTraffic) {
    withProgram = withProgram !== false;
    backend = backend || 'id7';
    let time = 0, timer, delay, client, watches = 0, shutdowns = 0;
    const files = {}, feeds = {}, subscriptions = {}, config = settings(), app = new EventEmitter();
    const calls = [];
    if(withTraffic)config.hudTrafficMode="both";
    if (target) { config.displayTarget = target; ['sport','all'].forEach(mode => { config[mode+'HudOutput']=target==='hud'?'redline':'stock';config[mode+'ClusterOutput']=target==='hud'?'stock':'redline'; }); }
    class FakeClient extends EventEmitter {
        constructor() { super(); client = this; this.ready = false; this.backend = backend; this.targets = 'map:1088x480,panel:1920x720,hud:800x480'; this.next = 0; }
        connect() { calls.push('connect'); this.ready = true; this.emit('ready'); }
        image(o) { calls.push(['image', o]); return ++this.next; }
        pixels() { calls.push('pixels'); }
        set() { calls.push('visible'); }
        drop() { calls.push('drop'); }
        close() { calls.push('close'); this.ready = false; }
    }
    config.allHudOutput='stock';config.allClusterOutput='stock';
    const painter = { W: 1088, H: 480, draw: () => ({ d: Buffer.alloc(4) }), difference: () => ({ rects: [], pixels: Buffer.alloc(0) }) };
    const fakeFs = {
        readFileSync: () => JSON.stringify({ id: 'cluster-render', version: version }),
        writeFileSync: (p, v) => { files[p] = v; },
        renameSync: (a, b) => { files[b] = files[a]; delete files[a]; },
    };
    const box = { module: { exports: {} }, require: (name) => {
        if (name === 'fs') return fakeFs;
        if (name === 'path') return path;
        if (name === './cluster_render_client') return { ClusterRender: FakeClient };
        if (name === './outputs') return { Outputs };
        if (name === './draw') return painter;
        if (name === './hud-compose') return Object.assign({}, painter, { W: 800, H: 353 });
        if(['./lane-guidance','./native-navigation','./projection-config','./hud-guidance','./route-events','./aux-info','./display-config'].includes(name))return require('../../apps/cluster_redline/'+name.slice(2));
        if (name === './policy') return require('../../apps/cluster_redline/policy');
        if (name === './renderer') return require('../../apps/cluster_redline/renderer');
        if (name === './guidance') return require('../../apps/cluster_redline/guidance');
        if (name === './gear') return require('../../apps/cluster_redline/gear');
        if(name==='./battery-voltage')return require('../../apps/cluster_redline/battery-voltage');
        if(['./demand-signals','./data-demand'].includes(name))return require('../../apps/cluster_redline/'+name.slice(2));
        throw new Error('Unexpected dependency ' + name);
    }, process: { hrtime: () => [Math.floor(time / 1000), Math.floor((time % 1000) * 1000000)], once() {}, removeListener() {} },
    setTimeout: (fn, ms) => { timer = fn; delay = ms; return 1; }, clearTimeout: () => { timer = null; }, console };
    vm.runInNewContext(source, box, { filename: 'worker.js' });
    const worker = box.module.exports.start({
        dataDir: '/data', app: app,
        settings: { get: (k) => config[k] }, log: { warn() {} },
        signals: { hasNative: () => live, loadConfig: (iface) => { if (iface==='de.bmw.infotainment.navigation.guiding.Guidance') return {fields:{guidanceState:{getter:{id:1}},guidingProvider:{getter:{id:2}}}}; if (!withProgram) throw new Error('optional MDrive absent'); return { fields: { dataDisplayGearbox: {} } }; }, watch: (iface, instance, handlers, log, options) => {
            const navigation = iface === 'de.bmw.infotainment.navigation.guiding.Guidance';
            assert.strictEqual(instance, navigation ? 'Main_Instance' : '1'); assert.strictEqual(options.pollMs, undefined);
            if(navigation){handlers.guidanceState('INACTIVE');handlers.guidingProvider('NONE');}
            feeds[iface] = handlers; watches++;
            const sub = { available: true, shutdown() { shutdowns++; } }; subscriptions[iface] = sub;
            return Promise.resolve(sub);
        } },
    });
    if (stopEarly) {
        worker.stop();
        await Promise.resolve();
        assert.strictEqual(timer, null); assert.strictEqual(shutdowns, watches, 'late subscriptions must shut down after OFF');
        assert.strictEqual(app.listenerCount('shutdown'), 0);
        return;
    }
    await Promise.resolve();
    const status = () => JSON.parse(JSON.stringify(worker.status()));
    assert.strictEqual(files[path.join('/data', 'cluster-redline-status.json')], undefined, 'no status file');
    assert.strictEqual(delay, 50, 'background loop must request a fixed 20fps period');
    const tick = (at) => { time = at; assert(timer); const fn = timer; timer = null; fn(); };
    assert.strictEqual(status().requested, false);
    if (!live) {
        assert.strictEqual(watches, 0); assert.strictEqual(calls.indexOf('connect'), -1);
        tick(1000); assert.strictEqual(status().source, 'offline-disabled');
    } else {
        assert.strictEqual(watches, (withProgram ? 5 : 4));
        feeds['de.bmw.infotainment.navigation.guiding.Guidance'].guidanceState('INACTIVE');
        feeds['de.bmw.infotainment.navigation.guiding.Guidance'].guidingProvider('NONE');
        const rpm = feeds['de.bmw.infotainment.vehicle.CDS'].statusEngineSpeed2;
        const mode = feeds['de.bmw.infotainment.drivingexcitement.FES'].statusFESVehicleDynamicSwitchHMI;
        assert.strictEqual(typeof rpm, 'function'); assert.strictEqual(typeof mode, 'function');
        rpm({ actualValueRPMEngineCrankshaft: 26000 }); mode({ actualValueModeDrivingExperience: 'SPORT_DYNAMIC' });
        tick(1000);
        if(withTraffic)assert(!Object.keys(feeds).some(i=>/TrafficSign|FrontCamera|Vehicle2$/.test(i)), 'retired traffic inputs stay closed');
        if (['0.4.0', '0.4.1'].includes(version) && backend === 'id7') {
            assert.strictEqual(status().requested,true,JSON.stringify(status().outputs));assert.strictEqual(status().rpm,6500);
            assert.strictEqual(status().shift, true);
            const gear = feeds['de.bmw.infrastructure.VehicleInformation'];
            gear.statusGearboxDrive({ statusActualGearDrive: 'G4', statusActualStageDrive: 'D' });
            gear.DataPowerTrain2({});
            config.shiftRpm = 2000; rpm({ actualValueRPMEngineCrankshaft: 8400 }); tick(1500);
            assert.strictEqual(status().config.shiftRpm, 2000); assert.strictEqual(status().shift, true); assert.strictEqual(status().gear, 'D4');
            feeds['de.bmw.infotainment.drivingexcitement.FES'].statusActualValueTorque2({ actualValueTorqueCrankshaft: 2807 });
            if (withProgram) feeds['de.bmw.infotainment.misc.MDrive'].dataDisplayGearbox({ displayProgramGearbox: 1 });
            config.shiftRpm = 3000; config.frameRate = 60; tick(2000);
            assert.strictEqual(status().config.frameRate, 20); assert.strictEqual(delay, 50);
            assert.strictEqual(status().shift, false); assert.strictEqual(status().gear, withProgram ? 'S4' : 'D4', 'received programme and change-only gear are preserved');
            assert.strictEqual(status().torqueNm, 380); assert(status().powerPS > 100);
            assert.deepStrictEqual(calls.filter((c) => Array.isArray(c)).map((c) => c[1].target), [target || 'map']);
            assert.strictEqual(status().targetName, target || 'map');
            assert.strictEqual(status().guidanceRequested, !target || target === 'map');
            assert.strictEqual(status().rendererBackend, 'id7');
            assert(status().rendererTargets.includes('hud:800x480'), 'diagnostics record the native advertised targets');
            if (target === 'hud') assert.strictEqual(calls.find(c => Array.isArray(c))[1].iw, 800);
            // The settings UI is never opened in this test. Its visibility is irrelevant.
            mode({ actualValueModeDrivingExperience: 4 }); tick(2500);
            assert.strictEqual(status().requested, false); assert(calls.includes('drop'));
            subscriptions['de.bmw.infrastructure.VehicleInformation'].available = false;
            mode({ actualValueModeDrivingExperience: 1 }); rpm({ actualValueRPMEngineCrankshaft: 24000 }); tick(3600);
            assert.strictEqual(status().gear, '--', 'provider loss must clear the last gear');
            config.appEnabled = false; tick(4200); assert.strictEqual(status().requested, false);
        } else {
            assert.strictEqual(status().requested, false);
            if (!['0.4.0', '0.4.1'].includes(version)) assert.strictEqual(calls.indexOf('connect'), -1);
            assert.strictEqual(calls.filter((c) => Array.isArray(c) && c[0] === 'image').length, 0);
        }
    }
    app.emit('shutdown'); for(let i=0;i<20;i++)await Promise.resolve(); assert.strictEqual(timer, null); assert.strictEqual(shutdowns, watches);
    worker.stop(); // idempotent
}
(async () => {
    await scenario(true, '0.3.10');
    await scenario(true, '0.3.9');
    await scenario(true, '0.3.1');
    await scenario(true, '0.4.0');
    await scenario(true, '0.4.1');
    await scenario(true, '0.4.0', 'id7', true, false, 'hud');
    await scenario(true, '0.4.0', 'id7', true, false, 'hud', true);
    await scenario(true, '0.4.0', 'id7', false);
    await scenario(true, '0.4.0', 'id8');
    await scenario(false, '0.3.10');
    await scenario(true, '0.4.0', 'id7', true, true);
    console.log('PASS: real worker live-field adapters, raw RPM scale, background sport-only output, master OFF, old-renderer refusal, offline no-connect and platform shutdown');
})().catch((e) => { console.error(e); process.exit(1); });
