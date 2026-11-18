'use strict';
// Read only the standardized ECU voltage PID/DID. No diagnostic sessions,
// security access, coding or write requests. Lazy and scoped to this worker.
const IFACE='com.harman.infotainment.systemfunctions.tasu.tasu.InternalTasu';
function supported(catalog){
 const d=(catalog.interfaces||{})[IFACE],ids=(catalog.instanceIDs||{})[IFACE];
 return !!(d&&d.serviceId===63654&&d.version&&d.version.major===1&&ids&&ids.SystemFunctionsInternalTasuInst1===128&&d.methods&&d.methods.sendTasuRequest&&d.methods.sendTasuRequest.methodId===1&&d.events&&d.events.sendTasuResponse&&d.events.sendTasuResponse.eventId===32769);
}
// Three ways to ask the DME (0x12) or the gearbox (0x18) for the same voltage. One that answered is kept: a
// missed or refused reply is usually traffic (another app such as car_vitals polls the DME, the transport turns
// requests away while busy), not a sign that the way stopped working. The last good value stays on screen until
// the next good one (12 V moves slowly); it is cleared only when reading stops: the item is deselected, the engine
// has been off for 3 minutes, or the app stops. Only repeated misses move on to the next way.
const CANDIDATES=[[18,1,[0x42]],[18,0x22,[0xF4,0x42]],[24,1,[0x42]]];
const POLL_MS=5000,QUICK_MS=1000,SCAN_MS=2000,IDLE_MS=30000,LOCK_MISSES=4;
// Refusals that mean "this ECU has no such value"; any other (busy, conditions not correct, another app's
// refusal of the same service) is transient.
const UNSUPPORTED=[0x11,0x12,0x31];
function close(diag){if(!diag)return;diag.removeAllListeners&&diag.removeAllListeners('frame');Promise.resolve().then(()=>diag.p&&diag.p.shutdown&&diag.p.shutdown()).catch(()=>{});}
class BatteryVoltage{
 constructor(signals,log,clock,create){this.signals=signals;this.log=log;this.clock=clock;this.create=create||(()=>{const {Diag}=require('./kit/diag');return new Diag(signals,log);});this.diag=null;this.initializing=false;this.pending=false;this.stopped=false;this.epoch=0;this.value=null;this.at=-Infinity;this.last=-Infinity;this.retry=2000;this.choice=0;this.locked=false;this.misses=0;this.lastEngine=-Infinity;this.stats={ok:0,timeout:0,refused:0,busy:0,invalid:0,switched:0};}
 tick(now,wanted,running){
  if(this.stopped)return;
  if(running)this.lastEngine=now;
  if(!wanted||now-this.lastEngine>180000){this.value=null;if(this.diag||this.initializing)this.release();return;}
  if(!this.diag){
   if(this.initializing||now-this.last<this.retry)return;this.initializing=true;this.last=now;const epoch=this.epoch,d=this.create();d.quiet=true;
   Promise.resolve().then(()=>d.init()).then(()=>{if(this.stopped||epoch!==this.epoch){close(d);return;}this.initializing=false;if(d.error){close(d);this.retry=IDLE_MS;return;}this.diag=d;this.retry=0;},()=>{close(d);if(epoch===this.epoch){this.initializing=false;this.retry=IDLE_MS;}});return;
  }
  if(this.diag.available===false)return;
  if(this.pending||now-this.last<this.retry)return;
  this.pending=true;this.last=now;const epoch=this.epoch,d=this.diag,candidate=CANDIDATES[this.choice];
  const sid=candidate[1],query=candidate[2],prefix=sid===1?[0x41,0x42]:[0x62,0xF4,0x42];
  const accept=u=>Array.isArray(u)&&(prefix.every((n,i)=>u[i]===n)||(u[0]===0x7F&&u[1]===sid&&u[2]!==0x78));
  Promise.resolve().then(()=>d.physical(candidate[0],sid,query,1500,accept,{maxRetries:2,retryBaseMs:250,callTimeoutMs:1000,hardTimeoutMs:3000,pendingTimeoutMs:1500})).then(reply=>{
   if(this.stopped||epoch!==this.epoch)return;
   const offset=prefix.length,valid=Array.isArray(reply)&&prefix.every((n,i)=>reply[i]===n)&&reply.length>=offset+2&&reply.slice(offset,offset+2).every(n=>Number.isInteger(n)&&n>=0&&n<=255),v=valid?((reply[offset]<<8)|reply[offset+1])/1000:null;
   if(v!==null&&v>=5&&v<=18){this.value=v;this.at=this.clock();this.retry=POLL_MS;this.locked=true;this.misses=0;this.stats.ok++;return;}
   const refused=Array.isArray(reply)&&reply[0]===0x7F,unsupported=refused&&UNSUPPORTED.includes(reply[2]);
   this.stats[reply===null?'timeout':refused?'refused':'invalid']++;
   this.miss(unsupported&&!this.locked);
  },e=>{if(this.stopped||epoch!==this.epoch)return;this.stats.busy++;this.miss(false,/refused|BUSY|NOT_ACCEPTED/i.test(String(e&&e.message||e)));}).then(()=>{if(epoch===this.epoch)this.pending=false;});
 }
 // One failed request. A way that has answered keeps being asked (quickly at first) until LOCK_MISSES in a row;
 // a way still being tried, or one the ECU says it does not have, moves on at once.
 miss(unsupported,transport){
  this.misses++;
  if(this.locked&&!unsupported&&this.misses<LOCK_MISSES){this.retry=transport?QUICK_MS:this.misses===1?QUICK_MS:SCAN_MS;return;}
  if(!this.locked&&!unsupported&&transport){this.retry=SCAN_MS;return;}
  this.locked=false;this.misses=0;this.stats.switched++;
  this.choice=(this.choice+1)%CANDIDATES.length;this.retry=this.choice===0?IDLE_MS:SCAN_MS;
 }
 read(){return !this.stopped&&this.value!==null?this.value:null;}
 release(){this.epoch++;this.value=null;this.pending=false;this.locked=false;this.misses=0;const d=this.diag;this.diag=null;this.initializing=false;close(d);}
 stop(){this.stopped=true;this.release();}
}
module.exports={BatteryVoltage,supported,IFACE,LOCK_MISSES};
