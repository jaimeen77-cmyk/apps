'use strict';
// The BC button check (1.3.39): what the car sends when the steering column's BC button is pressed, shown on the
// Cluster tab (BC button check), to learn whether each stock BC page of the cluster comes back with the same value
// (then each page can get its own Redline cluster screen) or the value only counts presses. Read only, nothing sent:
//   KombiIF.statusKombiSelection   statusActivationInstrumentPackContent / ...BC: the cluster's own selection
//   Light.IndicatorSteeringColumn(Complete)   operationColumnStalks: the left stalk's switches (BC is on it)
// Both added at install where the car's catalog has them (traffic-config.js). The signals are those chyiz's
// idrive7-cluster-metrics reads for its BC button (GPL; facts only, no code taken).
const KOMBI='de.bmw.infotainment.KombiIF',SELECTION='statusKombiSelection',LIGHT='de.bmw.body.Light';
const STALK=['IndicatorSteeringColumn','IndicatorSteeringColumnComplete'],HISTORY=10;
const plain=(x)=>typeof x==='number'&&isFinite(x)||typeof x==='string'&&x.length>0&&x.length<40;
/** The selection as one text ('content:bc'), or null. */
function selection(v){
 if(!v||typeof v!=='object')return null;
 const c=v.statusActivationInstrumentPackContent,b=v.statusActivationInstrumentPackBC;
 if(!plain(c)&&!plain(b))return null;
 return (plain(c)?String(c):'-')+':'+(plain(b)?String(b):'-');
}
function stalkOf(v){const r=v&&typeof v==='object'?v.operationColumnStalks:v;return plain(r)?String(r):null;}
class Track {
 constructor(){this.now=null;this.changes=0;this.received=0;this.history=[];}
 feed(value,at){this.received++;if(value===null||value===this.now)return false;if(this.now!==null)this.changes++;this.now=value;this.history.unshift({value,at});this.history.length=Math.min(this.history.length,HISTORY);return true;}
}
class BcDiag {
 // o: { signals, log, changed: () => void (redraw), clock }
 constructor(o){this.signals=o.signals;this.log=o.log||{warn(){},info(){}};this.changed=o.changed||(()=>{});this.clock=o.clock||Date.now;
  this.kombi=new Track();this.stalk=new Track();this.subs=[];this.state={kombi:'off',stalk:'off'};this.started=false;}
 has(iface,fields){try{const c=this.signals.loadConfig(iface);return !!(c&&c.fields&&fields.some(f=>c.fields[f]));}catch(e){return false;}}
 /** Starts reading (the check screen opens it; then it stays on until the app stops). */
 start(){
  if(this.started)return;this.started=true;
  const watch=(key,iface,handlers,opts)=>{
   this.state[key]='subscribing';
   Promise.resolve().then(()=>this.signals.watch(iface,'1',handlers,this.log,opts||{})).then((s)=>{this.subs.push(s);this.state[key]=s&&s.error?'error':'reading';this.changed();},()=>{this.state[key]='error';this.changed();});
  };
  if(this.has(KOMBI,[SELECTION]))watch('kombi',KOMBI,{[SELECTION]:(v)=>{if(this.kombi.feed(selection(v),this.clock()))this.changed();}},{pollMs:1000});else this.state.kombi='not_installed';
  if(this.has(LIGHT,STALK)){const h={};STALK.forEach(f=>{h[f]=(v)=>{if(this.stalk.feed(stalkOf(v),this.clock()))this.changed();};});watch('stalk',LIGHT,h);}else this.state.stalk='not_installed';
  this.changed();
 }
 status(){return {state:Object.assign({},this.state),kombi:{now:this.kombi.now,changes:this.kombi.changes,received:this.kombi.received,history:this.kombi.history.slice()},
  stalk:{now:this.stalk.now,changes:this.stalk.changes,received:this.stalk.received,history:this.stalk.history.slice()}};}
 stop(){this.subs.forEach(s=>{try{s.shutdown();}catch(e){}});this.subs=[];}
}
module.exports={BcDiag,selection,stalkOf,KOMBI,LIGHT,SELECTION,STALK};
