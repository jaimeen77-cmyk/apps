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
// The driver's name: personalization.UserAccount (name / firstName getters, in the package from the kit template, all
// instances), asked on the instance the account reference names. Not yet seen on a car: without a name the
// driver's number shows, as before.
const ACCOUNT='de.bmw.infotainment.personalization.UserAccount',NAME_WAIT_MS=15000;
function nameOf(v){
 if(v&&typeof v==='object'&&!Array.isArray(v)){for(const k of ['value','name','firstName']){const r=nameOf(v[k]);if(r)return r;}return null;}
 if(typeof v!=='string')return null;
 const t=Array.from(v.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,20).join('');
 return t||null;
}
// bcIndex / bcCluster: the BC page in step now and what it asks of the cluster (the car's state, not a driver's)
const CAR_KEYS=['engineProfile','autoStart','driverProfiles','bcIndex','bcCluster'];
function idOf(v){
 if(typeof v==='string'||typeof v==='number')return String(v)||null;
 if(v&&typeof v==='object'){for(const k of ['value',FIELD,'id','reference']){const r=idOf(v[k]);if(r)return r;}}
 return null;
}
class DriverProfiles{
 // o: { settings, signals, log, fs, file, keys: () => [setting keys], changed: () => void }
 constructor(o){
  this.settings=o.settings;this.signals=o.signals;this.log=o.log||{warn(){},info(){}};this.fs=o.fs;this.file=o.file;this.keysOf=o.keys;this.changed=o.changed||(()=>{});this.greet=o.greet||null;this.active=o.active||null;this.greetFor=null;this.greetChange=false;
  this.profiles={};this.order=[];this.names={};this.nameSub=null;this.nameState=null;this.current=null;this.sub=null;this.state='off';this.error=null;this.applying=false;this.reads=0;
  try{const d=JSON.parse(this.fs.readFileSync(this.file,'utf8'));if(d&&typeof d==='object'){this.profiles=d.profiles||{};this.order=Array.isArray(d.order)?d.order:Object.keys(this.profiles);this.names=d.names&&typeof d.names==='object'?d.names:{};}}catch(e){}
  this.migrate();
  this.settings.onChange((k,v)=>{
   if(k==='driverProfiles'){this.sync();return;}
   if(this.applying||!this.on()||!this.current||this.keys().indexOf(k)<0)return;
   this.profiles[this.current]=Object.assign(this.profiles[this.current]||this.snapshot(),{[k]:v});this.save();
  });
  this.sync();
 }
 on(){return this.settings.get('driverProfiles')==='on';}
 // Keys added to the per-driver set later (1.3.15: the favourites, shared until then): every driver kept before
 // starts with the shared value they all had, then each keeps their own.
 migrate(){
  if(!Object.keys(this.profiles).length)return;
  let changed=false;const keys=this.keys();
  Object.keys(this.profiles).forEach(id=>{const p=this.profiles[id];if(!p||typeof p!=='object')return;
   keys.forEach(k=>{if(!(k in p)){const v=this.settings.get(k);if(v!==undefined){p[k]=v;changed=true;}}});});
  if(changed)this.save();
 }
 // Never throws: a broken key list means nothing is kept per driver, not an app that cannot start.
 keys(){let list=[];try{list=this.keysOf()||[];}catch(e){this.log.warn('driver profiles: '+e);}return list.filter(k=>CAR_KEYS.indexOf(k)<0);}
 snapshot(){const o={};this.keys().forEach(k=>{const v=this.settings.get(k);if(v!==undefined)o[k]=v;});return o;}
 save(){try{this.fs.writeFileSync(this.file,JSON.stringify({profiles:this.profiles,order:this.order,names:this.names}));}catch(e){this.log.warn('driver profiles: '+e);}}
 // Start or stop reading the current driver as the setting says.
 sync(){
  if(this.active)try{this.active(this.on());}catch(e){}
  if(!this.on()){if(this.sub){try{this.sub.shutdown();}catch(e){}this.sub=null;}this.dropName();this.current=null;this.state='off';this.changed();return;}
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
  this.greetChange=this.current!==null;this.current=id;if(this.order.indexOf(id)<0)this.order.push(id);
  // a driver recognised (at the start or a change): hello on the HUD, with their name once it is known
  this.greetFor=id;this.askName(id);if(this.names[id])this.hello(id);
  const saved=this.profiles[id];
  if(!saved){this.profiles[id]=this.snapshot();this.save();this.log.info('driver profile: first seen, current settings kept');this.changed();return;}
  const changes={};Object.keys(saved).forEach(k=>{if(this.keys().indexOf(k)>=0&&saved[k]!==undefined&&this.settings.get(k)!==saved[k])changes[k]=saved[k];});
  if(Object.keys(changes).length){this.applying=true;
   try{if(typeof this.settings.setMany==='function')this.settings.setMany(changes);else Object.keys(changes).forEach(k=>this.settings.set(k,changes[k]));}finally{this.applying=false;}}
  this.log.info('driver profile: their settings');this.changed();
 }
 // Hello once per recognised driver, with the name if known by now; change: another driver was in use before.
 hello(id){if(this.greetFor!==id)return;this.greetFor=null;if(this.greet)try{this.greet(this.names[id]||null,this.greetChange);}catch(e){}}
 // Ask the driver's name on their account instance; kept in driver-profiles.json, refreshed each time they come back.
 askName(id){
  this.dropName();this.nameState='reading';const token={};this.nameToken=token;
  const got=v=>{const n=nameOf(v);if(!n||this.nameToken!==token)return;this.nameState='ready';if(this.names[id]!==n){this.names[id]=n;this.save();}this.hello(id);this.changed();this.dropName(true);};
  Promise.resolve().then(()=>this.signals.watch(ACCOUNT,id,{name:got,firstName:got},this.log,{})).then(s=>{
   if(this.nameToken!==token){try{s.shutdown();}catch(e){}return;}
   this.nameSub=s;if(s&&s.error){this.nameState='unreadable';this.dropName(true);this.hello(id);this.changed();}
  },()=>{if(this.nameToken===token){this.nameState='unreadable';this.hello(id);this.changed();}});
  this.nameTimer=setTimeout(()=>{if(this.nameToken===token&&this.nameState==='reading'){this.nameState='unreadable';this.dropName(true);this.hello(id);this.changed();}},NAME_WAIT_MS);
  if(this.nameTimer&&this.nameTimer.unref)this.nameTimer.unref();
 }
 dropName(keepState){if(this.nameSub){try{this.nameSub.shutdown();}catch(e){}this.nameSub=null;}if(this.nameTimer){clearTimeout(this.nameTimer);this.nameTimer=null;}if(!keepState){this.nameToken=null;this.nameState=null;}}
 /** For the settings screen: { state, driver: 1-based number in the order first seen, or null, drivers, name }. */
 status(){return {state:this.state,driver:this.current?this.order.indexOf(this.current)+1:null,drivers:this.order.length,error:this.error,name:this.current&&this.names[this.current]||null,nameState:this.nameState};}
 stop(){if(this.sub){try{this.sub.shutdown();}catch(e){}this.sub=null;}this.dropName();}
}
module.exports={DriverProfiles,IFACE,FIELD,ACCOUNT,idOf,nameOf,CAR_KEYS};
