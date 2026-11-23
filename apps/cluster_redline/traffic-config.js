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
 // the BC button (bc-follow.js, bc-diag.js): the left stalk's switches (the BC button is on it). The cluster's own BC
 // selection (KombiIF.statusKombiSelection) and every cluster (Kombi) value were added too (1.3.39 / 1.3.44): none
 // follows the stock BC page on the user's car, so they are no longer added (1.3.46)
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
 return manifest;
}
module.exports={filterTraffic,INPUTS,instanceOf};
