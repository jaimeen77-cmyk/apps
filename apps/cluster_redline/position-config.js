'use strict';
// Install time (Store build on the head unit, with the car's own SOME/IP catalog): the car's GPS position for the
// coming speed camera warnings (1.3.93: only checked on the Position check screen, nothing is warned yet).
// Which interface carries the position is documented nowhere public and can differ between firmware versions, so the
// catalog is searched for fields and events whose data type holds a latitude and a longitude, ranked, and the best
// few are added to our manifest read-only (fields notified or read, events subscribed). The list goes into the package
// as position-candidates.json for position.js. Nothing is ever written to the car; only our manifest changes.
// The search and its ranking follow SpeedCam's tools/store_build.py (Zakh294/bmw-sugar-apps, MIT; see NOTICE),
// written anew in JavaScript for this app.
const MAX=4;
const words=(n)=>String(n).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_\-.]+/g,' ').toLowerCase();
const LAT=/(^|[^a-z])lat(itude)?([^a-z]|$)|latitude|wgs84lat/i,LON=/(^|[^a-z])(lon|lng)(gitude)?([^a-z]|$)|longitude|wgs84lon/i;
const GOOD=/position|location|ccp|gnss|gps|geo|current|ownpos|carpos|vehiclepos|matched|ego|coordinate/i;
const BAD=/dest|poi|route|maneuver|manoeuvre|search|address|favo|history|weather|charg|parking|traffic|geofence|lastmile|waypoint|stopover|contact|photo|picture|sms|calendar|tile|map(?!matched)|camera|event|incident|hazard|warning|share|send|import|export|request|set[A-Z]/i;
function isLat(n){const w=words(n);return LAT.test(w)&&!/lateral|relat|plate|translat/.test(w);}
function isLon(n){const w=words(n);return LON.test(w)&&!/longitudinal/.test(w)&&!/(^| )long( |$)/.test(w);}
// The shortest path inside a data type to a struct holding both a latitude and a longitude member ('' : the type itself;
// "[]" marks an array), or null. Kept per type, so a big catalog's nested types are walked once; 6 levels at most.
function pairOf(cat,ref,depth,memo){
 const types=cat.datatypes||{},d=typeof ref==='string'?types[ref]:null;
 if(!d||typeof d!=='object'||depth>6)return null;
 if(memo.has(ref))return memo.get(ref);memo.set(ref,null);   // (a type holding itself: nothing more)
 let best=null;const take=(p)=>{if(p!==null&&(best===null||p.length<best.length))best=p;};
 if(d.type==='struct'||d.type==='union'){let members=[],dd=d,guard=0;
  while(dd&&typeof dd==='object'&&guard<8){members=(dd.members||[]).concat(members);dd=dd.extends?types[dd.extends]:null;guard++;}
  members=members.filter((m)=>m&&typeof m==='object');
  if(members.some((m)=>isLat(m.name||''))&&members.some((m)=>isLon(m.name||'')))best='';
  else members.forEach((m)=>{const c=pairOf(cat,m.dataRef,depth+1,memo);if(c!==null)take('.'+(m.name||'')+c);});}
 else if(d.type==='typedef')take(pairOf(cat,d.dataRef||d.baseType,depth,memo));
 else if(d.type==='array'){const c=pairOf(cat,d.elementDataRef,depth+1,memo);if(c!==null)take('[]'+c);}
 memo.set(ref,best);return best;
}
function refsIn(e){const found=[];(function walk(x,depth){if(depth>5||!x||typeof x!=='object')return;
 if(Array.isArray(x)){x.forEach((v)=>walk(v,depth+1));return;}
 Object.keys(x).forEach((k)=>{const v=x[k];if((k==='dataRef'||k==='elementDataRef')&&typeof v==='string')found.push(v);else if(v&&typeof v==='object')walk(v,depth+1);});})(e,0);return found;}
const entries=(part)=>Array.isArray(part)?part.filter((e)=>e&&typeof e==='object'&&e.name).map((e)=>[e.name,e]):part&&typeof part==='object'?Object.keys(part).filter((k)=>part[k]&&typeof part[k]==='object').map((k)=>[k,part[k]]):[];
const validId=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
/** Fields and events of this unit with a latitude and a longitude, best first: [{ iface, inst, name, kind, path, mode, score }]. */
function scan(cat){
 const found=[],ids=cat&&cat.instanceIDs||{},defs=cat&&cat.interfaces||{},memo=new Map();
 Object.keys(defs).forEach((iface)=>{const d=defs[iface],insts=ids[iface];if(!d||typeof d!=='object'||!insts||typeof insts!=='object')return;
  // an instance the install's own check (store-build.js fitToUnit) would keep: a number other than 0
  const names=Object.keys(insts).filter((k)=>!!insts[k]);if(!names.length)return;
  const inst=['1','Main_Instance','Inst1','Front'].find((n)=>names.indexOf(n)>=0)||names[0];
  [['field','fields'],['event','events'],['event','broadcasts']].forEach(([kind,part])=>entries(d[part]).forEach(([name,e])=>{
   const pairs=refsIn(e).map((r)=>pairOf(cat,r,0,memo)).filter((p)=>p!==null);if(!pairs.length)return;
   const path=pairs.reduce((a,b)=>b.length<a.length?b:a),text=iface+'.'+name+' '+path;let score=50;
   if(GOOD.test(text))score+=30;
   if(/current|ccp|ownpos|carpos|vehicleposition|egopos|matched/i.test(text))score+=25;
   if(BAD.test(name)||BAD.test(path)||BAD.test(iface.split('.').pop()))score-=120;
   if(/navigation|positioning|gnss|location/i.test(iface))score+=15;
   if(path.indexOf('[]')>=0)score-=60;
   score-=3*(path.split('.').length-1);
   let mode='';
   if(kind==='field'){const get=e.getter&&validId(e.getter.id,1,32767),notify=e.notifier&&validId(e.notifier.id,32768,65535);if(!get&&!notify)return;
    score+=notify?20:5;mode=(get?'r':'')+(notify?'s':'');}
   else{if(!validId(e.eventId,32768,65535))return;score+=10;}
   found.push({iface,inst,name,kind,path:path||'.',mode,score});}));
 });
 return found.sort((a,b)=>b.score-a.score);
}
/**
 * Adds the best candidates (score above 0, at most 4) to the manifest; returns them for position-candidates.json.
 * Only interfaces the app does not use yet: a proxy the app already has (the navigation, the vehicle speed...) is never
 * changed, so whatever the unit makes of a new entry cannot touch what already works.
 */
function filterPosition(manifest,cat){
 const proxies=manifest.proxies||(manifest.proxies={}),list=[],ours=new Set(Object.keys(proxies));
 scan(cat).filter((c)=>c.score>0&&!ours.has(c.iface)).forEach((c)=>{if(list.length>=MAX)return;
  const p=proxies[c.iface]||(proxies[c.iface]={instances:c.inst});
  if(c.kind==='event'){p.broadcasts=p.broadcasts||[];if(p.broadcasts.indexOf(c.name)<0)p.broadcasts.push(c.name);}
  else{p.attributes=p.attributes||{};if(p.attributes[c.name]===undefined)p.attributes[c.name]=c.mode;}
  list.push({iface:c.iface,inst:c.inst,name:c.name,kind:c.kind,path:c.path,poll:c.kind==='field'&&c.mode==='r',score:c.score});});
 return list;
}
module.exports={scan,filterPosition,isLat,isLon,MAX};
