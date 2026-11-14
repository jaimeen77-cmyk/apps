'use strict';
// Install time (with the car's own SOME/IP catalog): add read-only inputs for the speed limit data collection
// in the hidden menu — the vehicle speed, then the PRIORITY inputs (the car's speed limit display, the navigation's
// speed limit at the car position, camera sign recognition), then other speed-limit-looking names that are values
// (not settings), up to MAX. A field needs a valid getter or notifier, an event a valid eventId, and the interface
// a known instance; nothing is added otherwise and nothing is ever written to the car. Only our manifest changes.
const {LIMIT_NAME,SPEED,PRIORITY,NOT_VALUE}=require('./speed-probe');
const MAX=10;
const validId=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
function instanceOf(catalog,iface){
 const ids=catalog.instanceIDs&&catalog.instanceIDs[iface];if(!ids)return null;
 const keys=Object.keys(ids).filter(k=>ids[k]!==null&&ids[k]!==undefined);
 return keys.includes('1')?'1':keys.includes('Main_Instance')?'Main_Instance':keys[0]||null;
}
function filterSpeedProbe(manifest,catalog){
 const proxies=manifest.proxies||(manifest.proxies={}),defs=(catalog&&catalog.interfaces)||{};let added=0;
 const proxy=iface=>{const inst=instanceOf(catalog,iface);if(!inst)return null;let p=proxies[iface];
  if(p&&String(p.instances||'').split(',')[0]!==inst)return null;   // an existing proxy on another instance: leave it
  return p||(proxies[iface]={instances:inst,attributes:{}});};
 const add=(iface,name,kind)=>{
  const d=defs[iface];if(!d)return false;
  if(kind==='event'){const e=d.events&&d.events[name];if(!e||!validId(e.eventId,32768,65535))return false;const p=proxy(iface);if(!p)return false;
   p.broadcasts=p.broadcasts||[];if(!p.broadcasts.includes(name))p.broadcasts.push(name);return true;}
  const f=d.fields&&d.fields[name];if(!f)return false;
  const get=f.getter&&validId(f.getter.id,1,32767),notify=f.notifier&&validId(f.notifier.id,32768,65535);if(!get&&!notify)return false;
  const p=proxy(iface);if(!p)return false;
  p.attributes=p.attributes||{};if(p.attributes[name]===undefined)p.attributes[name]=get?(notify?'rs':'r'):'s';
  return true;
 };
 add(SPEED.iface,SPEED.field,'field');
 const seen=new Set();
 PRIORITY.forEach(([iface,name,kind])=>{seen.add(iface+'.'+name);if(added<MAX&&add(iface,name,kind))added++;});
 Object.keys(defs).sort().forEach(iface=>{const d=defs[iface]||{};
  [['field',Object.keys(d.fields||{})],['event',Object.keys(d.events||{})]].forEach(([kind,names])=>names.sort().forEach(name=>{
   if(added>=MAX||seen.has(iface+'.'+name)||!LIMIT_NAME.test(name)||NOT_VALUE.test(name))return;
   if(add(iface,name,kind))added++;}));});
 return manifest;
}
module.exports={filterSpeedProbe,MAX};
