'use strict';
const {t}=require('./kit/i18n'),G=require('./kit/gauges'),{header}=require('./settings-chrome');
require('./crisp-text');
const {tr}=require('./strings');
const {settings:effective,PROFILES,DEFAULTS}=require('./policy');
const D=require('./display-config'),RL=require('./redline-hud'),HUD=require('./hud-draw'),CLUSTER=require('./draw'),NAV=require('./nav-draw');
const {measurePart}=require('./component-canvas'),{placement}=require('./layout'),NAV_TEXT=require('./nav-text');
const W=1600,H=520,TABS=['Basic settings','HUD display setting','CLUSTER display setting','NAV display setting','Favorites'],FAV_TAB=4,FAV_COUNT=5,FAV_GAP=1500,FAV_ARM=4000;
// 1.3.48: Basic is App operation, Settings per driver and two menus (HUD lamps, Vehicle preset); the HUD and Cluster
// tabs are their RPM rows (BC mode on both), Design (then its auxiliary values), Position / size and BC mode screens;
// the Navigation tab has no Vehicle alerts row (always on, placed in its Position / size)
const GROUPS=[['appEnabled','driverProfiles','hudLamps','vehiclePreset'],['sportHudOutput','allHudOutput','design','layout','bcFollow'],['sportClusterOutput','allClusterOutput','design','layout','bcFollow'],['navDisplayMode','navColor','clusterYieldGuidance','layout']];
// menus inside a tab: their rows, opened from the row of the same key, Back to it
const SUBMENUS={hudLamps:['hudHeadway','hudLaneLines','turn','hudDoorAlert'],vehiclePreset:['engineProfile','powerUnit','torqueUnit','shiftRpm','comfortShiftRpm']};
const SUBMENU_ITEMS={hudLamps:{key:'hudLamps',label:'HUD lamps',type:'action'},vehiclePreset:{key:'vehiclePreset',label:'Vehicle preset',type:'action'}};
const RENDERER_NOTICE='Install Cluster renderer (cluster-render) from MGU Store first.';
const MAP_WARNING='Set Central display area to Map view or Off. Assist or route preview may cover the widget.';
const HUD_WARNING='HUD navigation shows received turn guidance; unavailable data preserves stock guidance.';
// Keys saved, loaded and reset by the position/size presets of each tab.
const RL_KEYS=Object.keys(DEFAULTS).filter(k=>/^(hud|cluster)Rl/.test(k)),defaultOf=(schema,k)=>{const d=schema.find(s=>s.key===k);return d&&d.default!==undefined?d.default:DEFAULTS[k];};
// A favourite is the whole setup: every setting except running / preview state and the saved slots
// themselves, plus the values kept outside app.json (designs, Redline layout elements, per-design positions).
// HUD turn signals: kept outside app.json, like the designs.
const TURN_KEYS=Object.keys(D.defaults).filter(k=>/^hudTurn/.test(k));
const TURN_ITEM={key:'turn',label:'Turn signals on HUD',type:'action'};
// Settings per driver (driver-profiles.js): kept outside app.json; main.js sets page.driverStatus.
const DOOR_ITEM={key:'hudDoorAlert',label:'Door-open warning',type:'action'};
const DOOR_KEYS=Object.keys(D.defaults).filter(k=>/^hudDoor/.test(k));
// a screen of its own (1.3.34): settings per driver, the greeting and the goodbye, each on / off
const DRIVER_ITEM={key:'driverProfiles',label:'Settings per driver',type:'action'};
// Vehicle alerts (vehicle-alerts.js): kept outside app.json, like the turn signals.
const ALERT_KEYS=Object.keys(D.defaults).filter(k=>/^hudCarAlert/.test(k));
const ALERT_ITEM={key:'hudCarAlerts',label:'Vehicle alerts',type:'choice',options:[['off',tr('Off')],['speed',tr('Speeding')],['school',tr('School zone')],['camera',tr('Speed camera')],['all',tr('Show all')]]};
// Screens whose buttons are the cursor's stops (layoutActions).
// One received turn on the Received turns screen (nav-probe.js list()): time, source, kind, its raw values, distance,
// description, and what the HUD drew.
const NAVLOG_KIND={intersection:'Intersection',branch:'Junction',roundabout:'Roundabout',alongMainRoad:'Along the main road',laneChange:'Lane change',destinationManeuver:'Destination'};
const NAVLOG_DRAWN={highway:'Highway picture',branch:'Junction picture',roundabout:'Roundabout picture',road:'Road picture',arrow:'Arrow',none:'Not shown'};
const NAVLOG_SOURCE={dart:'Guidance',route:'Route list',hud:'Stock HUD'};
const NAVLOG_PROVIDER={CAR_PLAY:'CarPlay',ANDROID_AUTO:'AA',NONE:'BMW','':'-'};
function navLogLine(e){
 const kind=NAVLOG_KIND[e.kind]?tr(NAVLOG_KIND[e.kind])+' ('+e.kind+')':e.kind;
 return [e.time,(NAVLOG_PROVIDER[e.provider]||e.provider)+' '+tr(NAVLOG_SOURCE[e.source]||e.source),kind,(e.fields||[]).join(' '),e.dist,e.text?'"'+e.text+'"':'']
  .filter(Boolean).join(' · ')+' → '+tr(NAVLOG_DRAWN[e.drawn]||e.drawn)+(e.count>1?' ×'+e.count:'');
}
// The design picker (1.3.48): the default design's two alert styles first, as Redline layouts ('Jam' layouts), then
// the Redline app layouts; a design chosen, then its auxiliary values (or none)
const JAM={'jam-bar':'Jam top alert bar','jam-circle':'Jam circle alert'};
function designList(display){return Object.keys(JAM).concat(RL.stylesFor(display));}
function designNow(cfg,display){return RL.active(cfg,display)?RL.style(cfg,display):cfg[display+'AlertStyle']==='circle'?'jam-circle':'jam-bar';}
const ACTION_SCREENS=['layout','layoutPresets','turn','navColor','door','driver','navMode','navLog','headway','bcCheck','bc','myPic','laneLines'];
// The BC button check (bc-diag.js, 1.3.39): what the car sends when BC is pressed; main.js sets page.bcDiag
const BCCHECK_ITEM={key:'bcCheck',label:'BC button check',type:'action'};
// Following the BC button (bc-follow.js, 1.3.40): its own screen; main.js sets page.bcFollow
const BCFOLLOW_ITEM={key:'bcFollow',label:'BC mode screens',type:'action'};
const BC=require('./bc-follow');
// The HUD headway badge (1.3.37): a screen of its own; its settings kept outside app.json
const HEADWAY_ITEM={key:'hudHeadway',label:'Lead-car headway',type:'action'};
const LANE_ITEM={key:'hudLaneLines',label:'Lane lines',type:'action'};
const HEADWAY_KEYS=Object.keys(D.defaults).filter(k=>/^hudHeadway/.test(k));
const NAV_COLOR_LABELS={orange:'Orange',green:'Green',blue:'Blue',white:'White'};
const TURN_STYLE_LABELS={arrow:'Default arrow',chevron3:'<<<  >>>',chevron:'<  >'},TURN_COLOR_LABELS={green:'Green',blue:'Blue',orange:'Orange'};
const FAV_EXTRA=['clockZone','hudDesign','clusterDesign','comfortShiftRpm','clusterYieldGuidance','hudRlLayouts','clusterRlLayouts','navTextColor','hudNavThen','bcHmi','bcPages','bcHudPages','bcStart'].concat(DOOR_KEYS,HEADWAY_KEYS).concat(TURN_KEYS,ALERT_KEYS);
function favKeys(schema){const skip=k=>k==='appEnabled'||k==='layoutPreview'||/LayoutSlot\d|^favorite\d|^_/.test(k);return schema.map(s=>s.key).concat(FAV_EXTRA,Object.keys(DEFAULTS).filter(k=>/^(hud|cluster)Rl/.test(k))).filter((k,i,a)=>!skip(k)&&a.indexOf(k)===i);}
// Settings per driver (driver-profiles.js): the whole setup a favourite keeps, plus the favourites themselves, so each
// driver has their own five favourites.
// (1.3.16: the Position / size save slots of the HUD, cluster and NAV tabs too.)
function driverKeys(schema){const own=[];for(let n=1;n<=FAV_COUNT;n++)own.push('favorite'+n);['hud','cluster','nav'].forEach(d=>{for(let i=1;i<=3;i++)own.push(d+'LayoutSlot'+i);});return favKeys(schema).concat(own);}
const SLOT_COUNT=3,FACE_KEY=/^(hud|cluster)(RlNav|RlClock|RlSpeed|RpmGauge|Gear|Alert|AuxLeft|AuxRight|RpmValue|Mark|MarkTop|MarkBottom|Aux|RlCar|RlCarPic|RlGear|RlMode|RlAlert|RlRpm|RlGauge|RlGMeter|RlTemp|RlRead|RlReadA|RlReadB|RlReadC|RlReadD|RlMark)(OffsetX|OffsetY|WidthScale|HeightScale|Hidden|LineHidden)$/;
const NAV_KEYS=['hudNavOffsetX','hudNavOffsetY','navUniformScale','hudNavWidthScale','hudNavHeightScale','hudTextOffsetX','hudTextOffsetY','hudTextScale','hudLanesOffsetX','hudLanesOffsetY','hudLanesScale','hudThenOffsetX','hudThenOffsetY','hudThenScale','hudThenHidden','hudNavHidden','hudTextHidden','hudLanesHidden'];
function layoutKeys(tab,schema){
 const name=tab===3?'nav':tab===2?'cluster':'hud',known=new Set(schema.map(s=>s.key));
 const keys=name==='nav'?NAV_KEYS.concat(ALERT_KEYS.filter(k=>k!=='hudCarAlerts')):Object.keys(DEFAULTS).filter(k=>{const m=FACE_KEY.exec(k);return m&&m[1]===name;}).concat([name+'OffsetX',name+'OffsetY',name+'WidthScale',name+'HeightScale'],name==='hud'?['hudAuxTextOffsetY']:[]);
 // Redline layout elements are kept outside the schema (like hudDesign).
 return keys.filter((k,i,a)=>(known.has(k)||/^(hud|cluster)Rl/.test(k)||/^hudCarAlert/.test(k))&&a.indexOf(k)===i);
}
// Comfort / Eco shift alert RPM: kept outside app.json (like clockZone) so the Store templates stay valid.
// The two shift alert rows are named for the modes they apply to (Shift alert RPM keeps its app.json key).
const ROW_LABELS={engineProfile:'Vehicle type',shiftRpm:'Shift alert RPM · Sport',comfortShiftRpm:'Shift alert RPM · Comfort / Eco'};
const YIELD_ITEM={key:'clusterYieldGuidance',label:'Cluster · yield to navigation',type:'choice',options:[['off',tr('Do not yield')],['phone',tr('Yield during Waze guidance · all modes')],['nosport',tr('Yield during Waze guidance · except Sport')]]};
const COMFORT_ITEM={key:'comfortShiftRpm',label:'Shift alert RPM · Comfort / Eco',type:'choice',options:[[0,tr('Automatic (90 % of Sport)')]].concat([2000,2250,2500,2750,3000,3250,3500,4000,4500,5000].map(v=>[v,v+' rpm']))};
function options(item,cfg){
 if(!item)return [];
 if(item.type==='bool')return [[false,'Off'],[true,'On']];
 // BC mode (1.3.42): one more choice on the cluster's RPM rows (the value outside app.json's list, as the host keeps it)
 if(item.type==='choice')return /(Cluster|Hud)Output$/.test(item.key)?(item.options||[]).concat([['bc',tr('BC mode')]]):item.options||[];
 const range=PROFILES[cfg.engineProfile]&&PROFILES[cfg.engineProfile].ranges[item.key];
 return (item.steps||[]).filter(v=>!range||!v||v>=range[0]&&v<=range[1]).map(v=>[v,v===0?'Preset default':String(v)+' '+(item.unit||'')]);
}
// On the car (a recorded frame) a design preview is recorded once as a layer the renderer keeps, and only
// drawn again when what it shows changes; the settings screen repaints twice a second and on every press.
// draw(c,x,y) paints at x, y; key covers everything it depends on. Other canvases draw it directly.
function cached(cv,key,x,y,w,h,draw){
 if(typeof cv.words!=='function'||typeof cv.blit!=='function'||typeof G.layer!=='function'){draw(cv,x,y);return;}
 const L=G.layer('redline-preview|'+key,Math.ceil(w),Math.ceil(h),r=>draw(r,0,0),cv.textScale||1);cv.blit(L,x,y);
}
function vector(cv,x,y,s){
 return {art:(n,a,b,w,h,o)=>require('./hud-art').paint(cv,n,x+a*s,y+b*s,w*s,h*s,o),text:(v,a,b,z,c,o)=>cv.text(v,x+a*s,y+b*s,z*s,c,o),textWidth:(v,z,o)=>cv.textWidth(v,z*s,o)/s,
  line:(a,b,c,d,w,k)=>cv.line(x+a*s,y+b*s,x+c*s,y+d*s,w*s,k),polyline:(p,w,c)=>cv.polyline(p.map(v=>[x+v[0]*s,y+v[1]*s]),w*s,c),
  quad:(p,c)=>cv.quad(p.map(v=>[x+v[0]*s,y+v[1]*s]),c),arc:(a,b,r0,r1,f,l,c)=>cv.arc(x+a*s,y+b*s,r0*s,r1*s,f,l,c),
  fillRect:(a,b,w,h,c)=>cv.fillRect(x+a*s,y+b*s,w*s,h*s,c),roundRect:(a,b,w,h,r,c)=>cv.roundRect(x+a*s,y+b*s,w*s,h*s,r*s,c),
  // an image as rectangles: each run of same-colour pixels in a row is one rectangle, not one per pixel
  blit:(im,a,b)=>{const D=new Uint32Array(im.d.buffer,im.d.byteOffset,im.d.length>>2);for(let row=0;row<im.h;row++){let col=0;while(col<im.w){const v=D[row*im.w+col];let end=col+1;while(end<im.w&&D[row*im.w+end]===v)end++;
   if(v>>>24){const p=(row*im.w+col)*4;cv.fillRect(x+(a+col)*s,y+(b+row)*s,(end-col)*s,s,[im.d[p],im.d[p+1],im.d[p+2],im.d[p+3]]);}col=end;}}}};
}
class SettingsPage{
 constructor(settings,changed,version){this.settings=settings;this.changed=changed||(()=>{});this.version=version;this.tab=0;this.focus=0;this.open=null;this.choice=0;this.layoutPart=0;this.layoutParam=0;this.draft=null;this.layoutActions=[];this.layoutSelected=new Set();}
 config(){const raw={};this.settings.schema.forEach(s=>{raw[s.key]=this.settings.get(s.key);});['clockZone','layoutPreview','hudDesign','clusterDesign','comfortShiftRpm','clusterYieldGuidance','navTextColor','greetHello','greetBye','hudNavThen','myPicIds','navProbeLog','calmTone','hudLaneLines','navArrowStyle','bcFollow','bcHmi','bcPages','bcHudPages','bcStart','bcIndex','bcCluster'].concat(RL_KEYS,TURN_KEYS,ALERT_KEYS,DOOR_KEYS,HEADWAY_KEYS).forEach(k=>{if(raw[k]===undefined)raw[k]=this.settings.get(k);});return effective(raw);}
 display(){return this.tab===2?'cluster':'hud';}
 keys(){return this.tab===FAV_TAB?[]:this.sub&&SUBMENUS[this.sub]?SUBMENUS[this.sub]:GROUPS[this.tab];}
 item(){return this.itemOf(this.keys()[this.focus]);}
 itemOf(key){if(SUBMENU_ITEMS[key])return SUBMENU_ITEMS[key];if(key==='turn')return TURN_ITEM;if(key==='hudHeadway')return HEADWAY_ITEM;if(key==='hudLaneLines')return LANE_ITEM;if(key==='bcCheck')return BCCHECK_ITEM;if(key==='bcFollow')return BCFOLLOW_ITEM;if(key==='hudCarAlerts')return ALERT_ITEM;if(key==='driverProfiles')return DRIVER_ITEM;if(key==='hudDoorAlert')return DOOR_ITEM;if(key==='comfortShiftRpm')return COMFORT_ITEM;if(key==='clusterYieldGuidance')return YIELD_ITEM;if(['aux','design','layout'].includes(key))return {key,label:{aux:'Auxiliary information',design:'Design',layout:'Position / size'}[key],type:'action'};return this.settings.schema.find(s=>s.key===key);}
 // Keep Basic a normal tab, including repeated taps from older hosts.
 tapBasic(){this.selectTab(0);}
 selectTab(i){if(this.open==='layout'||this.open==='layoutPresets'||this.settings.get('layoutPreview'))this.setPreview(false);this.layoutKind=null;this.sub=null;this.tab=Math.max(0,Math.min(FAV_TAB,i|0));this.favArmed=null;this.focus=0;this.open=null;this.draft=null;this.choice=0;this.changed();}
 // The settings screen left without Back (Home, another app, screen off): end Position / size so its
 // preview never stays on the HUD or cluster.
 leave(){if(this.open==='layout'||this.open==='layoutPresets'){this.setPreview(false);this.open=null;this.layoutKind=null;this.draft=null;this.resetArmed=false;this.presetMessage='';this.choice=0;this.changed();}else if(this.settings.get('layoutPreview'))this.setPreview(false);}
 back(){
  if(!this.open&&this.sub){const k=this.sub;this.sub=null;this.focus=Math.max(0,GROUPS[this.tab].indexOf(k));this.changed();return;}
  // following the BC button: its check and a page's setup (auxiliary values, then design) come back to its screen
  // a BC page's last step, Position / size: leaving it keeps the page's setup, positions and sizes too (1.3.41)
  if(this.bcEdit&&this.open==='layout'&&!this.layoutKind){this.setPreview(false);this.bcSave();return;}
  if(this.open==='bcCheck'&&this.bcFromFollow||this.bcEdit&&(this.open==='auxMode'||this.open==='auxSelect'||this.open==='design'||this.open==='rlDesign'||this.open==='myPic')){this.open='bc';this.bcEdit=null;this.bcFromFollow=false;this.draft=null;this.choice=0;this.changed();return;}
  if(this.open==='navLog'){this.open='navMode';this.choice=0;this.changed();return;}
  if(this.open==='myPic'&&!this.bcEdit){this.open='rlDesign';this.choice=Math.max(0,designList(this.display()).indexOf('car'));this.changed();return;}
  if(this.open==='favView'){this.open=null;}
  else if(this.open==='auxMode'){this.open='rlDesign';this.choice=Math.max(0,designList(this.display()).indexOf(designNow(this.config(),this.display())));}
  else if(this.open==='auxSelect'){this.open='auxMode';this.draft=null;this.choice=0;}
  else if(this.open==='layoutPresets'){this.open='layout';this.choice=0;this.presetMessage='';}
  else if(this.open==='layout'&&(this.layoutKind==='turn'||this.layoutKind==='door'||this.layoutKind==='headway')){this.setPreview(false);this.open=this.layoutKind;this.layoutKind=null;this.choice=0;}
  else{if(this.open==='layout')this.setPreview(false);this.open=null;this.draft=null;this.layoutKind=null;}
  this.changed();
 }
 move(delta){
  if(this.tab===FAV_TAB&&!this.open){const n=FAV_COUNT*3;this.focus=(this.focus+delta+n)%n;}
  else if(this.open==='favView'){this.choice=(this.choice+delta+2)%2;}
  else if(!this.open)this.focus=(this.focus+delta+this.keys().length)%this.keys().length;
  else{const n=this.open==='navMode'?options(this.settings.schema.find(s=>s.key==='navDisplayMode'),this.config()).length+3:ACTION_SCREENS.includes(this.open)?this.layoutActions.length:this.open==='auxMode'?3:this.open==='design'?3:this.open==='rlDesign'?designList(this.display()).length:this.open==='auxSelect'?D.METRICS.length+1+(this.draft&&this.draft.items.includes('clock')?1:0):options(this.item(),this.config()).length;this.choice=(this.choice+delta+Math.max(1,n))%Math.max(1,n);}
  this.changed();
 }
 value(item,cfg){
  if(item.key==='aux'){const a=D.auxConfig(cfg[this.display()+'AuxConfig']);return t(a.mode==='values'?'Text':'Gauges')+' · '+a.items.map(k=>tr(D.LABELS[k])).join(' / ');}
  if(item.key==='design'){const d=this.display(),n=designNow(cfg,d),a=D.auxConfig(cfg[d+'AuxConfig']);
   return tr(JAM[n]||RL.NAMES[n])+' · '+(a.mode==='off'?tr('No auxiliary information'):a.items.map(k=>tr(D.LABELS[k])).join(' / '));}
  if(item.key==='layout')return t('Adjust');
  if(item.key==='hudLamps')return [[cfg.hudHeadway!=='off','Lead-car headway'],[cfg.hudLaneLines==='on','Lane lines'],[cfg.hudTurnSignals==='on','Turn signals on HUD'],[cfg.hudDoorAlert!=='off','Door-open warning']].filter(x=>x[0]).map(x=>tr(x[1])).join(' · ')||tr('Off');
  if(item.key==='vehiclePreset'){const e=options(this.settings.schema.find(s=>s.key==='engineProfile'),cfg).find(o=>o[0]===cfg.engineProfile);return (e?t(e[1]):'')+' · '+cfg.powerUnit+' · '+(cfg.torqueUnit==='kgfm'?'kgf·m':'Nm')+' · '+cfg.shiftRpm+' rpm';}
  if(item.key==='driverProfiles')return this.driverValue();
  if(item.key==='hudDoorAlert')return this.doorValue(cfg);
  if(item.key==='navColor')return tr(cfg.navArrowStyle==='drawn'?'Drawn arrows':'3D')+' · '+tr('Arrow')+' '+tr(NAV_COLOR_LABELS[cfg.navColor])+' · '+tr('Text')+' '+tr(NAV_COLOR_LABELS[cfg.navTextColor]);
  // the blind spot warning is set on the same screen: named here while it is on
  if(item.key==='turn')return (cfg.hudTurnSignals==='on'?tr('On')+' · '+tr(TURN_STYLE_LABELS[cfg.hudTurnStyle])+' · '+tr(TURN_COLOR_LABELS[cfg.hudTurnColor]):tr('Off'))+(cfg.hudTurnBlindSpot==='on'?' · '+tr('Blind spot on'):'');
  // Navigation display (1.3.36): its own screen, with the next turn on the HUD; both named here
  if(item.key==='navDisplayMode'){const m=options(item,cfg).find(o=>o[0]===cfg.navDisplayMode);return (m?t(m[1]):t('Check required'))+' · '+tr('Next turn')+' '+tr(cfg.hudNavThen==='off'?'Off':'On');}
  if(item.key==='hudHeadway')return this.headwayValue(cfg);
  if(item.key==='bcFollow'){const on=BC.bcOf(k=>cfg[k],this.display()),p=on&&this.bcFollow&&this.bcFollow.current(),l=p&&(BC.PAGES[cfg.bcHmi]||[]).find(x=>x[0]===p);return 'iDrive '+(cfg.bcHmi==='ID8'?'8':'7')+(l?' · '+tr(l[1]):on?'':' · '+tr('BC mode not chosen'));}
  if(item.key==='bcCheck'){const s=this.bcDiag&&this.bcDiag.started?this.bcDiag.status():null;return s?tr('BC presses')+' '+s.presses+(s.stalk.now!==null?' · '+s.stalk.now:''):tr('Check what the car sends');}
  if(item.key==='appEnabled')return t(cfg.appEnabled?'Running':'Stopped');
  if(item.key==='shiftRpm'&&!this.settings.get(item.key))return cfg.shiftRpm+' rpm';
  if(item.key==='comfortShiftRpm')return cfg.comfortShiftRpm?cfg.comfortShiftRpm+' rpm':tr('Automatic')+' · '+Math.round(cfg.shiftRpm*0.9/100)*100+' rpm';
  const selected=options(item,cfg).find(o=>o[0]===(item.key==='clusterYieldGuidance'||item.key==='hudCarAlerts'?cfg[item.key]:this.settings.get(item.key)));return selected?t(selected[1]):t('Check required');
 }
 change(delta){if(this.tab===FAV_TAB&&!this.open||this.open==='favView')return;if(this.open==='layoutPresets'||this.open==='turn'||this.open==='navColor'||this.open==='door'||this.open==='driver'||this.open==='navMode'||this.open==='navLog'||this.open==='headway'||this.open==='bcCheck'||this.open==='bc'||this.open==='myPic'||this.open==='laneLines')return;if(this.open==='layout'){this.adjust(this.layoutParam,delta);return;}const item=this.item(),list=options(item,this.config());if(!list.length){this.activate();return;}const at=list.findIndex(o=>o[0]===this.settings.get(item.key));this.settings.set(item.key,list[(at+delta+list.length)%list.length][0]);this.changed();}
 activate(index){
  if(index!==undefined)this.focus=index;
  if(this.tab===FAV_TAB&&!this.open){this.favAction(Math.floor(this.focus/3)+1,this.focus%3);return;}
  const item=this.item();if(!item)return;
  this.choice=0;
  if(SUBMENUS[item.key]){this.sub=item.key;this.focus=0;this.changed();return;}
  if(item.key==='turn')this.open='turn';
  else if(item.key==='hudDoorAlert')this.open='door';
  else if(item.key==='driverProfiles')this.open='driver';
  else if(item.key==='navDisplayMode')this.open='navMode';
  else if(item.key==='hudHeadway')this.open='headway';
  else if(item.key==='hudLaneLines')this.open='laneLines';
  else if(item.key==='bcCheck'){this.open='bcCheck';if(this.bcDiag)this.bcDiag.start();}
  else if(item.key==='bcFollow'){this.open='bc';this.bcEdit=null;}
  else if(item.key==='aux')this.open='auxMode';
  else if(item.key==='design'){this.open='rlDesign';this.choice=Math.max(0,designList(this.display()).indexOf(designNow(this.config(),this.display())));}
  else if(item.key==='layout'){this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set([this.layoutParts()[0].key]);this.setPreview(true);}
  else if(item.type==='bool'){this.change(1);return;}
  else{this.open=item.key;this.choice=Math.max(0,options(item,this.config()).findIndex(o=>o[0]===this.settings.get(item.key)));}
  this.changed();
 }
 choose(index){
  if(this.open==='favView'){if(index===0)this.loadFavorite(this.favIndex);else this.back();return;}
  // Navigation display: its first buttons are the drive modes, in their list's order (as its picker had them)
  if(this.open==='navMode'){const modes=options(this.settings.schema.find(s=>s.key==='navDisplayMode'),this.config());if(index<modes.length){this.settings.set('navDisplayMode',modes[index][0]);this.changed();return;}}
  if(ACTION_SCREENS.includes(this.open)){const a=this.layoutActions[index];if(a)a.act();return;}
  if(this.open==='auxMode'){
   // no auxiliary values (1.3.48): the design alone
   if(index===2){this.settings.set(this.display()+'AuxConfig',JSON.stringify({mode:'off',items:[]}));this.draft=null;if(this.bcLayout())return;this.open=null;this.changed();return;}
   this.draft={mode:index===1?'values':'gauges',items:[]};this.open='auxSelect';this.choice=0;this.changed();return;}
  if(this.open==='auxSelect'){if(index===D.METRICS.length)this.commitAux();else if(index===D.METRICS.length+1)this.toggleClockZone();else this.toggleMetric(D.METRICS[index]);return;}
  if(this.open==='design'){
   if(index===2){this.open='rlDesign';this.choice=Math.max(0,RL.stylesFor(this.display()).indexOf(RL.style(this.config(),this.display())));this.changed();return;}
   const values=this.designSwitch('own');values[this.display()+'AlertStyle']=index===1?'circle':'bar';this.setValues(values);if(this.bcLayout())return;this.open=null;this.changed();return;}
  if(this.open==='rlDesign'){const d=this.display(),st=designList(d)[index];if(!st)return;
   if(JAM[st]){const values=this.designSwitch('own');values[d+'AlertStyle']=st==='jam-circle'?'circle':'bar';this.setValues(values);}else this.setValues(this.designSwitch('rl-'+st));
   // My design (1.3.50): first its GIFs from the GIF player, then its auxiliary values
   // the Animation layout (1.3.55, with My design merged in): on the cluster its GIFs first
   if(st==='car'){this.openMyPic();return;}   // (the HUD too since 1.3.59: the same GIFs)
   // then its auxiliary values
   const a=D.auxConfig(this.config()[d+'AuxConfig']);this.open='auxMode';this.choice=a.mode==='off'?2:a.mode==='values'?1:0;this.changed();return;}
  const list=options(this.item(),this.config());if(!list[index])return;
  this.settings.set(this.item().key,list[index][0]);if(this.item().key==='navDisplayMode')this.settings.set('hudNavigationEnabled',true);this.open=null;this.changed();
 }
 toggleClockZone(){this.settings.set('clockZone',this.config().clockZone==='utc9'?'auto':'utc9');this.changed();}
 // the clock: horizontal gauges only (not in text mode, not on Hexagon / Classic dial, whose gauges stand upright)
 auxBlocked(id,cfg){if(!D.GAUGE_ONLY.includes(id))return false;if(!this.draft||this.draft.mode!=='gauges')return true;const st=RL.style(cfg||this.config(),this.display());return !!st&&RL.VERTICAL_GAUGES.includes(st);}
 toggleMetric(id){if(!this.draft||!D.METRICS.includes(id)||this.auxBlocked(id)&&!this.draft.items.includes(id))return;const a=this.draft.items,i=a.indexOf(id);if(i>=0)a.splice(i,1);else if(a.length<(this.draft.mode==='gauges'?2:4))a.push(id);this.changed();}
 commitAux(){if(!this.draft||!this.draft.items.length)return;this.settings.set(this.display()+'AuxConfig',JSON.stringify(this.draft));this.draft=null;
  // a BC page's setup: its auxiliary values, then its design
  if(this.bcLayout())return;this.open=null;this.changed();}
 // A BC page's design chosen: then its Position / size (the Cluster tab's layout screen)
 bcLayout(){if(!this.bcEdit)return false;this.layoutKind=null;this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set([this.layoutParts()[0].key]);this.setPreview(true);this.changed();return true;}
 // A BC page's setup done: what the cluster shows now is kept for that page, its positions and sizes too (1.3.41):
 // every cluster position / size / shown setting, applied again when BC comes to that page
 bcLayoutKeys(d){d=d==='hud'?'hud':'cluster';const keys=this.settings.schema.map(s=>s.key).concat(Object.keys(DEFAULTS));return keys.filter((k,i)=>keys.indexOf(k)===i&&k.indexOf(d)===0&&/(OffsetX|OffsetY|WidthScale|HeightScale|Hidden)$/.test(k));}
 bcSave(){const e=this.bcEdit;if(!e)return false;const d=e.display==='hud'?'hud':'cluster',pk=BC.PAGES_KEY[d],c=this.config(),all=BC.parse(this.settings.get(pk),{});all[e.hmi]=all[e.hmi]||{};
  const layout={};this.bcLayoutKeys(d).forEach(k=>{const v=this.settings.get(k);if(v!==undefined)layout[k]=v;});
  all[e.hmi][e.page]={kind:'redline',design:c[d+'Design']||'own',aux:c[d+'AuxConfig'],alert:c[d+'AlertStyle'],layout};this.settings.set(pk,JSON.stringify(all));this.bcEdit=null;this.open='bc';this.choice=0;this.changed();return true;}
 button(cv,targets,label,x,y,w,h,act,on,id,max){
  const layoutFocus=ACTION_SCREENS.includes(this.open)&&targets.length===this.choice,focused=layoutFocus&&!/^part/.test(id||'')||this.open==='auxSelect'&&(id==='metric-'+D.METRICS[this.choice]||id==='ok'&&this.choice===D.METRICS.length||id==='clock-zone'&&this.choice===D.METRICS.length+1)||this.open==='rlDesign'&&id==='rl-'+designList(this.display())[this.choice]||this.open==='design'&&id==='design'+this.choice||this.tab===FAV_TAB&&!this.open&&id==='fav-'+this.focus||this.open==='favView'&&id==='favview-'+this.choice;
  // On the design pickers the fill marks the design in use and a white outline the cursor; elsewhere the cursor fills.
  const picker=(this.open==='design'||this.open==='rlDesign')&&focused;
  cv.roundRect(x,y,w,h,6,on||focused&&!picker?'#57202d':'#252a31');if(picker)cv.polyline([[x+2,y+2],[x+w-2,y+2],[x+w-2,y+h-2],[x+2,y+h-2],[x+2,y+2]],3,'#f3f5f7');if(layoutFocus&&/^part/.test(id||'')&&!on)cv.polyline([[x+2,y+2],[x+w-2,y+2],[x+w-2,y+h-2],[x+2,y+h-2],[x+2,y+2]],2,'#9bacc4');let size=max||30;while(size>18&&cv.textWidth(t(label),size)>w-24)size--;
  if(label==='−'||label==='+'){cv.line(x+w/2-17,y+h/2,x+w/2+17,y+h/2,3,'#f3f5f7');if(label==='+')cv.line(x+w/2,y+h/2-17,x+w/2,y+h/2+17,3,'#f3f5f7');}
  else cv.text(label,x+w/2,y+h/2+size*0.36,size,'#f3f5f7',{align:'center',font:'bold'});targets.push({x,y,w,h,act,label,id:id||label});
 }
 draw(cv,status,liveState){
  this.liveState=liveState||null;
  // My picture's previews read the GIFs from the app's data folder (my-picture.js), once the layout is chosen
  if(this.dataDir&&!this.myPictureDir&&(this.config().clusterDesign==='rl-car'||this.config().hudDesign==='rl-car')){this.myPictureDir=true;require('./my-picture').setDir(this.dataDir);}
  const cfg=this.config(),targets=[],theme={bg:'#090b0e',text:'#f3f5f7',dim:'#8d97a4',sel:'#f32b40',accent:'#f32b40'};cv.clear(theme.bg);{const B=require('./settings-bg');B.paint(cv,W,H,B.left(cv),B.top(cv,cv.chrome?0:80));}
  const badges=this.version?[{text:'v'+this.version,color:'#8d97a4'}]:[];
  // 'Favorites' is not in the kit's own catalogue: its Korean comes from strings.js.
  const tabs=TABS.map(x=>x==='Favorites'?tr(x):x);
  if(cv.chrome)G.frame(cv,theme,tabs,this.tab,badges);else{header(cv,theme,0,0,W,80,'Cluster Redline',tabs,this.tab,badges,true,false);(cv.tabRects||[]).forEach(r=>targets.push(Object.assign({},r,{act:()=>r.i===0?this.tapBasic():this.selectTab(r.i),label:TABS[r.i],id:'tab'+r.i})));}
  if(this.open==='layout')this.drawLayout(cv,cfg,targets);
  else if(this.open==='layoutPresets')this.drawPresets(cv,cfg,targets);
  else if(this.open==='turn')this.drawTurn(cv,cfg,targets);
  else if(this.open==='door')this.drawDoor(cv,cfg,targets);
  else if(this.open==='driver')this.drawDriver(cv,cfg,targets);
  else if(this.open==='navMode')this.drawNavMode(cv,cfg,targets);
  else if(this.open==='navLog')this.drawNavLog(cv,cfg,targets);
  else if(this.open==='headway')this.drawHeadway(cv,cfg,targets);
  else if(this.open==='laneLines')this.drawLaneLines(cv,cfg,targets);
  else if(this.open==='bcCheck')this.drawBcCheck(cv,cfg,targets);
  else if(this.open==='bc')this.drawBc(cv,cfg,targets);
  else if(this.open==='myPic')this.drawMyPic(cv,cfg,targets);
  else if(this.open==='auxMode')this.drawAuxMode(cv,cfg,targets);
  else if(this.open==='auxSelect')this.drawAuxSelect(cv,cfg,targets);
  else if(this.open==='design')this.drawDesign(cv,cfg,targets);
  else if(this.open==='rlDesign')this.drawRedlineDesigns(cv,cfg,targets);
  else if(this.open==='navColor')this.drawColors(cv,cfg,targets);
  else if(this.open==='favView')this.drawFavoriteView(cv,targets);
  else if(this.open)this.drawChoices(cv,cfg,targets);
  else if(this.tab===FAV_TAB)this.drawFavorites(cv,targets);
  else this.drawRows(cv,cfg,targets,status);
  cv.targets=targets.map((r,i)=>Object.assign({key:this.tab+':'+(this.open||'rows')+':'+i,run:r.act},r));return cv;
 }
 drawRows(cv,cfg,targets,status){
  let y=100;
  this.keys().forEach((key,i)=>{
   const item=this.itemOf(key);
   // the HUD tab's seven rows (1.3.37: + Lead-car headway) as tight as the Basic tab's, above its notes
   const h=this.tab===0||this.tab===1&&this.keys().length>6?46:this.tab===1||this.tab===3||this.tab===2&&this.keys().length>5?56:68,ty=h===50?35:39;
   if(i===this.focus){cv.gradientRect(78,y,1460,h-1,[[0,'#30131a'],[1,'#090b0e']]);cv.fillRect(78,y+(h===50?6:8),4,h===50?37:42,'#f32b40');}
   const label=/^sport/.test(key)?'Sport mode RPM display':/^all/.test(key)?'All modes RPM display':ROW_LABELS[key]||item.label;
   cv.text(tr(label),100,y+ty,32,'#f3f5f7');
   if(key==='appEnabled'){
    // 1.3.48: one row for both: Start also starts it with the car, Stop also no longer starts it
    [[true,'Start app (auto start)'],[false,'Stop app (no auto start)']].forEach((v,n)=>this.button(cv,targets,tr(v[1]),860+n*340,y+3,330,h===50?44:50,()=>{this.settings.set(key,v[0]);this.settings.set('autoStart',v[0]);this.changed();},cfg.appEnabled===v[0],'operation-'+v[0],24));
   }else{
    let size=30,value=this.value(item,cfg);while(size>18&&cv.textWidth(value,size)>850)size--;
    cv.text(value,1480,y+ty,size,'#c1cddd',{align:'right'});targets.push({x:78,y,w:1460,h:h-1,act:()=>this.activate(i),label,id:key});
   }
   // (1.3.13: the Basic tab's renderer / display-area notices are gone; the guide keeps them)
   cv.line(84,y+h-1,1536,y+h-1,0.6,'#292d34');y+=h;
  });
  if(this.tab===1||this.tab===2){cv.text(tr('All modes: Sport too · Except Sport modes: Sport follows its own row.'),84,492,23,'#91a1b6',{literal:true});let o=this.outsideStatus(cfg);if(o){while(o.length>5&&cv.textWidth(o,21,{literal:true})>1000)o=o.slice(0,-2);cv.text(o,84,462,21,'#ffad45',{literal:true});}}
  if(this.tab===3){const y=this.yieldStatus(cfg);if(y)cv.text(y,84,398,21,'#ffad45',{literal:true});const a=this.alertStatus(cfg);if(a)cv.text(a,84,428,21,'#ffad45',{literal:true});}
  // Cafe watermark in the free bottom-right corner of the HUD, cluster and navigation tabs (not on Basic: its rows fill the screen).
  if(this.sub){cv.text(tr(SUBMENU_ITEMS[this.sub].label),100,84+this.keys().length*46+60,24,'#91a1b6',{literal:true});this.backButton(cv,targets);}
  if(this.tab>0)require('./settings-bg').mark(cv,W,H);
  if(this.tab===3){cv.text(HUD_WARNING,84,466,19,'#91a1b6');cv.text(tr('Yield: while phone (Waze) or chosen route guidance runs, the cluster RPM display steps aside for the stock map.'),84,492,19,'#91a1b6');}
 }
 // Live check lines (from the background app's status) so a car without the value can be told apart.
 outsideStatus(cfg){
  const items=D.auxConfig(cfg[this.display()+'AuxConfig']).items;if(!items.includes('outside'))return '';
  const live=this.liveState&&this.liveState.auxiliary;if(!live)return tr('Outside temperature')+': '+tr('waiting for the background app');
  const v=live.values&&live.values.outside,src=(live.sources||[]).find(e=>e.field==='ExteriorTemperature'),d=live.diagnostics&&live.diagnostics.outside;
  if(typeof v==='number')return tr('Outside temperature')+': '+v.toFixed(1)+' °C · '+tr('received')+' '+(src?src.received:0);
  const su=live.setup&&live.setup.ExteriorTemperature;
  if(!src){if(!su)return tr('Outside temperature')+': '+tr('signal not installed for this app (reinstall from the Store)');
   return tr('Outside temperature')+': '+(su.state==='no_config'?tr('no interface config installed'):su.state==='field_missing'?tr('field missing in the installed config'):tr('not readable'))+' · '+(su.error||su.fieldKeys.concat(su.configFields).join(','));}
  if(src.error)return tr('Outside temperature')+': '+tr('subscription error')+' · '+src.error;
  if(!src.available)return tr('Outside temperature')+': '+tr('car interface not available yet');
  if(!src.received)return tr('Outside temperature')+': '+tr('subscribed, no value from the car yet');
  return tr('Outside temperature')+': '+tr('received')+' '+src.received+' · '+tr('raw')+' '+(d?String(d.raw):'?')+' ('+(d?d.result:'?')+')';
 }
 // Vehicle alerts from the car: query state, replies, the alert kinds in the last reply, what shows now.
 alertStatus(cfg){
  if(cfg.hudCarAlerts==='off')return '';const head=tr('Vehicle alerts'),a=this.liveState&&this.liveState.vehicleAlerts;if(!a)return head+': '+tr('waiting for the background app');
  const parts=[],o=a.overlay||{};
  // speeding / children signs: the camera's sign recognition and the vehicle speed (received counts)
  if(cfg.hudCarAlerts!=='camera'){const s=a.signs||[],n=f=>{const e=s.find(x=>x.field===f);return !e||!e.configured?'X':String(e.received);};
   parts.push(tr('Sign recognition')+' '+n('TrafficSignRecognition')+' · '+tr('Camera')+' '+n('TrafficSignRecognitionFrontCamera')+' · '+tr('Speed')+' '+n('statusCarSpeed2'));}
  // speed cameras: the navigation's route events
  if(cfg.hudCarAlerts==='camera'||cfg.hudCarAlerts==='all'){const k=x=>(a.kinds&&a.kinds[x])||0;
   parts.push(a.state==='waiting'?tr('route events not available yet'):a.state==='types_rejected'?tr('the car refused the alert query'):!a.replies?tr('Speed camera')+' '+tr('no reply yet'):tr('Speed camera')+' '+(k('speedCamera')+k('speedSectionCamera'))+'/'+a.replies);}
  if(o.shown)parts.push(tr('shown'));
  return head+': '+parts.join(' · ');
 }
 // Settings per driver: on / off and whose settings are in use (driver 1, 2 ... in the order first seen).
 // The door-open warning: on / off, and whether the car's door status arrives (and which doors are open now).
 doorValue(cfg){
  if(cfg.hudDoorAlert==='off')return tr('Off');const d=this.liveState&&this.liveState.doors;if(!d)return tr('On');
  if(d.state==='not_installed')return tr('On')+' · '+tr('not installed (reinstall from the Store)');
  if(d.state==='error')return tr('On')+' · '+tr('subscription error');
  return tr('On')+(d.open&&d.open.length?' · '+tr('open')+' '+d.open.length:'');
 }
 driverValue(){
  if(this.settings.get('driverProfiles')!=='on')return tr('Off');
  const s=typeof this.driverStatus==='function'?this.driverStatus():null;if(!s)return tr('On');
  if(s.state==='ready'&&s.driver)return tr('On')+' · '+(s.name?s.name+(s.drivers>1?' ('+s.driver+' / '+s.drivers+')':''):tr('Driver')+' '+s.driver+(s.drivers>1?' / '+s.drivers:''))+this.greetingValue();
  return tr('On')+' · '+tr(s.state==='error'||s.state==='unavailable'?'driver not readable':'reading the driver');
 }
 // What the greeting did last (driver-greeting.js status): shown, a restart within 3 minutes not greeted, or no
 // display ready in time; with how long ago.
 greetingValue(){
  let g=null;try{g=require('./driver-greeting').status();}catch(e){}if(!g||!g.last&&!g.waiting)return '';
  if(g.waiting)return ' · '+tr('Greeting waiting');
  const m=Math.max(0,Math.round((Date.now()-g.last.wall)/60000)),ago=m<1?tr('just now'):m+tr(' min ago');
  return ' · '+tr({shown:'Greeting shown',restart:'Greeting skipped (restart within 3 min)',not_ready:'Greeting missed (display not ready)',bye:'Goodbye shown',bye_not_ready:'Goodbye missed (display off)'}[g.last.what]||g.last.what)+' '+ago;
 }
 yieldStatus(cfg){
  if(cfg.clusterYieldGuidance==='off')return '';const y=this.liveState&&this.liveState.clusterYield;if(!y)return tr('Yield')+': '+tr('waiting for the background app');
  const p=y.projected||{},cp=p.CAR_PLAY||{},aa=p.ANDROID_AUTO||{},f=x=>x===true?'O':x===false?'X':'-';
  return tr('Yield')+': '+tr(y.active?'cluster released':'not now')+' · HUD '+f(y.hud)+' · CarPlay '+f(cp.available)+'/'+f(cp.active)+'/'+f(cp.metadataAvailable)+' · AA '+f(aa.available)+'/'+f(aa.active)+'/'+f(aa.metadataAvailable)+(y.provider?' · '+y.provider:'');
 }
 backButton(cv,targets){this.button(cv,targets,'Back',1210,448,326,64,()=>this.back(),false,'back');}
 drawChoices(cv,cfg,targets){
  const item=this.item(),list=options(item,cfg),start=Math.max(0,Math.min(list.length-4,this.choice-1));cv.text(tr(ROW_LABELS[item.key]||item.label),100,126,32,'#ef4050');
  list.slice(start,start+4).forEach((o,row)=>{const i=start+row,y=148+row*72;this.button(cv,targets,tr(o[1]),84,y,1452,68,()=>this.choose(i),this.choice===i,'choice'+i);});this.backButton(cv,targets);
 }
 drawAuxMode(cv,cfg,targets){
  cv.text('Auxiliary information',100,126,32,'#ef4050');
  ['Gauges','Text','No auxiliary information'].forEach((name,i)=>this.button(cv,targets,tr(name),84+i*488,180,464,110,()=>this.choose(i),this.choice===i,'aux-mode'+i));
  cv.text('Select items on the next screen. Changes apply only after OK.',100,360,26,'#a8b6c8');
  // the Calm clock's colours (1.3.71): cool or warm, for both displays
  if(RL.style(cfg,this.display())==='calm'){const warm=cfg.calmTone==='warm';this.button(cv,targets,tr('Calm clock')+' · '+tr('Colours')+': '+tr(warm?'Warm':'Cool'),84,448,700,64,()=>{this.settings.set('calmTone',warm?'cool':'warm');this.changed();},false,'calm-tone');}
  this.backButton(cv,targets);
 }
 drawAuxSelect(cv,cfg,targets){
  const draft=this.draft,limit=draft.mode==='gauges'?2:4;cv.text(t(draft.mode==='gauges'?'Select gauges':'Select text items')+' (1–'+limit+')',100,128,32,'#ef4050',{literal:true});
  D.METRICS.forEach((id,i)=>{const index=draft.items.indexOf(id),x=84+(i%4)*369,y=152+Math.floor(i/4)*80,blocked=this.auxBlocked(id,cfg);
   this.button(cv,targets,index>=0?(index+1)+'. '+tr(D.LABELS[id]):D.GAUGE_ONLY.includes(id)?tr(D.LABELS[id])+' · '+tr('Horizontal gauges only'):tr(D.LABELS[id]),x,y,343,70,()=>this.toggleMetric(id),index>=0,'metric-'+id);
   if(blocked&&index<0)cv.roundRect(x,y,343,70,6,[0,0,0,150]);   // can't be chosen here: dimmed
  });
  if(draft.mode==='gauges'&&this.auxBlocked('clock',cfg))cv.text(tr('Upright gauges on this layout: no clock.'),1516,410,22,'#ff8a8a',{align:'right'});
  cv.text('Selection order sets the left and right positions.',100,410,24,'#a8b6c8');
  this.button(cv,targets,'OK',84,448,326,64,()=>this.commitAux(),draft.items.length>0,'ok');
  if(draft.items.includes('clock'))this.button(cv,targets,tr('Clock time')+': '+tr(cfg.clockZone==='utc9'?'UTC+9 (Korea)':'Head unit time'),430,448,760,64,()=>this.toggleClockZone(),false,'clock-zone');
  this.backButton(cv,targets);
 }
 preview(cv,cfg,x,y,width,display){
  const painter=display==='cluster'?CLUSTER:HUD,clean=Object.assign({},cfg);
  D.PARTS.forEach(p=>['OffsetX','OffsetY','WidthScale','HeightScale'].forEach(k=>{clean[display+p+k]=D.defaults[display+p+k];}));
  const s=width/painter.W,state={config:clean,rpm:Math.round(cfg.shiftRpm*0.92/10)*10,gear:'M3',shift:false,flash:true,torqueNm:300,powerPS:180,torquePeak:380,powerPeak:220,aux:{boost:0.85,oil:95,outside:18,gforce:0.35,gLat:0.25,gLong:0.24}};
  const target=vector(cv,x,y,s);target.part=(cfg,d,name,bounds,paint)=>paint(vector(cv,x+(cfg[d+name+'OffsetX']||0)*s,y+(cfg[d+name+'OffsetY']||0)*s,s));painter.draw(state,target);
 }
 previewHUD(cv,cfg,x,y,width){this.preview(cv,cfg,x,y,width,'hud');}
 drawDesign(cv,cfg,targets){
  const display=this.display();['Top alert bar','Circle beside gear'].forEach((label,i)=>{
   const x=84+i*740;this.button(cv,targets,label,x,106,712,64,()=>this.choose(i),!RL.active(cfg,display)&&(cfg[display+'AlertStyle']==='circle')===(i===1),'design'+i);
   cv.text(tr('Gauge support'),x+700,124,17,'#5ee08f',{align:'right',literal:true});
   const preview=Object.assign({},cfg);preview[display+'AlertStyle']=i?'circle':'bar';preview[display+'Design']='own';const pw=display==='cluster'?590:690,painter=display==='cluster'?CLUSTER:HUD;
   cached(cv,'own|'+display+'|'+JSON.stringify(preview),x+10,182,pw,painter.H*pw/painter.W+2,(c,px,py)=>this.preview(c,preview,px,py,pw,display));
  });this.button(cv,targets,tr('Redline app layouts')+(RL.active(cfg,display)?' · '+tr(RL.NAMES[RL.style(cfg,display)]):''),84,448,1100,64,()=>this.choose(2),RL.active(cfg,display),'design2');
  this.backButton(cv,targets);
 }
 // The Redline app's nine HUD layouts with live previews (sample: 6300 rpm, 3rd gear).
 drawRedlineDesigns(cv,cfg,targets){
  cv.text(tr('Redline app layouts'),100,126,32,'#ef4050',{literal:true});
  const d=this.display(),current=RL.style(cfg,d),sample=Object.assign({},cfg),state={config:sample,rpm:6300,gear:'M3',shift:false,flash:false,mode:'SPORT',torqueNm:380,powerPS:260,aux:{boost:1.1,oil:96,outside:18,clock:'23:00'}};
  // Four columns: the Redline app's nine, then Cluster Redline's five; each preview fitted to its cell.
  // Rows shrink when the list needs a fifth row (the cluster's seventeen layouts).
  const list=designList(d),rows=Math.ceil(list.length/4),pitch=Math.min(80,Math.floor(304/rows)),bh=pitch-4;
  const now=designNow(cfg,d);
  list.forEach((st,i)=>{const x=84+(i%4)*366,y=138+Math.floor(i/4)*pitch,on=st===now;
   if(JAM[st]){this.button(cv,targets,'',x,y,354,bh,()=>this.choose(i),on,'rl-'+st);
    const pc=Object.assign({},cfg);pc[d+'Design']='own';pc[d+'AlertStyle']=st==='jam-circle'?'circle':'bar';const painter=d==='cluster'?CLUSTER:HUD,pw=Math.min(330,(bh-24)*painter.W/painter.H);
    cached(cv,'jam|'+d+'|'+st+'|'+JSON.stringify(pc),x+8,y+4,pw,painter.H*pw/painter.W+2,(c,px,py)=>this.preview(c,pc,px,py,pw,d));
    cv.text(tr(JAM[st]),x+346,y+bh-6,17,on?'#ffffff':'#b8c5d4',{align:'right',literal:true});return;}
   const k=Math.min(200/RL.IW,(bh-24)/RL.heightOf(st));
   this.button(cv,targets,'',x,y,354,bh,()=>this.choose(i),on,'rl-'+st);
   // whether the layout draws the auxiliary items as bar gauges in gauge mode, or as text only
   const g=RL.GAUGE_LAYOUTS.includes(st);cv.text(tr(g?'Gauge support':'Text only'),x+346,y+22,15,g?'#5ee08f':'#7d8794',{align:'right',literal:true});
   sample[d+'Design']='rl-'+st;const shown=Object.assign({},state,{config:Object.assign({},sample),aux:Object.assign({gLat:0.3,gLong:-0.25,gforce:0.39},state.aux)});
   cached(cv,'rl|'+d+'|'+st+'|'+require('./strings').language()+'|'+JSON.stringify(shown.config),x+8,y+4,RL.IW*k+2,RL.heightOf(st)*k+2,(c,px,py)=>RL.paint(c,shown,k,px,py,0,d));
   cv.text(tr(RL.NAMES[st]),x+346,y+bh-6,17,on?'#ffffff':'#b8c5d4',{align:'right',literal:true});
  });
  if(rows<=4)cv.text(tr('Redline app layouts (appsKOR, MIT) and Cluster Redline layouts. Navigation, lanes and auxiliary items stay as set.'),84,476,20,'#a8b6c8',{literal:true});
  this.backButton(cv,targets);
 }
 // The car's turn signal input, for checking in the car: subscription, notifications received, last direction.
 turnStatus(){
  const head=tr('Turn signal input'),s=this.liveState&&this.liveState.turnSignal;if(!s)return [head,tr('waiting for the background app')];
  if(s.state==='not_installed')return [head,tr('not installed (reinstall from the Store)')];
  if(s.state==='error')return [head,tr('subscription error')];
  if(!s.received){const b=this.liveState&&this.liveState.blindSpot;return [head,tr('no value from the car yet')+(b&&b.on?' · '+tr('Blind spot')+' '+(b.refused?tr('not supported by this car'):b.good?tr('received')+' '+b.good:b.reading?tr('reading'):tr('engine off')):'')];}
  const dir={off:'Off',left:'Left',right:'Right',both:'Both (hazards)'}[s.indicator]||String(s.indicator);
  const b=this.liveState&&this.liveState.blindSpot,side=v=>v===2?tr('warning'):v===1?tr('car'):'-';
  const blind=!b||!b.on?'':' · '+tr('Blind spot')+' '+(b.refused?tr('not supported by this car'):b.good?side(b.left)+' / '+side(b.right):b.reading?tr('reading'):tr('engine off'));
  return [head+': '+tr('received')+' '+s.received,tr(dir)+(s.drawnIn?' · '+tr(s.drawnIn==='redline-hud'?'in the Redline HUD':'overlay'):'')+blind];
 }
 // Following the BC button (1.3.40): on / off, the head unit's list, where the next drive starts, the check; then the
 // stock BC pages in the order a press goes through them, each with what the Redline cluster shows there (Set screen:
 // its auxiliary values, then its design), Waze / the stock map, no change, or left out; the page in step marked, and
 // "This page now" to put it back in step.
 bcSummary(s){
  if(s.kind==='yield')return tr('Waze map');if(s.kind==='keep')return tr('No change');if(s.kind==='skip')return tr('Left out');
  let a=null;try{a=JSON.parse(s.aux||'null');}catch(e){}
  const design=s.design&&/^rl-/.test(s.design)?tr(RL.NAMES[s.design.slice(3)]||s.design):s.design==='own'?tr(s.alert==='circle'?JAM['jam-circle']:JAM['jam-bar']):'';
  if(a&&a.mode==='off')return design+' / '+tr('No auxiliary information');
  const items=a&&Array.isArray(a.items)?a.items.map(id=>t(D.LABELS[id]||id)).join(' · '):'';
  return [design,items].filter(Boolean).join(' / ')+(s.layout&&Object.keys(s.layout).length?' · '+tr('own position'):'')||tr('Redline cluster');
 }
 drawBc(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();},hmi=cfg.bcHmi==='ID8'?'ID8':'ID7',f=this.bcFollow,d=this.display(),pk=BC.PAGES_KEY[d];
  const pages=BC.pagesOf(cfg[pk],hmi,d),now=f?f.current():null,setKind=(page,kind)=>{const all=BC.parse(this.settings.get(pk),{});all[hmi]=all[hmi]||{};all[hmi][page]=Object.assign({},pages[page],{kind});set(pk,JSON.stringify(all));};
  // on in the drive modes whose RPM row says BC mode (1.3.42); here the list and each page
  [['ID7','iDrive 7'],['ID8','iDrive 8']].forEach((o,i)=>this.button(cv,local,o[1],84+i*170,96,160,50,()=>set('bcHmi',o[0]),hmi===o[0],'bc-'+o[0],22));
  const bcOn=BC.bcOf(k=>cfg[k],d);
  cv.text(tr(d==='hud'?'HUD':'Cluster'),440,112,17,'#91a1b6',{literal:true});
  if(!bcOn)cv.text(tr('Choose BC mode in Sport / All modes RPM display'),440,128,19,'#ffad45',{literal:true});
  if(bcOn)this.button(cv,local,tr(cfg.bcStart==='first'?'Start: the first page':'Start: the page reached last'),730,96,400,50,()=>set('bcStart',cfg.bcStart==='first'?'last':'first'),false,'bc-start',20);
  this.button(cv,local,tr('BC button check'),1146,96,390,50,()=>{this.open='bcCheck';this.bcFromFollow=true;if(this.bcDiag)this.bcDiag.start();this.changed();},false,'bc-check',20);
  const list=BC.PAGES[hmi],rowH=Math.min(44,Math.floor(286/list.length)),bh=rowH-6;
  list.forEach(([key,label],i)=>{
   const y=158+i*rowH,s=pages[key],here=bcOn&&now===key;
   if(here)cv.gradientRect(78,y,1460,rowH-2,[[0,'#30131a'],[1,'#090b0e']]);
   cv.text(tr(label),100,y+rowH*0.68,20,'#f3f5f7',{literal:true});
   let sum=this.bcSummary(s);while(sum.length>4&&cv.textWidth(sum,17,{literal:true})>440)sum=sum.slice(0,-2);
   cv.text(sum,330,y+rowH*0.68,17,'#91a1b6',{literal:true});
   // Set screen: its design, then its auxiliary values, then its Position / size (1.3.48); Waze: the cluster only
   [['Set screen',()=>{this.bcEdit={hmi,page:key,display:d};this.draft=null;this.open='rlDesign';this.choice=Math.max(0,designList(d).indexOf(designNow(this.config(),d)));this.changed();},s.kind==='redline',170,'edit']]
    .concat(d==='cluster'?[['Waze map',()=>setKind(key,'yield'),s.kind==='yield',120,'yield']]:[])
    .concat([['No change',()=>setKind(key,'keep'),s.kind==='keep',150,'keep'],['This page now',()=>{if(f)f.here(key);},here,190,'here']])
    .reduce((x,[l,act,on,w,id])=>{this.button(cv,local,tr(l),x,y+2,w,bh,act,on,'bc-'+key+'-'+id,17);return x+w+8;},d==='cluster'?866:994);
  });
  const st=f?f.status():null,msg=!st?'':st.state==='not_installed'?tr('not installed (reinstall from the Store)'):st.state==='error'?tr('subscription error'):bcOn?tr('BC presses')+' '+st.presses:'';
  if(msg)cv.text(msg,100,494,20,'#ffad45',{literal:true});
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // My design (1.3.50, my-picture-source.js): up to three GIFs from the GIF player, one for each scene (standing still,
 // driving, reverse), the sizes that fit shown first; Fetch copies them into my-pictures/; Next: auxiliary values.
 openMyPic(){this.open='myPic';this.choice=0;if(this.dataDir)require('./my-picture').setDir(this.dataDir);this.myPicList();this.changed();}
 myPicList(){const st=this.myPic=Object.assign(this.myPic||{},{state:'loading',error:null});
  require('./my-picture-source').list((e,files)=>{st.state=e?'error':'ready';st.error=e?e.message:null;st.files=files||[];this.changed();});}
 myPicChoice(){let v={};try{v=JSON.parse(this.settings.get('myPicIds')||'{}')||{};}catch(e){}return v;}
 myPicStep(slot,delta){const files=(this.myPic&&this.myPic.files)||[],ids=[''].concat(files.map(f=>f.id)),c=this.myPicChoice(),i=Math.max(0,ids.indexOf(c[slot]||''));
  c[slot]=ids[(i+delta+ids.length)%ids.length];this.settings.set('myPicIds',JSON.stringify(c));this.changed();}
 myPicFetch(){const st=this.myPic;if(!st||st.busy||!this.dataDir)return;st.busy=true;st.result=null;this.changed();
  require('./my-picture-source').fetchChosen(this.dataDir,this.myPicChoice(),(out)=>{st.busy=false;st.result=out;this.changed();});}
 drawMyPic(cv,cfg,targets){
  const local=[],MPS=require('./my-picture-source'),MP=require('./my-picture'),st=this.myPic||{},B=MP.BOX,SRC=MP.SOURCE,choice=this.myPicChoice();
  const kb=b=>b>=1024*1024?(b/1048576).toFixed(1)+' MB':Math.max(1,Math.round(b/1024))+' KB';
  cv.text(tr('Animation')+' · '+tr('My GIFs'),100,118,32,'#ef4050',{literal:true});
  // the sizes (1.3.51): another size is fitted when it is copied, so only the GIF player's own limits apply
  cv.text(tr('Recommended')+': '+tr('canvas')+' '+B.w+' × '+B.h+' · '+tr('other sizes are fitted automatically')+' ('+tr('at most')+' '+SRC.maxW+' × '+SRC.maxH+', '+kb(SRC.maxBytes)+') · '+tr('Over N frames: N kept').replace(/N/g,MP.MAX_FRAMES),100,152,19,'#5ee08f',{literal:true});
  const src=st.state==='loading'?tr('GIF player')+': '+tr('waiting'):st.state==='error'?tr('GIF player')+': '+tr(st.error==='not_running'?'not running or older than 0.4.3 (update it and open it once)':'not reachable')+' ('+st.error+')':tr('GIF player')+': GIF '+(st.files||[]).length;
  cv.text(src+'  ·  '+tr('Smaller GIFs run faster: 160 × 90 10-20 frames a second, 320 × 180 2-6'),100,180,19,st.state==='error'?'#ffad45':'#c1cddd',{literal:true});
  const status=MP.status(),why={missing:'not set',too_large:'file too large',too_big:'canvas too big',not_gif:'not a GIF',no_frames:'no frames',broken:'unreadable',not_running:'GIF player not running',need_drive:'choose the driving GIF first'};
  const res=st.result||{};
  // five scenes (1.3.52: + turning left / right); a turn without its own GIF shows the other one mirrored
  const other={left:'right',right:'left'},stand=slot=>other[slot]&&choice[other[slot]]?tr(other[slot]==='right'?'Uses the right-turn GIF mirrored':'Uses the left-turn GIF mirrored'):tr('Uses the driving GIF');
  [['drive','Driving'],['stop','Standing still'],['reverse','Reverse'],['left','Turning left'],['right','Turning right']].forEach(([slot,label],i)=>{
   const y=190+i*46,id=choice[slot]||'',f=(st.files||[]).find(x=>x.id===id),must=slot==='drive';
   cv.text(tr(label)+(must?' *':''),100,y+29,22,'#f3f5f7',{literal:true});
   this.button(cv,local,'−',290,y,70,40,()=>this.myPicStep(slot,-1),false,'mypic-'+slot+'-prev');
   const fit=f?MPS.fits(f):'ok';
   // no GIF at all: the Animation layout's car (1.3.55); the driving GIF is required once any other is chosen
   const any=Object.keys(choice).some(k=>choice[k]),need=must&&!id&&any;
   let line=!id?(must?tr(any?'Required: choose a GIF':'None: the car picture'):any?stand(slot):tr('None: the car picture')):(f?(f.preset?tr('Built-in')+' · ':'')+f.name:id)+(f&&f.width?' · '+f.width+' × '+f.height+(MPS.resized(f)&&fit==='ok'?' → '+tr('fitted to')+' '+B.w+' × '+B.h:''):'')+(f&&f.bytes?' · '+kb(f.bytes):'')+(fit!=='ok'?' · '+tr(why[fit]):'');
   while(line.length>4&&cv.textWidth(line,20,{literal:true})>560)line=line.slice(0,-2);
   cv.roundRect(372,y,580,40,6,'#1b2027');cv.text(line,386,y+28,19,fit!=='ok'||need?'#ff8a8a':!id?'#91a1b6':'#f3f5f7',{literal:true});
   this.button(cv,local,'+',964,y,70,40,()=>this.myPicStep(slot,1),false,'mypic-'+slot+'-next');
   const s=status.find(x=>x.name===slot)||{},r=res[slot];
   let now=s.ok?tr('In use')+': '+s.w+' × '+s.h+' · '+s.frames+' '+tr('frames'):s.mirrored?tr(s.uses==='right'?'Uses the right-turn GIF mirrored':'Uses the left-turn GIF mirrored'):s.uses==='drive'?tr('Uses the driving GIF'):tr('Car picture (none)');
   if(r&&r.error)now+=' · '+tr('not kept')+' ('+(why[r.error]?tr(why[r.error]):r.error)+')';
   cv.text(now,1050,y+28,17,s.ok||s.uses?'#5ee08f':'#91a1b6',{literal:true});
  });
  const note=res.cleared?tr('No GIF: the Car layout\'s own car is shown.'):res.error?tr(why[res.error]||res.error):tr('No GIF: the car picture. With GIFs the driving GIF is required; scenes without their own show it (a turn: the other turn mirrored first). A change of scene fades.');
  cv.text(note,100,432,16,res.cleared?'#5ee08f':res.error?'#ff8a8a':'#91a1b6',{literal:true});
  this.button(cv,local,st.busy?tr('Fetching'):tr('Fetch from GIF player'),84,448,380,64,()=>this.myPicFetch(),false,'mypic-fetch',24);
  this.button(cv,local,tr('Refresh'),476,448,200,64,()=>this.myPicList(),false,'mypic-refresh',24);
  this.button(cv,local,tr('Next')+': '+tr('Auxiliary information'),688,448,500,64,()=>{const a=D.auxConfig(this.config()[this.display()+'AuxConfig']);this.open='auxMode';this.choice=a.mode==='off'?2:a.mode==='values'?1:0;this.changed();},false,'mypic-next',24);
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // The BC button check (1.3.39): press BC through the stock BC pages; if each page brings back its own value, each
 // page can get its own Redline cluster screen; if the value only grows, only the presses can be counted.
 drawBcCheck(cv,cfg,targets){
  const local=[],s=this.bcDiag?this.bcDiag.status():null;
  cv.text(tr('BC button check'),100,126,32,'#ef4050',{literal:true});
  cv.text(tr('Press BC several times so the stock BC pages of the cluster go round once.'),100,170,22,'#c1cddd',{literal:true});
  cv.text(tr('The left stalk shows 64 while BC is held, 0 when let go: each press is counted (BC presses).'),100,200,19,'#91a1b6',{literal:true});
  const block=(title,key,track,y)=>{
   cv.text(tr(title),100,y,24,'#f3f5f7',{literal:true});
   const st=s&&s.state[key];
   if(!s||st==='off'){cv.text(tr('waiting'),100,y+44,30,'#8d97a4',{literal:true});return;}
   if(st==='not_installed'){cv.text(tr('not installed (reinstall from the Store)'),100,y+40,24,'#ffad45',{literal:true});return;}
   if(st==='error'){cv.text(tr('subscription error'),100,y+40,24,'#ffad45',{literal:true});return;}
   cv.text(track.now===null?'-':track.now,100,y+48,40,'#37c6ff',{font:'num',literal:true});
   cv.text(tr('changes')+' '+track.changes+' · '+tr('received')+' '+track.received,420,y+40,22,'#c1cddd',{literal:true});
   let line=track.history.map(h=>h.value).join('  <  ');while(line.length>4&&cv.textWidth(line,20,{literal:true})>1060)line=line.slice(0,line.lastIndexOf('  <  '));
   if(line)cv.text(tr('newest first')+': '+line,420,y+70,20,'#91a1b6',{literal:true});
  };
  block('Left stalk switches','stalk',s&&s.stalk,260);
  if(s&&s.state.stalk==='reading')cv.text(tr('BC presses')+' '+s.presses,100,400,26,'#f3f5f7',{literal:true});
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // The HUD headway badge (1.3.37): off / simple / detailed, what the colours mean, what the car sends (to check the
 // signal on a car it has not been seen on), and Position / size.
 headwayValue(cfg){
  if(cfg.hudHeadway==='off')return tr('Off');const mode=tr(cfg.hudHeadway==='simple'?'Simple':'Detailed'),h=this.liveState&&this.liveState.headway;
  if(!h)return mode;if(h.unsupported)return mode+' · '+tr('this car does not give the app the car ahead');if(h.state==='not_installed'&&!(h.assist&&h.assist.state==='subscribed'))return mode+' · '+tr('not installed (reinstall from the Store)');if(h.state==='error')return mode+' · '+tr('subscription error');
  return mode+(h.now?' · '+(h.now.headway!==null?h.now.headway.toFixed(1)+' s · ':'')+Math.round(h.now.gap)+' m':' · '+tr('no car ahead'));
 }
 drawHeadway(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();};
  cv.text(tr('Lead-car headway'),100,126,32,'#ef4050',{literal:true});
  [['off','Off'],['simple','Simple'],['detail','Detailed']].forEach((o,i)=>this.button(cv,local,tr(o[1]),84+i*488,146,474,64,()=>set('hudHeadway',o[0]),cfg.hudHeadway===o[0],'headway-'+o[0]));
  cv.text(tr('The car ahead as the radar measures it: time gap at your speed and distance (Detailed: closing speed too).'),100,252,21,'#c1cddd',{literal:true});
  {const hh=this.liveState&&this.liveState.headway;
   if(hh&&hh.unsupported)cv.text(tr('Neither the radar nor the Drive assist view is offered to apps on this car (the cluster gets them directly): the badge cannot show here.'),100,284,19,'#ffad45',{literal:true});
   else cv.text(tr('Under 1.0 s red · 1.0 to 1.5 s amber · 1.5 s and over cyan. Below 12 km/h the distance only.'),100,284,21,'#91a1b6',{literal:true});}
  // what arrives: the raw values, to check the signal on this car
  const h=this.liveState&&this.liveState.headway,r=h&&h.raw||{},f=v=>v===null||v===undefined?'-':String(v);
  cv.text(this.headwayValue(cfg),100,322,21,h&&h.unsupported?'#ffad45':'#c1cddd',{literal:true});
  // whether the car offers the radar's service to the app at all, and on which instance (1.3.65)
  if(h&&cfg.hudHeadway!=='off'&&h.state==='subscribed')cv.text(tr('Radar service')+': '+(h.available===true?tr('offered'):h.available===false?tr('not offered (the car does not send it now)'):'-')+(h.instance?' · '+tr('instance')+' '+h.instance:''),100,364,16,h.available?'#5ee08f':'#ffad45',{literal:true});
  // the car's Drive assist view (1.3.68, 1.3.69): offered or not, what came
  if(h&&cfg.hudHeadway!=='off'&&h.assist){const a=h.assist,ar=a.raw||{},rc=a.received||{},src=x=>!x?tr('not in the catalog'):x.offered?tr('offered'):tr('not offered');
   cv.text(tr('Drive assist view')+': '+(a.state==='not_installed'?tr('not installed (reinstall from the Store)'):'ACC '+src(a.acc)+' · '+tr('objects')+' '+src(a.objects)+' · '+tr('received')+' '+(rc.acc||0)+' / '+(rc.objects||0)+(ar.lead?' · '+tr('car followed')+' #'+f(ar.lead.id)+' x '+f(ar.lead.x):'')),100,384,16,rc.acc||rc.objects?'#5ee08f':a.acc&&a.acc.offered||a.objects&&a.objects.offered?'#c1cddd':'#ffad45',{literal:true});}
  // the front camera's object list (1.3.73): offered or not, what came, the car followed (metres ahead, as sent)
  if(h&&cfg.hudHeadway!=='off'&&h.camera){const c=h.camera,cr=c.received||{},cw=c.raw||{};
   cv.text(tr('Front camera objects')+': '+(c.state==='not_installed'?tr('not installed (reinstall from the Store)'):(c.offered===true?tr('offered'):c.offered===false?tr('not offered'):'-')+(c.instance?' ('+tr('instance')+' '+c.instance+')':'')+' · '+tr('received')+' '+(cr.rec||0)+' / '+(cr.pos||0)+' · '+tr('cars')+' '+f(cw.objects)+' · '+tr('car followed')+' '+(cw.lead?'#'+cw.lead.id+' '+cw.lead.x+' m':'-')),100,404,16,cr.rec||cr.pos?'#5ee08f':c.offered?'#c1cddd':'#ffad45',{literal:true});}
  // Cluster Redline's root helper (1.3.74): installed and answering, what it receives
  if(h&&cfg.hudHeadway!=='off'&&h.helper){const x=h.helper,cm=x.cam||{},rd=x.radar||{},on=x.state==='connected'||x.lines>0;
   cv.text(tr('Lead-car helper')+': '+(!on?tr('not installed (Store: Cluster Redline lead-car helper)'):tr('connected')+' · '+tr('camera')+' '+tr('received')+' '+(cm.rx||0)+(cm.lead?' · '+tr('car followed')+' #'+cm.lead.id+' '+cm.lead.m+' m':' · '+tr('no car ahead'))+' · '+tr('radar')+' '+(rd.rx||0)+(rd.gapX!==null&&rd.gapX!==undefined?' (gapX '+rd.gapX+')':'')),100,426,16,on?(cm.lead?'#5ee08f':'#c1cddd'):'#ffad45',{literal:true});}
  if(h&&cfg.hudHeadway!=='off')cv.text(tr('From the car')+': '+tr('received')+' '+(h.received||0)+' · status '+f(r.status)+' · gap '+f(r.gap)+' · gapX '+f(r.gapX)+' · object '+f(r.object)+' · qualifier '+f(r.qualifier)+(r.kind?' · '+r.kind:''),100,344,16,'#7f8b9a',{literal:true});
  this.button(cv,local,tr('Position / size'),84,448,700,64,()=>{this.layoutKind='headway';this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set(['Headway']);this.setPreview(true);this.changed();},false,'headway-layout');
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // Lane lines (1.3.77, lane-lines.js): on / off and what the helper receives from the front camera's lane list
 drawLaneLines(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();},x=this.liveState&&this.liveState.laneLines,f=v=>v===null||v===undefined?'-':String(v);
  cv.text(tr('Lane lines'),100,126,32,'#ef4050',{literal:true});
  [['off','Off'],['on','On']].forEach((o,i)=>this.button(cv,local,tr(o[1]),84+i*732,146,718,64,()=>set('hudLaneLines',o[0]),cfg.hudLaneLines===o[0],'lanes-'+o[0]));
  cv.text(tr('The lines either side of the car as the front camera sees them, above the headway badge. Within 15 cm amber, on the line red (blue with the turn signal: a lane change).'),100,252,19,'#c1cddd',{literal:true});
  cv.text(tr('Needs the lead-car helper (installed with Cluster Redline from the Store).'),100,284,19,'#91a1b6',{literal:true});
  if(cfg.hudLaneLines==='on'&&x){const on=x.helper==='connected',n=x.now,side=(s,lb)=>tr(lb)+' '+(s?Math.abs(s.y).toFixed(2)+' m · '+tr(s.type)+' · '+tr(s.color)+' · '+tr('margin')+' '+s.margin.toFixed(2)+' m':'-');
   cv.text(tr('Lead-car helper')+': '+(on?tr('connected'):x.helper==='connecting'?tr('waiting'):tr('not installed (Store: Cluster Redline lead-car helper)'))+' · '+tr('received')+' '+f(x.rx)+' · '+tr('lines')+' '+f(x.lines)+' · '+tr('visibility')+' '+f(x.visibility),100,330,17,on&&x.rx?'#5ee08f':on?'#c1cddd':'#ffad45',{literal:true});
   cv.text(n?side(n.left,'Left')+'   '+side(n.right,'Right')+(n.width!==null?'   '+tr('lane width')+' '+n.width.toFixed(2)+' m':''):tr('no lane lines seen'),100,364,17,n?'#c1cddd':'#7f8b9a',{literal:true});}
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // Navigation display (1.3.36): in which drive modes the HUD shows route guidance, and the next turn under its arrow
 // (1.3.35, until then a row of its own in the Navigation tab).
 drawNavMode(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();},item=this.settings.schema.find(s=>s.key==='navDisplayMode');
  cv.text(t('Navigation display'),100,126,32,'#ef4050',{literal:true});
  const modes=options(item,cfg),w=Math.floor((1452-(modes.length-1)*14)/modes.length);
  modes.forEach((o,i)=>this.button(cv,local,t(o[1]),84+i*(w+14),146,w,64,()=>set('navDisplayMode',o[0]),cfg.navDisplayMode===o[0],'navmode-'+o[0]));
  cv.text(tr('Next turn on HUD'),100,282,28,'#f3f5f7',{literal:true});
  [['on','On'],['off','Off']].forEach((o,j)=>this.button(cv,local,tr(o[1]),820+j*366,240,352,64,()=>set('hudNavThen',o[0]),(cfg.hudNavThen==='off'?'off':'on')===o[0],'navthen-'+o[0]));
  cv.text(tr('When the turn after the next one follows within 250 m: under the HUD arrow, e.g. "Then 120 m".'),100,350,21,'#91a1b6',{literal:true});
  const p=this.liveState&&this.liveState.navProbe,n=p&&p.turns?p.turns.length:0;
  this.button(cv,local,tr('Received turns')+(n?' · '+n:''),84,448,700,64,()=>{this.open='navLog';this.choice=0;this.changed();},false,'navlog');
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // What the navigation sends (1.3.43, nav-probe.js): the last turns received, newest first, with the raw values of
 // each (as they came), its distance and description, and what the HUD drew; and the record to a file on / off.
 drawNavLog(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();},p=this.liveState&&this.liveState.navProbe;
  cv.text(tr('Received turns'),100,126,32,'#ef4050',{literal:true});
  cv.text(tr('Record to a file'),100,189,26,'#f3f5f7',{literal:true});
  [['on','On'],['off','Off']].forEach((o,j)=>this.button(cv,local,tr(o[1]),820+j*366,146,352,64,()=>set('navProbeLog',o[0]),(cfg.navProbeLog==='on'?'on':'off')===o[0],'navprobe-'+o[0]));
  const turns=p&&p.turns||[];
  if(!turns.length)cv.text(tr(p?'No turns received yet · start route guidance':'waiting for the background app'),100,270,22,'#91a1b6',{literal:true});
  turns.slice(0,6).forEach((e,i)=>{let line=navLogLine(e),size=18;while(size>13&&cv.textWidth(line,size,{literal:true})>1440)size--;
   while(cv.textWidth(line,size,{literal:true})>1440&&line.length>8)line=line.slice(0,-2);
   cv.text(line,96,262+i*31,size,i?'#c1cddd':'#f3f5f7',{literal:true});});
  // the route's turn list (1.3.67): how many turns it holds; one only (a phone sending just the next turn): no next turn
  {const r=p&&p.route,txt=r?tr('Route turn list')+': '+tr('last')+' '+r.last+' · '+tr('most')+' '+r.max+' · '+r.count+' '+tr('times')+(r.provider?' · '+r.provider:'')+(r.gap!==null?' · '+tr('1st to 2nd')+' '+r.gap+' m':'')+' · '+r.time+' → '+tr(r.max>=2?'next turns arrive':'only one turn: no next turn'):tr('Route turn list')+': '+tr('none received yet');
   cv.text(txt,100,452,18,r?(r.max>=2?'#5ee08f':'#ffad45'):'#91a1b6',{literal:true});}
  const status=tr('Newest first · the same turn again only updates its distance')+(p&&p.recording?' · nav-probe.log '+p.written+' '+tr('lines saved'):'')+(p&&p.error?' · '+p.error:'');
  cv.text(status,100,482,18,'#91a1b6',{literal:true});
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // Settings per driver (1.3.34): the setting itself, the greeting at the engine start and the goodbye when it is
 // switched off, each on / off; then whose settings are in use and what the greeting did last.
 drawDriver(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();},on=this.settings.get('driverProfiles')==='on';
  cv.text(tr('Settings per driver'),100,126,32,'#ef4050',{literal:true});
  [['driverProfiles',on?'on':'off','Settings per driver'],['greetHello',cfg.greetHello,'Greeting at the engine start'],['greetBye',cfg.greetBye,'Goodbye when the engine is switched off']].forEach(([key,now,label],i)=>{
   const y=146+i*84;cv.text(tr(label),100,y+43,28,on||!i?'#f3f5f7':'#7f8b9a',{literal:true});
   [['on','On'],['off','Off']].forEach((o,j)=>this.button(cv,local,tr(o[1]),820+j*366,y,352,64,()=>set(key,o[0]),now===o[0],key+'-'+o[0]));
  });
  cv.text(tr('The greeting and the goodbye need settings per driver on. On the HUD and the cluster, 5 s.'),100,420,20,'#91a1b6',{literal:true});
  cv.text(this.driverValue(),100,470,22,'#c1cddd',{literal:true});
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // The door-open warning: on / off, what it does, and Position / size of its HUD picture.
 drawDoor(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();};
  cv.text(tr('Door-open warning'),100,126,32,'#ef4050',{literal:true});
  [['on','On'],['off','Off']].forEach((o,i)=>this.button(cv,local,tr(o[1]),84+i*740,146,712,64,()=>set('hudDoorAlert',o[0]),cfg.hudDoorAlert===o[0],'door-'+o[0]));
  cv.text(tr('While a door, the hood or the trunk is open: the car on the HUD with what is open in red.'),100,262,24,'#c1cddd',{literal:true});
  cv.text(this.doorValue(cfg),100,300,22,'#91a1b6',{literal:true});
  // the hood and the trunk: the names found in the car's door status (or not), and what else it carries
  const d=this.liveState&&this.liveState.doors;
  if(d&&d.received){const l=d.lids||{},f=k=>l[k]?l[k]:tr('not found');
   cv.text(tr('Hood')+': '+f('hood')+' · '+tr('Trunk')+': '+f('trunk'),100,338,20,'#91a1b6',{literal:true});
   const names=(d.names||[]).join(', ');if(names)cv.text(tr('Also from the car')+': '+(names.length>150?names.slice(0,150)+'…':names),100,370,17,'#7f8b9a',{literal:true});}
  this.button(cv,local,tr('Position / size'),84,448,700,64,()=>{this.layoutKind='door';this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set(['Door']);this.setPreview(true);this.changed();},false,'door-layout');
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // HUD turn signals: on / off, shape, colour, and Position / size (both, left, right).
 drawTurn(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();};
  cv.text(tr('Turn signals on HUD'),100,126,32,'#ef4050',{literal:true});
  [['off','Off'],['on','On']].forEach((o,i)=>this.button(cv,local,tr(o[1]),84+i*740,146,712,64,()=>set('hudTurnSignals',o[0]),(cfg.hudTurnSignals===o[0]),'turn-'+o[0]));
  const {Canvas}=require('./kit/canvas'),draw=require('./turn-draw');
  D.TURN_STYLES.forEach((st,i)=>{const x=84+i*490;this.button(cv,local,tr(TURN_STYLE_LABELS[st]),x,222,464,86,()=>set('hudTurnStyle',st),cfg.hudTurnStyle===st,'turn-style-'+st);
   // the shape is painted only when the preview cache has no copy of it
   ['left','right'].forEach((side,n)=>cached(cv,'turn|'+st+'|'+cfg.hudTurnColor+'|'+side,x+16+n*386,250,36,30,(c,px,py)=>{const im=new Canvas(36,30);im.clear([0,0,0,0]);draw.paint(im,36,30,side,st,cfg.hudTurnColor);vector(c,px,py,1).blit(im,0,0);}));});
  Object.keys(D.TURN_COLORS).forEach((k,i)=>{const x=84+i*490;this.button(cv,local,tr(TURN_COLOR_LABELS[k]),x,320,464,64,()=>set('hudTurnColor',k),cfg.hudTurnColor===k,'turn-color-'+k);cv.fillRect(x+20,320+52,424,5,D.TURN_COLORS[k]);});
  cv.text(tr('Shown on the HUD whenever a turn signal or the hazards flash, even with the stock HUD.'),100,418,22,'#91a1b6',{literal:true});
  // the blind spot warning (the door mirror lamps, read from the car while the engine runs); its signs are placed in
  // the same Position / size as the arrows, as parts of their own
  [['on','Blind spot warning on'],['off','Blind spot warning off']].forEach((o,i)=>this.button(cv,local,tr(o[1]),820+i*366,392,352,48,()=>set('hudTurnBlindSpot',o[0]),cfg.hudTurnBlindSpot===o[0],'blind-'+o[0]));
  this.turnStatus().forEach((line,i)=>cv.text(line,804,474+i*28,20,'#8d97a4',{literal:true}));
  this.button(cv,local,tr('Position / size'),84,448,700,64,()=>{this.layoutKind='turn';this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set(['Turn']);this.setPreview(true);this.changed();},false,'turn-layout');
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // Navigation colours: the arrow (navColor, in app.json; also the recommended lanes) and the text (navTextColor,
 // kept outside app.json): orange, green, blue, white each, with a live preview of both.
 drawColors(cv,cfg,targets){
  const local=[],set=(k,v)=>{this.settings.set(k,v);this.changed();};
  [['navColor','Arrow colour',126,146],['navTextColor','Text colour',250,266]].forEach(([key,title,ty,by])=>{
   cv.text(tr(title),100,ty,28,'#ef4050',{literal:true});
   D.NAV_COLOR_NAMES.forEach((name,i)=>{const x=84+i*268;
    this.button(cv,local,tr(NAV_COLOR_LABELS[name]),x,by,256,62,()=>set(key,name),cfg[key]===name,key+'-'+name);
    cv.fillRect(x+20,by+50,216,5,D.NAV_COLORS[name]);});
  });
  // the arrow style (1.3.82, after the colours so their buttons keep their order): the icons from the user's sheet or the drawn arrows
  cv.text(tr('Arrow style'),1180,126,28,'#ef4050',{literal:true});
  [['icon','3D'],['drawn','Drawn arrows']].forEach(([v,l],i)=>this.button(cv,local,tr(l),1164,146+i*76,352,62,()=>set('navArrowStyle',v),cfg.navArrowStyle===v,'navArrowStyle-'+v));
  // preview: a right turn with its distance, and a road name, as the HUD draws them
  cv.roundRect(84,340,700,100,10,[0,0,0,170]);
  NAV.draw({visible:true,maneuver:'RIGHT',color:cfg.navColor,textColor:cfg.navTextColor,distanceText:'300 m',arrowStyle:cfg.navArrowStyle},vector(cv,104,342,0.86));
  cv.text(tr('Sample road'),560,402,30,D.NAV_COLORS[cfg.navTextColor]||'#f4f7fb',{font:'bold',align:'center',literal:true});
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 // Parts placed by their own rectangle (navigation, turn signals) rather than measured on the face.
 rectKind(){return this.tab===3||this.layoutKind==='turn'||this.layoutKind==='door'||this.layoutKind==='headway';}
 layoutParts(){return this.layoutKind==='headway'?D.HEADWAY_PARTS:this.layoutKind==='door'?D.DOOR_PARTS:this.layoutKind==='turn'?D.TURN_PARTS.concat(D.BLIND_PARTS):this.tab===3?D.NAV_LAYOUT_PARTS:D.partsFor(this.display(),this.config());}
 // Tell the renderer which part is being adjusted so hidden or unused parts are drawn while moving them.
 previewValue(){const p=this.layoutParts()[this.layoutPart];return p?(this.tab===3?'nav':this.display())+':'+p.key+'@'+Date.now():'';}
 // Refresh the marker only when the part changed or it is a minute old (it expires after two).
 previewRefresh(){const v=this.previewValue(),cur=String(this.settings.get('layoutPreview')||''),m=/^(.*)@(\d+)$/.exec(cur);return m&&v.indexOf(m[1]+'@')===0&&Date.now()-Number(m[2])<60000?{}:{layoutPreview:v};}
 setPreview(on){const v=on?this.previewValue():'';if(on||this.settings.get('layoutPreview'))this.settings.set('layoutPreview',v);}
 slotKey(i){return (this.tab===3?'nav':this.display())+'LayoutSlot'+i;}
 slot(i){try{const v=JSON.parse(this.settings.get(this.slotKey(i))||'null');return v&&v.values&&typeof v.values==='object'?v:null;}catch(e){return null;}}
 saveSlot(i){const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{values[k]=this.settings.get(k);});this.settings.set(this.slotKey(i),JSON.stringify({version:1,values}));this.presetMessage=tr('Saved to slot')+' '+i;this.changed();}
 loadSlot(i){const slot=this.slot(i);if(!slot){this.presetMessage=tr('Slot is empty');this.changed();return;}const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{const v=slot.values[k];if(v!==undefined&&typeof v===typeof defaultOf(this.settings.schema,k))values[k]=v;});Object.assign(values,this.previewRefresh());this.setValues(values);this.presetMessage=tr('Loaded slot')+' '+i;this.changed();}
 resetLayout(){if(!this.resetArmed){this.resetArmed=true;this.presetMessage=tr('Press again to reset to defaults');this.changed();return;}this.resetArmed=false;const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{values[k]=defaultOf(this.settings.schema,k);});Object.assign(values,this.previewRefresh());this.setValues(values);this.presetMessage=tr('Reset to defaults');this.changed();}
 drawPresets(cv,cfg,targets){
  const local=[],name=t(this.tab===3?'NAV display setting':this.tab===2?'CLUSTER display setting':'HUD display setting');
  cv.text(tr('Save / load positions')+' · '+name,100,126,32,'#ef4050',{literal:true});
  this.button(cv,local,tr(this.resetArmed?'Press again to reset':'Reset to defaults'),84,150,1452,64,()=>this.resetLayout(),!!this.resetArmed,'preset-reset');
  for(let i=1;i<=SLOT_COUNT;i++){const x=84+(i-1)*490,saved=!!this.slot(i);
   cv.text(tr('Slot')+' '+i+' · '+tr(saved?'Saved':'Empty'),x+8,262,24,saved?'#b8c5d4':'#6f7c8c',{literal:true});
   this.button(cv,local,tr('Save')+' '+i,x,276,464,64,()=>{this.resetArmed=false;this.saveSlot(i);},false,'preset-save'+i);
   this.button(cv,local,tr('Load')+' '+i,x,352,464,64,()=>{this.resetArmed=false;this.loadSlot(i);},false,'preset-load'+i);
  }
  if(this.presetMessage)cv.text(this.presetMessage,84,470,24,'#ffad45',{literal:true});
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }
 selectLayoutPart(index,only){
  const parts=this.layoutParts(),p=parts[index];if(!p)return;
  if(only)this.layoutSelected=new Set([p.key]);else if(this.layoutSelected.has(p.key))this.layoutSelected.delete(p.key);else this.layoutSelected.add(p.key);
  this.layoutPart=this.layoutSelected.has(p.key)?index:Math.max(0,parts.findIndex(v=>this.layoutSelected.has(v.key)));this.choice=index;const refresh=this.previewRefresh();if(refresh.layoutPreview!==undefined)this.settings.set('layoutPreview',refresh.layoutPreview);this.changed();
 }
 selectedLayoutParts(){return this.layoutParts().filter(p=>this.layoutSelected.has(p.key));}
 layoutPrefix(p){return this.rectKind()?p.prefix:this.display()+p.key;}
 // ---- Favourites (tab 5): register the whole setup, load it back, or look at it first.
 // Parsed once per stored text (the tab redraws twice a second; parsing and summarising five favourites each
 // frame cost ~5 ms).
 favorite(n){const raw=this.settings.get('favorite'+n)||'',c=(this.favCache||(this.favCache={}))[n];if(c&&c.raw===raw)return c.fav;
  let fav=null;try{const v=JSON.parse(raw||'null');fav=v&&v.values&&typeof v.values==='object'?v:null;}catch(e){fav=null;}
  this.favCache[n]={raw,fav};return fav;}
 favSay(n,text){this.favMessage={n,text,at:Date.now()};this.changed();}
 favAction(n,which){if(which===0)this.registerFavorite(n);else if(which===1)this.loadFavorite(n);else this.viewFavorite(n);}
 // Register keeps only values that differ from the defaults (a favourite is a few hundred bytes, not ~10 KB).
 // Over an existing favourite the first press arms, the second within 4 s overwrites.
 registerFavorite(n){
  const now=Date.now();
  if(this.favorite(n)&&!(this.favArmed&&this.favArmed.n===n&&now-this.favArmed.at<FAV_ARM)){this.favArmed={n,at:now};this.favSay(n,tr('Press Register again to overwrite'));return false;}
  this.favArmed=null;const schema=this.settings.schema,values={};
  favKeys(schema).forEach(k=>{const v=this.settings.get(k);if(v!==undefined&&v!==defaultOf(schema,k))values[k]=v;});
  this.settings.set('favorite'+n,JSON.stringify({version:1,savedAt:now,values}));this.favSay(n,tr('Registered'));return true;
 }
 // Load sets every key of the favourite (defaults for those it does not list) in one write, only the keys
 // that differ; nothing when already in use; at most once per FAV_GAP, so presses cannot pile up redraws.
 favValues(fav){const schema=this.settings.schema,out={};favKeys(schema).forEach(k=>{const v=fav.values[k];const d=defaultOf(schema,k);out[k]=v!==undefined&&(d===undefined||typeof v===typeof d)?v:d;});return out;}
 loadFavorite(n){
  const fav=this.favorite(n),now=Date.now();this.favArmed=null;
  if(!fav){this.favSay(n,tr('Favorite is empty'));return false;}
  if(this.lastFavLoad&&now>=this.lastFavLoad&&now-this.lastFavLoad<FAV_GAP){this.favSay(n,tr('Wait a moment, then press again'));return false;}
  const target=this.favValues(fav),changes={};Object.keys(target).forEach(k=>{if(target[k]!==undefined&&this.settings.get(k)!==target[k])changes[k]=target[k];});
  if(this.settings.get('layoutPreview'))changes.layoutPreview='';
  if(!Object.keys(changes).length){this.favSay(n,tr('Already in use'));return false;}
  this.lastFavLoad=now;this.setValues(changes);
  // BC mode (1.3.47): the page in step keeps its own cluster screen; the favourite's cluster design gives way to it
  // (the page count itself, bcIndex, is never in a favourite)
  if(this.bcFollow)try{this.bcFollow.show();}catch(e){}
  this.favSay(n,tr('Loaded'));return true;
 }
 viewFavorite(n){this.favArmed=null;if(!this.favorite(n)){this.favSay(n,tr('Favorite is empty'));return;}this.open='favView';this.favIndex=n;this.choice=0;this.changed();}
 // A read-only page over the favourite's values, so the same labels and formats as the tabs are used.
 favPage(fav){const values=this.favValues(fav),schema=this.settings.schema;return new SettingsPage({schema,get:k=>values[k]!==undefined?values[k]:this.settings.get(k),set:()=>{},setMany:()=>{}},null,'');}
 favSummary(fav){if(fav.summary&&fav.summaryLang===tr('Favorite'))return fav.summary;fav.summaryLang=tr('Favorite');return (fav.summary=this.favSummaryOf(fav));}
 favSummaryOf(fav){const p=this.favPage(fav),c=p.config(),name=d=>RL.active(c,d)?tr(RL.NAMES[RL.style(c,d)]):t(c[d+'AlertStyle']==='circle'?'Circle beside gear':'Top alert bar');
  return 'HUD '+name('hud')+' · '+tr('Cluster')+' '+name('cluster');}
 favWhen(fav){const d=new Date(fav.savedAt||0),z=v=>(v<10?'0':'')+v;return isFinite(d)?z(d.getMonth()+1)+'/'+z(d.getDate())+' '+z(d.getHours())+':'+z(d.getMinutes()):'';}
 drawFavorites(cv,targets){
  const h=80;let y=96;
  for(let n=1;n<=FAV_COUNT;n++){
   const fav=this.favorite(n),row=n-1,on=Math.floor(this.focus/3)===row;
   if(on){cv.gradientRect(78,y,1460,h-2,[[0,'#30131a'],[1,'#090b0e']]);cv.fillRect(78,y+10,4,h-22,'#f32b40');}
   cv.text(tr('Favorite')+' '+n,100,y+34,30,'#f3f5f7',{literal:true});
   let sub=fav?this.favSummary(fav)+'  ·  '+this.favWhen(fav):tr('Empty');let size=21;while(size>16&&cv.textWidth(sub,size)>800)size--;
   cv.text(sub,100,y+64,size,fav?'#b8c5d4':'#6f7c8c',{literal:true});
   const m=this.favMessage;if(m&&m.n===n&&Date.now()-m.at<4000)cv.text(m.text,920,y+34,22,'#ffad45',{align:'right',literal:true});
   [['Register',0],['Load',1],['Check settings',2]].forEach(([label,k])=>this.button(cv,targets,tr(label),940+k*200,y+12,188,h-24,()=>{this.focus=row*3+k;this.favAction(n,k);},!!(k===0&&this.favArmed&&this.favArmed.n===n),'fav-'+(row*3+k)));
   cv.line(84,y+h-1,1536,y+h-1,0.6,'#292d34');y+=h;
  }
 }
 drawFavoriteView(cv,targets){
  const fav=this.favorite(this.favIndex);if(!fav){this.open=null;this.drawFavorites(cv,targets);return;}
  const p=this.favPage(fav),c=p.config();p.tab=1;
  cv.text(tr('Favorite')+' '+this.favIndex+' · '+tr('Check settings'),84,128,32,'#ef4050',{literal:true});
  cv.text(tr('Registered at')+' '+this.favWhen(fav),1536,128,22,'#8d97a4',{align:'right',literal:true});
  const item=k=>k==='comfortShiftRpm'?COMFORT_ITEM:k==='clusterYieldGuidance'?YIELD_ITEM:['aux','design'].includes(k)?{key:k}:this.settings.schema.find(s=>s.key===k);
  const label=k=>tr(/^sport/.test(k)?'Sport mode RPM display':/^all/.test(k)?'All modes RPM display':ROW_LABELS[k]||{aux:'Auxiliary information',design:'Layout'}[k]||(item(k)||{}).label||k);
  const value=(k,d)=>{if(k==='design')return RL.active(c,d)?tr(RL.NAMES[RL.style(c,d)]):tr('Default design')+' · '+t(c[d+'AlertStyle']==='circle'?'Circle beside gear':'Top alert bar');
   try{return String(p.value(item(k),c));}catch(e){return '-';}};
  const cols=[['Basic settings',0,['engineProfile','powerUnit','torqueUnit','shiftRpm','comfortShiftRpm']],['HUD display setting',1,['sportHudOutput','allHudOutput','design','aux']],['CLUSTER display setting',2,['sportClusterOutput','allClusterOutput','design','aux']],['NAV display setting',3,['navDisplayMode','navColor','clusterYieldGuidance']]];
  const cw=356,gap=10,top=146,bottom=440;
  cols.forEach(([title,tab,keys],i)=>{
   const x=84+i*(cw+gap),d=tab===2?'cluster':'hud';p.tab=tab;cv.roundRect(x,top,cw,bottom-top,10,[18,22,28,215]);cv.text(t(title),x+16,top+32,24,'#f3f5f7',{font:'bold'});
   let y=top+66;
   keys.forEach(k=>{if(!item(k))return;const v=value(k,d),l=label(k);
    // label and value on one line when they fit; otherwise the label above and the value below (two lines at ' · ' / ' / ')
    if(cv.textWidth(l,17)+cv.textWidth(v,20)+28<=cw-32){cv.text(l,x+16,y,17,'#8d97a4',{literal:true});cv.text(v,x+cw-16,y,20,'#f3f5f7',{align:'right',literal:true});y+=34;return;}
    cv.text(l,x+16,y,17,'#8d97a4',{literal:true});y+=25;
    let size=20;const fit=s=>cv.textWidth(s,size)<=cw-32;
    if(fit(v)){cv.text(v,x+16,y,size,'#f3f5f7',{literal:true});y+=34;return;}
    const mid=Math.floor(v.length*0.6),cut=Math.max(v.lastIndexOf(' · ',mid),v.lastIndexOf(' / ',mid));
    const a=cut>0?v.slice(0,cut):v,b=cut>0?v.slice(cut+3):'';while(size>15&&!(fit(a)&&fit(b)))size--;
    cv.text(a,x+16,y,size,'#f3f5f7',{literal:true});if(b){y+=size+5;cv.text(b,x+16,y,size,'#f3f5f7',{literal:true});}y+=34;});
  });
  this.button(cv,targets,tr('Load'),84,454,360,54,()=>{this.choice=0;this.loadFavorite(this.favIndex);},false,'favview-0');
  this.button(cv,targets,t('Back'),460,454,240,54,()=>this.back(),false,'favview-1');
  const m=this.favMessage;if(m&&m.n===this.favIndex&&Date.now()-m.at<4000)cv.text(m.text,720,488,22,'#ffad45',{literal:true});
 }
 setValues(values){
  if(typeof this.settings.setMany==='function')this.settings.setMany(values);
  else Object.keys(values).forEach(key=>{if(this.settings.get(key)!==values[key])this.settings.set(key,values[key]);});
 }
 toggleHidden(line){
  const parts=this.selectedLayoutParts().filter(p=>!line||/^Mark/.test(p.key)),cfg=this.config(),suffix=line?'LineHidden':'Hidden';
  if(!parts.length)return;
  const show=parts.length&&parts.every(p=>cfg[this.layoutPrefix(p)+suffix]);
  const values=this.previewRefresh();parts.forEach(p=>{values[this.layoutPrefix(p)+suffix]=!show;});this.setValues(values);this.changed();
 }
 // Each design keeps its own Whole layout / element positions and sizes: switching saves the current
 // design's values under it (in <display>RlLayouts, outside app.json) and brings back the new design's,
 // or its defaults the first time. Returns the values to set.
 designSwitch(next,display){
  const d=display||this.display(),cur=this.config()[d+'Design']||'own',values={[d+'Design']:next};if(cur===next)return values;
  const keys=['RpmGauge'].concat(D.RL_PARTS).reduce((a,p)=>a.concat(['OffsetX','OffsetY','WidthScale','HeightScale','Hidden'].map(x=>d+p+x)),[]);
  let saved={};try{saved=JSON.parse(this.settings.get(d+'RlLayouts')||'{}')||{};}catch(e){saved={};}
  const now={};keys.forEach(k=>{const v=this.settings.get(k);if(v!==undefined&&v!==defaultOf(this.settings.schema,k))now[k]=v;});if(Object.keys(now).length)saved[cur]=now;else delete saved[cur];
  // Only values changed from the defaults are kept, so the saved list stays small however many designs are tried.
  Object.keys(saved).forEach(n=>{const o=saved[n]||{};Object.keys(o).forEach(k=>{if(o[k]===defaultOf(this.settings.schema,k))delete o[k];});if(!Object.keys(o).length)delete saved[n];});
  const back=saved[next]||{};keys.forEach(k=>{values[k]=back[k]!==undefined?back[k]:defaultOf(this.settings.schema,k);});
  values[d+'RlLayouts']=JSON.stringify(saved);return values;
 }
 // Add or remove the M mark on a Redline layout; added, it is selected so it can be moved straight away.
 toggleMMark(){const d=this.display(),on=!this.config()[d+'RlMarkHidden'],values=this.previewRefresh();values[d+'RlMarkHidden']=on;this.setValues(values);
  if(!on){const i=this.layoutParts().findIndex(p=>p.key==='RlMark');if(i>=0){this.layoutPart=i;this.layoutSelected=new Set(['RlMark']);}}this.changed();}
 adjust(param,delta){
  this.layoutParam=param;const cfg=this.config(),nav=this.rectKind(),parts=this.selectedLayoutParts();if(!parts.length)return;
  // Several parts (or All) resize as one picture: every part by the same factor, about the group's
  // centre, so their sizes and the gaps between them keep their proportions.
  if(!nav&&parts.length>1&&!parts.some(p=>p.uniform)&&param>=2){this.groupScale(cfg,parts,delta);return;}
  if(!nav&&(parts.length>1||parts.some(p=>p.uniform))&&param>=2){
   const values=parts.map(p=>{const prefix=this.layoutPrefix(p),w=cfg[prefix+'WidthScale'],h=cfg[prefix+'HeightScale'];return {prefix,w,h,lo:Math.max(20-w,20-h,Math.ceil((Math.max(w-1.3*h,h-1.3*w)/0.3-1e-7)/5)*5),hi:Math.min(200-w,200-h)};});
   const step=Math.max(...values.map(v=>v.lo),Math.min(delta*5,...values.map(v=>v.hi)));
   const changes=this.previewRefresh();values.forEach(v=>{changes[v.prefix+'WidthScale']=v.w+step;changes[v.prefix+'HeightScale']=v.h+step;});
   if(this.rlUnchanged(cfg,parts,changes))return;this.setValues(changes);this.changed();return;
  }
  const edits=parts.map(p=>{
   const prefix=this.layoutPrefix(p),key=param<2?prefix+(param?'OffsetY':'OffsetX'):nav?p.scale:prefix+(param===2?'WidthScale':'HeightScale');
   let lo=param<2?-1000:20,hi=param<2?1000:200;
   if(!nav&&param>=2){const other=cfg[prefix+(param===2?'HeightScale':'WidthScale')];lo=Math.max(lo,Math.ceil(other/1.3/5)*5);hi=Math.min(hi,Math.floor(other*1.3/5)*5);}
   return {key,value:cfg[key],lo,hi};
  });
  const step=Math.max(...edits.map(e=>e.lo-e.value),Math.min(delta*(param<2?10:5),...edits.map(e=>e.hi-e.value)));
  const changes=this.previewRefresh();edits.forEach(e=>{changes[e.key]=e.value+step;});
  // A Redline layout element held at the edge of the HUD does not keep counting offsets it cannot show,
  // so the way back (and every other direction) answers on the first press.
  // Pressing back from a stored overshoot skips the steps that would not move it.
  if(param<2&&!nav&&RL.active(cfg,this.display())&&step){
   const at=v=>{const c=Object.assign({},cfg);edits.forEach(e=>{c[e.key]=Math.max(e.lo,Math.min(e.hi,e.value+v));});return JSON.stringify(parts.map(p=>this.rlRect(c,p)));},now=at(0);
   let v=step,n=0;while(at(v)===now&&n<200&&edits.some(e=>e.value+v>e.lo&&e.value+v<e.hi)){v+=step;n++;}
   if(at(v)===now)return;edits.forEach(e=>{changes[e.key]=Math.max(e.lo,Math.min(e.hi,e.value+v));});
  }
  if(param>=2&&this.rlUnchanged(cfg,parts,changes))return;
  this.setValues(changes);this.changed();
 }
 // A Redline layout already as large as the HUD allows (or held at its edge) does not store a size it cannot show.
 rlUnchanged(cfg,parts,changes){if(this.rectKind()||!RL.active(cfg,this.display()))return false;const after=Object.assign({},cfg,changes);return JSON.stringify(parts.map(p=>this.rlRect(cfg,p)))===JSON.stringify(parts.map(p=>this.rlRect(after,p)));}
 partBase(cfg,p){
  const display=this.display();
  if(RL.active(cfg,display)){const e=RL.elements(cfg,display).find(v=>v.key===p.key);return e?RL.bounds({config:cfg,rpm:0,gear:'--',aux:{}},e.id,display):null;}
  const {Canvas}=require('./kit/canvas');let box=null;const noop=()=>{},text=new Canvas(1,1),painter=display==='hud'?HUD:CLUSTER;
  const cv={clear:noop,text:noop,line:noop,polyline:noop,quad:noop,arc:noop,fillRect:noop,roundRect:noop,blit:noop,gradientRect:noop,textWidth:(v,z,o)=>text.textWidth(v,z,o),part:(c,d,n,b)=>{if(d!==display||n!==p.key||!b)return;box=box?{x:Math.min(box.x,b.x),y:Math.min(box.y,b.y),w:Math.max(box.x+box.w,b.x+b.w)-Math.min(box.x,b.x),h:Math.max(box.y+box.h,b.y+b.h)-Math.min(box.y,b.y)}:Object.assign({},b);}};
  try{painter.draw({config:Object.assign({},cfg,{[display+p.key+'Hidden']:false}),rpm:0,gear:this.liveState&&this.liveState.gear||'--',aux:{}},cv);}catch(e){}
  return box;
 }
 groupScale(cfg,parts,delta){
  const items=parts.map(p=>{const prefix=this.layoutPrefix(p),b=this.partBase(cfg,p),w=cfg[prefix+'WidthScale']||100,h=cfg[prefix+'HeightScale']||100,ox=cfg[prefix+'OffsetX']||0,oy=cfg[prefix+'OffsetY']||0;
   return b&&{prefix,w,h,ox,oy,cx:b.x+b.w/2+ox,cy:b.y+b.h/2+oy};}).filter(Boolean);
  if(!items.length)return;
  const lead=items[0],x0=Math.min(...items.map(i=>i.cx)),x1=Math.max(...items.map(i=>i.cx)),y0=Math.min(...items.map(i=>i.cy)),y1=Math.max(...items.map(i=>i.cy)),C={x:(x0+x1)/2,y:(y0+y1)/2};
  const lo=Math.max(...items.map(i=>20/Math.min(i.w,i.h))),hi=Math.min(...items.map(i=>200/Math.max(i.w,i.h)));
  const f=Math.max(lo,Math.min(hi,(lead.w+5*delta)/lead.w));if(Math.abs(f-1)<1e-6)return;
  const changes=this.previewRefresh();
  items.forEach(i=>{changes[i.prefix+'WidthScale']=Math.max(20,Math.min(200,Math.round(i.w*f)));changes[i.prefix+'HeightScale']=Math.max(20,Math.min(200,Math.round(i.h*f)));
   changes[i.prefix+'OffsetX']=Math.max(-1000,Math.min(1000,Math.round(i.ox+(i.cx-C.x)*(f-1))));changes[i.prefix+'OffsetY']=Math.max(-1000,Math.min(1000,Math.round(i.oy+(i.cy-C.y)*(f-1))));});
  this.setValues(changes);this.changed();
 }
 selectAllParts(){const parts=this.layoutParts().filter(p=>!p.uniform),all=parts.every(p=>this.layoutSelected.has(p.key));
  this.layoutSelected=new Set(all?[parts[0].key]:parts.map(p=>p.key));this.layoutPart=Math.max(0,this.layoutParts().findIndex(p=>this.layoutSelected.has(p.key)));
  const refresh=this.previewRefresh();if(refresh.layoutPreview!==undefined)this.settings.set('layoutPreview',refresh.layoutPreview);this.changed();}
 rlRect(cfg,p){const display=this.display(),face=display==='hud'?placement(cfg,'hud',HUD):{x:0,y:0,w:CLUSTER.W,h:CLUSTER.H},layout=RL.rect(cfg,face,display);if(p.key==='RpmGauge')return layout;const shown=RL.placed({config:cfg,rpm:0,gear:'--',aux:{}},layout,display,face).find(v=>v.key===p.key);if(shown)return shown.r;const e=RL.elements(cfg,display).find(v=>v.key===p.key),b=e&&RL.bounds({config:cfg,rpm:0,gear:'--',aux:{}},e.id,display);return b?RL.clampTo(RL.partRect(cfg,layout,b,e.key,display),RL.room(face,display)):layout;}
 drawLayout(cv,cfg,targets){
  const local=[],nav=this.rectKind(),turn=this.layoutKind==='turn'||this.layoutKind==='door'||this.layoutKind==='headway',display=this.display(),parts=this.layoutParts();this.layoutPart=Math.min(this.layoutPart,parts.length-1);
  // Five columns, or six when a layout has many elements (two rows with Save / load in the last cell).
  const columns=parts.length>=10?6:5,cell=columns===6?243:292;
  parts.forEach((p,i)=>this.button(cv,local,tr(p.label),84+(i%columns)*cell,96+Math.floor(i/columns)*62,cell-14,56,()=>this.selectLayoutPart(i),this.layoutSelected.has(p.key),'part'+i));
  const allButton=!nav&&!RL.active(cfg,display),allCell=parts.length;
  if(allButton){const sel=parts.every(p=>this.layoutSelected.has(p.key));this.button(cv,local,tr('All'),84+(allCell%columns)*cell,96+Math.floor(allCell/columns)*62,cell-14,56,()=>this.selectAllParts(),sel,'part-all');}
  const presetCell=parts.length+(allButton?1:0)<=columns-1?columns-1:2*columns-1;
  if(!turn)this.button(cv,local,tr('Save / load'),84+(presetCell%columns)*cell,96+Math.floor(presetCell/columns)*62,cell-14,56,()=>{this.open='layoutPresets';this.choice=0;this.resetArmed=false;this.presetMessage='';this.changed();},false,'presets');
  const selected=parts[this.layoutPart],prefix=this.layoutPrefix(selected),group=this.selectedLayoutParts();
  cv.text('Position',100,241,28,'#b8c5d4');
  const btn=(label,x,y,act,id)=>this.button(cv,local,label,x,y,110,56,act,false,id);
  btn('Up',300,246,()=>this.adjust(1,-1),'up');btn('Left',170,307,()=>this.adjust(0,-1),'left');btn('Right',430,307,()=>this.adjust(0,1),'right');btn('Down',300,368,()=>this.adjust(1,1),'down');
  const uniform=group.some(p=>p.uniform),rows=nav||group.length>1||uniform?['Size']:['Width','Height'];rows.forEach((label,i)=>{
   const y=240+i*84,key=nav?selected.scale:prefix+(i?'HeightScale':'WidthScale');
   cv.text(label,790,y+20,28,'#b8c5d4');btn('−',1010,y+26,()=>this.adjust(i+2,-1),'size-minus'+i);btn('+',1140,y+26,()=>this.adjust(i+2,1),'size-plus'+i);cv.text(!nav&&group.length>1&&!uniform?cfg[prefix+'WidthScale']+' × '+cfg[prefix+'HeightScale']+' %':String(cfg[key])+' %',1500,y+67,30,'#f3f5f7',{align:'right',font:'num'});
  });
  let width,height;
  if(this.layoutKind==='door'){const rect=D.doorRect(cfg);width=rect.w;height=rect.h;}
  else if(this.layoutKind==='headway'){const rect=D.headwayRect(cfg);width=rect.w;height=rect.h;}
  else if(turn&&/^Blind/.test(selected.key)){const rect=D.blindRect(cfg,selected.key==='BlindRight'?'right':'left');width=rect.w;height=rect.h;}
  else if(turn){const rect=D.turnRect(cfg,selected.key==='TurnRight'?'right':'left');width=rect.w;height=rect.h;}
  else if(nav){const rect=D.navRect(cfg,selected.key);width=rect.w;height=rect.h;}
  else if(RL.active(cfg,display)){const face=display==='hud'?placement(cfg,'hud',HUD):{x:0,y:0,w:CLUSTER.W,h:CLUSTER.H},layout=RL.rect(cfg,face,display),e=RL.elements(cfg,display).find(v=>v.key===selected.key),b=e&&RL.bounds({config:cfg,rpm:0,gear:'--',aux:{}},e.id,display),r=b?RL.clampTo(RL.partRect(cfg,layout,b,e.key,display),RL.room(face,display)):layout;width=r.w;height=r.h;}
  else{const painter=display==='hud'?HUD:CLUSTER,b=measurePart(painter,{config:cfg,rpm:0,gear:this.liveState&&this.liveState.gear||'--'},display,selected.key,cv)||{w:0,h:0},r=placement(cfg,display==='hud'?'hud':cfg.displayTarget==='panel'?'panel':'map',painter);width=Math.round(b.w*cfg[prefix+'WidthScale']/100*r.w/painter.W);height=Math.round(b.h*cfg[prefix+'HeightScale']/100*r.h/painter.H);}
  cv.text(group.length?group.length+' '+t('selected')+' · '+tr(selected.label):t('Select items to adjust'),84,456,21,'#b8c5d4',{literal:true});
  cv.text(group.length?'X '+cfg[prefix+'OffsetX']+' · Y '+cfg[prefix+'OffsetY']+' · '+width+' × '+height+' px':'',84,500,21,'#ffad45',{literal:true});
  cv.text(nav||uniform?'Width and height scale together.':'Width / height difference limited to 30%.',790,432,18,'#a8b6c8');
  // My picture: whether each of its three GIFs is read (my-picture.js), what is wrong with one that is not
  if(!nav&&RL.style(cfg,display)==='car'){const MP=require('./my-picture');MP.scan(Date.now());const why={missing:'missing',too_large:'too large',too_big:'too big'};
   const SC={stop:'Standing still',drive:'Driving',reverse:'Reverse',left:'Turning left',right:'Turning right'},line=MP.status().map(s=>tr(SC[s.name])+' '+(s.ok?s.w+'×'+s.h+' '+s.frames+' '+tr('frames'):s.uses==='drive'?tr('Uses the driving GIF'):tr(why[s.error]||'unreadable'))).join(' · ');
   cv.text(tr('My GIFs')+': '+line,790,500,17,'#ffad45',{literal:true});}
  const hidden=group.length&&group.every(p=>cfg[this.layoutPrefix(p)+'Hidden']);
  const marks=!nav&&group.some(p=>/^Mark/.test(p.key));
  const mMark=!nav&&parts.some(p=>p.key==='RlMark'),markOn=mMark&&!cfg[display+'RlMarkHidden'];
  this.button(cv,local,hidden?'Show selected':'Hide selected',650,448,marks||mMark?260:540,56,()=>this.toggleHidden(false),hidden,'toggle-Hidden');
  if(mMark)this.button(cv,local,tr(markOn?'Remove M mark':'Add M mark'),930,448,260,56,()=>this.toggleMMark(),markOn,'toggle-MMark');  if(marks){const list=group.filter(p=>/^Mark/.test(p.key)),lines=list.every(p=>cfg[this.layoutPrefix(p)+'LineHidden']);this.button(cv,local,lines?'Show line':'Hide line',930,448,260,56,()=>this.toggleHidden(true),lines,'toggle-LineHidden');}
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }

}
module.exports={favKeys,driverKeys,SettingsPage,GROUPS,TABS,options,W,H,MAP_WARNING,HUD_WARNING,RENDERER_NOTICE,WARNING:MAP_WARNING};
