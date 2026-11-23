'use strict';
// Install time (Store build on the head unit, with the car's own SOME/IP catalog): add the read-only inputs the
// vehicle alerts use for speeding and children signs (and, from 1.3.19, the door status for the door-open warning), the ones the 2026-11-14 drive logs showed arriving:
//   Vehicle2.statusCarSpeed2                                   field  (the vehicle speed)
//   dass.TrafficSignRecognition.TrafficSignRecognition         event  (the combined speed limit class)
//   environmentalmodel.SignRecognitionFrontCamera
//       .TrafficSignRecognitionFrontCamera                     event  (the camera's signs: SPEED_LIMIT, DS_CHILDREN)
// Each is added only when the catalog has it with a valid getter / notifier or eventId and a known instance; an
// existing proxy on another instance is left alone. Nothing is ever written to the car; only our manifest changes.
const INPUTS=[
 ['de.bmw.infotainment.vehicle.Vehicle2','statusCarSpeed2','field'],
 ['de.bmw.dass.TrafficSignRecognition','TrafficSignRecognition','event'],
 ['de.bmw.environmentalmodel.SignRecognitionFrontCamera','TrafficSignRecognitionFrontCamera','event'],
 // the door-open HUD warning (door-alert.js): each door's switch, as appsKOR's Ambient Config reads it
 ['de.bmw.body.DoorsWindowsRoofMirrors','CentralLockingSystemAndPanelStatus','field'],
 // the BC button check (bc-diag.js, 1.3.39): the cluster's own BC selection, which a BC press changes, and the left
 // stalk's switches (the BC button is on it)
 ['de.bmw.infotainment.KombiIF','statusKombiSelection','field'],
 ['de.bmw.body.Light','IndicatorSteeringColumn','field'],
 ['de.bmw.body.Light','IndicatorSteeringColumnComplete','field'],
 // the HUD headway badge (lead-vehicle.js, 1.3.37): the car ahead as the ACC / front radar measures it
 ['de.bmw.dass.GapVehicleAhead','GapVehicleDrivingAhead','field'],
 ['de.bmw.dass.GapVehicleAhead','DataFrontVehicle','field'],
 ['de.bmw.dass.GapVehicleAhead','DataFrontVehicleExtended','field'],
];
const validId=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
function instanceOf(catalog,iface){
 const ids=catalog&&catalog.instanceIDs&&catalog.instanceIDs[iface];if(!ids)return null;
 const keys=Object.keys(ids).filter(k=>ids[k]!==null&&ids[k]!==undefined);
 return keys.includes('1')?'1':keys.includes('Main_Instance')?'Main_Instance':keys[0]||null;
}
function filterTraffic(manifest,catalog){
 const defs=catalog&&catalog.interfaces;if(!defs)return manifest;
 const proxies=manifest.proxies||(manifest.proxies={});
 INPUTS.forEach(([iface,name,kind])=>{
  const d=defs[iface],inst=instanceOf(catalog,iface);if(!d||!inst)return;
  let p=proxies[iface];if(p&&String(p.instances||'').split(',')[0]!==inst)return;
  if(kind==='event'){const e=d.events&&d.events[name];if(!e||!validId(e.eventId,32768,65535))return;
   p=p||(proxies[iface]={instances:inst});p.broadcasts=p.broadcasts||[];if(!p.broadcasts.includes(name))p.broadcasts.push(name);return;}
  const f=d.fields&&d.fields[name];if(!f)return;
  const get=f.getter&&validId(f.getter.id,1,32767),notify=f.notifier&&validId(f.notifier.id,32768,65535);if(!get&&!notify)return;
  p=p||(proxies[iface]={instances:inst});p.attributes=p.attributes||{};if(p.attributes[name]===undefined)p.attributes[name]=get?(notify?'rs':'r'):'s';
 });
 scanKombi(manifest,catalog);
 return manifest;
}
// The BC check's Kombi scan (bc-diag.js, 1.3.44): every field and event of the cluster's interfaces (a name with
// "Kombi") the catalog defines with a valid getter / notifier or eventId, read only, so the check can show which of
// them changes with the stock BC page (statusKombiSelection only says "no value" on the user's car). At most
// SCAN_MAX per interface; what is already there is left as it is.
const SCAN=/kombi/i,SCAN_MAX=80;
function scanKombi(manifest,catalog){
 const defs=catalog&&catalog.interfaces;if(!defs)return manifest;
 const proxies=manifest.proxies||(manifest.proxies={});
 Object.keys(defs).filter(i=>SCAN.test(i)).sort().forEach(iface=>{
  const d=defs[iface],inst=instanceOf(catalog,iface);if(!d||!inst)return;
  let p=proxies[iface];if(p&&String(p.instances||'').split(',')[0]!==inst)return;
  let n=0;const add=()=>{p=p||(proxies[iface]={instances:inst});return ++n<=SCAN_MAX;};
  Object.keys(d.fields||{}).sort().forEach(name=>{const f=d.fields[name];if(!f)return;
   const get=f.getter&&validId(f.getter.id,1,32767),notify=f.notifier&&validId(f.notifier.id,32768,65535);if(!get&&!notify)return;
   if(p&&p.attributes&&p.attributes[name]!==undefined)return;if(!add())return;p.attributes=p.attributes||{};p.attributes[name]=get?(notify?'rs':'r'):'s';});
  Object.keys(d.events||{}).sort().forEach(name=>{const e=d.events[name];if(!e||!validId(e.eventId,32768,65535))return;
   if(p&&p.broadcasts&&p.broadcasts.includes(name))return;if(!add())return;p.broadcasts=p.broadcasts||[];p.broadcasts.push(name);});
 });
 return manifest;
}
module.exports={filterTraffic,scanKombi,INPUTS,instanceOf,SCAN,SCAN_MAX};
