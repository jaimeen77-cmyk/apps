'use strict';
// Install time (with the car's own SOME/IP catalog): add read-only inputs for the speed limit data collection
// in the hidden menu — the vehicle speed and up to MAX fields whose names look like a speed limit. Each must be
// defined in this car's catalog with a valid getter or notifier and a known instance; nothing is added otherwise,
// and nothing is ever written to the car. Only our app's manifest is changed.
const {LIMIT_NAME,SPEED}=require('./speed-probe');
const MAX=6;
const validId=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
function instanceOf(catalog,iface){
 const ids=catalog.instanceIDs&&catalog.instanceIDs[iface];if(!ids)return null;
 const keys=Object.keys(ids).filter(k=>ids[k]!==null&&ids[k]!==undefined);
 return keys.includes('1')?'1':keys.includes('Main_Instance')?'Main_Instance':keys[0]||null;
}
function filterSpeedProbe(manifest,catalog){
 const proxies=manifest.proxies||(manifest.proxies={}),defs=(catalog&&catalog.interfaces)||{};let added=0;
 const add=(iface,field)=>{
  const d=defs[iface],f=d&&d.fields&&d.fields[field];if(!f)return false;
  const get=f.getter&&validId(f.getter.id,1,32767),notify=f.notifier&&validId(f.notifier.id,32768,65535);if(!get&&!notify)return false;
  const inst=instanceOf(catalog,iface);if(!inst)return false;
  let p=proxies[iface];
  if(p&&String(p.instances||'').split(',')[0]!==inst)return false;   // an existing proxy on another instance: leave it
  if(!p)p=proxies[iface]={instances:inst,attributes:{}};
  p.attributes=p.attributes||{};if(p.attributes[field]===undefined)p.attributes[field]=get?(notify?'rs':'r'):'s';
  return true;
 };
 add(SPEED.iface,SPEED.field);
 Object.keys(defs).sort().forEach(iface=>Object.keys((defs[iface]&&defs[iface].fields)||{}).sort().forEach(field=>{
  if(added<MAX&&LIMIT_NAME.test(field)&&add(iface,field))added++;
 }));
 return manifest;
}
module.exports={filterSpeedProbe,MAX};
