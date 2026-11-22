'use strict';
// The blind spot (lane change) warning as the car's own door mirror lamps show it, for the HUD: the body domain
// controller (BDC, 0x40), identifier D347, one byte a mirror (left, right): 0 off, 1 lit (a car in the blind spot),
// 2..4 flashing (warning steps, the turn signal on towards it), anything else (0x0D a display fault, 0xFF invalid) off.
// The facts (unit, identifier, values, 300 ms reading, 3 s staleness) are those akakingj's myapp-id7 Redline
// (apps/redline/blindspot.js, MIT) and mlurker's HUD signals found on a G05; this code is written anew.
//
// READ ONLY: the only request is 22 D3 47, through the kit's ReadOnlyDiag (nothing but 22 / OBD 01 / 09 can leave
// the head unit; the same identifier written would switch the mirror lamps). Read only while the warning is on and
// the engine runs, at most every POLL_MS; the link is released when not wanted.
const BDC=0x40,DID=0xD347,POLL_MS=300,STALE_MS=3000,WAKE_MS=10000;
/** A lamp's byte: 0 off, 1 lit, 2 flashing. */
const decode=v=>v===1?1:v>=2&&v<=4?2:0;
/** A reply's lamps ({ left, right }), 'refused' for a 7F 22 refusal, or null when it is not an answer to D347. */
function parse(u){
 if(!Array.isArray(u)&&!(u&&typeof u.length==='number'))return null;
 if(u[0]===0x7F&&u[1]===0x22)return 'refused';
 if(u[0]!==0x62||u[1]!==0xD3||u[2]!==0x47||u.length<5)return null;
 return {left:decode(u[3]),right:decode(u[4])};
}
class BlindSpot{
 constructor(signals,log,create){
  this.signals=signals;this.log=log||{warn(){},info(){}};
  this.create=create||(()=>{const {ReadOnlyDiag}=require('./kit/readonly-diag');return new ReadOnlyDiag(signals,this.log,{silentAfter:5});});
  this.link=null;this.initializing=false;this.busy=false;this.epoch=0;this.lastPoll=-Infinity;this.woke=-Infinity;this.retryAt=0;
  this.lamps={left:0,right:0};this.at=null;this.reads=0;this.good=0;this.refused=false;this.error=null;
 }
 // now: monotonic ms; wanted: the warning is on and the engine runs.
 tick(now,wanted){
  if(!wanted){if(this.link||this.initializing)this.release();return;}
  if(!this.link){
   if(this.initializing||now<this.retryAt)return;this.initializing=true;const epoch=this.epoch,l=this.create();
   Promise.resolve().then(()=>l.init()).then(()=>{if(epoch!==this.epoch)return;this.initializing=false;this.link=l;},e=>{if(epoch!==this.epoch)return;this.initializing=false;this.error=String(e&&e.message||e).slice(0,120);this.retryAt=now+30000;});
   return;
  }
  if(this.refused||this.busy||now-this.lastPoll<POLL_MS||!this.link.ready)return;
  this.lastPoll=now;if(now-this.woke>WAKE_MS){this.woke=now;try{this.link.wake(BDC);}catch(e){}}
  this.busy=true;const epoch=this.epoch,l=this.link;
  Promise.resolve().then(()=>l.read(BDC,DID,1000)).then(u=>{
   if(epoch!==this.epoch)return;this.reads++;const p=parse(u);
   if(p==='refused'){this.refused=true;this.log.warn('blind spot: the BDC refused 22 D347 (this car has no such lamp status)');return;}
   if(!p)return;this.lamps=p;this.at=now;this.good++;this.error=null;
  },e=>{if(epoch===this.epoch)this.error=String(e&&e.message||e).slice(0,120);}).then(()=>{if(epoch===this.epoch)this.busy=false;});
 }
 /** Each side now: 0 nothing, 1 a car there (lit), 2 warning (flashing: the turn signal is on towards it). */
 read(now){const fresh=this.at!==null&&now-this.at<STALE_MS;return {left:fresh?this.lamps.left:0,right:fresh?this.lamps.right:0};}
 release(){this.epoch++;this.busy=false;this.initializing=false;this.link=null;this.at=null;this.lamps={left:0,right:0};}
 status(now){return {reading:!!this.link,reads:this.reads,good:this.good,refused:this.refused,error:this.error,ageMs:this.at===null?null:Math.round(now-this.at)};}
}
module.exports={BlindSpot,parse,decode,BDC,DID,POLL_MS,STALE_MS};
