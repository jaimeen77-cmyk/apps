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
 constructor(o){this.signals=o.signals;this.manifest=o.manifest||null;this.scan=null;this.bcPresses=0;this.bcDown=false;this.log=o.log||{warn(){},info(){}};this.changed=o.changed||(()=>{});this.clock=o.clock||Date.now;
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
  if(this.has(LIGHT,STALK)){const h={};STALK.forEach(f=>{h[f]=(v)=>{const r=v&&typeof v==='object'?v.operationColumnStalks:v,down=typeof r==='number'&&r!==255&&(r&64)!==0;if(down&&!this.bcDown)this.bcPresses++;if(typeof r==='number')this.bcDown=down;if(this.stalk.feed(stalkOf(v),this.clock()))this.changed();};});watch('stalk',LIGHT,h);}else this.state.stalk='not_installed';
  this.changed();
 }
 status(){return {state:Object.assign({},this.state),kombi:{now:this.kombi.now,changes:this.kombi.changes,received:this.kombi.received,history:this.kombi.history.slice()},
  stalk:{now:this.stalk.now,changes:this.stalk.changes,received:this.stalk.received,history:this.stalk.history.slice()}};}
 stop(){this.subs.forEach(s=>{try{s.shutdown();}catch(e){}});this.subs=[];this.scanStop();}
 // The Kombi scan (1.3.44): every field and event of the cluster's interfaces added at install (traffic-config.js
 // scanKombi), read while the scan screen is open, each one's changes counted, so the one that follows the stock BC
 // page shows: its value comes back the same on each page, changing once per BC press.
 scanStart(){
  if(this.scan)return;const scan=this.scan={state:'starting',items:[],subs:[],base:this.bcPresses};
  const ifaces=kombiProxies(this.manifest?this.manifest():readManifest());
  if(!ifaces.length){scan.state='not_installed';this.changed();return;}
  scan.state='reading';const stalkAt=()=>this.bcPresses-scan.base;
  ifaces.forEach(({iface,instance,names})=>{
   const short=iface.replace(/^de\.bmw\.infotainment\./,''),handlers={};
   names.forEach(name=>{const item={name:short+'.'+name,now:null,changes:0,received:0,history:[],firstStalk:null};scan.items.push(item);
    handlers[name]=(v)=>{if(this.scan!==scan)return;item.received++;const t=flat(v);if(t===item.now)return;if(item.now!==null){item.changes++;if(item.firstStalk===null)item.firstStalk=stalkAt();}
     item.now=t;item.history.unshift(t);item.history.length=Math.min(item.history.length,4);this.changed();};});
   Promise.resolve().then(()=>this.signals.watch(iface,instance,handlers,this.log,{pollMs:2000})).then((s)=>{if(this.scan!==scan){try{s.shutdown();}catch(e){}return;}scan.subs.push(s);if(s&&s.error)scan.error=String(s.error).slice(0,80);this.changed();},(e)=>{scan.error=String(e&&e.message||e).slice(0,80);this.changed();});
  });
  this.changed();
 }
 scanStop(){const s=this.scan;if(!s)return;this.scan=null;s.subs.forEach(x=>{try{x.shutdown();}catch(e){}});}
 scanStatus(){const s=this.scan;if(!s)return null;
  // the ones that changed most first (the BC page's changes once per press), then the ones that sent anything
  const items=s.items.slice().sort((a,b)=>b.changes-a.changes||b.received-a.received||(a.name<b.name?-1:1));
  return {state:s.state,error:s.error||null,count:s.items.length,received:s.items.filter(i=>i.received).length,presses:this.bcPresses-s.base,items:items.map(i=>({name:i.name,now:i.now,changes:i.changes,received:i.received,history:i.history.slice()}))};}
}
// A value in one short line: plain values as they are, a struct as its fields (one level in), at most 90 characters.
function flat(v){
 const one=(x)=>x===null||x===undefined?'-':typeof x==='object'?(Array.isArray(x)?'['+x.length+']':'{'+Object.keys(x).length+'}'):String(x);
 if(v===null||typeof v!=='object')return one(v).slice(0,90);
 if(Array.isArray(v))return ('['+v.slice(0,6).map(one).join(',')+(v.length>6?',…':'')+']').slice(0,90);
 return Object.keys(v).map(k=>k.replace(/^status|^display/,'')+'='+one(v[k])).join(' ').slice(0,90);
}
function readManifest(){
 const path=require('path'),fs=require('fs');
 for(const f of [path.resolve(__dirname,'..','manifest.json'),path.resolve(__dirname,'..','..','manifest.json')]){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}}
 return null;
}
/** The cluster's interfaces in our manifest (a name with "Kombi"): [{ iface, instance, names }]. */
function kombiProxies(manifest){
 const proxies=manifest&&manifest.proxies||{};
 return Object.keys(proxies).filter(i=>/kombi/i.test(i)).sort().map(iface=>{const p=proxies[iface]||{};
  return {iface,instance:String(p.instances||'1').split(',')[0],names:Object.keys(p.attributes||{}).concat(Array.isArray(p.broadcasts)?p.broadcasts:[])};}).filter(x=>x.names.length);
}
module.exports={BcDiag,selection,stalkOf,flat,kombiProxies,KOMBI,LIGHT,SELECTION,STALK};
