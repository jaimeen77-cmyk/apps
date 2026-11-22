'use strict';
// Follow the BC button (1.3.40): each stock BC page of the cluster gets its own Redline cluster screen (its auxiliary
// values and its design), or Waze / the stock map (the Redline cluster steps aside), or no change, or is left out.
// The car does not say which BC page shows (the cluster's own selection, KombiIF.statusKombiSelection, only sends
// "no value" on this car: BC button check, 2026-11-22), so the pages are followed by counting the presses: the left
// stalk's switches (Light.IndicatorSteeringColumn) have bit 64 while BC is held, and each press moves to the next page
// in the cluster's own order (as the user photographed it). The page reached is kept, so the next drive starts there;
// "This page now" on the settings screen puts them back in step if the stock page was changed another way.
// A change made by hand on the Cluster tab stays until BC is pressed again. Positions and sizes stay the driver's own:
// only the design, its auxiliary values and the alert style change. The BC button's signal is the one chyiz's
// idrive7-cluster-metrics reads (GPL; facts only, no code taken).
const LIGHT='de.bmw.body.Light',STALK=['IndicatorSteeringColumn','IndicatorSteeringColumnComplete'],BC_BIT=64,DEBOUNCE_MS=220;
// The stock BC pages in the order a BC press goes through them (key, label)
const PAGES={
 ID7:[['none','No display'],['efficiency','Efficiency · consumption'],['trip','Trip data'],['torque','Torque · power'],['gmeter','G-meter'],['media','Current media']],
 ID8:[['compact','Reduced view'],['trip','Trip data'],['assist','Driver assistance view'],['preview','Route preview'],['map','Map'],['gmeter','G-meter'],['media','Media · radio'],['ar','Augmented reality view']]
};
const gauges=(items)=>JSON.stringify({mode:'gauges',items}),values=(items)=>JSON.stringify({mode:'values',items});
// The defaults the user asked for: on each page what the stock page does not show already
const TRIP={kind:'redline',design:'rl-tyres',aux:values(['outside','batteryVoltage','economy','avgSpeed'])};
const DEFAULT_PAGES={
 ID7:{none:{kind:'keep'},efficiency:{kind:'yield'},trip:TRIP,torque:{kind:'redline',aux:gauges(['gforce'])},gmeter:{kind:'redline',aux:gauges(['torque','power'])},media:{kind:'redline',aux:gauges(['clock'])}},
 ID8:{compact:{kind:'redline',aux:gauges(['clock'])},trip:TRIP,assist:{kind:'keep'},preview:{kind:'keep'},map:{kind:'keep'},gmeter:{kind:'redline'},media:{kind:'redline',aux:gauges(['clock'])},ar:{kind:'keep'}}
};
const KINDS=['redline','yield','keep','skip'];
const hmiOf=(get)=>get('bcHmi')==='ID8'?'ID8':'ID7';
function parse(text,fallback){try{const v=JSON.parse(text||'');return v&&typeof v==='object'?v:fallback;}catch(e){return fallback;}}
/** Every page's setup for a head unit: the saved one, else the default. */
function pagesOf(text,hmi){const saved=parse(text,{})[hmi]||{};const out={};PAGES[hmi].forEach(([k])=>{const s=saved[k];out[k]=s&&KINDS.includes(s.kind)?s:DEFAULT_PAGES[hmi][k]||{kind:'keep'};});return out;}
/** The pages a BC press goes through (those not left out), in the cluster's order. */
function cycleOf(text,hmi){const p=pagesOf(text,hmi);return PAGES[hmi].map(([k])=>k).filter(k=>p[k].kind!=='skip');}
class BcFollow {
 // o: { settings, signals, log, apply: (values) => void (sets the cluster's design, keeping each design's layout), changed, clock }
 constructor(o){
  this.settings=o.settings;this.signals=o.signals;this.log=o.log||{warn(){},info(){}};this.apply=o.apply;this.changed=o.changed||(()=>{});this.clock=o.clock||Date.now;
  this.sub=null;this.state='off';this.error=null;this.token=0;this.held=false;this.lastPress=-Infinity;this.presses=0;
  this.settings.onChange((k)=>{if(k==='bcFollow'||k==='bcHmi')this.sync(true);});
  this.sync(true);
 }
 get(k){return this.settings.get(k);}
 on(){return this.get('bcFollow')==='on';}
 // start or stop reading the stalk; first: apply the page in step now (the app's start, following switched on)
 sync(first){
  if(!this.on()){if(this.sub){this.token++;try{this.sub.shutdown();}catch(e){}this.sub=null;}this.state='off';if(this.get('bcCluster'))this.settings.set('bcCluster','');this.changed();return;}
  if(first){if(this.get('bcStart')==='first')this.settings.set('bcIndex',0);this.show();}
  if(this.sub||this.state==='subscribing'||this.state==='not_installed')return;
  let cfg=null;try{cfg=this.signals.loadConfig(LIGHT);}catch(e){}
  const fields=cfg&&cfg.fields?STALK.filter(f=>cfg.fields[f]):[];
  if(!fields.length){this.state='not_installed';this.changed();return;}
  const token=++this.token,h={};fields.forEach(f=>{h[f]=(v)=>{if(token===this.token)this.stalk(v);};});this.state='subscribing';
  Promise.resolve().then(()=>this.signals.watch(LIGHT,'1',h,this.log,{})).then((s)=>{
   if(token!==this.token){try{s.shutdown();}catch(e){}return;}
   this.sub=s;this.error=s&&s.error?String(s.error):null;this.state=this.error?'error':'reading';this.changed();
  },(e)=>{if(token===this.token){this.error=String(e&&e.message||e).slice(0,120);this.state='error';this.changed();}});
 }
 /** The stalk's switches: BC (bit 64) pressed = one step, once per press. */
 stalk(v){
  const r=v&&typeof v==='object'?v.operationColumnStalks:v;if(typeof r!=='number'||!isFinite(r)||r===255)return;
  const down=(r&BC_BIT)!==0,now=this.clock();
  if(down&&!this.held&&now-this.lastPress>=DEBOUNCE_MS){this.lastPress=now;this.press();}
  this.held=down;
 }
 press(){
  if(!this.on())return;const cycle=cycleOf(this.get('bcPages'),hmiOf(k=>this.get(k)));if(!cycle.length)return;
  const i=Math.max(0,Math.min(cycle.length-1,Number(this.get('bcIndex'))||0));this.presses++;
  this.settings.set('bcIndex',(i+1)%cycle.length);this.show();this.changed();
 }
 /** Put the pages back in step: the stock BC shows page (key) now. */
 here(page){const cycle=cycleOf(this.get('bcPages'),hmiOf(k=>this.get(k))),i=cycle.indexOf(page);if(i<0)return;this.settings.set('bcIndex',i);this.show();this.changed();}
 /** The page in step now (key), or null. */
 current(){const cycle=cycleOf(this.get('bcPages'),hmiOf(k=>this.get(k)));if(!cycle.length)return null;return cycle[Math.max(0,Math.min(cycle.length-1,Number(this.get('bcIndex'))||0))];}
 // the page's screen: the cluster's design / auxiliary values, or Waze / the stock map, or nothing changed
 show(){
  const hmi=hmiOf(k=>this.get(k)),page=this.current(),setup=page?pagesOf(this.get('bcPages'),hmi)[page]:{kind:'keep'};
  const cluster=!this.on()?'':setup.kind==='yield'?'yield':setup.kind==='redline'?'redline':'';
  if((this.get('bcCluster')||'')!==cluster)this.settings.set('bcCluster',cluster);
  if(!this.on()||setup.kind!=='redline')return;
  const v={};if(setup.design)v.clusterDesign=setup.design;if(setup.aux)v.clusterAuxConfig=setup.aux;if(setup.alert)v.clusterAlertStyle=setup.alert;
  if(Object.keys(v).length)try{this.apply(v);}catch(e){this.log.warn('bc follow: '+e);}
 }
 status(){return {state:this.state,error:this.error,presses:this.presses,page:this.current()};}
 stop(){this.token++;if(this.sub)try{this.sub.shutdown();}catch(e){}this.sub=null;}
}
module.exports={BcFollow,PAGES,DEFAULT_PAGES,KINDS,pagesOf,cycleOf,parse,LIGHT,BC_BIT};
