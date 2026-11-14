'use strict';
const D=require('./display-config'),{SOURCES,auxOf}=require('./aux-info'),{PROJECTED}=require('./projection-config');
const G='de.bmw.infotainment.navigation.guiding.Guidance',F='de.bmw.infotainment.drivingexcitement.FES',C='de.bmw.infotainment.vehicle.CDS',V='de.bmw.infrastructure.VehicleInformation';
function demand(cfg,mode){
 const fields=new Set(),aux=new Set(),nav=D.navVisible(cfg,mode),enabled=cfg.appEnabled;
 const faces=['hud','cluster'].filter(d=>enabled&&D.faceVisible(cfg,d)&&(mode===null?cfg['all'+(d==='hud'?'Hud':'Cluster')+'Output']==='redline'||cfg['sport'+(d==='hud'?'Hud':'Cluster')+'Output']==='redline':D.rpmOutput(cfg,d==='hud'?'Hud':'Cluster',mode)));
 faces.forEach(d=>D.visibleMetrics(cfg,d).forEach(k=>aux.add(k)));
 // The G-force + RPM rings layout's G meter reads the G-force whatever the readouts are.
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-classic'&&!cfg[d+'RpmGaugeHidden']&&!cfg[d+'RlTempHidden'])aux.add('oil');});
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-rings'&&!cfg[d+'RpmGaugeHidden']&&!cfg[d+'RlGMeterHidden'])aux.add('gforce');});
 const rpm=faces.some(d=>D.faceRpmNeeded(cfg,d))||aux.has('batteryVoltage'),torque=aux.has('torque')||aux.has('power'),gear=faces.some(d=>!cfg[d+'GearHidden']);
 const navAny=enabled&&(nav.direction||nav.text||nav.lanes),turns=enabled&&(nav.direction||nav.text);
 const navPotential=enabled&&cfg.hudNavigationEnabled&&cfg.navDisplayMode!=='stock'&&D.NAV_PARTS.some(p=>!cfg[p.prefix+'Hidden']);
 const modeNeeded=navPotential||enabled&&['hud','cluster'].some(d=>D.faceVisible(cfg,d)&&['all','sport'].some(m=>cfg[m+(d==='hud'?'Hud':'Cluster')+'Output']==='redline'));
 const add=(i,f)=>fields.add(i+(f?'.'+f:''));
 if(enabled&&cfg.hudTrafficMode!=='off'&&faces.includes('hud'))require('./traffic-signs').FIELDS.forEach(([i,f])=>add(i,f));
 if(modeNeeded)add(F,'statusFESVehicleDynamicSwitchHMI');if(rpm)add(C,'statusEngineSpeed2');if(torque)add(F,'statusActualValueTorque2');
 if(gear){add(V,'statusGearboxDrive');add(V,'DataPowerTrain2');add('de.bmw.infotainment.misc.MDrive','dataDisplayGearbox');}
 // The Tyres & trip layout's car reads the tyre temperatures and pressures.
 faces.forEach(d=>{if(cfg[d+'Design']==='rl-tyres'&&!cfg[d+'RlCarHidden'])aux.add('tyres');});
 SOURCES.forEach(s=>{if(Object.keys(s.members).some(k=>aux.has(auxOf(k))))add(s.iface,s.field);});
 // Cluster yields to route guidance: watch the guidance state while the cluster face is shown.
 const yieldNav=enabled&&cfg.clusterYieldGuidance!=='off'&&faces.includes('cluster');
 if(yieldNav&&!navAny){add(G,'guidanceState');add(G,'guidingProvider');}
 if(navAny){add(G,'guidanceState');add(G,'guidingProvider');Object.keys(PROJECTED).forEach(p=>['projectedGuidanceActive','projectedGuidanceMetadataAvailable'].forEach(f=>add(PROJECTED[p].iface,f)));}
 if(turns){add(G,'conclusiveDart');add('de.bmw.infotainment.navigation.guiding.GuidanceEventList');add('de.bmw.infotainment.navigation.guiding.GuidanceRenderedContent');}
 return {fields,aux,rpm,torque,gear,mode:modeNeeded,nav:navAny,turns,lanes:enabled&&nav.lanes,parts:nav};
}
module.exports={demand};
