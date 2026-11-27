'use strict';
// Install time (Store build on the head unit, with the car's own SOME/IP catalog): the car's GPS position for the
// coming speed camera warnings (1.3.93: only checked on the Position check screen, nothing is warned yet).
// Which interface carries the position is documented nowhere public and can differ between firmware versions, so the
// catalog is searched for fields and events whose data type holds a latitude and a longitude, ranked, and the best
// few are added to our manifest read-only (fields notified or read, events subscribed). The list goes into the package
// as position-candidates.json for position.js. Nothing is ever written to the car; only our manifest changes.
// The search and its ranking follow SpeedCam's tools/store_build.py (Zakh294/bmw-sugar-apps, MIT; see NOTICE),
// written anew in JavaScript for this app.
const MAX=6;
const words=(n)=>String(n).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_\-.]+/g,' ').toLowerCase();
const LAT=/(^|[^a-z])lat(itude)?([^a-z]|$)|latitude|wgs84lat/i,LON=/(^|[^a-z])(lon|lng)(gitude)?([^a-z]|$)|longitude|wgs84lon/i;
const GOOD=/position|location|ccp|gnss|gps|geo|current|ownpos|carpos|vehiclepos|matched|ego|coordinate/i;
const BAD=/dest|poi|route|maneuver|manoeuvre|search|address|favo|history|weather|charg|parking|traffic|geofence|lastmile|waypoint|stopover|contact|photo|picture|sms|calendar|tile|map(?!matched)|camera|event|incident|hazard|warning|share|send|import|export|request|set[A-Z]/i;
function isLat(n){const w=words(n);return LAT.test(w)&&!/lateral|relat|plate|translat/.test(w);}
function isLon(n){const w=words(n);return LON.test(w)&&!/longitudinal/.test(w)&&!/(^| )long( |$)/.test(w);}
// every member reachable from a data type: [path, name, inArray]
function leaves(cat,ref,path,depth,out,seen){
 const types=cat.datatypes||{},d=typeof ref==='string'?types[ref]:null;
 if(!d||typeof d!=='object'||depth>6||seen.has(ref+'@'+depth))return;seen.add(ref+'@'+depth);
 if(d.type==='struct'||d.type==='union'){let members=[],dd=d,guard=0;
  while(dd&&typeof dd==='object'&&guard<8){members=(dd.members||[]).concat(members);dd=dd.extends?types[dd.extends]:null;guard++;}
  members.forEach((m)=>{if(!m||typeof m!=='object')return;const n=m.name||'';out.push([path,n,path.indexOf('[]')>=0]);leaves(cat,m.dataRef,path+'.'+n,depth+1,out,seen);});}
 else if(d.type==='typedef')leaves(cat,d.dataRef||d.baseType,path,depth,out,seen);
 else if(d.type==='array')leaves(cat,d.elementDataRef,path+'[]',depth+1,out,seen);
}
function refsIn(e){const found=[];(function walk(x,depth){if(depth>5||!x||typeof x!=='object')return;
 if(Array.isArray(x)){x.forEach((v)=>walk(v,depth+1));return;}
 Object.keys(x).forEach((k)=>{const v=x[k];if((k==='dataRef'||k==='elementDataRef')&&typeof v==='string')found.push(v);else if(v&&typeof v==='object')walk(v,depth+1);});})(e,0);return found;}
const entries=(part)=>Array.isArray(part)?part.filter((e)=>e&&typeof e==='object'&&e.name).map((e)=>[e.name,e]):part&&typeof part==='object'?Object.keys(part).filter((k)=>part[k]&&typeof part[k]==='object').map((k)=>[k,part[k]]):[];
const validId=(n,lo,hi)=>Number.isInteger(n)&&n>=lo&&n<=hi;
/** Fields and events of this unit with a latitude and a longitude, best first: [{ iface, inst, name, kind, path, mode, score }]. */
function scan(cat){
 const found=[],ids=cat&&cat.instanceIDs||{},defs=cat&&cat.interfaces||{};
 Object.keys(defs).forEach((iface)=>{const d=defs[iface],insts=ids[iface];if(!d||typeof d!=='object'||!insts||typeof insts!=='object')return;
  const names=Object.keys(insts).filter((k)=>insts[k]!==null&&insts[k]!==undefined);if(!names.length)return;
  const inst=['1','Main_Instance','Inst1','Front'].find((n)=>names.indexOf(n)>=0)||names[0];
  [['field','fields'],['event','events'],['event','broadcasts']].forEach(([kind,part])=>entries(d[part]).forEach(([name,e])=>{
   const lv=[];refsIn(e).forEach((r)=>leaves(cat,r,'',0,lv,new Set()));
   const by={};lv.forEach(([p,n,arr])=>{const s=by[p]||(by[p]={lat:false,lon:false,arr});s.lat=s.lat||isLat(n);s.lon=s.lon||isLon(n);});
   const pairs=Object.keys(by).filter((p)=>by[p].lat&&by[p].lon);if(!pairs.length)return;
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
/** Adds the best candidates (score above 0, at most 6) to the manifest; returns them for position-candidates.json. */
function filterPosition(manifest,cat){
 const proxies=manifest.proxies||(manifest.proxies={}),list=[];
 scan(cat).filter((c)=>c.score>0).forEach((c)=>{if(list.length>=MAX)return;
  let p=proxies[c.iface];if(p&&String(p.instances||'').split(',')[0]!==c.inst)return;   // already ours on another instance: left alone
  p=p||(proxies[c.iface]={instances:c.inst});
  if(c.kind==='event'){p.broadcasts=p.broadcasts||[];if(p.broadcasts.indexOf(c.name)<0)p.broadcasts.push(c.name);}
  else{p.attributes=p.attributes||{};if(p.attributes[c.name]===undefined)p.attributes[c.name]=c.mode;}
  list.push({iface:c.iface,inst:c.inst,name:c.name,kind:c.kind,path:c.path,poll:c.kind==='field'&&c.mode==='r',score:c.score});});
 return list;
}
module.exports={scan,filterPosition,isLat,isLon,MAX};
