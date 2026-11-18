'use strict';
// Vehicle alerts: the car navigation's own speeding, school zone and speed camera events, read from the same
// read-only GuidanceEventList.queryContent the HUD route events use (no view is registered, nothing is set).
//
// What the car's catalog gives (navigation GuidanceEventUnion, ID7):
//   speedCamera        { formattedDistance, speedLimitAssistInfo, speedCameraInfo }
//   speedSectionCamera { formattedDistance, length, isInsideEvent, averageSpeed, speedUnit, speedLimitAssistInfo }
//   schoolZone         { formattedDistance, length, isInsideEvent, speedLimitAssistInfo }
//   speedLimitAssist   { formattedDistance, speedLimitAssistInfo }
//   speedLimitAssistInfo: { value: { reason: { speedLimitInfo: { speedLimit, speedUnit, speedingInfo:
//                           UNKNOWN | SPEED_OKAY | TOO_FAST } } } }  (or { nil: NO_VALUE })
// Speeding is the car's own TOO_FAST verdict; nothing is guessed from the vehicle speed.
//
// includedTypes: the three alert kinds together; if the car refuses that set, each kind is asked alone once and
// only the accepted ones are kept; if none is accepted, the empty list (the only one the 2026-11-14 drive log saw
// accepted: NO_ERROR, no events on that drive), whatever the car then sends.
const {distanceText}=require('./native-navigation');
const KINDS=['speedCamera','speedSectionCamera','schoolZone','speedLimitAssist'];
const TYPES=['INCLUDE_SPEED_CAMERA','INCLUDE_SCHOOL_ZONES','INCLUDE_SPEED_LIMIT_ASSIST'];
const POLL_MS=1000,FRESH_MS=3000,CAMERA_NEAR_M=1000,SCHOOL_NEAR_M=300;
const UNIT_M={KM:1000,METER:1,MILE_UK:1609.344,MILE_US:1609.344,YARD:0.9144,FEET:0.3048};
const UNIT_NAMES=['NONE','KM','MILE_UK','MILE_US','METER','YARD','FEET'];
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
function enumName(v,names){return typeof v==='string'?v:typeof v==='number'&&names[v]!==undefined?names[v]:null;}
function params(types){
 return {viewConfigs:[{viewport:{startPoint:{anchorPoint:{standardReferencePoint:'CCP'},offsets:[]},maxElementCount:8,endPoints:[],includedTypes:types.slice()},
  options:[],minimumUpdateIntervalMs:1000,segmentItemRasterLength:100}]};
}
// Metres to the event, from the car's formatted distance (rawDistance is in that unit); null when unknown.
function metres(d){
 if(!object(d))return null;const unit=enumName(d.unit,UNIT_NAMES),k=UNIT_M[unit];if(!k)return null;
 const raw=Number(d.rawDistance);if(isFinite(raw)&&raw>=0)return raw*k;
 const t=parseFloat(String(d.distance||'').replace(',','.'));return isFinite(t)&&t>=0?t*k:null;
}
function speedInfo(item){
 const v=object(item)&&object(item.speedLimitAssistInfo)&&item.speedLimitAssistInfo.value,r=object(v)&&v.reason,s=object(r)&&r.speedLimitInfo;
 if(!object(s))return null;
 const limit=Number(s.speedLimit),speeding=enumName(s.speedingInfo,['UNKNOWN','SPEED_OKAY','TOO_FAST']);
 return {limit:Number.isInteger(limit)&&limit>0&&limit<400?limit:null,tooFast:speeding==='TOO_FAST',unit:enumName(s.speedUnit,[null,'KM_P_H','MI_P_H_UK','MI_P_H_US'])};
}
/** One queryContent reply: { ok, error, kinds: {kind: count}, camera, school, speeding }. */
function decode(reply){
 const out={ok:false,error:null,kinds:{},camera:null,school:null,speeding:null};
 if(!object(reply)){out.error='no_reply';return out;}
 if(reply.GuidanceEventListError!==undefined&&reply.GuidanceEventListError!==0&&reply.GuidanceEventListError!=='NO_ERROR'){out.error='rejected:'+reply.GuidanceEventListError;return out;}
 const views=reply.viewContent;if(!Array.isArray(views)||!views.length||!object(views[0])||!Array.isArray(views[0].eventsInView)){out.error='shape';return out;}
 out.ok=true;
 views[0].eventsInView.slice(0,16).forEach(e=>{
  if(!object(e))return;const keys=Object.keys(e).filter(k=>e[k]!==undefined&&e[k]!==null);if(keys.length!==1)return;
  const kind=keys[0],item=e[kind];out.kinds[kind]=(out.kinds[kind]||0)+1;
  if(KINDS.indexOf(kind)<0||!object(item)||item.unreliable===true)return;
  const m=metres(item.formattedDistance),text=distanceText(item.formattedDistance),inside=item.isInsideEvent===true,s=speedInfo(item);
  if(s&&s.tooFast&&!out.speeding)out.speeding={limit:s.limit};
  if((kind==='speedCamera'||kind==='speedSectionCamera')&&(inside||m!==null&&m<=CAMERA_NEAR_M)&&(!out.camera||m!==null&&out.camera.m!==null&&m<out.camera.m)){
   const avg=Number(item.averageSpeed);
   out.camera={m,text:inside?null:text,section:kind==='speedSectionCamera',inside,limit:s&&s.limit||(kind==='speedSectionCamera'&&Number.isInteger(avg)&&avg>0&&avg<400?avg:null)};
  }
  if(kind==='schoolZone'&&(inside||m!==null&&m<=SCHOOL_NEAR_M)&&!out.school)out.school={m,text:inside?null:text,inside,limit:s&&s.limit};
 });
 return out;
}
class VehicleAlerts{
 constructor(clock,call){this.clock=clock;this.call=call;this.sub=null;this.closed=false;this.pending=false;this.lastPoll=-Infinity;this.epoch=0;
  this.types=null;this.trying=null;this.state='off';this.last=null;this.at=null;this.queries=0;this.replies=0;this.error=null;this.kinds={};}
 attach(sub){if(this.sub!==sub){this.epoch++;this.last=null;this.at=null;}this.sub=sub;}
 stop(){this.closed=true;this.epoch++;this.sub=null;this.last=null;this.at=null;this.state='stopped';}
 // The type list to ask next: the accepted one, else the full set, else each kind alone in turn.
 next(){if(this.types)return this.types;if(!this.trying)this.trying={list:[TYPES.slice()].concat(TYPES.map(t=>[t]),[[]]),index:0,accepted:[]};return this.trying.list[this.trying.index];}
 result(types,ok){
  if(this.types){if(!ok)this.error=this.error||'query_failed';return;}
  const t=this.trying;if(!t)return;
  if(ok&&t.index===0){this.types=types.slice();this.trying=null;return;}
  if(ok&&types.length===1)t.accepted.push(types[0]);
  // the empty list is tried only when no kind was accepted alone
  if(t.index===t.list.length-2&&t.accepted.length){this.types=t.accepted;this.trying=null;return;}
  if(ok&&!types.length){this.types=[];this.trying=null;return;}
  t.index++;if(t.index<t.list.length)return;
  this.trying=null;if(t.accepted.length)this.types=t.accepted;else{this.state='types_rejected';this.types=null;this.trying=null;this.rejectedAt=this.clock();}
 }
 tick(now,wanted){
  if(!wanted){if(this.state!=='off'){this.epoch++;this.last=null;this.at=null;this.state='off';}return;}
  const sub=this.sub,usable=!!(sub&&sub.proxy&&!sub.error);
  if(!usable){this.state=sub&&sub.error?'interface_error':'waiting';this.last=null;this.at=null;return;}
  if(this.state==='types_rejected'&&now-this.rejectedAt<30000)return;
  if(this.closed||this.pending||now-this.lastPoll<POLL_MS)return;
  this.pending=true;this.lastPoll=now;this.queries++;if(this.state==='off'||this.state==='waiting'||this.state==='types_rejected')this.state='reading';
  const epoch=this.epoch,types=this.next();
  Promise.resolve().then(()=>this.call(sub.proxy,'queryContent',params(types),1000)).then(reply=>{
   if(this.closed||epoch!==this.epoch)return;
   const d=decode(reply);this.result(types,d.ok);
   if(d.ok){this.replies++;this.last=d;this.at=this.clock();this.kinds=d.kinds;this.error=null;this.state='ready';}
   else{this.error=d.error;if(this.types)this.state='read_failed';}
  },e=>{if(this.closed||epoch!==this.epoch)return;this.result(types,false);this.error=String(e&&e.message||e).slice(0,120);if(this.types)this.state='read_failed';})
  .then(()=>{this.pending=false;});
 }
 /** What the HUD shows now for a mode ('speed' | 'school' | 'camera' | 'all'): { speeding, school, camera } or null. */
 read(now,mode){
  if(!this.last||this.at===null||now<this.at||now-this.at>FRESH_MS||mode==='off')return null;
  const all=mode==='all',v={speeding:(all||mode==='speed')?this.last.speeding:null,school:(all||mode==='school')?this.last.school:null,camera:(all||mode==='camera')?this.last.camera:null};
  return v.speeding||v.school||v.camera?v:null;
 }
 status(now){return {state:this.state,queries:this.queries,replies:this.replies,types:this.types,error:this.error,kinds:this.kinds,ageMs:this.at===null?null:Math.max(0,now-this.at)};}
}
// A sample for the Position / size preview: every alert at once.
const SAMPLE={speeding:{limit:30},school:{m:150,text:'150 m',inside:false,limit:30},camera:{m:420,text:'420 m',section:false,inside:false,limit:60}};
module.exports={VehicleAlerts,decode,params,TYPES,KINDS,SAMPLE,FRESH_MS};
