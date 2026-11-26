'use strict';
// What the navigation sends, turn by turn (1.3.43): to see what a phone navigation (T map, Kakao Navi through
// CarPlay / Android Auto) or BMW's own guidance sends for a highway exit, and so what the HUD can draw from it.
//   the screen  Navigation tab → Navigation display: the last turns received, newest first, each with the raw
//               values of its turn (the kind, every plain field as it came: branchType, direction, exitNumber ...),
//               its distance, its description text, and what the HUD drew for it. The same turn coming again with
//               only its distance changed updates its line; a new line only when the turn changes. Kept until the
//               app stops.
//   the file    nav-probe.log in the app's data folder, while switched on (Navigation display → Record to a file):
//               one JSON line per new turn with the whole turn as received, and the route's event list (the next
//               turns) when its first turn changes. At most 1 MB, then one older file (.1).
// Read only: nothing is ever sent to the car.
const KEEP=10,FILE_MAX=1024*1024;
const object=(v)=>!!v&&typeof v==='object'&&!Array.isArray(v);
// The kind of turn (the union's key) and its body.
function turnOf(union){if(!object(union))return null;const keys=Object.keys(union).filter(k=>union[k]!==undefined&&union[k]!==null);return keys.length===1?{kind:keys[0],item:union[keys[0]]}:null;}
const DISTANCE_KEYS=/^(formattedDistance|distanceToDestination|rawDistance|timeStamp|distance)$/;
// Each plain field of the turn as it came (numbers, names, true / false), the distances and the texts apart.
function fields(item){
 const out=[];if(!object(item))return out;
 Object.keys(item).sort().forEach(k=>{const v=item[k];if(DISTANCE_KEYS.test(k)||k==='description')return;
  if(typeof v==='number'||typeof v==='boolean'||typeof v==='string')out.push(k+'='+String(v).slice(0,32));
  else if(object(v)){Object.keys(v).sort().forEach(s=>{const w=v[s];if(typeof w==='number'||typeof w==='boolean'||typeof w==='string')out.push(k+'.'+s+'='+String(w).slice(0,24));});}
 });
 return out.slice(0,10);
}
function distanceOf(item){
 const f=object(item)&&object(item.formattedDistance)?item.formattedDistance:null;if(!f)return '';
 const d=typeof f.distance==='string'?f.distance.trim():'',u=f.unit===undefined||f.unit===null?'':String(f.unit);
 return (d+(u?' ['+u+']':'')).slice(0,24);
}
function textOf(item){
 const d=object(item)&&object(item.description)?item.description:null;if(!d||!Array.isArray(d.elements))return '';
 return d.elements.slice(0,24).map(e=>object(e)&&typeof e.text==='string'?e.text:object(e)&&object(e.icon)&&typeof e.icon.text==='string'?' ['+e.icon.text+'] ':object(e)&&e.spacer!==undefined&&e.spacer!==null?' ':'').join('').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim().slice(0,48);
}
const clockText=(d)=>[d.getHours(),d.getMinutes(),d.getSeconds()].map(n=>String(n).padStart(2,'0')).join(':');
class NavProbe {
 // o: { fs, file (path of nav-probe.log), wall: () => Date }
 constructor(o){o=o||{};this.fs=o.fs||null;this.file=o.file||null;this.wall=o.wall||(()=>new Date());this.entries=[];this.recording=false;this.written=0;this.lastRoute=null;this.error=null;}
 /** Switch the file on or off (the setting). */
 record(on){on=!!on&&!!this.fs&&!!this.file;if(on===this.recording)return;this.recording=on;if(on){this.write({at:this.wall().toISOString(),note:'recording started'});}}
 write(line){
  if(!this.recording)return;
  try{const text=JSON.stringify(line)+'\n';let size=0;try{size=this.fs.statSync(this.file).size;}catch(e){}
   if(size+text.length>FILE_MAX){try{this.fs.renameSync(this.file,this.file+'.1');}catch(e){}}
   this.fs.appendFileSync(this.file,text);this.written++;this.error=null;}catch(e){this.error=String(e&&e.message||e).slice(0,80);}
 }
 /**
  * A turn received. source: 'dart' (the guidance's current turn) or 'route' (the route's event list, first turn);
  * provider: CAR_PLAY / ANDROID_AUTO / NONE ...; union: the turn as received ({ branch: {...} }); drawn: what the HUD
  * drew for it ('highway', 'branch', 'roundabout', 'road', 'arrow', or 'none': not shown).
  */
 turn(source,provider,union,drawn,extra){
  const t=turnOf(union);if(!t)return;
  const now=this.wall(),f=fields(t.item),text=textOf(t.item),dist=distanceOf(t.item);
  const sig=[source,provider||'',t.kind,f.join(','),text].join('|'),last=this.entries.find(e=>e.source===source);
  if(last&&last.sig===sig){last.time=clockText(now);last.dist=dist;last.drawn=drawn||last.drawn;last.count++;return;}
  this.entries.unshift({sig,source,time:clockText(now),provider:provider||'',kind:t.kind,fields:f,dist,text,drawn:drawn||'none',count:1});
  if(this.entries.length>KEEP)this.entries.length=KEEP;
  this.write(Object.assign({at:now.toISOString(),source,provider:provider||'',drawn:drawn||'none',turn:union},extra||{}));
 }
 /** The route's event list (the reply as received): its first turn on the screen, the whole list in the file. */
 route(provider,reply,drawn){
  const views=reply&&Array.isArray(reply.viewContent)?reply.viewContent:null,events=views&&views[0]&&Array.isArray(views[0].eventsInView)?views[0].eventsInView:null;
  if(!events||!events.length)return;
  // how many turns the list holds (1.3.67): one only, and no next turn can ever show; shown on the screen, no file needed
  const r=this.routeInfo||(this.routeInfo={count:0,last:0,max:0,provider:'',gap:null,time:''});r.count++;r.last=events.length;r.max=Math.max(r.max,events.length);r.provider=provider||'';r.time=clockText(this.wall());
  {const a=turnOf(events[0]),b=events[1]?turnOf(events[1]):null,da=a&&object(a.item)?a.item.distanceToDestination:null,db=b&&object(b.item)?b.item.distanceToDestination:null;
   r.gap=typeof da==='number'&&typeof db==='number'&&da>db?Math.round(da-db):null;}
  const first=turnOf(events[0]),key=first?first.kind+'|'+fields(first.item).join(',')+'|'+textOf(first.item):'';
  const fresh=key!==this.lastRoute;this.lastRoute=key;
  const was=this.recording;if(!fresh)this.recording=false;   // the whole list only when its first turn changes
  try{this.turn('route',provider,events[0],drawn,{events:events.slice(0,6)});}finally{this.recording=was;}
 }
 list(){return this.entries.map(e=>({source:e.source,time:e.time,provider:e.provider,kind:e.kind,fields:e.fields,dist:e.dist,text:e.text,drawn:e.drawn,count:e.count}));}
 status(){return {recording:this.recording,written:this.written,error:this.error,turns:this.list(),route:this.routeInfo?Object.assign({},this.routeInfo):null};}
}
/** What the HUD draws for a decoded turn (nav-draw): 'highway', 'branch', 'roundabout', 'road', 'arrow' or 'none'. */
function drawnOf(decoded){if(!decoded||!decoded.maneuver)return 'none';let k=null;try{k=require('./nav-draw').diagramKind(Object.assign({visible:true},decoded));}catch(e){return 'arrow';}return k||'arrow';}
module.exports={NavProbe,drawnOf,fields,textOf,distanceOf,turnOf,KEEP,FILE_MAX};
