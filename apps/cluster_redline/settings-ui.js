'use strict';
const {t}=require('./kit/i18n'),G=require('./kit/gauges'),{header}=require('./settings-chrome');
require('./crisp-text');
const {tr}=require('./strings');
const {settings:effective,PROFILES,DEFAULTS}=require('./policy');
const D=require('./display-config'),RL=require('./redline-hud'),HUD=require('./hud-draw'),CLUSTER=require('./draw'),NAV=require('./nav-draw');
const {measurePart}=require('./component-canvas'),{placement}=require('./layout'),NAV_TEXT=require('./nav-text');
const W=1600,H=520,TABS=['Basic settings','HUD display setting','CLUSTER display setting','NAV display setting','Load'],LOAD_TAB=4;
const GROUPS=[['autoStart','appEnabled','engineProfile','powerUnit','torqueUnit','shiftRpm','comfortShiftRpm'],['sportHudOutput','allHudOutput','aux','design','layout'],['sportClusterOutput','allClusterOutput','aux','design','layout'],['navDisplayMode','navColor','clusterYieldGuidance','layout']];
const RENDERER_NOTICE='Install Cluster renderer (cluster-render) from MGU Store first.';
const MAP_WARNING='Set Central display area to Map view or Off. Assist or route preview may cover the widget.';
const HUD_WARNING='HUD navigation shows received turn guidance; unavailable data preserves stock guidance.';
// Keys saved, loaded and reset by the position/size presets of each tab.
const RL_KEYS=Object.keys(DEFAULTS).filter(k=>/^(hud|cluster)Rl/.test(k)),defaultOf=(schema,k)=>{const d=schema.find(s=>s.key===k);return d&&d.default!==undefined?d.default:DEFAULTS[k];};
const SLOT_COUNT=3,SCOPES=['hud','cluster','nav'],SCOPE_TAB={hud:1,cluster:2,nav:3},LOAD_GAP=1500,FACE_KEY=/^(hud|cluster)(RpmGauge|Gear|Alert|AuxLeft|AuxRight|RpmValue|Mark|MarkTop|MarkBottom|Aux|RlGear|RlMode|RlAlert|RlRpm|RlGauge|RlGMeter|RlTemp|RlRead|RlReadA|RlReadB|RlReadC|RlReadD|RlMark)(OffsetX|OffsetY|WidthScale|HeightScale|Hidden|LineHidden)$/;
const NAV_KEYS=['hudNavOffsetX','hudNavOffsetY','navUniformScale','hudNavWidthScale','hudNavHeightScale','hudTextOffsetX','hudTextOffsetY','hudTextScale','hudLanesOffsetX','hudLanesOffsetY','hudLanesScale','hudNavHidden','hudTextHidden','hudLanesHidden'];
function layoutKeys(tab,schema){
 const name=tab===3?'nav':tab===2?'cluster':'hud',known=new Set(schema.map(s=>s.key));
 const keys=name==='nav'?NAV_KEYS:Object.keys(DEFAULTS).filter(k=>{const m=FACE_KEY.exec(k);return m&&m[1]===name;}).concat([name+'OffsetX',name+'OffsetY',name+'WidthScale',name+'HeightScale'],name==='hud'?['hudAuxTextOffsetY']:[]);
 // Redline layout elements are kept outside the schema (like hudDesign).
 return keys.filter((k,i,a)=>(known.has(k)||/^(hud|cluster)Rl/.test(k))&&a.indexOf(k)===i);
}
// Comfort / Eco shift alert RPM: kept outside app.json (like clockZone) so the Store templates stay valid.
// The two shift alert rows are named for the modes they apply to (Shift alert RPM keeps its app.json key).
const ROW_LABELS={shiftRpm:'Shift alert RPM · Sport',comfortShiftRpm:'Shift alert RPM · Comfort / Eco'};
const YIELD_ITEM={key:'clusterYieldGuidance',label:'Cluster · yield to navigation',type:'choice',options:[['off',tr('Do not yield')],['phone',tr('Yield during Waze guidance · all modes')],['nosport',tr('Yield during Waze guidance · except Sport')]]};
const COMFORT_ITEM={key:'comfortShiftRpm',label:'Shift alert RPM · Comfort / Eco',type:'choice',options:[[0,tr('Automatic (90 % of Sport)')]].concat([2000,2250,2500,2750,3000,3250,3500,4000,4500,5000].map(v=>[v,v+' rpm']))};
function options(item,cfg){
 if(!item)return [];
 if(item.type==='bool')return [[false,'Off'],[true,'On']];
 if(item.type==='choice')return item.options||[];
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
 return {text:(v,a,b,z,c,o)=>cv.text(v,x+a*s,y+b*s,z*s,c,o),textWidth:(v,z,o)=>cv.textWidth(v,z*s,o)/s,
  line:(a,b,c,d,w,k)=>cv.line(x+a*s,y+b*s,x+c*s,y+d*s,w*s,k),polyline:(p,w,c)=>cv.polyline(p.map(v=>[x+v[0]*s,y+v[1]*s]),w*s,c),
  quad:(p,c)=>cv.quad(p.map(v=>[x+v[0]*s,y+v[1]*s]),c),arc:(a,b,r0,r1,f,l,c)=>cv.arc(x+a*s,y+b*s,r0*s,r1*s,f,l,c),
  fillRect:(a,b,w,h,c)=>cv.fillRect(x+a*s,y+b*s,w*s,h*s,c),roundRect:(a,b,w,h,r,c)=>cv.roundRect(x+a*s,y+b*s,w*s,h*s,r*s,c),
  // an image as rectangles: each run of same-colour pixels in a row is one rectangle, not one per pixel
  blit:(im,a,b)=>{const D=new Uint32Array(im.d.buffer,im.d.byteOffset,im.d.length>>2);for(let row=0;row<im.h;row++){let col=0;while(col<im.w){const v=D[row*im.w+col];let end=col+1;while(end<im.w&&D[row*im.w+end]===v)end++;
   if(v>>>24){const p=(row*im.w+col)*4;cv.fillRect(x+(a+col)*s,y+(b+row)*s,(end-col)*s,s,[im.d[p],im.d[p+1],im.d[p+2],im.d[p+3]]);}col=end;}}}};
}
class SettingsPage{
 constructor(settings,changed,version){this.settings=settings;this.changed=changed||(()=>{});this.version=version;this.tab=0;this.focus=0;this.open=null;this.choice=0;this.layoutPart=0;this.layoutParam=0;this.draft=null;this.layoutActions=[];this.layoutSelected=new Set();}
 config(){const raw={};this.settings.schema.forEach(s=>{raw[s.key]=this.settings.get(s.key);});['clockZone','layoutPreview','hudDesign','clusterDesign','comfortShiftRpm','clusterYieldGuidance'].concat(RL_KEYS).forEach(k=>{if(raw[k]===undefined)raw[k]=this.settings.get(k);});return effective(raw);}
 display(){return this.tab===2?'cluster':'hud';}
 keys(){return this.tab===LOAD_TAB?this.loadEntries().map(e=>'load-'+e.scope+'-'+e.i):GROUPS[this.tab];}
 item(){const key=this.keys()[this.focus];if(key==='comfortShiftRpm')return COMFORT_ITEM;if(key==='clusterYieldGuidance')return YIELD_ITEM;if(['aux','design','layout'].includes(key))return {key,label:{aux:'Auxiliary information',design:'Design',layout:'Position / size'}[key],type:'action'};return this.settings.schema.find(s=>s.key===key);}
 selectTab(i){this.tab=Math.max(0,Math.min(LOAD_TAB,i|0));this.focus=0;this.open=null;this.draft=null;this.choice=0;this.changed();}
 // The settings screen left without Back (Home, another app, screen off): end Position / size so its
 // preview never stays on the HUD or cluster.
 leave(){if(this.open==='layout'||this.open==='layoutPresets'){this.setPreview(false);this.open=null;this.draft=null;this.resetArmed=false;this.presetMessage='';this.choice=0;this.changed();}else if(this.settings.get('layoutPreview'))this.setPreview(false);}
 back(){
  if(this.open==='rlDesign'){this.open='design';this.choice=2;}
  else if(this.open==='auxSelect'){this.open='auxMode';this.draft=null;this.choice=0;}
  else if(this.open==='layoutPresets'){this.open='layout';this.choice=0;this.presetMessage='';}
  else{if(this.open==='layout')this.setPreview(false);this.open=null;this.draft=null;}
  this.changed();
 }
 move(delta){
  if(!this.open){const n=this.keys().length;this.focus=n?(this.focus+delta+n)%n:0;}
  else{const n=this.open==='layout'||this.open==='layoutPresets'?this.layoutActions.length:this.open==='auxMode'?2:this.open==='design'?3:this.open==='rlDesign'?RL.stylesFor(this.display()).length:this.open==='auxSelect'?D.METRICS.length+1+(this.draft&&this.draft.items.includes('clock')?1:0):options(this.item(),this.config()).length;this.choice=(this.choice+delta+Math.max(1,n))%Math.max(1,n);}
  this.changed();
 }
 value(item,cfg){
  if(item.key==='aux'){const a=D.auxConfig(cfg[this.display()+'AuxConfig']);return t(a.mode==='values'?'Text':'Gauges')+' · '+a.items.map(k=>tr(D.LABELS[k])).join(' / ');}
  if(item.key==='design'){const d=this.display();if(RL.active(cfg,d))return tr('Redline app layouts')+' · '+tr(RL.NAMES[RL.style(cfg,d)]);return t(cfg[this.display()+'AlertStyle']==='circle'?'Circle beside gear':'Top alert bar');}
  if(item.key==='layout')return t('Adjust');
  if(item.key==='appEnabled')return t(cfg.appEnabled?'Running':'Stopped');
  if(item.key==='shiftRpm'&&!this.settings.get(item.key))return cfg.shiftRpm+' rpm';
  if(item.key==='comfortShiftRpm')return cfg.comfortShiftRpm?cfg.comfortShiftRpm+' rpm':tr('Automatic')+' · '+Math.round(cfg.shiftRpm*0.9/100)*100+' rpm';
  const selected=options(item,cfg).find(o=>o[0]===(item.key==='clusterYieldGuidance'?cfg.clusterYieldGuidance:this.settings.get(item.key)));return selected?t(selected[1]):t('Check required');
 }
 change(delta){if(this.tab===LOAD_TAB&&!this.open)return;if(this.open==='layoutPresets')return;if(this.open==='layout'){this.adjust(this.layoutParam,delta);return;}const item=this.item(),list=options(item,this.config());if(!list.length){this.activate();return;}const at=list.findIndex(o=>o[0]===this.settings.get(item.key));this.settings.set(item.key,list[(at+delta+list.length)%list.length][0]);this.changed();}
 activate(index){
  if(index!==undefined)this.focus=index;
  if(this.tab===LOAD_TAB&&!this.open){const e=this.loadEntries()[this.focus];if(e)this.loadEntry(e.scope,e.i);return;}
  const item=this.item();if(!item)return;
  this.choice=0;
  if(item.key==='aux')this.open='auxMode';
  else if(item.key==='design'){this.open='design';this.choice=RL.active(this.config(),this.display())?2:this.config()[this.display()+'AlertStyle']==='circle'?1:0;}
  else if(item.key==='layout'){this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set([this.layoutParts()[0].key]);this.setPreview(true);}
  else if(item.type==='bool'){this.change(1);return;}
  else{this.open=item.key;this.choice=Math.max(0,options(item,this.config()).findIndex(o=>o[0]===this.settings.get(item.key)));}
  this.changed();
 }
 choose(index){
  if(this.open==='layout'||this.open==='layoutPresets'){const a=this.layoutActions[index];if(a)a.act();return;}
  if(this.open==='auxMode'){this.draft={mode:index===1?'values':'gauges',items:[]};this.open='auxSelect';this.choice=0;this.changed();return;}
  if(this.open==='auxSelect'){if(index===D.METRICS.length)this.commitAux();else if(index===D.METRICS.length+1)this.toggleClockZone();else this.toggleMetric(D.METRICS[index]);return;}
  if(this.open==='design'){
   if(index===2){this.open='rlDesign';this.choice=Math.max(0,RL.stylesFor(this.display()).indexOf(RL.style(this.config(),this.display())));this.changed();return;}
   const values=this.designSwitch('own');values[this.display()+'AlertStyle']=index===1?'circle':'bar';this.setValues(values);this.open=null;this.changed();return;}
  if(this.open==='rlDesign'){const st=RL.stylesFor(this.display())[index];if(st){this.setValues(this.designSwitch('rl-'+st));this.open=null;this.changed();}return;}
  const list=options(this.item(),this.config());if(!list[index])return;
  this.settings.set(this.item().key,list[index][0]);if(this.item().key==='navDisplayMode')this.settings.set('hudNavigationEnabled',true);this.open=null;this.changed();
 }
 toggleClockZone(){this.settings.set('clockZone',this.config().clockZone==='utc9'?'auto':'utc9');this.changed();}
 toggleMetric(id){if(!this.draft||!D.METRICS.includes(id)||this.draft.mode!=='gauges'&&D.GAUGE_ONLY.includes(id))return;const a=this.draft.items,i=a.indexOf(id);if(i>=0)a.splice(i,1);else if(a.length<(this.draft.mode==='gauges'?2:4))a.push(id);this.changed();}
 commitAux(){if(!this.draft||!this.draft.items.length)return;this.settings.set(this.display()+'AuxConfig',JSON.stringify(this.draft));this.open=null;this.draft=null;this.changed();}
 button(cv,targets,label,x,y,w,h,act,on,id){
  const layoutFocus=(this.open==='layout'||this.open==='layoutPresets')&&targets.length===this.choice,focused=layoutFocus&&!/^part/.test(id||'')||this.open==='auxSelect'&&(id==='metric-'+D.METRICS[this.choice]||id==='ok'&&this.choice===D.METRICS.length||id==='clock-zone'&&this.choice===D.METRICS.length+1)||this.open==='rlDesign'&&id==='rl-'+RL.stylesFor(this.display())[this.choice]||this.open==='design'&&id==='design'+this.choice;
  // On the design pickers the fill marks the design in use and a white outline the cursor; elsewhere the cursor fills.
  const picker=(this.open==='design'||this.open==='rlDesign')&&focused;
  cv.roundRect(x,y,w,h,6,on||focused&&!picker?'#57202d':'#252a31');if(picker)cv.polyline([[x+2,y+2],[x+w-2,y+2],[x+w-2,y+h-2],[x+2,y+h-2],[x+2,y+2]],3,'#f3f5f7');if(layoutFocus&&/^part/.test(id||'')&&!on)cv.polyline([[x+2,y+2],[x+w-2,y+2],[x+w-2,y+h-2],[x+2,y+h-2],[x+2,y+2]],2,'#9bacc4');let size=30;while(size>18&&cv.textWidth(t(label),size)>w-24)size--;
  if(label==='−'||label==='+'){cv.line(x+w/2-17,y+h/2,x+w/2+17,y+h/2,3,'#f3f5f7');if(label==='+')cv.line(x+w/2,y+h/2-17,x+w/2,y+h/2+17,3,'#f3f5f7');}
  else cv.text(label,x+w/2,y+h/2+size*0.36,size,'#f3f5f7',{align:'center',font:'bold'});targets.push({x,y,w,h,act,label,id:id||label});
 }
 draw(cv,status,liveState){
  this.liveState=liveState||null;
  const cfg=this.config(),targets=[],theme={bg:'#090b0e',text:'#f3f5f7',dim:'#8d97a4',sel:'#f32b40',accent:'#f32b40'};cv.clear(theme.bg);require('./settings-bg').paint(cv,W,H);
  const badges=this.version?[{text:'v'+this.version,color:'#8d97a4'}]:[];
  // 'Load' is not in the kit's own catalogue: its Korean comes from strings.js.
  const tabs=TABS.map(x=>x==='Load'?tr('Load'):x);
  if(cv.chrome)G.frame(cv,theme,tabs,this.tab,badges);else{header(cv,theme,0,0,W,80,'Cluster Redline',tabs,this.tab,badges,true,false);(cv.tabRects||[]).forEach(r=>targets.push(Object.assign({},r,{act:()=>this.selectTab(r.i),label:TABS[r.i],id:'tab'+r.i})));}
  if(this.open==='layout')this.drawLayout(cv,cfg,targets);
  else if(this.open==='layoutPresets')this.drawPresets(cv,cfg,targets);
  else if(this.open==='auxMode')this.drawAuxMode(cv,cfg,targets);
  else if(this.open==='auxSelect')this.drawAuxSelect(cv,cfg,targets);
  else if(this.open==='design')this.drawDesign(cv,cfg,targets);
  else if(this.open==='rlDesign')this.drawRedlineDesigns(cv,cfg,targets);
  else if(this.open==='navColor')this.drawColors(cv,cfg,targets);
  else if(this.open)this.drawChoices(cv,cfg,targets);
  else if(this.tab===LOAD_TAB)this.drawLoad(cv,cfg,targets);
  else this.drawRows(cv,cfg,targets,status);
  cv.targets=targets.map((r,i)=>Object.assign({key:this.tab+':'+(this.open||'rows')+':'+i,run:r.act},r));return cv;
 }
 drawRows(cv,cfg,targets,status){
  let y=100;
  this.keys().forEach((key,i)=>{
   const item=key==='comfortShiftRpm'?COMFORT_ITEM:key==='clusterYieldGuidance'?YIELD_ITEM:['aux','design','layout'].includes(key)?{key,label:{aux:'Auxiliary information',design:'Design',layout:'Position / size'}[key]}:this.settings.schema.find(s=>s.key===key);
   const h=this.tab===0?(key==='autoStart'?108:50):68,ty=h===50?35:39;
   if(i===this.focus){cv.gradientRect(78,y,1460,h-1,[[0,'#30131a'],[1,'#090b0e']]);cv.fillRect(78,y+(h===50?6:8),4,h===50?37:42,'#f32b40');}
   const label=/^sport/.test(key)?'Sport mode RPM display':/^all/.test(key)?'All modes RPM display':ROW_LABELS[key]||item.label;
   cv.text(tr(label),100,y+ty,32,'#f3f5f7');
   if(key==='appEnabled'){
    [[true,'Start app'],[false,'Stop app']].forEach((v,n)=>this.button(cv,targets,v[1],990+n*278,y+3,260,h===50?44:50,()=>{this.settings.set(key,v[0]);this.changed();},cfg.appEnabled===v[0],'operation-'+v[0]));
   }else{
    let size=30,value=this.value(item,cfg);while(size>18&&cv.textWidth(value,size)>850)size--;
    cv.text(value,1480,y+ty,size,'#c1cddd',{align:'right'});targets.push({x:78,y,w:1460,h:h-1,act:()=>this.activate(i),label,id:key});
   }
   if(key==='autoStart'){cv.text(RENDERER_NOTICE,100,y+72,24,'#ff9e36');cv.text(cfg.sportHudOutput==='redline'||cfg.allHudOutput==='redline'?HUD_WARNING:MAP_WARNING,100,y+101,23,'#ff9e36');}
   cv.line(84,y+h-1,1536,y+h-1,0.6,'#292d34');y+=h;
  });
  if(this.tab===1||this.tab===2){cv.text('All modes Redline also applies in Sport.',84,492,23,'#91a1b6');const o=this.outsideStatus(cfg);if(o)cv.text(o,84,462,22,'#ffad45',{literal:true});}
  if(this.tab===3){const y=this.yieldStatus(cfg);if(y)cv.text(y,84,462,22,'#ffad45',{literal:true});}
  // Cafe watermark in the free bottom-right corner of the HUD, cluster and navigation tabs (not on Basic: its rows fill the screen).
  if(this.tab>0)require('./settings-bg').mark(cv,W,H);
  if(this.tab===3){cv.text(HUD_WARNING,84,390,25,'#91a1b6');cv.text(tr('Yield: while phone (Waze) or chosen route guidance runs, the cluster RPM display steps aside for the stock map.'),84,426,25,'#91a1b6');}
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
  ['Gauges','Text'].forEach((name,i)=>this.button(cv,targets,name,84+i*740,180,712,110,()=>this.choose(i),this.choice===i,'aux-mode'+i));
  cv.text('Select items on the next screen. Changes apply only after OK.',100,360,26,'#a8b6c8');this.backButton(cv,targets);
 }
 drawAuxSelect(cv,cfg,targets){
  const draft=this.draft,limit=draft.mode==='gauges'?2:4;cv.text(t(draft.mode==='gauges'?'Select gauges':'Select text items')+' (1–'+limit+')',100,128,32,'#ef4050',{literal:true});
  D.METRICS.forEach((id,i)=>{const index=draft.items.indexOf(id),x=84+(i%4)*369,y=152+Math.floor(i/4)*80,blocked=draft.mode!=='gauges'&&D.GAUGE_ONLY.includes(id);
   this.button(cv,targets,blocked?tr(D.LABELS[id])+' · '+tr('Gauges only'):(index>=0?(index+1)+'. ':'')+tr(D.LABELS[id]),x,y,343,70,()=>this.toggleMetric(id),index>=0,'metric-'+id);
  });
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
  RL.stylesFor(this.display()).forEach((st,i)=>{const x=84+(i%4)*366,y=138+Math.floor(i/4)*80,on=st===current,k=Math.min(200/RL.IW,52/RL.heightOf(st));
   this.button(cv,targets,'',x,y,354,76,()=>this.choose(i),on,'rl-'+st);
   sample[d+'Design']='rl-'+st;const shown=Object.assign({},state,{config:Object.assign({},sample),aux:Object.assign({gLat:0.3,gLong:-0.25,gforce:0.39},state.aux)});
   cached(cv,'rl|'+d+'|'+st+'|'+require('./strings').language()+'|'+JSON.stringify(shown.config),x+8,y+4,RL.IW*k+2,RL.heightOf(st)*k+2,(c,px,py)=>RL.paint(c,shown,k,px,py,0,d));
   cv.text(tr(RL.NAMES[st]),x+346,y+70,17,on?'#ffffff':'#b8c5d4',{align:'right',literal:true});
  });
  cv.text(tr('Redline app layouts (appsKOR, MIT) and Cluster Redline layouts. Navigation, lanes and auxiliary items stay as set.'),84,476,20,'#a8b6c8',{literal:true});
  this.backButton(cv,targets);
 }
 drawColors(cv,cfg,targets){
  [['gray','Gray'],['white','White'],['blue','Blue']].forEach((o,i)=>{
   const x=84+i*490;this.button(cv,targets,o[1],x,112,464,70,()=>this.choose(i),this.choice===i,'color'+i);
   NAV.draw({visible:true,maneuver:'RIGHT',color:o[0],distanceText:'300 m'},vector(cv,x+75,225,1.25));
  });this.backButton(cv,targets);
 }
 layoutParts(){return this.tab===3?D.NAV_PARTS:D.partsFor(this.display(),this.config());}
 // Tell the renderer which part is being adjusted so hidden or unused parts are drawn while moving them.
 previewValue(){const p=this.layoutParts()[this.layoutPart];return p?(this.tab===3?'nav':this.display())+':'+p.key+'@'+Date.now():'';}
 // Refresh the marker only when the part changed or it is a minute old (it expires after two).
 previewRefresh(){const v=this.previewValue(),cur=String(this.settings.get('layoutPreview')||''),m=/^(.*)@(\d+)$/.exec(cur);return m&&v.indexOf(m[1]+'@')===0&&Date.now()-Number(m[2])<60000?{}:{layoutPreview:v};}
 setPreview(on){const v=on?this.previewValue():'';if(on||this.settings.get('layoutPreview'))this.settings.set('layoutPreview',v);}
 scope(){return this.tab===3?'nav':this.display();}
 slotKey(i,scope){return (scope||this.scope())+'LayoutSlot'+i;}
 slot(i,scope){try{const v=JSON.parse(this.settings.get(this.slotKey(i,scope))||'null');return v&&v.values&&typeof v.values==='object'?v:null;}catch(e){return null;}}
 // A slot keeps the tab's positions and sizes and, on HUD / cluster, the design they belong to (design, alert
 // style, auxiliary information), so loading it brings back the same picture. Slots saved before 1.2.43 have
 // positions only and load onto the design in use.
 saveSlot(i){const scope=this.scope(),values={};layoutKeys(SCOPE_TAB[scope],this.settings.schema).forEach(k=>{values[k]=this.settings.get(k);});
  const slot={version:2,values,savedAt:Date.now()};
  if(scope!=='nav'){const cfg=this.config();slot.design=cfg[scope+'Design']||'own';slot.alert=cfg[scope+'AlertStyle'];slot.aux=cfg[scope+'AuxConfig'];}
  this.settings.set(this.slotKey(i,scope),JSON.stringify(slot));this.presetMessage=tr('Saved to slot')+' '+i;this.changed();}
 loadSlot(i){this.loadEntry(this.scope(),i);}
 // Every saved slot, HUD then cluster then navigation, for the Load tab.
 loadEntries(){const out=[];SCOPES.forEach(scope=>{for(let i=1;i<=SLOT_COUNT;i++){const slot=this.slot(i,scope);if(slot)out.push({scope,i,slot});}});return out;}
 slotName(scope,slot){
  if(scope==='nav')return tr('Navigation');
  const d=slot&&slot.design;if(!d)return tr('Design not recorded');
  if(/^rl-/.test(d))return tr(RL.NAMES[d.slice(3)]||d);
  return t(slot.alert==='circle'?'Circle beside gear':'Top alert bar');
 }
 // The values a slot sets: on HUD / cluster first the design switch (which keeps the outgoing design's
 // positions, as choosing a design does), then the slot's own positions, alert style and auxiliary information.
 slotValues(scope,slot){
  const schema=this.settings.schema,values={};
  if(scope!=='nav'&&slot.design&&D.HUD_DESIGNS.concat(['own']).includes(slot.design)&&!(scope==='hud'&&RL.CLUSTER_ONLY.includes(slot.design.slice(3)))&&!(scope==='cluster'&&RL.HUD_ONLY.includes(slot.design.slice(3))))
   Object.assign(values,this.designSwitch(slot.design,scope));
  layoutKeys(SCOPE_TAB[scope],schema).forEach(k=>{const v=slot.values[k];if(v!==undefined&&typeof v===typeof defaultOf(schema,k))values[k]=v;});
  if(scope!=='nav'){if(slot.alert==='bar'||slot.alert==='circle')values[scope+'AlertStyle']=slot.alert;if(typeof slot.aux==='string'&&D.auxConfig(slot.aux).items.length)values[scope+'AuxConfig']=slot.aux;}
  return values;
 }
 // Loading writes only what differs, at most once per LOAD_GAP for each of HUD / cluster / navigation: pressing again quickly, or loading what is
 // already in use, writes nothing (each write makes the background app redraw the HUD / cluster).
 loadEntry(scope,i){
  const slot=this.slot(i,scope),now=Date.now(),say=m=>{this.presetMessage=m;this.loadMessage={scope,i,text:m,at:now};this.changed();};
  if(!slot){say(tr('Slot is empty'));return false;}
  const last=(this.lastLoadAt||(this.lastLoadAt={}))[scope];
  if(last&&now-last<LOAD_GAP&&now>=last){say(tr('Wait a moment, then press again'));return false;}
  const values=this.slotValues(scope,slot),changes={};
  Object.keys(values).forEach(k=>{if(this.settings.get(k)!==values[k])changes[k]=values[k];});
  if(this.open==='layout'||this.open==='layoutPresets')Object.assign(changes,this.previewRefresh());
  else if(this.settings.get('layoutPreview'))changes.layoutPreview='';
  if(!Object.keys(changes).length){say(tr('Already in use'));return false;}
  this.lastLoadAt[scope]=now;this.setValues(changes);say(tr('Loaded slot')+' '+i);return true;
 }
 drawLoad(cv,cfg,targets){
  const list=this.loadEntries();
  if(!list.length){
   cv.text(tr('No saved layouts yet.'),100,160,32,'#f3f5f7');
   cv.text(tr('Save one in HUD / CLUSTER / NAV display setting → Position / size → Save / load.'),100,206,25,'#91a1b6');
   require('./settings-bg').mark(cv,W,H);return;
  }
  this.focus=Math.min(this.focus,list.length-1);
  const h=list.length>6?46:64;let y=100;
  list.forEach((e,n)=>{
   if(n===this.focus){cv.gradientRect(78,y,1460,h-1,[[0,'#30131a'],[1,'#090b0e']]);cv.fillRect(78,y+6,4,h-13,'#f32b40');}
   const scopeName=e.scope==='hud'?'HUD':e.scope==='cluster'?tr('Cluster'):tr('Navigation');
   const label=(e.scope==='nav'?scopeName:scopeName+' · '+this.slotName(e.scope,e.slot))+' - '+tr('Slot')+' '+e.i;
   cv.text(label,100,y+h/2+11,30,'#f3f5f7',{literal:true});
   const m=this.loadMessage;if(m&&m.scope===e.scope&&m.i===e.i&&Date.now()-m.at<4000)cv.text(m.text,1250,y+h/2+9,22,'#ffad45',{align:'right',literal:true});
   targets.push({x:78,y,w:1170,h:h-1,act:()=>{this.focus=n;this.changed();},label,id:'load-row-'+e.scope+e.i});
   this.button(cv,targets,tr('Load'),1270,y+4,260,h-9,()=>{this.focus=n;this.loadEntry(e.scope,e.i);},false,'load-'+e.scope+e.i);
   cv.line(84,y+h-1,1536,y+h-1,0.6,'#292d34');y+=h;
  });
  if(list.length<=5)require('./settings-bg').mark(cv,W,H);
 }
 resetLayout(){if(!this.resetArmed){this.resetArmed=true;this.presetMessage=tr('Press again to reset to defaults');this.changed();return;}this.resetArmed=false;const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{values[k]=defaultOf(this.settings.schema,k);});Object.assign(values,this.previewRefresh());this.setValues(values);this.presetMessage=tr('Reset to defaults');this.changed();}
 drawPresets(cv,cfg,targets){
  const local=[],name=t(this.tab===3?'NAV display setting':this.tab===2?'CLUSTER display setting':'HUD display setting');
  cv.text(tr('Save / load positions')+' · '+name,100,126,32,'#ef4050',{literal:true});
  this.button(cv,local,tr(this.resetArmed?'Press again to reset':'Reset to defaults'),84,150,1452,64,()=>this.resetLayout(),!!this.resetArmed,'preset-reset');
  for(let i=1;i<=SLOT_COUNT;i++){const x=84+(i-1)*490,slot=this.slot(i),saved=!!slot;
   cv.text(tr('Slot')+' '+i+' · '+(saved?(this.scope()==='nav'?tr('Saved'):this.slotName(this.scope(),slot)):tr('Empty')),x+8,262,24,saved?'#b8c5d4':'#6f7c8c',{literal:true});
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
 layoutPrefix(p){return this.tab===3?p.prefix:this.display()+p.key;}
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
  this.layoutParam=param;const cfg=this.config(),nav=this.tab===3,parts=this.selectedLayoutParts();if(!parts.length)return;
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
 rlUnchanged(cfg,parts,changes){if(this.tab===3||!RL.active(cfg,this.display()))return false;const after=Object.assign({},cfg,changes);return JSON.stringify(parts.map(p=>this.rlRect(cfg,p)))===JSON.stringify(parts.map(p=>this.rlRect(after,p)));}
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
  const local=[],nav=this.tab===3,display=this.display(),parts=this.layoutParts();this.layoutPart=Math.min(this.layoutPart,parts.length-1);
  // Five columns, or six when a layout has many elements (two rows with Save / load in the last cell).
  const columns=parts.length>=10?6:5,cell=columns===6?243:292;
  parts.forEach((p,i)=>this.button(cv,local,tr(p.label),84+(i%columns)*cell,96+Math.floor(i/columns)*62,cell-14,56,()=>this.selectLayoutPart(i),this.layoutSelected.has(p.key),'part'+i));
  const allButton=this.tab!==3&&!RL.active(cfg,display),allCell=parts.length;
  if(allButton){const sel=parts.every(p=>this.layoutSelected.has(p.key));this.button(cv,local,tr('All'),84+(allCell%columns)*cell,96+Math.floor(allCell/columns)*62,cell-14,56,()=>this.selectAllParts(),sel,'part-all');}
  const presetCell=parts.length+(allButton?1:0)<=columns-1?columns-1:2*columns-1;
  this.button(cv,local,tr('Save / load'),84+(presetCell%columns)*cell,96+Math.floor(presetCell/columns)*62,cell-14,56,()=>{this.open='layoutPresets';this.choice=0;this.resetArmed=false;this.presetMessage='';this.changed();},false,'presets');
  const selected=parts[this.layoutPart],prefix=this.layoutPrefix(selected),group=this.selectedLayoutParts();
  cv.text('Position',100,241,28,'#b8c5d4');
  const btn=(label,x,y,act,id)=>this.button(cv,local,label,x,y,110,56,act,false,id);
  btn('Up',300,246,()=>this.adjust(1,-1),'up');btn('Left',170,307,()=>this.adjust(0,-1),'left');btn('Right',430,307,()=>this.adjust(0,1),'right');btn('Down',300,368,()=>this.adjust(1,1),'down');
  const uniform=group.some(p=>p.uniform),rows=nav||group.length>1||uniform?['Size']:['Width','Height'];rows.forEach((label,i)=>{
   const y=240+i*84,key=nav?selected.scale:prefix+(i?'HeightScale':'WidthScale');
   cv.text(label,790,y+20,28,'#b8c5d4');btn('−',1010,y+26,()=>this.adjust(i+2,-1),'size-minus'+i);btn('+',1140,y+26,()=>this.adjust(i+2,1),'size-plus'+i);cv.text(!nav&&group.length>1&&!uniform?cfg[prefix+'WidthScale']+' × '+cfg[prefix+'HeightScale']+' %':String(cfg[key])+' %',1500,y+67,30,'#f3f5f7',{align:'right',font:'num'});
  });
  let width,height;
  if(nav){const rect=D.navRect(cfg,selected.key);width=rect.w;height=rect.h;}
  else if(RL.active(cfg,display)){const face=display==='hud'?placement(cfg,'hud',HUD):{x:0,y:0,w:CLUSTER.W,h:CLUSTER.H},layout=RL.rect(cfg,face,display),e=RL.elements(cfg,display).find(v=>v.key===selected.key),b=e&&RL.bounds({config:cfg,rpm:0,gear:'--',aux:{}},e.id,display),r=b?RL.clampTo(RL.partRect(cfg,layout,b,e.key,display),RL.room(face,display)):layout;width=r.w;height=r.h;}
  else{const painter=display==='hud'?HUD:CLUSTER,b=measurePart(painter,{config:cfg,rpm:0,gear:this.liveState&&this.liveState.gear||'--'},display,selected.key,cv)||{w:0,h:0},r=placement(cfg,display==='hud'?'hud':cfg.displayTarget==='panel'?'panel':'map',painter);width=Math.round(b.w*cfg[prefix+'WidthScale']/100*r.w/painter.W);height=Math.round(b.h*cfg[prefix+'HeightScale']/100*r.h/painter.H);}
  cv.text(group.length?group.length+' '+t('selected')+' · '+tr(selected.label):t('Select items to adjust'),84,456,21,'#b8c5d4',{literal:true});
  cv.text(group.length?'X '+cfg[prefix+'OffsetX']+' · Y '+cfg[prefix+'OffsetY']+' · '+width+' × '+height+' px':'',84,500,21,'#ffad45',{literal:true});
  cv.text(nav||uniform?'Width and height scale together.':'Width / height difference limited to 30%.',790,432,18,'#a8b6c8');
  const hidden=group.length&&group.every(p=>cfg[this.layoutPrefix(p)+'Hidden']);
  const marks=!nav&&group.some(p=>/^Mark/.test(p.key));
  const mMark=!nav&&parts.some(p=>p.key==='RlMark'),markOn=mMark&&!cfg[display+'RlMarkHidden'];
  this.button(cv,local,hidden?'Show selected':'Hide selected',650,448,marks||mMark?260:540,56,()=>this.toggleHidden(false),hidden,'toggle-Hidden');
  if(mMark)this.button(cv,local,tr(markOn?'Remove M mark':'Add M mark'),930,448,260,56,()=>this.toggleMMark(),markOn,'toggle-MMark');
  if(marks){const list=group.filter(p=>/^Mark/.test(p.key)),lines=list.every(p=>cfg[this.layoutPrefix(p)+'LineHidden']);this.button(cv,local,lines?'Show line':'Hide line',930,448,260,56,()=>this.toggleHidden(true),lines,'toggle-LineHidden');}
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }

}
module.exports={SettingsPage,GROUPS,TABS,options,W,H,MAP_WARNING,HUD_WARNING,RENDERER_NOTICE,WARNING:MAP_WARNING};
