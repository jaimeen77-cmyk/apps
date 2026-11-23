'use strict';
// The BC button check (1.3.39): what the car sends when the steering column's BC button is pressed, shown on the
// Cluster tab (BC mode → BC button check): the left stalk's switches (Light.IndicatorSteeringColumn(Complete),
// operationColumnStalks: 64 while BC is held), each change and each BC press counted, so it shows that the presses
// can be followed. Read only, nothing sent. The stalk fields are added at install where the car's catalog has them
// (traffic-config.js). The cluster's own BC selection (KombiIF.statusKombiSelection) and every other cluster (Kombi)
// value were read here too (1.3.39 / 1.3.44): none of them follows the stock BC page on the user's car (2026-11-23),
// so they were taken out in 1.3.46. The signal is the one chyiz's idrive7-cluster-metrics reads for its BC button
// (GPL; facts only, no code taken).
const LIGHT='de.bmw.body.Light',STALK=['IndicatorSteeringColumn','IndicatorSteeringColumnComplete'],HISTORY=10,BC_BIT=64;
const plain=(x)=>typeof x==='number'&&isFinite(x)||typeof x==='string'&&x.length>0&&x.length<40;
function stalkOf(v){const r=v&&typeof v==='object'?v.operationColumnStalks:v;return plain(r)?String(r):null;}
class Track {
 constructor(){this.now=null;this.changes=0;this.received=0;this.history=[];}
 feed(value,at){this.received++;if(value===null||value===this.now)return false;if(this.now!==null)this.changes++;this.now=value;this.history.unshift({value,at});this.history.length=Math.min(this.history.length,HISTORY);return true;}
}
class BcDiag {
 // o: { signals, log, changed: () => void (redraw), clock }
 constructor(o){this.signals=o.signals;this.log=o.log||{warn(){},info(){}};this.changed=o.changed||(()=>{});this.clock=o.clock||Date.now;
  this.stalk=new Track();this.subs=[];this.state={stalk:'off'};this.started=false;this.presses=0;this.down=false;}
 has(iface,fields){try{const c=this.signals.loadConfig(iface);return !!(c&&c.fields&&fields.some(f=>c.fields[f]));}catch(e){return false;}}
 /** Starts reading (the check screen opens it; then it stays on until the app stops). */
 start(){
  if(this.started)return;this.started=true;
  if(!this.has(LIGHT,STALK)){this.state.stalk='not_installed';this.changed();return;}
  const h={};STALK.forEach(f=>{h[f]=(v)=>{
   const r=v&&typeof v==='object'?v.operationColumnStalks:v,down=typeof r==='number'&&r!==255&&(r&BC_BIT)!==0;
   if(down&&!this.down)this.presses++;if(typeof r==='number')this.down=down;
   if(this.stalk.feed(stalkOf(v),this.clock()))this.changed();};});
  this.state.stalk='subscribing';
  Promise.resolve().then(()=>this.signals.watch(LIGHT,'1',h,this.log,{})).then((s)=>{this.subs.push(s);this.state.stalk=s&&s.error?'error':'reading';this.changed();},()=>{this.state.stalk='error';this.changed();});
  this.changed();
 }
 status(){return {state:Object.assign({},this.state),presses:this.presses,stalk:{now:this.stalk.now,changes:this.stalk.changes,received:this.stalk.received,history:this.stalk.history.slice()}};}
 stop(){this.subs.forEach(s=>{try{s.shutdown();}catch(e){}});this.subs=[];}
}
module.exports={BcDiag,stalkOf,LIGHT,STALK};
