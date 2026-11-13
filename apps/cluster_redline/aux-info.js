'use strict';
// Same signal scales as the existing Live Data app. No estimated substitutes.
const TPMS='de.bmw.infotainment.vehicle.TPMS',CDS='de.bmw.infotainment.vehicle.CDS',CDS2=CDS+'2',FES='de.bmw.infotainment.drivingexcitement.FES',ENV='de.bmw.infrastructure.EnvironmentalInformation',KOMBI='de.bmw.infotainment.KombiIF';
const {supported:voltageSupported,IFACE:TASU}=require('./battery-voltage');
function economy(value){
 const raw=value&&value.consumptionAverage1BC1,u=value&&value.statusUnitOfMeasurementConsumptionBC;
 if(!Number.isInteger(raw)||raw<=0||raw===4095||raw>=65535)return null;
 const units={VERBRAUCH_IN_L_S_100KM:1,VERBRAUCH_IN_MPG_UK:2,VERBRAUCH_IN_MPG_US:3,VERBRAUCH_IN_KM_S_L:4},unit=typeof u==='string'?units[u]:u,n=raw*0.1;
 return unit===1?100/n:unit===2?n*0.3540061899:unit===3?n*0.425143707:unit===4?n:null;
}
// Trip 1 average speed (0.1 a step; the car's unit, mph turned into km/h) and driving time (hours + minutes),
// read as the Live Data app reads them.
function avgSpeed(value){
 const raw=value&&value.speedAverage1BC1,u=value&&value.statusUnitOfMeasurementSpeedBC;
 if(!Number.isInteger(raw)||raw<0||raw>=65535)return null;
 const mph=u==='MPH__MLS'||u===2,n=raw*0.1;return mph?n*1.609344:n;
}
function tripTime(value){
 const h=value&&value.rideDurationHours,m=value&&value.rideDurationMinutes;
 return Number.isInteger(h)&&Number.isInteger(m)&&h>=0&&h<65535&&m>=0&&m<60?h*60+m:null;
}
const CORNERS=['FL','FR','RL','RR'];
const SOURCES=[
 {iface:FES,field:'statusSwitchDriveDynamicSport2',members:{boost:['displayBoostPressure',0.01,0,255]}},
 {iface:CDS,field:'statusEngineTemperature',members:{oil:['temperatureEngineOilDrive',1,-48,255]}},
 {iface:CDS2,field:'statusInjectionVolume',members:{oilFallback:['oilTemperature',1,-48,255]}},
 {iface:CDS2,field:'statusLongitudinalAccelerationMassCenter',members:{gLong:['longitudinalAccelerationCentreOfGravity',0.002/9.80665,-65/9.80665,65535]}},
 {iface:CDS2,field:'statusLateralAccelerationMassCenter',members:{gLat:['lateralAccelerationCentreOfGravity',0.002/9.80665,-65/9.80665,65535]}},
 // Read as the eDrive app does: from its notifications whenever the car sends them, keeping the last good value.
 {iface:ENV,field:'ExteriorTemperature',members:{outside:['temperatureExterior',0.5,-40,255]},subscribe:true,keepLast:true},
 {iface:CDS,field:'statusBattery2',members:{batteryCharge:['conditionBatteryChargingCondition',1,0,101]}},
 {iface:KOMBI,field:'statusBordcomputerAverage',members:{economy:[],avgSpeed:[]},decode:{economy,avgSpeed}},
 {iface:KOMBI,field:'statusBordcomputerTravelData',members:{tripTime:[]},decode:{tripTime},optionalField:true},
 // Tyre temperatures (°C + 40) and pressures (0.1 bar a step), as Live Data reads them (x_call reads TPMS, never subscribes).
 {iface:TPMS,field:'statusTyreTemperature',members:Object.assign({},...CORNERS.map(c=>({['t'+c]:['actualValueTemperatureTyre'+c+'H',1,-40,65535,150]}))),poll:true,optionalField:true},
 {iface:TPMS,field:'statusTyrePressure',members:Object.assign({},...CORNERS.map(c=>({['p'+c]:['actualValuePressureTyre'+c+'H',0.1,0,65532]}))),poll:true,optionalField:true}
];
// Which auxiliary item a source member feeds (several members feed one item).
function auxOf(k){return k==='oilFallback'?'oil':k==='gLat'||k==='gLong'?'gforce':/^[tp](FL|FR|RL|RR)$/.test(k)?'tyres':k;}
SOURCES.forEach(source=>{
 const ids=Object.keys(source.members),slow=ids.some(k=>['oil','oilFallback','outside','batteryCharge','economy','avgSpeed','tripTime'].includes(k)||/^[tp](FL|FR|RL|RR)$/.test(k));
 source.pollMs=ids.includes('outside')?10000:slow?5000:1000;
 source.ttlMs=slow?source.pollMs*3:2500;
});
class AuxInfo {
 constructor(){this.samples={};this.diag={};}
 sample(source,value,now){Object.keys(source.members).forEach(k=>{const a=source.members[k],raw=value&&value[a[0]],dec=source.decode&&(typeof source.decode==='function'?source.decode:source.decode[k]);let v=dec?dec(value):typeof raw==='number'&&isFinite(raw)&&raw>=0&&raw<a[3]?raw*a[1]+a[2]:null;if(v!==null&&a[4]!==undefined&&v>a[4])v=null;const prev=this.samples[k];
  // keepLast: an invalid reading (e.g. 255 while the sensor settles) leaves the last good value, as eDrive does.
  if(!(source.keepLast&&v===null&&prev&&prev.v!==null))this.samples[k]={v,at:now,ttl:source.ttlMs||2500};
  // Bounded diagnostics: why a received value was or was not usable (no other data).
  if(!source.decode)this.diag[k]={at:now,member:a[0],raw:typeof raw==='number'&&isFinite(raw)?raw:raw===undefined?null:typeof raw,keys:value&&typeof value==='object'?Object.keys(value).slice(0,8):typeof value,
   result:v!==null?'ok':raw===undefined?'member_missing':typeof raw!=='number'||!isFinite(raw)?'not_number':raw<0?'negative':'invalid_or_out_of_range',value:v};});}
 clearSource(source,reason){Object.keys(source.members).forEach(k=>{delete this.samples[k];if(reason&&this.diag[k])this.diag[k]=Object.assign({},this.diag[k],{result:reason});});}
 read(now){
  const get=k=>{const s=this.samples[k];return s&&typeof now==='number'&&now>=s.at&&now-s.at<=s.ttl?s.v:null;};
  const gl=get('gLong'),ga=get('gLat'),gforce=gl!==null&&ga!==null&&Math.abs(gl)<=3&&Math.abs(ga)<=3?Math.sqrt(gl*gl+ga*ga):null;
  const corner=p=>{const o={};let any=false;CORNERS.forEach(c=>{o[c]=get(p+c);if(o[c]!==null)any=true;});return any?o:null;};
  return {boost:get('boost'),oil:get('oil')===null?get('oilFallback'):get('oil'),outside:get('outside'),batteryCharge:get('batteryCharge'),economy:get('economy'),avgSpeed:get('avgSpeed'),tripTime:get('tripTime'),tyreTemp:corner('t'),tyrePressure:corner('p'),gforce,gLong:gl,gLat:ga};
 }
}
function validId(n,lo,hi){return Number.isInteger(n)&&n>=lo&&n<=hi;}
function filterAux(manifest,catalog){
 const proxies=manifest.proxies||{},defs=catalog.interfaces||{};
 // Fields added at install (not in the 1.2.x Store template): driving time on KombiIF and the TPMS tyre data,
 // only when the car's catalog defines them with a valid getter; read-only ('r'), polled like Live Data.
 SOURCES.filter(s=>s.optionalField).forEach(s=>{const d=defs[s.iface],f=d&&d.fields&&d.fields[s.field],ids=catalog.instanceIDs&&catalog.instanceIDs[s.iface];
  if(!f||!f.getter||!validId(f.getter.id,1,32767))return;
  if(s.iface===TPMS&&!(ids&&ids['1']!==undefined))return;
  const p=proxies[s.iface]||(s.iface===TPMS?(proxies[s.iface]={instances:'1',attributes:{}}):null);if(!p)return;
  p.attributes=p.attributes||{};if(p.attributes[s.field]===undefined)p.attributes[s.field]='r';});
 SOURCES.forEach(s=>{const p=proxies[s.iface];if(!p||!p.attributes||p.attributes[s.field]===undefined)return;
  const f=defs[s.iface]&&defs[s.iface].fields&&defs[s.iface].fields[s.field];
  // A getter is polled; a notifier-only field (the exterior temperature on some cars) is subscribed.
  const getter=f&&f.getter&&validId(f.getter.id,1,32767),notifier=f&&f.notifier&&validId(f.notifier.id,32768,65535);
  if(!getter&&!notifier){delete p.attributes[s.field];return;}
  // The exterior temperature is subscribed only, exactly as the eDrive app does: its getter answers some
  // cars with a placeholder, so it is not read.
  p.attributes[s.field]=s.subscribe&&notifier?'s':getter?(notifier?'rs':'r'):'s';
 });
 [CDS2,KOMBI,TPMS].forEach(i=>{if(proxies[i]&&!Object.keys(proxies[i].attributes||{}).length)delete proxies[i];});
 if(proxies[TASU]){if(!voltageSupported(catalog))delete proxies[TASU];else proxies[TASU]={instances:'SystemFunctionsInternalTasuInst1',methods:['sendTasuRequest'],broadcasts:['sendTasuResponse']};}
 return manifest;
}
module.exports={AuxInfo,SOURCES,filterAux,economy,avgSpeed,tripTime,auxOf,TPMS};
