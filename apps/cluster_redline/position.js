'use strict';
// The car's GPS position (1.3.93), read over SOME/IP from the fields and events the install found for it
// (position-config.js -> position-candidates.json). Read only: subscriptions and getters, never a write.
// For now it only feeds the Position check screen (NAV tab -> Navigation display -> Position check), so that a car can
// show whether, and from where, the app gets its position before the speed camera warnings are built on it.
// Each candidate is watched while the check is on; the latitude / longitude pair is found inside whatever it sends,
// its unit worked out (degrees, 1e-6 / 1e-7 degrees, 2^32 per turn, radians, milliarcseconds...), and the candidate
// giving fresh positions most often is used. The ideas follow SpeedCam's position.js (Zakh294/bmw-sugar-apps, MIT;
// see NOTICE), written anew here. A position never goes to the log: only key names and counts do.
// a candidate's values are looked at 5 times a second at most (a fast event costs no more); a getter-only field is
// read once a second by our own timer, which stops with the check
const STALE_MS=3000,HEAD_MIN_M=12,MIN_GAP_MS=200,POLL_MS=1000;
// South Korea with a margin (Jeju to the DMZ, Ulleungdo and Dokdo)
const KR={lat0:32.5,lat1:39,lon0:124,lon1:132};
const SCALES=[['deg',1],['1e-6 deg',1e-6],['1e-7 deg',1e-7],['1e-5 deg',1e-5],['2^32/turn',360/4294967296],['2^31/180',180/2147483648],
 ['2^30/90',90/1073741824],['2^24/turn',360/16777216],['rad',180/Math.PI],['mas',1/3600000],['arcsec',1/3600],['1e-8 deg',1e-8]];
const words=(k)=>String(k).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_\-.]+/g,' ').toLowerCase().split(' ').filter((w)=>w);
const isLatKey=(k)=>words(k).some((w)=>w==='lat'||/^latitude/.test(w)||/^wgs84lat/.test(w));
const isLonKey=(k)=>words(k).some((w)=>w==='lon'||w==='lng'||/^longitude/.test(w)||/^wgs84lon/.test(w));
function num(v){
 if(typeof v==='number'&&isFinite(v))return v;
 if(typeof v==='string'&&/^-?\d+(\.\d+)?$/.test(v))return Number(v);
 if(v&&typeof v==='object'&&!Array.isArray(v)){const ks=Object.keys(v).filter((k)=>typeof v[k]==='number');if(ks.length===1)return v[ks[0]];}
 return null;
}
/** The car's latitude / longitude pair inside v: { lat, lon, path } (raw numbers) or null; "current" / "vehicle" first. */
function findPair(v){
 const found=[];
 (function walk(x,path,depth){
  if(depth>8||!x||typeof x!=='object'||found.length>20)return;
  if(Array.isArray(x)){if(x.length)walk(x[0],path+'[0]',depth+1);return;}
  const keys=Object.keys(x),lk=keys.filter(isLatKey),ok=keys.filter(isLonKey);
  if(lk.length&&ok.length){const lat=num(x[lk[0]]),lon=num(x[ok[0]]);if(lat!==null&&lon!==null)found.push({lat,lon,path:path||'.'});}
  keys.forEach((k)=>{if(x[k]&&typeof x[k]==='object')walk(x[k],path?path+'.'+k:k,depth+1);});
 })(v,'',0);
 if(!found.length)return null;
 return found.find((f)=>/current|vehicle|car|ego|ccp|own|matched/i.test(f.path)&&!/dest|target|poi|via|stop/i.test(f.path))||found.find((f)=>!/dest|target|poi|via|stop/i.test(f.path))||found[0];
}
const inKR=(lat,lon)=>lat>=KR.lat0&&lat<=KR.lat1&&lon>=KR.lon0&&lon<=KR.lon1;
/** The unit that puts the raw pair in Korea (else anywhere on Earth), or null (0 / 0 and the like: no fix). */
function scaleOf(rawLat,rawLon){
 if(rawLat===0&&rawLon===0)return null;
 const kr=SCALES.find((s)=>inKR(rawLat*s[1],rawLon*s[1]));if(kr)return {name:kr[0],k:kr[1],kr:true};
 const any=SCALES.find((s)=>{const a=rawLat*s[1],o=rawLon*s[1];return Math.abs(a)<=90&&Math.abs(o)<=180&&(Math.abs(a)>0.01||Math.abs(o)>0.01);});
 return any?{name:any[0],k:any[1],kr:false}:null;
}
/** Key paths of a value, without the values (for the log). */
function shape(v){const out=[];(function walk(x,p,d){if(out.length>60||d>6)return;
 if(Array.isArray(x)){if(x.length)walk(x[0],p+'[]',d+1);else out.push(p+'[]');return;}
 if(x&&typeof x==='object'){Object.keys(x).forEach((k)=>walk(x[k],p?p+'.'+k:k,d+1));return;}out.push(p+':'+typeof x);})(v,'',0);return out.join(' ');}
const R=6371008.8,RAD=Math.PI/180;
function distance(a1,o1,a2,o2){const p1=a1*RAD,p2=a2*RAD,dp=(a2-a1)*RAD,dl=(o2-o1)*RAD,h=Math.sin(dp/2)*Math.sin(dp/2)+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)*Math.sin(dl/2);return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function bearing(a1,o1,a2,o2){const p1=a1*RAD,p2=a2*RAD,dl=(o2-o1)*RAD,y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return (Math.atan2(y,x)/RAD+360)%360;}
function loadCandidates(){try{const j=require('./position-candidates.json');return {list:Array.isArray(j.list)?j.list:[],note:j.note||''};}catch(e){return {list:[],note:'no position-candidates.json'};}}
class Position {
 // signals: the kit's signals (watch); clock: the worker's monotonic ms; candidates: { list, note } (position-candidates.json)
 constructor(signals,log,clock,candidates){
  this.signals=signals;this.log=log||{info(){},warn(){}};this.clock=clock||Date.now;
  const c=candidates||loadCandidates();this.note=c.note;
  this.cands=c.list.map((x)=>Object.assign({count:0,misses:0,last:null,first:null,scale:null,error:null,shapeLogged:false,sub:null,seenAt:null,skipped:0},x));this.timer=null;
  this.on=false;this.token=0;this.best=null;this.anchor=null;this.heading=null;
 }
 /** on: the check wanted. Subscribes every candidate, or lets them go. */
 sync(on){
  if(!on){if(this.on){this.token++;if(this.timer){clearInterval(this.timer);this.timer=null;}this.cands.forEach((c)=>{if(c.sub)try{c.sub.shutdown();}catch(e){}c.sub=null;});}this.on=false;return;}
  if(this.on||!this.signals||!this.signals.watch)return;
  this.on=true;const token=++this.token,groups={};
  this.cands.forEach((c)=>{const k=c.iface+'|'+(c.inst||'1');(groups[k]=groups[k]||[]).push(c);});
  Object.keys(groups).forEach((k)=>{const list=groups[k],c0=list[0],handlers={};
   list.forEach((c)=>{handlers[c.name]=(v)=>{if(token===this.token)this.value(c,v,this.clock());};});
   Promise.resolve().then(()=>this.signals.watch(c0.iface,c0.inst||'1',handlers,this.log,{})).then((s)=>{
    if(token!==this.token){try{s.shutdown();}catch(e){}return;}
    const err=s&&s.error?String(s.error):null;list.forEach((c)=>{c.sub=s;c.error=err;});
    this.log.info('position: '+c0.iface+' ('+list.map((c)=>c.name).join(', ')+')'+(err?' error: '+err:' watched'));
   },(e)=>{if(token===this.token)list.forEach((c)=>{c.error=String(e&&e.message||e).slice(0,120);});});
  });
  if(this.cands.some((c)=>c.poll))this.timer=setInterval(()=>{if(token!==this.token)return;
   this.cands.forEach((c)=>{const px=c.poll&&c.sub&&c.sub.available&&c.sub.proxy;if(!px||!px.getValue)return;
    Promise.resolve().then(()=>px.getValue(c.name,3000)).then((v)=>{if(token===this.token)this.value(c,v,this.clock());},()=>{});});},POLL_MS);
 }
 value(c,v,now){
  if(c.seenAt!==null&&now-c.seenAt<MIN_GAP_MS&&now>=c.seenAt){c.skipped++;return;}c.seenAt=now;
  try{
   const pair=findPair(v);
   if(!pair){c.misses++;if(!c.shapeLogged){c.shapeLogged=true;this.log.info('position: '+c.name+' sent no lat/lon pair; its keys: '+shape(v).slice(0,600));}return;}
   let s=c.scale;const fits=s&&Math.abs(pair.lat*s.k)<=90&&Math.abs(pair.lon*s.k)<=180&&(!s.kr||inKR(pair.lat*s.k,pair.lon*s.k));
   if(!fits){s=scaleOf(pair.lat,pair.lon);if(!s){c.misses++;return;}
    if(!c.scale||c.scale.name!==s.name)this.log.info('position: '+c.name+' at '+pair.path+' in '+s.name+(s.kr?'':' (outside Korea)'));c.scale=s;}
   c.last={lat:pair.lat*s.k,lon:pair.lon*s.k,t:now,path:pair.path};if(c.first===null)c.first=now;c.count++;
   this.choose(now);
   if(this.best===c)this.track(c.last);
  }catch(e){this.log.warn('position '+c.name+': '+e);}
 }
 // the heading from fixes at least 12 m apart (as SpeedCam): unknown until the car has moved that far
 track(fix){
  if(!this.anchor){this.anchor=fix;return;}
  if(distance(this.anchor.lat,this.anchor.lon,fix.lat,fix.lon)>=HEAD_MIN_M){this.heading=bearing(this.anchor.lat,this.anchor.lon,fix.lat,fix.lon);this.headingAt=fix.t;this.anchor=fix;}
  if(this.heading!==null&&fix.t-this.headingAt>20000)this.heading=null;
 }
 choose(now){
  const fresh=this.cands.filter((c)=>c.last&&now-c.last.t<=STALE_MS);
  fresh.sort((a,b)=>(b.scale&&b.scale.kr?1:0)-(a.scale&&a.scale.kr?1:0)||b.count-a.count);
  const next=fresh[0]||null;if(next!==this.best){if(next)this.log.info('position source: '+next.iface+'.'+next.name);this.best=next;this.anchor=null;this.heading=null;}
 }
 /** The newest position of the source in use: { lat, lon, t } or null when older than 3 s. */
 fix(now){this.choose(now);return this.best&&this.best.last?this.best.last:null;}
 /** For the screen: the candidates (each: name, received, per second, age, unit, in use) and the position now. */
 status(now){
  const fix=this.on?this.fix(now):null;
  return {on:this.on,note:this.note,candidates:this.cands.map((c)=>({name:c.iface.split('.').slice(-2).join('.')+'.'+c.name,kind:c.kind,received:c.count,misses:c.misses,error:c.error,
   available:c.sub?c.sub.available:null,rate:c.first!==null&&c.last&&c.last.t>c.first?Math.round(c.count/((c.last.t-c.first)/1000)*10)/10:null,
   age:c.last?Math.round((now-c.last.t)/100)/10:null,unit:c.scale?c.scale.name:null,korea:c.scale?c.scale.kr:null,inUse:this.best===c})),
   fix:fix?{lat:fix.lat,lon:fix.lon,korea:inKR(fix.lat,fix.lon),heading:this.heading===null?null:Math.round(this.heading)}:null};
 }
}
module.exports={Position,findPair,scaleOf,shape,inKR,distance,bearing,KR,STALE_MS};
