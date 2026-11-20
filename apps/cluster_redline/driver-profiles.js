'use strict';
// Settings per driver: the head unit's current user account (personalization.SessionManager
// .currentUserAccountReference, a getter, read every 5 s, as Cluster Info in appscluster_fork does) picks whose
// settings are in use. Each driver keeps the favourite-style whole setup (settings-ui favKeys, without what belongs
// to the car: vehicle preset, auto-start) in driver-profiles.json in the app's data folder:
//   - a change is kept for the driver at the time;
//   - a driver seen again gets theirs back (one write, only the keys that differ);
//   - a driver seen for the first time keeps what is set now.
// Off (the default) reads nothing. Read-only towards the car; subscribed directly (not through the worker's demand
// set), only while on.
const IFACE='de.bmw.infotainment.personalization.SessionManager',FIELD='currentUserAccountReference';
const CAR_KEYS=['engineProfile','autoStart','driverProfiles'];
function idOf(v){
 if(typeof v==='string'||typeof v==='number')return String(v)||null;
 if(v&&typeof v==='object'){for(const k of ['value',FIELD,'id','reference']){const r=idOf(v[k]);if(r)return r;}}
 return null;
}
class DriverProfiles{
 // o: { settings, signals, log, fs, file, keys: () => [setting keys], changed: () => void }
 constructor(o){
  this.settings=o.settings;this.signals=o.signals;this.log=o.log||{warn(){},info(){}};this.fs=o.fs;this.file=o.file;this.keysOf=o.keys;this.changed=o.changed||(()=>{});
  this.profiles={};this.order=[];this.current=null;this.sub=null;this.state='off';this.error=null;this.applying=false;this.reads=0;
  try{const d=JSON.parse(this.fs.readFileSync(this.file,'utf8'));if(d&&typeof d==='object'){this.profiles=d.profiles||{};this.order=Array.isArray(d.order)?d.order:Object.keys(this.profiles);}}catch(e){}
  this.settings.onChange((k,v)=>{
   if(k==='driverProfiles'){this.sync();return;}
   if(this.applying||!this.on()||!this.current||this.keys().indexOf(k)<0)return;
   this.profiles[this.current]=Object.assign(this.profiles[this.current]||this.snapshot(),{[k]:v});this.save();
  });
  this.sync();
 }
 on(){return this.settings.get('driverProfiles')==='on';}
 keys(){return this.keysOf().filter(k=>CAR_KEYS.indexOf(k)<0);}
 snapshot(){const o={};this.keys().forEach(k=>{const v=this.settings.get(k);if(v!==undefined)o[k]=v;});return o;}
 save(){try{this.fs.writeFileSync(this.file,JSON.stringify({profiles:this.profiles,order:this.order}));}catch(e){this.log.warn('driver profiles: '+e);}}
 // Start or stop reading the current driver as the setting says.
 sync(){
  if(!this.on()){if(this.sub){try{this.sub.shutdown();}catch(e){}this.sub=null;}this.current=null;this.state='off';this.changed();return;}
  if(this.sub||this.state==='subscribing')return;
  if(!this.signals||typeof this.signals.watch!=='function'||(typeof this.signals.hasNative==='function'&&!this.signals.hasNative())){this.state='unavailable';this.changed();return;}
  this.state='subscribing';
  Promise.resolve().then(()=>this.signals.watch(IFACE,IFACE,{[FIELD]:v=>this.sample(v)},this.log,{pollMs:5000})).then(s=>{
   if(!this.on()){try{s.shutdown();}catch(e){}this.state='off';return;}
   this.sub=s;this.error=s&&s.error?String(s.error):null;this.state=this.error?'error':'waiting';this.changed();
  },e=>{this.error=String(e&&e.message||e);this.state='error';this.changed();});
 }
 sample(v){
  this.reads++;const id=idOf(v);if(!id||!this.on())return;
  this.state='ready';if(id===this.current)return;
  this.current=id;if(this.order.indexOf(id)<0)this.order.push(id);
  const saved=this.profiles[id];
  if(!saved){this.profiles[id]=this.snapshot();this.save();this.log.info('driver profile: first seen, current settings kept');this.changed();return;}
  const changes={};Object.keys(saved).forEach(k=>{if(this.keys().indexOf(k)>=0&&saved[k]!==undefined&&this.settings.get(k)!==saved[k])changes[k]=saved[k];});
  if(Object.keys(changes).length){this.applying=true;
   try{if(typeof this.settings.setMany==='function')this.settings.setMany(changes);else Object.keys(changes).forEach(k=>this.settings.set(k,changes[k]));}finally{this.applying=false;}}
  this.log.info('driver profile: their settings');this.changed();
 }
 /** For the settings screen: { state, driver: 1-based number in the order first seen, or null, drivers }. */
 status(){return {state:this.state,driver:this.current?this.order.indexOf(this.current)+1:null,drivers:this.order.length,error:this.error};}
 stop(){if(this.sub){try{this.sub.shutdown();}catch(e){}this.sub=null;}}
}
module.exports={DriverProfiles,IFACE,FIELD,idOf,CAR_KEYS};
