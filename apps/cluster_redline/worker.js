'use strict';
// Live-only background work in the same OAP process as the settings UI.
// MainApp owns its autostart/restart lifecycle; no root service is installed.
const fs = require('fs');
const path = require('path');
const { ClusterRender } = require('./cluster_render_client');
const { Outputs } = require('./outputs');
const painter = require('./draw');
const hudPainter = require('./hud-compose');
const { settings, DEFAULTS } = require('./policy');
const renderer = require('./renderer');
const gear = require('./gear');
const guidance = require('./guidance');
const {NativeNavigation} = require('./native-navigation');
const {AuxInfo,SOURCES,auxOf}=require('./aux-info');
const D=require('./display-config'),{navAllowed,auxConfig,rpmOutput,clockText,sportMode,carMeterFaces}=D;
const {BatteryVoltage}=require('./battery-voltage');
const {PROJECTED} = require('./projection-config');
const {HudGuidance,INTERFACE:HUD_GUIDANCE,INSTANCE:HUD_INSTANCE,METHODS:HUD_METHODS}=require('./hud-guidance');
const {RouteEvents,INTERFACE:ROUTE_EVENTS,INSTANCE:ROUTE_INSTANCE,METHODS:ROUTE_METHODS}=require('./route-events');
const {LaneGuidance,INTERFACE:LANE_INTERFACE,INSTANCE:LANE_INSTANCE,FIELD:LANE_FIELD}=require('./lane-guidance');
const {DemandSignals}=require('./demand-signals');
const {demand}=require('./data-demand');
const CDS = 'de.bmw.infotainment.vehicle.CDS';
const FES = 'de.bmw.infotainment.drivingexcitement.FES';
const MODE_FIELD = 'statusFESVehicleDynamicSwitchHMI';
const VEHICLE_INFO = 'de.bmw.infrastructure.VehicleInformation';
const MDRIVE = 'de.bmw.infotainment.misc.MDrive';
const LIGHT = 'de.bmw.body.Light';
const {TurnSignal} = require('./turn-signal');
const {TurnOverlay} = require('./turn-overlay');
const {VehicleAlerts,SAMPLE:ALERT_SAMPLE} = require('./vehicle-alerts');
const {AlertOverlay} = require('./alert-overlay');
const {GreetingOverlay} = require('./greeting-overlay');
const DOOR = require('./door-alert');
const {LeadVehicle} = require('./lead-vehicle');
const {HeadwayOverlay} = require('./headway-overlay');
const {LaneLines, LaneOverlay} = require('./lane-lines');
const {LeadDeparture} = require('./lead-departure');
const {BlindSpot} = require('./blind-spot');
const {BlindSpotOverlay} = require('./blind-spot-overlay');
const driverGreeting = require('./driver-greeting');
const {TrafficSigns,FIELDS:TRAFFIC_FIELDS} = require('./traffic-signs');
const {live:trafficLive} = require('./traffic-live');
const previewPresence = require('./preview-presence');
const {NavProbe,drawnOf} = require('./nav-probe');
const {decodeDart} = require('./native-navigation');
const {decodeReply} = require('./route-events');
function mono() { const p = process.hrtime(); return p[0] * 1000 + p[1] / 1000000; }
function supportedRenderer() { return renderer.inspect(undefined, fs).compatible; }
function start(ctx) {
    let latest = null;
    const collectors=new DemandSignals(ctx.signals),log = ctx.log, signals = collectors.signals;
    const client = new ClusterRender('cluster-redline'), controller = new Outputs(client, painter, hudPainter);
    const gearbox = new gear.GearState(), navigation = new guidance.GuidanceState(), maneuvers = new NativeNavigation();
    const auxSetup={},auxInfo=new AuxInfo(),auxSubs=[],batteryVoltage=new BatteryVoltage(signals,log,mono);
    const projectionSubs={},projectionFields={},projectionPending={},projectionLastPoll={},projectionEpoch={},projectionEvents={};
    const navigationFields = [], lastNavigationValues = {}, navigationEventRevisions = {}, navigationSeenAt = {}, navigationReadState = {};
    function refreshProjection(provider){
        const sub=projectionSubs[provider],available=!!(sub&&sub.available&&!sub.error),before=maneuvers.projectedStatus(mono())[provider].available;
        if(before!==available){projectionEpoch[provider]=(projectionEpoch[provider]||0)+1;if(!Object.prototype.hasOwnProperty.call(PROJECTED,maneuvers.provider)||maneuvers.provider===provider)navigationRevision++;}
        maneuvers.projectionAvailability(provider,available,mono());
    }
    function navigationSample(field,value,readState) {
        if(stopped)return;
        Object.keys(PROJECTED).forEach(refreshProjection);
        navigationSeenAt[field]=mono();navigationReadState[field]=readState||'received';
        if(field!=='conclusiveDart' && lastNavigationValues[field]!==value){navigationRevision++;lastNavigationValues[field]=value;}
        if(field===guidance.FIELD)navigation.sample(value,mono());
        maneuvers.sample(field,value,mono());
        if(field==='conclusiveDart'&&value&&typeof value==='object')navProbe.turn('dart',maneuvers.provider,value.maneuver,drawnOf(decodeDart(value)));
        protectGuidance();
    }
    function protectGuidance() {
        const now=mono(),m=maneuvers.read(now,true);
        const key=m.active&&m.known?navigationRevision+':'+m.provider:null;
        const routeKey=collection.turns&&Object.prototype.hasOwnProperty.call(PROJECTED,m.provider)?key:null;
        const laneKey=collection.lanes&&m.active&&m.known&&m.provider==='CAR_PLAY'?key:null;
        lanes.context(laneKey);
        if((navigation.read(now,true).blocked||m.needsStock)&&!m.visible&&!routeEvents.read(now,routeKey)&&!hudGuidance.read(now,collection.turns?key:null)&&!lanes.read(now,laneKey))controller.hud.yieldGuidance();
    }
    function projectionSample(provider,field,value) {
        if(stopped)return;
        refreshProjection(provider);
        if(field==='projectedGuidanceActive') {
            const last=projectionEvents[provider].value;
            if(last!==value){projectionEpoch[provider]++;projectionEvents[provider].value=value;if(!Object.prototype.hasOwnProperty.call(PROJECTED,maneuvers.provider)||maneuvers.provider===provider)navigationRevision++;}
        }
        maneuvers.projectionSample(provider,field,value,mono());protectGuidance();
    }
    let lastYieldAt = -Infinity;
    let config = settings(),collection=demand(config,null), lastStatus = -Infinity, stopped = false, timer;
    let guidanceSub, lastGuidancePoll = -Infinity, guidancePending = false, navigationRevision = 0, nativeStatus = null;
    let rendererInfo = renderer.inspect(undefined, fs), lastRendererCheck = -Infinity, connectionStarted = false, gearSub, fesSub, programSub;
    const hudGuidance=new HudGuidance(mono,(proxy,method,args,timeout)=>signals.call(proxy,method,args,timeout));
    const routeEvents=new RouteEvents(mono,(proxy,method,args,timeout)=>signals.call(proxy,method,args,timeout));
    // what the navigation sends, turn by turn (1.3.43): Navigation display's list, and nav-probe.log while switched on
    const navProbe=new NavProbe({fs,file:ctx.dataDir?path.join(ctx.dataDir,'nav-probe.log'):null});
    routeEvents.onReply=(reply)=>navProbe.route(maneuvers.provider,reply,drawnOf(decodeReply(reply).value));
    hudGuidance.onEvent=(event,decoded)=>navProbe.turn('hud',maneuvers.provider,event,drawnOf(decoded));
    const lanes=new LaneGuidance(mono);
    const traffic=new TrafficSigns(),trafficSubs=[];let carSpeed={v:null,at:null};   // (carSpeed: the Car layout's own copy of the speed)
    // My picture's GIFs go in <data>/my-pictures/ (made here, so tools/my-pictures.js finds it; my-picture.js loads with the layout)
    if(ctx.dataDir){try{fs.mkdirSync(path.join(ctx.dataDir,'my-pictures'));}catch(e){}}
    // the HUD headway badge (lead-vehicle.js): made once the manifest's instances can be read, below
    let lead=null;const headwayOverlay=new HeadwayOverlay(client);
    // the HUD lane lines (lane-lines.js, 1.3.77): from the root helper, only while on
    const laneLines=new LaneLines(mono),laneOverlay=new LaneOverlay(client),departure=new LeadDeparture();let departureOn=false;
    const vehicleAlerts=new VehicleAlerts(mono,(proxy,method,args,timeout)=>signals.call(proxy,method,args,timeout)),alertOverlay=new AlertOverlay(client),greetingOverlay=new GreetingOverlay(client),clusterGreeting=new GreetingOverlay(client,'map'),doors=new DOOR.DoorState(),doorOverlay=new DOOR.DoorOverlay(client),blindSpot=new BlindSpot(signals,log),blindSpotOverlay=new BlindSpotOverlay(client);let doorSub=null,doorState='not_installed',greetingNow=null;
    const turnSignal=new TurnSignal(),turnOverlay=new TurnOverlay(client);let lightSub=null,lightSeenAvailable=false,lightState='not_installed';
    const subs = [], errors = [];
    function keep(s) { if (stopped) s.shutdown(); else subs.push(s); }
    const reportError = (name, e) => { const s = (name + ': ' + e).slice(0, 320); if (errors.indexOf(s) < 0) { errors.push(s); if (errors.length > 8) errors.shift(); } };   // kept for the settings screen, not logged
    const live = signals && typeof signals.hasNative === 'function' && signals.hasNative();
    if (!live) reportError('someip', 'live native binding unavailable; cluster output disabled');
    client.on('ready', () => {
        // Controller validates the selected target's exact ID7 geometry. It
        // never falls back to another target when the selected one is missing.
        if (client.backend !== 'id7' || !supportedRenderer()) {
            controller.hide(); controller.refused = true;
            reportError('cluster-render', 'unsupported backend or version; display disabled');
        }
    });
    if (live) {
        // Share one optional proxy per interface; polling belongs to this worker.
        const auxGroups={};SOURCES.forEach(source=>{(auxGroups[source.iface]||(auxGroups[source.iface]=[])).push(source);});
        Object.keys(auxGroups).forEach(iface=>{
            try{
                const cfg=signals.loadConfig(iface),handlers={},entries=[];
                auxGroups[iface].forEach(source=>{
                    const f=cfg.fields&&cfg.fields[source.field];
                    // Why a field is or is not read, for the settings check line and the status file.
                    auxSetup[source.field]={iface:iface.split('.').pop(),state:!cfg.fields?'no_fields':!f?'field_missing':'ok',fieldKeys:f&&typeof f==='object'?Object.keys(f).slice(0,6):[],configFields:cfg.fields?Object.keys(cfg.fields).slice(0,6):[]};
                    // A subscribed source (the exterior temperature) is set up whenever the installed config has the
                    // field, whatever its getter / notifier entries are named, as the eDrive app subscribes blindly.
                    if(!f||!source.subscribe&&!f.getter&&!f.notifier){if(f)auxSetup[source.field].state='no_access';return;}
                    // A notifier-only field cannot be polled, and the exterior temperature is read from its
                    // notifications whenever the car sends them, as the eDrive app does (some cars' getter answers
                    // with no usable value): keep the last notified value while the interface is available.
                    const notifyOnly=!f.getter||!!(source.subscribe&&f.notifier),kept=notifyOnly?Object.assign({},source,{ttlMs:6*3600000}):source;
                    const entry={source,kept,notifyOnly,sub:null,pending:false,lastPoll:-Infinity,epoch:0,revision:0,available:false,wanted:false};entries.push(entry);
                    handlers[source.field]=value=>{if(!stopped){entry.revision++;entry.received=(entry.received||0)+1;entry.lastAt=mono();if(entry.wanted||notifyOnly){entry.lastPoll=mono();auxInfo.sample(kept,value,entry.lastPoll);}}};
                });
                if(!entries.length){reportError('optional auxiliary '+iface,'no readable field in the installed interface config');return;}
                signals.watch(iface,'1',handlers,log,{}).then(sub=>{entries.forEach(entry=>{entry.sub=sub;auxSubs.push(entry);});keep(sub);if(sub.error)reportError('optional auxiliary '+iface,sub.error);}).catch((e)=>reportError('optional auxiliary '+iface,e));
            }catch(e){auxGroups[iface].forEach(source=>{auxSetup[source.field]={iface:iface.split('.').pop(),state:'no_config',error:String(e&&e.message||e).slice(0,120)};});reportError('optional auxiliary '+iface,e&&e.message||e);}
        });
        // Re-read live getters; only the optional HUD view reader uses read-only query methods.
        signals.watch(CDS, '1', {
            statusEngineSpeed2: (v) => {
                const raw = v && v.actualValueRPMEngineCrankshaft;
                controller.policy.rpmSample(typeof raw === 'number' && raw >= 0 && raw < 65535 ? raw * 0.25 : null, mono());
            },
        }, log, { pollMs: 1000 }).then((s) => { keep(s); if (s.error) reportError(CDS, s.error); }).catch((e) => reportError(CDS, e));
        const handlers = {};
        handlers[MODE_FIELD] = (v) => controller.policy.modeSample(v && v.actualValueModeDrivingExperience, mono());
        handlers.statusActualValueTorque2 = (v) => controller.telemetry.sample(v && v.actualValueTorqueCrankshaft, mono());
        signals.watch(FES, '1', handlers, log, { pollMs: 1000 }).then((s) => { fesSub = s; keep(s); if (s.error) reportError(FES, s.error); }).catch((e) => reportError(FES, e));
        signals.watch(VEHICLE_INFO, '1', {
            statusGearboxDrive: (v) => gearbox.sample('gearbox', v),
            DataPowerTrain2: (v) => gearbox.sample('selection', v),
        }, log, { pollMs: 1000 }).then((s) => {
            gearSub = s; keep(s);
            if (s.error) { controller.gear = '--'; reportError('optional gear', s.error); }
        }).catch((e) => { controller.gear = '--'; reportError('optional gear', e); });
        // Some cars publish S/M only through MDrive. The Store build omits
        // this optional proxy when the car's catalog lacks the field.
        let hasProgram = false;
        try { const cfg = signals.loadConfig(MDRIVE); hasProgram = !!(cfg.fields && cfg.fields.dataDisplayGearbox); } catch (e) {}
        if (hasProgram) signals.watch(MDRIVE, '1', {
            dataDisplayGearbox: (v) => gearbox.sample('programme', v),
        }, log, { pollMs: 1000 }).then((s) => { programSub = s; keep(s); if (s.error) reportError('optional gearbox programme', s.error); }).catch((e) => reportError('optional gearbox programme', e));
        // HUD turn signals: the light module's indicator fields (notify only; read, never set). A car or build
        // without them leaves the HUD without arrows.
        let hasLight = false;
        try { const cfg = signals.loadConfig(LIGHT); hasLight = !!(cfg.fields && (cfg.fields.StatusFunctionsIndicators || cfg.fields.StatusFunctionsIndicators2)); } catch (e) {}
        lightState = hasLight ? 'subscribing' : 'not_installed';
        if (hasLight) signals.watch(LIGHT, '1', {
            StatusFunctionsIndicators: (v) => turnSignal.sample(v, mono()),
            StatusFunctionsIndicators2: (v) => turnSignal.sample(v, mono()),
        }, log, {}).then((s) => { lightSub = s; keep(s); lightState = s.error ? 'error' : 'subscribed'; if (s.error) reportError('optional turn signals', s.error); }).catch((e) => { lightState = 'error'; reportError('optional turn signals', e); });
        // Vehicle alerts: the vehicle speed and the camera's sign recognition (added at install by traffic-config.js
        // when the car's catalog has them). Events and fields notify; availability may never be reported, so a fresh
        // event counts as live (traffic-live.js).
        const here = typeof __dirname === 'string' ? __dirname : '.';
        const instanceOf = (iface) => { for (const file of [path.resolve(here, '..', 'manifest.json'), path.resolve(here, '..', '..', 'manifest.json')]) {
            try { const m = JSON.parse(fs.readFileSync(file, 'utf8')), p = m.proxies && m.proxies[iface]; if (p && p.instances) return String(p.instances).split(',')[0]; } catch (e) {} } return '1'; };
        TRAFFIC_FIELDS.forEach(([iface, field]) => {
            const entry = { iface, field, configured: false, received: 0, at: null, sub: null, error: null, wasAvailable: false, lostReceived: 0 }; trafficSubs.push(entry);
            try {
                const cfg = signals.loadConfig(iface);
                if (!(cfg.fields && cfg.fields[field] || cfg.events && cfg.events[field] || cfg.broadcasts && cfg.broadcasts[field])) return;
                entry.configured = true;
                // our speed also goes to the headway badge (its time gap), whatever the vehicle alerts do with it
                const handlers = {}; handlers[field] = (v) => { if (!stopped) { entry.received++; entry.at = mono(); traffic.sample(field, v, entry.at); if (field === TRAFFIC_FIELDS[0][1]) { if (lead) lead.sampleSpeed(v, entry.at);
                    // and to the Car layout (standing still): kept apart, as the vehicle alerts clear theirs while they are off
                    const r = v && v.speedVehicleCentreOfGravity; carSpeed = { v: typeof r === 'number' && isFinite(r) && r >= 0 && r <= 400 * 64 ? r / 64 : null, at: entry.at }; } } };
                signals.watch(iface, instanceOf(iface), handlers, log, {}).then((s) => { entry.sub = s; keep(s); }).catch((e) => { entry.error = String(e && e.message || e); });
            } catch (e) { entry.error = String(e && e.message || e); }
        });
        lead = new LeadVehicle(signals, log, instanceOf, mono);
        // The door-open HUD warning (door-alert.js): the door switches, notified on change.
        try {
            const cfg = signals.loadConfig(DOOR.IFACE);
            if (cfg.fields && cfg.fields[DOOR.FIELD]) {
                doorState = 'subscribing';
                signals.watch(DOOR.IFACE, instanceOf(DOOR.IFACE), { [DOOR.FIELD]: (v) => { if (!stopped) doors.sample(v, mono()); } }, log, {})
                    .then((s) => { doorSub = s; keep(s); doorState = s.error ? 'error' : 'subscribed'; }).catch((e) => { doorState = 'error'; reportError('optional doors', e); });
            }
        } catch (e) { /* no door status in this install: no warning */ }
        // Read the common native/projection guidance channel. Never set routes,
        // call vehicle methods, or alter the BMW HUD/menu configuration.
        try {
            const cfg=signals.loadConfig(guidance.INTERFACE);
            [guidance.FIELD,'guidingProvider','conclusiveDart'].forEach((field)=>{
                if(cfg.fields&&cfg.fields[field]&&cfg.fields[field].getter)navigationFields.push(field);
            });
        } catch(e) {}
        if(navigationFields.indexOf(guidance.FIELD)>=0) {
            const handlers={};
            navigationFields.forEach((field)=>{handlers[field]=(value)=>{navigationEventRevisions[field]=(navigationEventRevisions[field]||0)+1;navigationSample(field,value);};});
            signals.watch(guidance.INTERFACE,guidance.INSTANCE,handlers,log,{}).then((sub)=>{
                guidanceSub=sub;keep(sub);if(sub.error)reportError('optional native guidance',sub.error);
            }).catch((e)=>reportError('optional native guidance',e));
        } else reportError('optional native guidance','readable guidanceState unavailable; HUD released');
        Object.keys(PROJECTED).forEach((provider)=>{
            const definition=PROJECTED[provider],fields=[];
            projectionEpoch[provider]=0;projectionEvents[provider]={};projectionLastPoll[provider]=-Infinity;
            try {
                const cfg=signals.loadConfig(definition.iface);
                ['projectedGuidanceActive','projectedGuidanceMetadataAvailable'].forEach((field)=>{
                    if(cfg.fields&&cfg.fields[field]&&cfg.fields[field].getter)fields.push(field);
                });
            } catch(e) {}
            if(fields.indexOf('projectedGuidanceActive')<0)return;
            projectionFields[provider]=fields;
            const callbacks={};
            fields.forEach((field)=>{callbacks[field]=(value)=>{
                if(stopped)return;
                projectionEvents[provider][field]=(projectionEvents[provider][field]||0)+1;
                projectionSample(provider,field,value);
            };});
            signals.watch(definition.iface,definition.instance,callbacks,log,{}).then((sub)=>{
                projectionSubs[provider]=sub;keep(sub);
                if(!stopped){const available=sub.available===true&&!sub.error;if(maneuvers.projectedStatus(mono())[provider].available!==available&&(!Object.prototype.hasOwnProperty.call(PROJECTED,maneuvers.provider)||maneuvers.provider===provider))navigationRevision++;maneuvers.projectionAvailability(provider,available,mono());}
                if(sub.error)reportError(provider+' guidance status',sub.error);
            }).catch((e)=>reportError(provider+' guidance status',e));
        });
    }
    // Existing HUD views expose their actual associated event independently of
    // the common conclusiveDart. No view is registered or configured here.
    if(live)try {
        const cfg=signals.loadConfig(HUD_GUIDANCE);
        if(cfg.fields&&cfg.fields.registeredViews&&cfg.fields.registeredViews.getter&&
            cfg.methods&&HUD_METHODS.every(name=>cfg.methods[name])&&typeof signals.call==='function') {
            signals.watch(HUD_GUIDANCE,HUD_INSTANCE,{},log,{}).then(sub=>{keep(sub);hudGuidance.attach(sub);})
                .catch(e=>reportError('optional HUD guidance',e));
        }
    }catch(e){ /* Optional interface absent: normal stock-guidance fallback. */ }
    if(live)try {
        const cfg=signals.loadConfig(ROUTE_EVENTS);
        if(cfg.methods&&ROUTE_METHODS.every(name=>cfg.methods[name])&&typeof signals.call==='function') {
            signals.watch(ROUTE_EVENTS,ROUTE_INSTANCE,{},log,{}).then(sub=>{keep(sub);routeEvents.attach(sub);vehicleAlerts.attach(sub);})
                .catch(e=>reportError('optional route events',e));
        }
    }catch(e){ /* Optional query unavailable: retain the existing fallback. */ }
    // Lane guidance is an optional read-only CarPlay feed. Subscriptions stay
    // stable, with one bounded getter every 2s only while CarPlay NAV is on.
    if(live)try{
        const cfg=signals.loadConfig(LANE_INTERFACE);
        if(cfg.fields&&cfg.fields[LANE_FIELD]&&cfg.fields[LANE_FIELD].getter){
            const handlers={};handlers[LANE_FIELD]=value=>{if(!stopped)lanes.sample(value);};
            signals.watch(LANE_INTERFACE,LANE_INSTANCE,handlers,log,{}).then(sub=>{keep(sub);lanes.attach(sub);}).catch(()=>{});
        }
    }catch(e){ /* No lane capability: existing arrows/RPM continue normally. */ }
    function stop() {
        if (stopped) return;
        stopped = true; collectors.stop(); lanes.stop(); batteryVoltage.stop(); clearTimeout(timer); hudGuidance.stop(); routeEvents.stop(); vehicleAlerts.stop(); alertOverlay.close(); greetingOverlay.close(); clusterGreeting.close(); if (lead) lead.sync(false); headwayOverlay.close(); laneLines.sync(false); laneOverlay.close(); doorOverlay.close(); blindSpot.release(); blindSpotOverlay.close(); turnOverlay.close(); controller.close();
        process.removeListener('exit', stop);
        if (ctx.app && ctx.app.removeListener) ctx.app.removeListener('shutdown', stop);
        subs.forEach((s) => { try { s.shutdown(); } catch (e) {} });
        latest = { at: new Date().toISOString(), reason: 'stopped', requested: false, layerState: 'hidden' };
    }
    function tick() {
        const at = mono();
        try {
            if (live && at - lastRendererCheck >= 1000) {
                lastRendererCheck = at;
                try { nativeStatus = fs.readFileSync('/run/cluster-render/status.txt', 'utf8').slice(0, 24576); } catch (e) { nativeStatus = null; } rendererInfo = renderer.inspect(undefined, fs);
                if (rendererInfo.compatible && !connectionStarted) { connectionStarted = true; client.connect(); }
                else if (!rendererInfo.compatible) {
                    reportError('cluster-render', rendererInfo.reason);
                    if (connectionStarted) { controller.hide(); controller.policy.reset(); client.close(); connectionStarted = false; }
                }
            }
            // Gear fields may notify only on changes. Keep a known gear while its
            // provider remains available, and clear it on provider loss/error.
            if (gearSub && (gearSub.available === false || gearSub.error)) gearbox.clear();
            if (programSub && (programSub.available === false || programSub.error)) gearbox.programMode = null;
            controller.gear = gearbox.gear; controller.gearMode = gearbox.programMode || gearbox.mode;
            // The light module notifies on change only. Clear the direction on an error, or when a provider that was
            // available goes away; never because availability was not (yet) reported: a provider that does not report it
            // had every arrived notification wiped on the next frame. Cluster Info does not look at it either.
            if (lightSub) {
                if (lightSub.available === true) lightSeenAvailable = true;
                else if (lightSeenAvailable && lightSub.available === false) { lightSeenAvailable = false; turnSignal.clear(); }
                if (lightSub.error) turnSignal.clear();
            }
            controller.turn = turnSignal.read(at);
            if (fesSub && (fesSub.available === false || fesSub.error)) controller.telemetry.clear();
            const raw = {};
            Object.keys(DEFAULTS).forEach((k) => { if (k !== 'frameRate') raw[k] = ctx.settings.get(k); });
            config = settings(raw);navProbe.record(config.navProbeLog==='on');
            const before=collection;collection=demand(config,controller.policy.mode);
            if(before.rpm&&!collection.rpm){const running=controller.policy.runningSeen;controller.policy.rpmSample(null,at);controller.policy.runningSeen=running;}
            if(before.torque&&!collection.torque)controller.telemetry.clear();
            if(before.gear&&!collection.gear)gearbox.clear();
            if(before.mode&&!collection.mode)controller.policy.modeSample(null,at);
            const laneContext=maneuvers.read(at,!!(guidanceSub&&guidanceSub.available&&!guidanceSub.error));
            if(collection.lanes&&laneContext.active&&laneContext.known&&laneContext.provider==='CAR_PLAY')collection.fields.add(LANE_INTERFACE+'.'+LANE_FIELD);
            // the greeting at engine start needs the engine speed whatever the faces show
            // and the gear (P: the engine switched off for the goodbye)
            if(driverGreeting.wantsEngine()){collection.fields.add(CDS+'.statusEngineSpeed2');collection.fields.add(VEHICLE_INFO+'.statusGearboxDrive');collection.fields.add(VEHICLE_INFO+'.DataPowerTrain2');}
            collectors.reconcile(collection.fields,at);
            // Auxiliary values are not used by the maneuver decoder. Do not
            // compete with its reads for metrics that neither RPM face shows.
            const neededAux=collection.aux;
            auxSubs.forEach(entry=>{
                const {source,sub}=entry,available=!!(sub.available&&!sub.error);
                const wanted=Object.keys(source.members).some(key=>neededAux.has(auxOf(key)));
                if(entry.wanted!==wanted){entry.epoch++;entry.wanted=wanted;entry.lastPoll=-Infinity;if(!entry.notifyOnly)auxInfo.clearSource(source);}
                if(entry.available!==available){entry.epoch++;entry.available=available;}
                // A subscribed value (the exterior temperature) is kept across a provider gap, as eDrive keeps it.
                if(!available){if(!entry.notifyOnly)auxInfo.clearSource(source,'unavailable');return;}
                if(!wanted&&!entry.notifyOnly){auxInfo.clearSource(source);return;}
                // the Car picture follows the G: its two sources are read more often while it is shown
                const pollMs=source.carPollMs&&carMeterFaces(config).length?source.carPollMs:source.pollMs;
                if(entry.notifyOnly||!wanted||!sub.proxy||typeof sub.proxy.getValue!=='function'||entry.pending||at-entry.lastPoll<pollMs)return;
                entry.pending=true;entry.lastPoll=at;const epoch=entry.epoch,revision=entry.revision;
                Promise.resolve().then(()=>sub.proxy.getValue(source.field,1000)).then(value=>{
                    if(!stopped&&entry.epoch===epoch&&entry.revision===revision)auxInfo.sample(source,value,mono());
                },()=>{if(!stopped&&entry.epoch===epoch&&entry.revision===revision)auxInfo.clearSource(source,'read_failed');}).then(()=>{entry.pending=false;});
            });
            const voltageWanted=live&&neededAux.has('batteryVoltage');
            batteryVoltage.tick(at,voltageWanted,controller.policy.rpm>0&&controller.policy.rpmAt!==null&&at-controller.policy.rpmAt<=2500);controller.aux=Object.assign(auxInfo.read(at),{batteryVoltage:batteryVoltage.read(at)},neededAux.has('clock')?{clock:clockText(config)}:{});
            // The Car layout's picture (car-meter.js: the car's state, held against noise, and frame) or My picture's
            // GIFs (my-picture.js: stop / drive / reverse, the folder looked at every 5 s), per display
            // the speed for Calm clock (1.3.71), Navigation focus and G-G trail (1.3.72): the vehicle speed the alerts read, whole km/h, only while that layout is on
            const scrC=require('./policy').screenSettings(config,'cluster',controller.policy.mode),scrH=require('./policy').screenSettings(config,'hud',controller.policy.mode);
            if(['rl-calm','rl-navfocus','rl-gg'].includes(scrC.clusterDesign)||['rl-calm','rl-gg'].includes(scrH.hudDesign))controller.aux.speedNow=carSpeed.at!==null&&at-carSpeed.at<=2000&&typeof carSpeed.v==='number'?Math.round(carSpeed.v):null;
            const carFaces=carMeterFaces(config);
            if(carFaces.length){const CM=require('./car-meter'),MP=require('./my-picture'),stage=require('./redline-hud').gearOf(gearbox.gear).stage,g={lat:controller.aux.gLat,long:controller.aux.gLong};
                const speed=carSpeed.at!==null&&at-carSpeed.at<=2000?carSpeed.v:null;   // (a speed older than 2 s is not known)
                // the Animation layout shows your GIFs (my-picture.js) when there are any, else the car; on the HUD too
                // (1.3.59; black there is see-through)
                if(carFaces.length){if(!MP.folder()&&ctx.dataDir)MP.setDir(ctx.dataDir);MP.scan(at);}
                controller.aux.car={};carFaces.forEach(d=>{controller.aux.car[d]=MP.frameOf(d,stage,speed,at,g);});}
            const navigationAvailable = !!(guidanceSub && guidanceSub.available === true && !guidanceSub.error);
            if (!navigationAvailable) { navigationRevision++; navigation.clear(); maneuvers.clearGuidance(); }
            Object.keys(PROJECTED).forEach((provider)=>{
                const sub=projectionSubs[provider],available=!!(sub&&sub.available===true&&!sub.error);
                const before=maneuvers.projectedStatus(at)[provider].available;
                if(before!==available){projectionEpoch[provider]=(projectionEpoch[provider]||0)+1;if(!Object.prototype.hasOwnProperty.call(PROJECTED,maneuvers.provider)||maneuvers.provider===provider)navigationRevision++;}
                maneuvers.projectionAvailability(provider,available,at);
                if(!available||!sub.proxy||typeof sub.proxy.getValue!=='function'||projectionPending[provider]||at-projectionLastPoll[provider]<1000)return;
                projectionPending[provider]=true;projectionLastPoll[provider]=at;
                const epoch=projectionEpoch[provider],events=Object.assign({},projectionEvents[provider]);
                const reads=projectionFields[provider].map((field)=>Promise.resolve().then(()=>sub.proxy.getValue(field,1000))
                    .then((value)=>({field,value}),()=>({field,value:null})));
                Promise.all(reads).then((values)=>{
                    projectionPending[provider]=false;
                    if(stopped||epoch!==projectionEpoch[provider])return;
                    values.forEach((item)=>{
                        if((projectionEvents[provider][item.field]||0)===(events[item.field]||0))projectionSample(provider,item.field,item.value);
                    });
                },()=>{projectionPending[provider]=false;if(!stopped&&epoch===projectionEpoch[provider]){maneuvers.projectionAvailability(provider,false,mono());protectGuidance();}});
            });
            // Owned polling uses the existing worker timer; shutdown leaves no
            // independent interval and late reads cannot alter a stopped worker.
            if (navigationAvailable && guidanceSub.proxy && typeof guidanceSub.proxy.getValue === 'function' && !guidancePending && at - lastGuidancePoll >= 1000) {
                lastGuidancePoll = at; guidancePending = true; const revision = navigationRevision;
                const eventRevisions=Object.assign({},navigationEventRevisions);
                try {
                    const reads=navigationFields.filter(field=>collection.fields.has(guidance.INTERFACE+'.'+field)).map((field)=>Promise.resolve().then(()=>guidanceSub.proxy.getValue(field,1000))
                        .then((value)=>({field,value}),()=>({field,value:null,failed:true})));
                    Promise.all(reads).then((values)=>{
                        guidancePending=false;
                        if(stopped||revision!==navigationRevision)return;
                        // Apply identity before its maneuver; asynchronous initial
                        // reads cannot reinsert an arrow from a previous provider.
                        const identityBefore=navigationRevision;
                        const current=(item)=>(navigationEventRevisions[item.field]||0)===(eventRevisions[item.field]||0);
                        values.filter((item)=>item.field!=='conclusiveDart').forEach((item)=>{if(current(item))navigationSample(item.field,item.value,item.failed?'read_failed':'read_ok');});
                        // A getter started before a source/lifecycle change
                        // cannot introduce that source's first arrow. Repoll it.
                        if(identityBefore===navigationRevision)values.filter((item)=>item.field==='conclusiveDart').forEach((item)=>{if(current(item))navigationSample(item.field,item.value,item.failed?'read_failed':'read_ok');});
                    },()=>{guidancePending=false;if(!stopped&&revision===navigationRevision){navigation.clear();maneuvers.clear();controller.hud.yieldGuidance();}});
                } catch(e) {guidancePending=false;navigation.clear();maneuvers.clear();controller.hud.yieldGuidance();}
            }
            const navigationState=navigation.read(at,navigationAvailable);
            const commonManeuver=maneuvers.read(at,navigationAvailable);
            const hudKey=config.appEnabled&&navAllowed(config,controller.policy.mode)&&commonManeuver.active&&commonManeuver.known?navigationRevision+':'+commonManeuver.provider:null;
            const laneKey=collection.lanes&&commonManeuver.provider==='CAR_PLAY'?hudKey:null;
            lanes.tick(at,laneKey);
            const turnKey=collection.turns?hudKey:null,routeKey=Object.prototype.hasOwnProperty.call(PROJECTED,commonManeuver.provider)?turnKey:null;
            // the route's event list: the phone's turn (routeKey), and with BMW's own guidance too the turn after the
            // next one for the HUD ("then", 1.3.35)
            routeEvents.tick(at,routeKey||(config.hudNavThen!=='off'?turnKey:null));
            hudGuidance.tick(at,turnKey);
            const hudEvent=routeKey?routeEvents.read(at,routeKey)||hudGuidance.read(at,turnKey):hudGuidance.read(at,turnKey);
            const maneuverState=!commonManeuver.visible&&hudEvent?Object.assign({},hudEvent,{provider:commonManeuver.provider}):commonManeuver;
            const laneData=lanes.read(at,laneKey);
            const visible=collection.parts.direction&&maneuverState.visible||collection.parts.text&&maneuverState.visible&&!!maneuverState.description||collection.parts.lanes&&!!laneData;
            // Phone guidance (Waze and other CarPlay / Android Auto apps): any of the projection manager's
            // guidance flags, or the guidance channel naming the phone as the guiding provider. Some apps set
            // only the metadata flag, so either is enough. Held 8 s so a gap between reads does not flicker.
            const projected=maneuvers.projectedStatus(at);
            const phoneNow=Object.keys(projected).some((p)=>projected[p].available&&(projected[p].active===true||projected[p].metadataAvailable===true))
                ||Object.prototype.hasOwnProperty.call(PROJECTED,maneuvers.provider)&&maneuvers.fresh(maneuvers.providerAt,at);
            // As asked: whenever route guidance shows (or would show) on the HUD, the cluster is released too.
            const hudGuiding=!!(commonManeuver.active||maneuverState.visible||controller.navigation&&controller.navigation.visible);
            // 'nosport': yield in every mode but Sport (the RPM display stays in Sport while guiding).
            const yieldNow=(config.clusterYieldGuidance==='phone'||config.clusterYieldGuidance==='nosport'&&!sportMode(controller.policy.mode))&&(hudGuiding||phoneNow);
            if(yieldNow)lastYieldAt=at;
            if(config.clusterYieldGuidance==='nosport'&&sportMode(controller.policy.mode))lastYieldAt=-Infinity;
            controller.guidanceYield=config.clusterYieldGuidance!=='off'&&(yieldNow||at-lastYieldAt<8000);
            controller.guidanceYieldDetail={hud:hudGuiding,phone:phoneNow,provider:maneuvers.provider||'',projected};
            // the turn after the next one, when it follows close behind (route-events.js next): under the HUD's arrow
            const thenTurn=config.hudNavThen!=='off'&&maneuverState.visible?routeEvents.next(at,routeKey||turnKey,maneuverState):null;
            controller.navigation=Object.assign({},maneuverState,{visible:!!visible,maneuverVisible:!!maneuverState.visible,lanes:laneData,then:thenTurn});
            // No decoded arrow means non-contending RPM, not disabled HUD.
            // The native renderer still yields to real stock content/popups.
            controller.hudBlocked=rendererInfo.hudGuidanceSafe===false;
            controller.hudBlockReason=rendererInfo.hudGuidanceSafe===false?'hud_safety':(navigationState.active||Object.prototype.hasOwnProperty.call(PROJECTED,maneuverState.provider))&&config.hudNavigationEnabled?maneuverState.reason:navigationState.reason;
            // An open door no longer moves the cluster aside (1.3.29, user: the HUD picture is enough); doorYield stays off.
            controller.doorYield = false;
            // while the driver greeting shows, the Redline HUD face steps aside (greeting-overlay.js)
            controller.greetingHold = !!greetingNow;
            // BC mode (bc-follow.js): whether the drive mode now follows the BC button; the settings side applies its page
            require('./bc-follow').setNow({ cluster: config.appEnabled && D.bcModeNow(config, controller.policy.mode, 'Cluster'), hud: config.appEnabled && D.bcModeNow(config, controller.policy.mode, 'Hud') });
            const state = controller.tick(at, config);
            // HUD turn signals: in the Redline HUD image while it is on screen, else on their own overlay layers
            // (turn-overlay.js) above the stock HUD. Only one of the two carries them at a time.
            const pv = previewPresence.fresh() ? D.layoutPreview(config) : null;
            if (controller.turnPainted && controller.hudShown) turnOverlay.hide();
            else turnOverlay.tick(at, config, controller.turn, !!(pv && /^(Turn|Blind)/.test(pv.part || '')));
            // Vehicle alerts (vehicle-alerts.js): the car's speeding, school zone and speed camera events, on their
            // own HUD overlay; the Position / size preview shows every alert at once.
            // Speeding and children signs from the camera's sign recognition (traffic-signs.js, as the drive logs
            // showed them); speed cameras from the navigation's route events (vehicle-alerts.js).
            const alertsOn = live && config.appEnabled && config.hudCarAlerts !== 'off' && !config.hudCarAlertHidden;
            const trafficStates = {}; trafficSubs.forEach((e) => { trafficStates[e.field] = trafficLive(e, at); });
            const trafficOk = (f) => trafficStates[f] === true;
            if (!alertsOn) traffic.clear();
            else {
                if (!trafficOk(TRAFFIC_FIELDS[0][1])) { traffic.speed = null; traffic.speedAt = null; }
                if (!trafficOk(TRAFFIC_FIELDS[1][1])) { traffic.limit = null; traffic.limitAt = null; }
                if (!trafficOk(TRAFFIC_FIELDS[2][1])) { traffic.camera = null; traffic.cameraAt = null; traffic.childAt = null; }
            }
            vehicleAlerts.tick(at, alertsOn && (config.hudCarAlerts === 'camera' || config.hudCarAlerts === 'all'));
            const signAlerts = alertsOn ? traffic.alerts(at, config.hudCarAlerts, trafficOk(TRAFFIC_FIELDS[2][1])) : null, routeAlerts = alertsOn ? vehicleAlerts.read(at, config.hudCarAlerts) : null;
            const carAlerts = signAlerts || routeAlerts ? { speeding: (signAlerts && signAlerts.speeding) || (routeAlerts && routeAlerts.speeding) || null,
                school: (signAlerts && signAlerts.school) || (routeAlerts && routeAlerts.school) || null, camera: routeAlerts && routeAlerts.camera || null } : null;
            // a door opened with the engine off: the next start is greeted even after a short stop (driver-greeting.js)
            driverGreeting.door(!(doorSub && doorSub.error) && doors.open.length > 0);
            // a door switch lost with its provider or an error: no stale open door on the HUD
            if (doorSub && doorSub.error || config.hudDoorAlert === 'off') doors.clear();
            // The HUD headway badge (lead-vehicle.js): the car ahead read only while it is on; the preview shows a sample.
            // (1.3.87) the car ahead is read for the badge, for the lane lines (drawn in the road) and for the departure alert
            const headwayOn = live && config.appEnabled && config.hudHeadway !== 'off';
            const lanesOn = live && config.appEnabled && config.hudLaneLines === 'on';
            departureOn = live && config.appEnabled && config.hudLeadDeparture === 'on';
            if (lead) lead.sync(headwayOn || lanesOn || departureOn);
            const leadNow = lead && (headwayOn || lanesOn || departureOn) ? lead.read(at) : null;
            const speedKmh = carSpeed.at !== null && at - carSpeed.at <= 2000 ? carSpeed.v : null;
            const going = departureOn ? departure.tick(at, speedKmh, controller.gear, leadNow ? leadNow.gap : null) : false;
            const leadShown = leadNow ? Object.assign({}, leadNow, { go: going }) : going ? { gap: departure.nearest || 0, go: true } : null;
            // the badge: as set; with the departure and no lane lines, also while it shows when the badge is off
            headwayOverlay.tick(headwayOn || going && !lanesOn ? leadShown : null, config, config.hudHeadway === 'simple' ? 'simple' : 'detail', !!(pv && pv.part === 'Headway'));
            laneLines.sync(lanesOn);
            const lanesNow = lanesOn ? laneLines.read(at, controller.turn && controller.turn.indicator) : null;
            laneOverlay.tick(lanesNow ? Object.assign({}, lanesNow, { lead: leadShown }) : null, config, !!(pv && pv.part === 'Headway' && config.hudLaneLines === 'on'));
            doorOverlay.tick(pv && pv.part === 'Door' ? DOOR.SAMPLE : live && config.appEnabled && config.hudDoorAlert !== 'off' ? doors.open : null, config);
            // The blind spot warning (blind-spot.js): the door mirror lamps read from the BDC while it is on and the
            // engine runs; signs beside the turn arrows (blind-spot-overlay.js).
            const engineRuns = controller.policy.rpm > 0 && controller.policy.rpmAt !== null && at - controller.policy.rpmAt <= 2500;
            const blindOn = live && config.appEnabled && config.hudTurnBlindSpot === 'on';
            blindSpot.tick(at, blindOn && engineRuns);
            blindSpotOverlay.tick(config, blindOn ? blindSpot.read(at) : null, controller.turn && controller.turn.indicator, !!(pv && (/^Blind/.test(pv.part || '') || blindOn && /^Turn/.test(pv.part || ''))));
            driverGreeting.setHybrid(config.engineProfile === 'hybrid');
            driverGreeting.setOptions(config.greetHello !== 'off', config.greetBye !== 'off');
            driverGreeting.engine(controller.policy.rpm, controller.policy.rpmAt !== null && at - controller.policy.rpmAt <= 2500, undefined, gearbox.gear);
            // The driver greeting (settings per driver), once the renderer can take it: on the HUD and on the cluster.
            const targets = String(client.targets || ''), hudReady = targets.indexOf('hud:') >= 0, mapReady = targets.indexOf('map:') >= 0;
            greetingNow = driverGreeting.read(live && config.appEnabled && !!client.ready && (hudReady || mapReady));
            greetingOverlay.tick(hudReady ? greetingNow : null);
            clusterGreeting.tick(mapReady ? greetingNow : null);
            alertOverlay.tick(config, pv && pv.part === 'CarAlert' ? Object.assign({ preview: true }, ALERT_SAMPLE) : carAlerts);
            if (at - lastStatus >= 500) {
                lastStatus = at;
                latest = ({
                    at: new Date().toISOString(), appVersion: ctx.spec && ctx.spec.version || 'unknown', requested: !!state.requested, layerState: state.layerState || 'hidden',
                    reason: state.reason, mode: state.mode, rpm: state.rpm, shift: state.shift, engineStopped: !!state.engineStopped,
                    gear: state.gear, torqueNm: state.torqueNm, powerPS: state.powerPS, powerEstimated: true,
                    targetName: state.targetName, targetState: state.targetState, targetHolder: state.targetHolder, targetReason: state.targetReason,
                    guidanceRequested: !!state.guidanceRequested, guidanceDisabled: !!state.guidanceDisabled,
                    outputs: state.outputs, laneLines: Object.assign({ on: config.hudLaneLines === 'on' }, laneLines.status(at)), departure: Object.assign({ on: departureOn }, departure.status(at)), headway: lead ? Object.assign({ mode: config.hudHeadway, now: lead.read(at) }, lead.status(at)) : { mode: config.hudHeadway, state: 'not_started' }, blindSpot: Object.assign({ on: config.hudTurnBlindSpot === 'on' }, blindSpot.status(at), blindSpot.read(at)), doors: { state: doorSub ? (doorSub.error ? 'error' : 'subscribed') : doorState, received: doors.received, open: doors.open.slice(), lids: Object.assign({}, doors.lidNames), names: doors.names.slice(0, 24) }, vehicleAlerts: Object.assign({ mode: config.hudCarAlerts, overlay: alertOverlay.status(), signs: trafficSubs.map((e) => ({ field: e.field, configured: e.configured, received: e.received, live: trafficLive(e, at) })), diagnostics: traffic.diagnostics(at) }, vehicleAlerts.status(at)), turnSignal: Object.assign({ state: lightSub ? (lightSub.error ? 'error' : lightSub.proxy ? 'subscribed' : 'waiting') : lightState, available: lightSub ? lightSub.available : null, received: turnSignal.received, raw: turnSignal.raw, subscribed: !!lightSub && !lightSub.error, overlay: turnOverlay.status(), drawnIn: controller.turnPainted && controller.hudShown ? 'redline-hud' : 'overlay' }, controller.turn || {}), clusterYield: Object.assign({ setting: config.clusterYieldGuidance, active: !!controller.guidanceYield }, controller.guidanceYieldDetail || {}), navigation: navigationState, maneuver: maneuverState, commonManeuver: commonManeuver, hudGuidance: hudGuidance.status(at), routeEvents: routeEvents.status(at), projectedNavigation: maneuvers.projectedStatus(at),
                    laneGuidance:lanes.status(at),
                    navProbe:navProbe.status(),
                    auxiliary:{values:controller.aux,diagnostics:auxInfo.diag,setup:auxSetup,sources:auxSubs.map(e=>({field:e.source.field,available:!!(e.sub&&e.sub.available&&!e.sub.error),wanted:!!e.wanted,pending:!!e.pending,notifyOnly:!!e.notifyOnly,received:e.received||0,lastAgeMs:e.lastAt?Math.round(at-e.lastAt):null,error:e.sub&&e.sub.error?String(e.sub.error).slice(0,120):null})),missingOptional:Object.keys(SOURCES.reduce((o,s)=>{o[s.iface]=1;return o;},{})).filter(i=>!auxSubs.some(e=>e.source.iface===i))},
                    collection:{fields:Array.from(collection.fields),metrics:Array.from(collection.aux),subscriptions:collectors.status()},
                    navigationInputs: {fields:navigationFields.filter(field=>collection.fields.has(guidance.INTERFACE+'.'+field)),available:navigationAvailable,pending:guidancePending,reads:navigationFields.reduce((out,field)=>{if(collection.fields.has(guidance.INTERFACE+'.'+field))out[field]=navigationReadState[field];return out;},{}),
                        agesMs:navigationFields.reduce((out,field)=>{if(collection.fields.has(guidance.INTERFACE+'.'+field))out[field]=navigationSeenAt[field]===undefined?null:Math.max(0,at-navigationSeenAt[field]);return out;},{})}, nativeStatus: nativeStatus,
                    renderer: rendererInfo, rendererBackend: client.backend || null, rendererTargets: client.targets || '', requestedSettings: raw,
                    profile: config.engineProfile, config: config,
                    errors: errors.slice(-8), source: live ? 'live-someip' : 'offline-disabled',
                    gearSignals: gearbox.samples, transitions: controller.transitions,
                    modeAgeMs: controller.policy.modeAt === null ? null : at - controller.policy.modeAt,
                    rpmAgeMs: controller.policy.rpmAt === null ? null : at - controller.policy.rpmAt,
                    uploadBytes: controller.upload.sent, skippedUploads: controller.upload.skipped,
                });
            }
        } catch (e) { controller.hide(); reportError('worker', e.message || e); }
        if (!stopped) timer = setTimeout(tick, Math.max(15, 1000 / config.frameRate - (mono() - at)));
    }
    if (ctx.app && ctx.app.once) ctx.app.once('shutdown', stop);
    process.once('exit', stop);
    tick();
    // the status is kept in memory for the settings screen (no file is written: the app keeps no logs)
    return { controller: controller, stop: stop, status: () => latest };
}
module.exports = { start, supportedRenderer, CDS, FES, MODE_FIELD, VEHICLE_INFO };
