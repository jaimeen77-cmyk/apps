'use strict';
// Follow the BC button (1.3.40): each stock BC page of the cluster gets its own Redline cluster screen (its auxiliary
// values and its design), or Waze / the stock map (the Redline cluster steps aside), or no change, or is left out.
// The car does not say which BC page shows (the cluster's own selection, KombiIF.statusKombiSelection, only sends
// "no value" on this car: BC button check, 2026-11-22), so the pages are followed by counting the presses: the left
// stalk's switches (Light.IndicatorSteeringColumn) have bit 64 while BC is held, and each press moves to the next page
// in the cluster's own order (as the user photographed it). The page reached is kept, so the next drive starts there;
// "This page now" on the settings screen puts them back in step if the stock page was changed another way.
// A change made by hand on the Cluster tab stays until BC is pressed again. A page set up on the settings screen keeps
// its positions and sizes too (1.3.41); the defaults change only the design, its auxiliary values and the alert style. The BC button's signal is the one chyiz's
// idrive7-cluster-metrics reads (GPL; facts only, no code taken).
const LIGHT='de.bmw.body.Light',STALK=['IndicatorSteeringColumn','IndicatorSteeringColumnComplete'],BC_BIT=64,DEBOUNCE_MS=220;
// The stock BC pages in the order a BC press goes through them (key, label)
const PAGES={
 ID7:[['none','No display'],['efficiency','Efficiency · consumption'],['trip','Trip data'],['torque','Torque · power'],['gmeter','G-meter'],['media','Current media']],
 ID8:[['compact','Reduced view'],['trip','Trip data'],['assist','Driver assistance view'],['preview','Route preview'],['map','Map'],['gmeter','G-meter'],['media','Media · radio'],['ar','Augmented reality view']]
};
const gauges=(items)=>JSON.stringify({mode:'gauges',items}),values=(items)=>JSON.stringify({mode:'values',items});
// The defaults (1.3.48, the user's list): a design, its alert style for the 'Jam' designs (the default design's top
// alert bar / circle beside the gear), its auxiliary values
const S={
 needle:{kind:'redline',design:'rl-needle',aux:values(['avgSpeed','outside'])},
 trip:{kind:'redline',design:'rl-tyres',aux:values(['outside','batteryVoltage','avgSpeed','economy'])},
 tripHud:{kind:'redline',design:'own',alert:'bar',aux:values(['outside','batteryVoltage','avgSpeed','economy'])},   // no Tyres & trip on the HUD
 rings:{kind:'redline',design:'rl-rings',aux:gauges(['boost','oil'])},
 jamPower:{kind:'redline',design:'own',alert:'bar',aux:gauges(['power','torque'])},
 clock:{kind:'redline',design:'own',alert:'bar',aux:gauges(['clock'])},
 keep:{kind:'keep'},yield:{kind:'yield'}
};
const DEFAULT_PAGES={
 cluster:{
  ID7:{none:S.yield,efficiency:S.needle,trip:S.trip,torque:S.rings,gmeter:S.jamPower,media:S.clock},
  ID8:{compact:S.needle,trip:S.trip,assist:S.keep,preview:S.keep,map:S.yield,gmeter:S.jamPower,media:S.clock,ar:S.keep}},
 hud:{
  ID7:{none:S.keep,efficiency:S.needle,trip:S.tripHud,torque:S.rings,gmeter:S.jamPower,media:S.clock},
  ID8:{compact:S.needle,trip:S.tripHud,assist:S.keep,preview:S.keep,map:S.keep,gmeter:S.jamPower,media:S.clock,ar:S.keep}}
};
// Waze / the stock map: the cluster only. Left out (skip, until 1.3.47) is gone: the stock cluster still shows such a
// page, so leaving it out put the count out of step; a saved one counts as No change.
const KINDS={cluster:['redline','yield','keep'],hud:['redline','keep']};
const DISPLAYS=['cluster','hud'],PAGES_KEY={cluster:'bcPages',hud:'bcHudPages'},NAME={cluster:'Cluster',hud:'Hud'};
const hmiOf=(get)=>get('bcHmi')==='ID8'?'ID8':'ID7';
// BC mode (1.3.42 the cluster, 1.3.48 the HUD): chosen in the tab's RPM rows (Sport mode / All modes: BC mode). The
// worker says each frame which displays are in BC mode in the drive mode now (setNow({cluster, hud})); the presses are
// counted whenever the app runs, and a page's screen is applied to a display only while it is in BC mode.
const shared={now:{cluster:false,hud:false},listeners:[]};
function setNow(on){const next=typeof on==='object'&&on?{cluster:!!on.cluster,hud:!!on.hud}:{cluster:!!on,hud:false};
 const changed=DISPLAYS.filter(d=>next[d]!==shared.now[d]);if(!changed.length)return;shared.now=next;
 shared.listeners.slice().forEach(f=>{try{f(changed.filter(d=>next[d]));}catch(e){}});}
const bcOf=(get,d)=>get('sport'+NAME[d]+'Output')==='bc'||get('all'+NAME[d]+'Output')==='bc';
const anyBc=(get)=>DISPLAYS.some(d=>bcOf(get,d));
function parse(text,fallback){try{const v=JSON.parse(text||'');return v&&typeof v==='object'?v:fallback;}catch(e){return fallback;}}
/** Every page's setup for a head unit and a display ('cluster' when not given): the saved one, else the default. */
function pagesOf(text,hmi,display){const d=display==='hud'?'hud':'cluster',saved=parse(text,{})[hmi]||{};const out={};PAGES[hmi].forEach(([k])=>{const s=saved[k];
 out[k]=s&&s.kind==='skip'?S.keep:s&&KINDS[d].includes(s.kind)?s:DEFAULT_PAGES[d][hmi][k]||S.keep;});return out;}
/** The pages a BC press goes through, in the cluster's order (every page since 1.3.48). */
function cycleOf(text,hmi){return PAGES[hmi].map(([k])=>k);}
class BcFollow {
 // o: { settings, signals, log, apply: (values) => void (sets the cluster's design, keeping each design's layout), changed, clock }
 constructor(o){
  this.settings=o.settings;this.signals=o.signals;this.log=o.log||{warn(){},info(){}};this.apply=o.apply;this.changed=o.changed||(()=>{});this.clock=o.clock||Date.now;
  this.sub=null;this.state='off';this.error=null;this.token=0;this.held=false;this.lastPress=-Infinity;this.presses=0;
  this.settings.onChange((k)=>{if(/^(sport|all)(Cluster|Hud)Output$/.test(k)||k==='bcHmi')this.sync(true);});
  this.onNow=(ds)=>{if(ds&&ds.length)this.show();};shared.listeners.push(this.onNow);
  if(this.get('bcStart')==='first')this.settings.set('bcIndex',0);
  this.sync(true);
 }
 get(k){return this.settings.get(k);}
 on(){return anyBc((k)=>this.get(k));}
 bcOn(d){return bcOf((k)=>this.get(k),d);}
 // start or stop reading the stalk; first: apply the page in step now (the app's start, following switched on)
 sync(first){
  // the presses are counted whenever the app runs (1.3.45), BC mode or not: a page changed while no row was in BC
  // mode would otherwise put the count out of step once BC mode is chosen; only the screens wait for BC mode
  if(!this.bcOn('cluster')&&this.get('bcCluster'))this.settings.set('bcCluster','');
  if(!this.on())this.changed();
  else if(first)this.show();
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
  const cycle=cycleOf(this.get('bcPages'),hmiOf(k=>this.get(k)));if(!cycle.length)return;
  const i=Math.max(0,Math.min(cycle.length-1,Number(this.get('bcIndex'))||0));this.presses++;
  this.settings.set('bcIndex',(i+1)%cycle.length);this.show();this.changed();
 }
 /** Put the pages back in step: the stock BC shows page (key) now. */
 here(page){const cycle=cycleOf(this.get('bcPages'),hmiOf(k=>this.get(k))),i=cycle.indexOf(page);if(i<0)return;this.settings.set('bcIndex',i);this.show();this.changed();}
 /** The page in step now (key), or null. */
 current(){const cycle=cycleOf(this.get('bcPages'),hmiOf(k=>this.get(k)));if(!cycle.length)return null;return cycle[Math.max(0,Math.min(cycle.length-1,Number(this.get('bcIndex'))||0))];}
 // the page's screen on each display in BC mode now: its design / auxiliary values / alert style / positions, or (the
 // cluster) Waze / the stock map, or nothing changed
 show(){
  const hmi=hmiOf(k=>this.get(k)),page=this.current();
  const cs=page&&this.bcOn('cluster')?pagesOf(this.get('bcPages'),hmi,'cluster')[page]:S.keep,cluster=!this.bcOn('cluster')?'':cs.kind==='yield'?'yield':cs.kind==='redline'?'redline':'';
  if((this.get('bcCluster')||'')!==cluster)this.settings.set('bcCluster',cluster);
  if(!page)return;
  DISPLAYS.forEach(d=>{
   if(!this.bcOn(d)||!shared.now[d])return;const setup=pagesOf(this.get(PAGES_KEY[d]),hmi,d)[page];if(setup.kind!=='redline')return;
   const v={};if(setup.design)v[d+'Design']=setup.design;if(setup.aux)v[d+'AuxConfig']=setup.aux;if(setup.alert)v[d+'AlertStyle']=setup.alert;
   // a page set up with its own positions and sizes (1.3.41): those too, after the design's own layout
   if(setup.layout&&typeof setup.layout==='object')Object.keys(setup.layout).forEach(k=>{if(k.indexOf(d)===0&&/(OffsetX|OffsetY|WidthScale|HeightScale|Hidden)$/.test(k))v[k]=setup.layout[k];});
   if(Object.keys(v).length)try{this.apply(v,d);}catch(e){this.log.warn('bc follow: '+e);}
  });
 }
 status(){return {state:this.state,error:this.error,presses:this.presses,page:this.current()};}
 stop(){this.token++;if(this.sub)try{this.sub.shutdown();}catch(e){}this.sub=null;const i=shared.listeners.indexOf(this.onNow);if(i>=0)shared.listeners.splice(i,1);}
}
module.exports={setNow,anyBc,bcOf,BcFollow,PAGES,DEFAULT_PAGES,KINDS,PAGES_KEY,DISPLAYS,pagesOf,cycleOf,parse,LIGHT,BC_BIT};
