'use strict';
// Experimental, read-only sign alerts. Only the class/number pairs observed in the supplied vehicle log
// are accepted; a camera candidate alone is never treated as the current road's speed limit.
const SPEED_IF='de.bmw.infotainment.vehicle.Vehicle2',SPEED='statusCarSpeed2';
const TSR_IF='de.bmw.dass.TrafficSignRecognition',TSR='TrafficSignRecognition';
const CAMERA_IF='de.bmw.environmentalmodel.SignRecognitionFrontCamera',CAMERA='TrafficSignRecognitionFrontCamera';
const FIELDS=[[SPEED_IF,SPEED],[TSR_IF,TSR],[CAMERA_IF,CAMERA]];
const CLASSES={2:10,6:30,8:40,10:50},TTL=30000,CHILD_HOLD=6000,CHILD_COOLDOWN=30000;
const finite=v=>typeof v==='number'&&isFinite(v);
const fresh=(at,now,ttl)=>at!==null&&now>=at&&now-at<=ttl;
class TrafficSigns{
 constructor(){this.clear();}
 clear(){this.speed=null;this.speedAt=null;this.limit=null;this.limitAt=null;this.camera=null;this.cameraAt=null;this.childAt=null;this.lastChild=-Infinity;this.over=false;this.overAt=null;this.rawClass=null;}
 sample(kind,v,now){
  if(kind===SPEED){const r=v&&v.speedVehicleCentreOfGravity;this.speed=finite(r)&&r>=0&&r<=400*64?r/64:null;this.speedAt=this.speed===null?null:now;return;}
  if(kind===TSR){
   this.rawClass=v&&Number.isInteger(v.presentClassLimitSpeed)?v.presentClassLimitSpeed:null;
   const before=this.limit;
   const n=v&&Number.isInteger(v.presentClassLimitSpeed)&&CLASSES[v.presentClassLimitSpeed];
   // On the observed car: unit 0 accompanies valid km/h classes, unit 2 / class 254 accompanies withdrawal.
   this.limit=v&&v.presentWithdrawalLimitSpeed===1&&v.unitOfMeasurementSpeedLimit===0&&n?n:null;
   this.limitAt=this.limit===null?null:now;if(this.limit===null||before!==this.limit){this.over=false;this.overAt=null;}return;
  }
  if(kind!==CAMERA)return;
  const h=v&&v.trafficSignRecognition,n=h&&h.numberSigns;
  if(!v||v.eventDataQualifier!=='EVENT_DATA_AVAILABLE'||v.extendedQualifier!=='NORMAL_OPERATION_MODE'||!h||h.speedLimitUnit!=='KM_H'||!Number.isInteger(n)||n<0||n>32||!Array.isArray(v.trafficSign)){
   this.camera=null;this.cameraAt=null;this.childAt=null;return;
  }
  const signs=v.trafficSign.slice(0,n),qs=v.trafficSignRecognitionQuality||[];
  const valid=(s,i)=>{const q=qs[i],p=s&&s.position,l=s&&s.location;
   return s&&s.type!=='SIGNAL_UNFILLED'&&s.additionalInfo==='NO_ADDITIONAL_RESTRICTION'&&l&&l.locationInvalidFlags===0&&p&&!p.left&&(p.right||p.overhead)&&q&&q.qualityType===100&&finite(q.qualityValue)&&q.qualityValue>=40&&q.qualityValue<=100;
  };
  if(signs.some((s,i)=>valid(s,i)&&/^WITHDRAWAL_SPEED_LIMIT/.test(s.type))){this.camera=null;this.cameraAt=null;}
  else{
   const candidates=signs.filter((s,i)=>valid(s,i)&&s.type==='SPEED_LIMIT'&&[10,30,40,50].includes(s.value)&&s.firstSupplementalType==='SIGNAL_UNFILLED'&&s.secondSupplementalType==='SIGNAL_UNFILLED');
   const limits=Array.from(new Set(candidates.map(s=>s.value)));
   if(limits.length===1){this.camera=limits[0];this.cameraAt=now;}
   else if(limits.length>1){this.camera=null;this.cameraAt=null;}
  }
  if(signs.some((s,i)=>valid(s,i)&&s.type==='DS_CHILDREN')&&now-this.lastChild>=CHILD_COOLDOWN){this.childAt=now;this.lastChild=now;}
 }
 read(now,mode,available){
  if(!['speed','children','both'].includes(mode)||!available)return {visible:false,limit:null,children:false,over:false};
  const limit=mode!=='children'&&fresh(this.limitAt,now,TTL)&&fresh(this.cameraAt,now,TTL)&&this.limit===this.camera?this.limit:null;
  const children=mode!=='speed'&&fresh(this.childAt,now,CHILD_HOLD);
  if(limit!==null&&fresh(this.speedAt,now,2000)){
   if(this.speed>limit+3){if(this.overAt===null)this.overAt=now;if(now-this.overAt>=1000)this.over=true;}
   else if(this.speed<=limit+1){this.over=false;this.overAt=null;}
   else if(!this.over)this.overAt=null;
  }else{this.over=false;this.overAt=null;}
  return {visible:limit!==null||children,limit,children,over:limit!==null&&this.over,speed:fresh(this.speedAt,now,2000)?this.speed:null};
 }
 diagnostics(now){return {rawClass:this.rawClass,limit:this.limit,camera:this.camera,limitAgeMs:this.limitAt===null?null:now-this.limitAt,cameraAgeMs:this.cameraAt===null?null:now-this.cameraAt,childrenAgeMs:this.childAt===null?null:now-this.childAt};}
}
module.exports={TrafficSigns,FIELDS,SPEED_IF,SPEED,TSR_IF,TSR,CAMERA_IF,CAMERA,CLASSES};
