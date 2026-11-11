'use strict';
// Same signal scales as the existing Live Data app. No estimated substitutes.
const CDS='de.bmw.infotainment.vehicle.CDS',CDS2=CDS+'2',FES='de.bmw.infotainment.drivingexcitement.FES',ENV='de.bmw.infrastructure.EnvironmentalInformation',KOMBI='de.bmw.infotainment.KombiIF';
const {supported:voltageSupported,IFACE:TASU}=require('./battery-voltage');
function economy(value){
 const raw=value&&value.consumptionAverage1BC1,u=value&&value.statusUnitOfMeasurementConsumptionBC;
 if(!Number.isInteger(raw)||raw<=0||raw===4095||raw>=65535)return null;
 const units={VERBRAUCH_IN_L_S_100KM:1,VERBRAUCH_IN_MPG_UK:2,VERBRAUCH_IN_MPG_US:3,VERBRAUCH_IN_KM_S_L:4},unit=typeof u==='string'?units[u]:u,n=raw*0.1;
 return unit===1?100/n:unit===2?n*0.3540061899:unit===3?n*0.425143707:unit===4?n:null;
}
const SOURCES=[
 {iface:FES,field:'statusSwitchDriveDynamicSport2',members:{boost:['displayBoostPressure',0.01,0,255]}},
 {iface:CDS,field:'statusEngineTemperature',members:{oil:['temperatureEngineOilDrive',1,-48,255]}},
 {iface:CDS2,field:'statusInjectionVolume',members:{oilFallback:['oilTemperature',1,-48,255]}},
 {iface:CDS2,field:'statusLongitudinalAccelerationMassCenter',members:{gLong:['longitudinalAccelerationCentreOfGravity',0.002/9.80665,-65/9.80665,65535]}},
 {iface:CDS2,field:'statusLateralAccelerationMassCenter',members:{gLat:['lateralAccelerationCentreOfGravity',0.002/9.80665,-65/9.80665,65535]}},
 // notify: subscribe only and keep the last value, as the eDrive app reads it (its getter may fail on some cars).
 {iface:ENV,field:'ExteriorTemperature',notify:true,members:{outside:['temperatureExterior',0.5,-40,255]}},
 {iface:CDS,field:'statusBattery2',members:{batteryCharge:['conditionBatteryChargingCondition',1,0,101]}},
 {iface:KOMBI,field:'statusBordcomputerAverage',members:{economy:[]},decode:economy}
];
SOURCES.forEach(source=>{
 const ids=Object.keys(source.members),slow=ids.some(k=>['oil','oilFallback','outside','batteryCharge','economy'].includes(k));
 source.pollMs=ids.includes('outside')?10000:slow?5000:1000;
 source.ttlMs=slow?source.pollMs*3:2500;
});
class AuxInfo {
 constructor(){this.samples={};this.diag={};}
 sample(source,value,now){Object.keys(source.members).forEach(k=>{const a=source.members[k],raw=value&&value[a[0]],v=source.decode?source.decode(value):typeof raw==='number'&&isFinite(raw)&&raw>=0&&raw<a[3]?raw*a[1]+a[2]:null;this.samples[k]={v,at:now,ttl:source.ttlMs||2500};
  // Bounded diagnostics: why a received value was or was not usable (no other data).
  if(!source.decode)this.diag[k]={at:now,member:a[0],raw:typeof raw==='number'&&isFinite(raw)?raw:raw===undefined?null:typeof raw,keys:value&&typeof value==='object'?Object.keys(value).slice(0,8):typeof value,
   result:v!==null?'ok':raw===undefined?'member_missing':typeof raw!=='number'||!isFinite(raw)?'not_number':raw<0?'negative':'invalid_or_out_of_range',value:v};});}
 clearSource(source,reason){Object.keys(source.members).forEach(k=>{delete this.samples[k];if(reason&&this.diag[k])this.diag[k]=Object.assign({},this.diag[k],{result:reason});});}
 read(now){
  const get=k=>{const s=this.samples[k];return s&&typeof now==='number'&&now>=s.at&&now-s.at<=s.ttl?s.v:null;};
  const gl=get('gLong'),ga=get('gLat'),gforce=gl!==null&&ga!==null&&Math.abs(gl)<=3&&Math.abs(ga)<=3?Math.sqrt(gl*gl+ga*ga):null;
  return {boost:get('boost'),oil:get('oil')===null?get('oilFallback'):get('oil'),outside:get('outside'),batteryCharge:get('batteryCharge'),economy:get('economy'),gforce,gLong:gl,gLat:ga};
 }
}
function validId(n,lo,hi){return Number.isInteger(n)&&n>=lo&&n<=hi;}
function filterAux(manifest,catalog){
 const proxies=manifest.proxies||{},defs=catalog.interfaces||{};
 SOURCES.forEach(s=>{const p=proxies[s.iface];if(!p||!p.attributes||p.attributes[s.field]===undefined)return;
  const f=defs[s.iface]&&defs[s.iface].fields&&defs[s.iface].fields[s.field];
  // A getter is polled; a notifier-only field (the exterior temperature on some cars) is subscribed.
  const getter=f&&f.getter&&validId(f.getter.id,1,32767),notifier=f&&f.notifier&&validId(f.notifier.id,32768,65535);
  if(!getter&&!notifier){delete p.attributes[s.field];return;}
  p.attributes[s.field]=notifier&&(s.notify||!getter)?'s':getter&&notifier?'rs':'r';
 });
 [CDS2,KOMBI].forEach(i=>{if(proxies[i]&&!Object.keys(proxies[i].attributes||{}).length)delete proxies[i];});
 if(proxies[TASU]){if(!voltageSupported(catalog))delete proxies[TASU];else proxies[TASU]={instances:'SystemFunctionsInternalTasuInst1',methods:['sendTasuRequest'],broadcasts:['sendTasuResponse']};}
 return manifest;
}
module.exports={AuxInfo,SOURCES,filterAux,economy};
