'use strict';
const D=require('./display-config'),{SOURCES,auxOf}=require('./aux-info'),{PROJECTED}=require('./projection-config');
const G='de.bmw.infotainment.navigation.guiding.Guidance',F='de.bmw.infotainment.drivingexcitement.FES',C='de.bmw.infotainment.vehicle.CDS',V='de.bmw.infrastructure.VehicleInformation';
function demand(base,mode){
 // each face as it draws in this drive mode (1.3.84: a mode's own screen); the mode not known: the common screens
 const per={hud:mode===null?base:require('./policy').screenSettings(base,'hud',mode),cluster:mode===null?base:require('./policy').screenSettings(base,'cluster',mode)};
 const cfg=new Proxy(base,{get:(t,k)=>typeof k==='string'&&/^hud/.test(k)?per.hud[k]:typeof k==='string'&&/^cluster/.test(k)?per.cluster[k]:t[k]});
 const fields=new Set(),aux=new Set(),nav=D.navVisible(cfg,mode),enabled=cfg.appEnabled;
 const faces=['hud','cluster'].filter(d=>enabled&&D.faceVisible(cfg,d)&&(mode===null?D.rpmOutputPossible(cfg,d==='hud'?'Hud':'Cluster'):D.rpmOutput(cfg,d==='hud'?'Hud':'Cluster',mode)||D.bcModeNow(cfg,mode,d==='hud'?'Hud':'Cluster')));
 faces.forEach(d=>D.visibleMetrics(cfg,d).forEach(k=>aux.add(k)));
 // The G-force + RPM rings layout's G meter reads the G-force whatever the readouts are.
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-classic'&&!cfg[d+'RpmGaugeHidden']&&!cfg[d+'RlTempHidden'])aux.add('oil');});
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-rings'&&!cfg[d+'RpmGaugeHidden']&&!cfg[d+'RlGMeterHidden'])aux.add('gforce');});
 // The Car layout: its car picture follows the G (car-meter.js), and its small G meter shows it.
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-gg'&&!cfg[d+'RpmGaugeHidden']&&!cfg[d+'RlGMeterHidden'])aux.add('gforce');});   // (G-G trail, 1.3.72)
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-car'&&!cfg[d+'RpmGaugeHidden']&&(!cfg[d+'RlCarPicHidden']||!cfg[d+'RlGMeterHidden']))aux.add('gforce');});
 // (its GIFs on the cluster, my-picture.js, follow the gear and speed and, for the turns, the same sideways G)
 // the blind spot warning reads the mirror lamps (and the gearbox oil readout its unit, 1.3.106) only while the engine runs: it needs the engine speed
 const rpm=faces.some(d=>D.faceRpmNeeded(cfg,d))||aux.has('batteryVoltage')||aux.has('gearbox')||enabled&&cfg.hudTurnBlindSpot==='on',torque=aux.has('torque')||aux.has('power'),gear=faces.some(d=>!cfg[d+'GearHidden']);
 const navAny=enabled&&(nav.direction||nav.text||nav.lanes),turns=enabled&&(nav.direction||nav.text);
 const navPotential=enabled&&cfg.hudNavigationEnabled&&cfg.navDisplayMode!=='stock'&&D.NAV_PARTS.some(p=>p.key!=='Then'&&!cfg[p.prefix+'Hidden']);
 const modeNeeded=navPotential||enabled&&['hud','cluster'].some(d=>D.faceVisible(cfg,d)&&D.rpmOutputPossible(cfg,d==='hud'?'Hud':'Cluster'));
 const add=(i,f)=>fields.add(i+(f?'.'+f:''));
 if(modeNeeded)add(F,'statusFESVehicleDynamicSwitchHMI');if(rpm)add(C,'statusEngineSpeed2');if(torque)add(F,'statusActualValueTorque2');
 if(gear){add(V,'statusGearboxDrive');add(V,'DataPowerTrain2');add('de.bmw.infotainment.misc.MDrive','dataDisplayGearbox');}
 // The Tyres & trip layout's car reads the tyre temperatures and pressures.
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-tyres'&&!cfg[d+'RlCarHidden'])aux.add('tyres');});
 SOURCES.forEach(s=>{if(Object.keys(s.members).some(k=>aux.has(auxOf(k))))add(s.iface,s.field);});
 // Cluster yields to route guidance: watch the guidance state while the cluster face is shown.
 const yieldNav=enabled&&cfg.clusterYieldGuidance!=='off'&&faces.includes('cluster');
 // Yield also follows the phone's own guidance flags (Waze over CarPlay / Android Auto), not only the guidance channel.
 if(yieldNav&&!navAny){add(G,'guidanceState');add(G,'guidingProvider');Object.keys(PROJECTED).forEach(p=>['projectedGuidanceActive','projectedGuidanceMetadataAvailable'].forEach(f=>add(PROJECTED[p].iface,f)));}
 if(navAny){add(G,'guidanceState');add(G,'guidingProvider');Object.keys(PROJECTED).forEach(p=>['projectedGuidanceActive','projectedGuidanceMetadataAvailable'].forEach(f=>add(PROJECTED[p].iface,f)));}
 // HUD turn signals: the light module's two indicator fields, whenever the arrows are switched on (they show with
 // the stock HUD too, so no RPM face or navigation is needed).
 const turnSignals=enabled&&cfg.hudTurnSignals==='on'&&!cfg.hudTurnHidden;
 if(turnSignals){add('de.bmw.body.Light','StatusFunctionsIndicators');add('de.bmw.body.Light','StatusFunctionsIndicators2');}
 // Vehicle alerts: the car's route events (speeding, school zones, speed cameras) by query, whenever they are on.
 const carAlerts=enabled&&cfg.hudCarAlerts!=='off'&&!cfg.hudCarAlertHidden;
 // Speeding and children signs: the vehicle speed and the camera's sign recognition (traffic-signs.js);
 // speed cameras: the navigation's route events by query.
 if(carAlerts&&cfg.hudCarAlerts!=='camera')require('./traffic-signs').FIELDS.forEach(([i,f])=>add(i,f));
 // (1.3.105) the 0-100 screen: the vehicle speed and the longitudinal acceleration (CDS2)
 if(enabled&&cfg.hudLaunch==='on'&&!cfg.hudLaunchHidden){add('de.bmw.infotainment.vehicle.Vehicle2','statusCarSpeed2');SOURCES.forEach(s=>{if(Object.keys(s.members).includes('gLong'))add(s.iface,s.field);});}
 if(carAlerts&&(cfg.hudCarAlerts==='camera'||cfg.hudCarAlerts==='all'))add('de.bmw.infotainment.navigation.guiding.GuidanceEventList');
 // the door-open HUD warning: the door switches, whenever it is on (also standing still)
 const doorAlert=enabled&&cfg.hudDoorAlert!=='off';if(doorAlert)add('de.bmw.body.DoorsWindowsRoofMirrors','CentralLockingSystemAndPanelStatus');
 if(turns){add(G,'conclusiveDart');add('de.bmw.infotainment.navigation.guiding.GuidanceEventList');add('de.bmw.infotainment.navigation.guiding.GuidanceRenderedContent');}
 return {fields,aux,rpm,torque,gear,mode:modeNeeded,nav:navAny,turns,turnSignals,carAlerts,doorAlert,lanes:enabled&&nav.lanes,parts:nav};
}
module.exports={demand};
