'use strict';
// The gearbox oil temperature readout (1.3.104), from the first source that has it, as appsKOR's Warm-Up reads it
// (apps/warmup/gearbox.js; the facts are its, this code is written anew):
//   1. the gearbox unit (EGS, 0x18), READ ONLY through the kit's ReadOnlyDiag (nothing but 22 / OBD 01 / 09 can leave the
//      head unit): 22 6000 (ZF 8HP: °C + 40, read on a G22), else 22 DA12 (°C + 48, not confirmed on a car: taken only
//      once it has moved). A unit that says it has neither identifier is not asked again.
//   2. the car's BasicDataSet signal (valueTemperatureTransmissionOil, aux-info.js): only once it has moved, as some cars
//      leave it at one number.
// Asked only while the readout shows and the engine runs, every POLL_MS (SLOW_MS when the unit is silent); the link is
// released when not wanted.
const EGS=0x18,POLL_MS=5000,SLOW_MS=30000,FRESH_MS=20000,MIN=-40,MAX=160,MOVE=1,WAKE_MS=10000;
const DIDS=[{did:0x6000,offset:-40,sure:true},{did:0xDA12,offset:-48,sure:false}];
const ABSENT=[0x11,0x12,0x31];   // refusals that mean "this unit has no such identifier"
/** A value that counts only once it has moved by MOVE from the first one seen (unless sure). */
class Moving{
 constructor(sure){this.sure=!!sure;this.first=null;this.moved=this.sure;this.v=null;this.at=-Infinity;}
 put(v,now){if(typeof v!=='number'||!isFinite(v)||v<MIN||v>MAX)return;if(this.first===null)this.first=v;if(Math.abs(v-this.first)>=MOVE)this.moved=true;this.v=v;this.at=now;}
 get(now){return this.moved&&this.v!==null&&now-this.at<FRESH_MS?this.v:null;}
}
/** A reply to 22 <did>: the byte's °C, 'absent' (the unit has no such identifier), 'refused', or null (not this answer). */
function parse(u,d){
 if(!u||typeof u.length!=='number')return null;
 if(u[0]===0x7F&&u[1]===0x22)return ABSENT.indexOf(u[2])>=0?'absent':'refused';
 if(u[0]!==0x62||u.length<4||((u[1]<<8)|u[2])!==d.did)return null;
 return u[3]+d.offset;
}
class GearboxTemp{
 constructor(signals,log,create){
  this.signals=signals;this.log=log||{warn(){},info(){}};
  this.create=create||(()=>{const {ReadOnlyDiag}=require('./kit/readonly-diag');return new ReadOnlyDiag(signals,this.log,{silentAfter:5});});
  this.egs=DIDS.map(d=>Object.assign({gone:false,val:new Moving(d.sure)},d));this.sig=new Moving(false);
  this.link=null;this.initializing=false;this.busy=false;this.epoch=0;this.nextAt=0;this.woke=-Infinity;this.retryAt=0;this.silent=0;
  this.reads=0;this.good=0;this.error=null;
 }
 // now: monotonic ms; wanted: the readout shows and the engine runs; signal: the BasicDataSet value (°C) or null.
 tick(now,wanted,signal){
  if(typeof signal==='number')this.sig.put(signal,now);
  if(!wanted){if(this.link||this.initializing)this.release();return;}
  const ask=this.egs.filter(e=>!e.gone);if(!ask.length)return;
  if(!this.link){
   if(this.initializing||now<this.retryAt)return;this.initializing=true;const epoch=this.epoch,l=this.create();
   Promise.resolve().then(()=>l.init()).then(()=>{if(epoch!==this.epoch)return;this.initializing=false;if(l.ready)this.link=l;else this.retryAt=now+SLOW_MS;},
    e=>{if(epoch!==this.epoch)return;this.initializing=false;this.retryAt=now+SLOW_MS;this.error=String(e&&e.message||e).slice(0,120);});
   return;
  }
  if(this.busy||now<this.nextAt||!this.link.ready)return;
  if(now-this.woke>WAKE_MS){this.woke=now;try{this.link.wake(EGS);}catch(e){}}
  const d=ask.find(e=>e.val.v!==null)||ask[0];   // the identifier that answered before, or the first still possible
  this.busy=true;const epoch=this.epoch,l=this.link;
  Promise.resolve().then(()=>l.read(EGS,d.did,1000)).then(u=>{
   if(epoch!==this.epoch)return;this.reads++;const v=parse(u,d);
   if(typeof v==='number'){d.val.put(v,now);this.good++;this.silent=0;this.error=null;this.nextAt=now+POLL_MS;}
   else if(v==='absent'){d.gone=true;this.silent=0;this.nextAt=now+100;this.log.info('gearbox temp: the gearbox unit has no '+d.did.toString(16).toUpperCase());}
   else{this.silent++;this.nextAt=now+(this.silent>=3?SLOW_MS:POLL_MS);}
  },e=>{if(epoch!==this.epoch)return;this.silent++;this.nextAt=now+(this.silent>=3?SLOW_MS:POLL_MS);this.error=String(e&&e.message||e).slice(0,120);})
   .then(()=>{if(epoch===this.epoch)this.busy=false;});
 }
 /** °C now, or null (no source has it). */
 read(now){for(const e of this.egs){const v=e.val.get(now);if(v!==null)return v;}return this.sig.get(now);}
 source(now){for(const e of this.egs)if(e.val.get(now)!==null)return 'EGS '+e.did.toString(16).toUpperCase();return this.sig.get(now)!==null?'signal':null;}
 release(){this.epoch++;this.busy=false;this.initializing=false;this.link=null;}
 status(now){return {reading:!!this.link,reads:this.reads,good:this.good,source:this.source(now),gone:this.egs.filter(e=>e.gone).map(e=>e.did.toString(16).toUpperCase()),error:this.error};}
}
module.exports={GearboxTemp,Moving,parse,DIDS,EGS,POLL_MS,FRESH_MS};
