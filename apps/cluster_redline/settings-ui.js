'use strict';
const {t}=require('./kit/i18n'),G=require('./kit/gauges'),{header}=require('./settings-chrome');
require('./crisp-text');
const {tr}=require('./strings');
const {settings:effective,PROFILES,DEFAULTS}=require('./policy');
const D=require('./display-config'),RL=require('./redline-hud'),HUD=require('./hud-draw'),CLUSTER=require('./draw'),NAV=require('./nav-draw');
const {measurePart}=require('./component-canvas'),{placement}=require('./layout'),NAV_TEXT=require('./nav-text');
const W=1600,H=520,TABS=['Basic settings','HUD display setting','CLUSTER display setting','NAV display setting'];
const GROUPS=[['autoStart','appEnabled','engineProfile','powerUnit','torqueUnit','shiftRpm'],['sportHudOutput','allHudOutput','aux','design','layout'],['sportClusterOutput','allClusterOutput','aux','design','layout','clusterWazeYield'],['navDisplayMode','navColor','layout']];
// Settings kept outside the packaged schema (its templates are fingerprinted), shown as ordinary choices.
const EXTRA={clusterWazeYield:{key:'clusterWazeYield',label:'Yield to Waze map',type:'choice',default:'off',options:[['all','All modes incl. Sport'],['excludeSport','All modes except Sport'],['off',"Don't yield"]]}};
const RENDERER_NOTICE='Install Cluster renderer (cluster-render) from MGU Store first.';
const MAP_WARNING='Set Central display area to Map view or Off. Assist or route preview may cover the widget.';
const HUD_WARNING='HUD navigation shows received turn guidance; unavailable data preserves stock guidance.';
// Keys saved, loaded and reset by the position/size presets of each tab.
const SLOT_COUNT=3,FACE_KEY=/^(hud|cluster)(RpmGauge|Gear|Alert|AuxLeft|AuxRight|RpmValue|Mark|MarkTop|MarkBottom|Aux)(OffsetX|OffsetY|WidthScale|HeightScale|Hidden|LineHidden)$/;
const NAV_KEYS=['hudNavOffsetX','hudNavOffsetY','navUniformScale','hudNavWidthScale','hudNavHeightScale','hudTextOffsetX','hudTextOffsetY','hudTextScale','hudLanesOffsetX','hudLanesOffsetY','hudLanesScale','hudNavHidden','hudTextHidden','hudLanesHidden'];
function layoutKeys(tab,schema){
 const name=tab===3?'nav':tab===2?'cluster':'hud',known=new Set(schema.map(s=>s.key));
 const keys=name==='nav'?NAV_KEYS:Object.keys(DEFAULTS).filter(k=>{const m=FACE_KEY.exec(k);return m&&m[1]===name;}).concat([name+'OffsetX',name+'OffsetY',name+'WidthScale',name+'HeightScale'],name==='hud'?['hudAuxTextOffsetY']:[]);
 return keys.filter((k,i,a)=>known.has(k)&&a.indexOf(k)===i);
}
function options(item,cfg){
 if(!item)return [];
 if(item.type==='bool')return [[false,'Off'],[true,'On']];
 if(item.type==='choice')return item.options||[];
 const range=PROFILES[cfg.engineProfile]&&PROFILES[cfg.engineProfile].ranges[item.key];
 return (item.steps||[]).filter(v=>!range||!v||v>=range[0]&&v<=range[1]).map(v=>[v,v===0?'Preset default':String(v)+' '+(item.unit||'')]);
}
function vector(cv,x,y,s){
 return {text:(v,a,b,z,c,o)=>cv.text(v,x+a*s,y+b*s,z*s,c,o),textWidth:(v,z,o)=>cv.textWidth(v,z*s,o)/s,
  line:(a,b,c,d,w,k)=>cv.line(x+a*s,y+b*s,x+c*s,y+d*s,w*s,k),polyline:(p,w,c)=>cv.polyline(p.map(v=>[x+v[0]*s,y+v[1]*s]),w*s,c),
  quad:(p,c)=>cv.quad(p.map(v=>[x+v[0]*s,y+v[1]*s]),c),arc:(a,b,r0,r1,f,l,c)=>cv.arc(x+a*s,y+b*s,r0*s,r1*s,f,l,c),
  fillRect:(a,b,w,h,c)=>cv.fillRect(x+a*s,y+b*s,w*s,h*s,c),roundRect:(a,b,w,h,r,c)=>cv.roundRect(x+a*s,y+b*s,w*s,h*s,r*s,c),
  blit:(im,a,b)=>{for(let row=0;row<im.h;row++)for(let col=0;col<im.w;col++){const p=(row*im.w+col)*4;if(im.d[p+3])cv.fillRect(x+(a+col)*s,y+(b+row)*s,s,s,Array.from(im.d.slice(p,p+4)));}}};
}
class SettingsPage{
 constructor(settings,changed,version){this.settings=settings;this.changed=changed||(()=>{});this.version=version;this.tab=0;this.focus=0;this.open=null;this.choice=0;this.layoutPart=0;this.layoutParam=0;this.draft=null;this.layoutActions=[];this.layoutSelected=new Set();}
 config(){const raw={};this.settings.schema.forEach(s=>{raw[s.key]=this.settings.get(s.key);});['clockZone','layoutPreview','hudDesign','clusterWazeYield'].forEach(k=>{if(raw[k]===undefined)raw[k]=this.settings.get(k);});return effective(raw);}
 display(){return this.tab===2?'cluster':'hud';}
 keys(){return GROUPS[this.tab];}
 item(){const key=this.keys()[this.focus];if(['aux','design','layout'].includes(key))return {key,label:{aux:'Auxiliary information',design:'Design',layout:'Position / size'}[key],type:'action'};return EXTRA[key]||this.settings.schema.find(s=>s.key===key);}
 current(item,cfg){const v=this.settings.get(item.key);return v===undefined&&EXTRA[item.key]?cfg[item.key]:v;}
 selectTab(i){this.tab=Math.max(0,Math.min(3,i|0));this.focus=0;this.open=null;this.draft=null;this.choice=0;this.changed();}
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
  if(!this.open)this.focus=(this.focus+delta+this.keys().length)%this.keys().length;
  else{const n=this.open==='layout'||this.open==='layoutPresets'?this.layoutActions.length:this.open==='auxMode'?2:this.open==='design'?(this.display()==='hud'?3:2):this.open==='rlDesign'?RL.STYLES.length:this.open==='auxSelect'?D.METRICS.length+1+(this.draft&&this.draft.items.includes('clock')?1:0):options(this.item(),this.config()).length;this.choice=(this.choice+delta+Math.max(1,n))%Math.max(1,n);}
  this.changed();
 }
 value(item,cfg){
  if(item.key==='aux'){const a=D.auxConfig(cfg[this.display()+'AuxConfig']);return t(a.mode==='values'?'Text':'Gauges')+' · '+a.items.map(k=>tr(D.LABELS[k])).join(' / ');}
  if(item.key==='design'){if(this.display()==='hud'&&RL.active(cfg))return tr('Redline HUD')+' · '+tr(RL.NAMES[RL.style(cfg)]);return t(cfg[this.display()+'AlertStyle']==='circle'?'Circle beside gear':'Top alert bar');}
  if(item.key==='layout')return t('Adjust');
  if(item.key==='appEnabled')return t(cfg.appEnabled?'Running':'Stopped');
  if(item.key==='shiftRpm'&&!this.settings.get(item.key))return cfg.shiftRpm+' rpm';
  const now=this.current(item,cfg),selected=options(item,cfg).find(o=>o[0]===now);return selected?tr(selected[1]):t('Check required');
 }
 change(delta){if(this.open==='layoutPresets')return;if(this.open==='layout'){this.adjust(this.layoutParam,delta);return;}const item=this.item(),list=options(item,this.config());if(!list.length){this.activate();return;}const at=list.findIndex(o=>o[0]===this.current(item,this.config()));this.settings.set(item.key,list[(at+delta+list.length)%list.length][0]);this.changed();}
 activate(index){
  if(index!==undefined)this.focus=index;const item=this.item();if(!item)return;
  this.choice=0;
  if(item.key==='aux')this.open='auxMode';
  else if(item.key==='design'){this.open='design';this.choice=this.config()[this.display()+'AlertStyle']==='circle'?1:0;}
  else if(item.key==='layout'){this.open='layout';this.layoutPart=0;this.layoutParam=0;this.layoutSelected=new Set([this.layoutParts()[0].key]);this.setPreview(true);}
  else if(item.type==='bool'){this.change(1);return;}
  else{this.open=item.key;this.choice=Math.max(0,options(item,this.config()).findIndex(o=>o[0]===this.current(item,this.config())));}
  this.changed();
 }
 choose(index){
  if(this.open==='layout'||this.open==='layoutPresets'){const a=this.layoutActions[index];if(a)a.act();return;}
  if(this.open==='auxMode'){this.draft={mode:index===1?'values':'gauges',items:[]};this.open='auxSelect';this.choice=0;this.changed();return;}
  if(this.open==='auxSelect'){if(index===D.METRICS.length)this.commitAux();else if(index===D.METRICS.length+1)this.toggleClockZone();else this.toggleMetric(D.METRICS[index]);return;}
  if(this.open==='design'){
   if(index===2&&this.display()==='hud'){this.open='rlDesign';this.choice=Math.max(0,RL.STYLES.indexOf(RL.style(this.config())));this.changed();return;}
   const values={[this.display()+'AlertStyle']:index===1?'circle':'bar'};if(this.display()==='hud')values.hudDesign='own';this.setValues(values);this.open=null;this.changed();return;}
  if(this.open==='rlDesign'){const st=RL.STYLES[index];if(st){this.settings.set('hudDesign','rl-'+st);this.open=null;this.changed();}return;}
  const list=options(this.item(),this.config());if(!list[index])return;
  this.settings.set(this.item().key,list[index][0]);if(this.item().key==='navDisplayMode')this.settings.set('hudNavigationEnabled',true);this.open=null;this.changed();
 }
 toggleClockZone(){this.settings.set('clockZone',this.config().clockZone==='utc9'?'auto':'utc9');this.changed();}
 toggleMetric(id){if(!this.draft||!D.METRICS.includes(id)||this.draft.mode!=='gauges'&&D.GAUGE_ONLY.includes(id))return;const a=this.draft.items,i=a.indexOf(id);if(i>=0)a.splice(i,1);else if(a.length<(this.draft.mode==='gauges'?2:4))a.push(id);this.changed();}
 commitAux(){if(!this.draft||!this.draft.items.length)return;this.settings.set(this.display()+'AuxConfig',JSON.stringify(this.draft));this.open=null;this.draft=null;this.changed();}
 button(cv,targets,label,x,y,w,h,act,on,id){
  const layoutFocus=(this.open==='layout'||this.open==='layoutPresets')&&targets.length===this.choice,focused=layoutFocus&&!/^part/.test(id||'')||this.open==='auxSelect'&&(id==='metric-'+D.METRICS[this.choice]||id==='ok'&&this.choice===D.METRICS.length||id==='clock-zone'&&this.choice===D.METRICS.length+1)||this.open==='rlDesign'&&id==='rl-'+RL.STYLES[this.choice]||this.open==='design'&&id==='design'+this.choice;
  cv.roundRect(x,y,w,h,6,on||focused?'#57202d':'#252a31');if(layoutFocus&&/^part/.test(id||'')&&!on)cv.polyline([[x+2,y+2],[x+w-2,y+2],[x+w-2,y+h-2],[x+2,y+h-2],[x+2,y+2]],2,'#9bacc4');let size=30;while(size>18&&cv.textWidth(t(label),size)>w-24)size--;
  if(label==='−'||label==='+'){cv.line(x+w/2-17,y+h/2,x+w/2+17,y+h/2,3,'#f3f5f7');if(label==='+')cv.line(x+w/2,y+h/2-17,x+w/2,y+h/2+17,3,'#f3f5f7');}
  else cv.text(label,x+w/2,y+h/2+size*0.36,size,'#f3f5f7',{align:'center',font:'bold'});targets.push({x,y,w,h,act,label,id:id||label});
 }
 draw(cv,status,liveState){
  this.liveState=liveState||null;
  const cfg=this.config(),targets=[],theme={bg:'#090b0e',text:'#f3f5f7',dim:'#8d97a4',sel:'#f32b40',accent:'#f32b40'};cv.clear(theme.bg);
  const badges=this.version?[{text:'v'+this.version,color:'#8d97a4'}]:[];
  if(cv.chrome)G.frame(cv,theme,TABS,this.tab,badges);else{header(cv,theme,0,0,W,80,'Cluster Redline',TABS,this.tab,badges,true,false);(cv.tabRects||[]).forEach(r=>targets.push(Object.assign({},r,{act:()=>this.selectTab(r.i),label:TABS[r.i],id:'tab'+r.i})));}
  if(this.open==='layout')this.drawLayout(cv,cfg,targets);
  else if(this.open==='layoutPresets')this.drawPresets(cv,cfg,targets);
  else if(this.open==='auxMode')this.drawAuxMode(cv,cfg,targets);
  else if(this.open==='auxSelect')this.drawAuxSelect(cv,cfg,targets);
  else if(this.open==='design')this.drawDesign(cv,cfg,targets);
  else if(this.open==='rlDesign')this.drawRedlineDesigns(cv,cfg,targets);
  else if(this.open==='navColor')this.drawColors(cv,cfg,targets);
  else if(this.open)this.drawChoices(cv,cfg,targets);
  else this.drawRows(cv,cfg,targets,status);
  cv.targets=targets.map((r,i)=>Object.assign({key:this.tab+':'+(this.open||'rows')+':'+i,run:r.act},r));return cv;
 }
 drawRows(cv,cfg,targets,status){
  let y=100;
  this.keys().forEach((key,i)=>{
   const item=['aux','design','layout'].includes(key)?{key,label:{aux:'Auxiliary information',design:'Design',layout:'Position / size'}[key]}:EXTRA[key]||this.settings.schema.find(s=>s.key===key);
   const h=this.tab===0?(key==='autoStart'?112:58):this.keys().length>5?62:68;
   if(i===this.focus){cv.gradientRect(78,y,1460,h-1,[[0,'#30131a'],[1,'#090b0e']]);cv.fillRect(78,y+8,4,42,'#f32b40');}
   const label=/^sport/.test(key)?'Sport mode RPM display':/^all/.test(key)?'All modes RPM display':tr(item.label);
   cv.text(label,100,y+39,32,'#f3f5f7');
   if(key==='appEnabled'){
    [[true,'Start app'],[false,'Stop app']].forEach((v,n)=>this.button(cv,targets,v[1],990+n*278,y+3,260,50,()=>{this.settings.set(key,v[0]);this.changed();},cfg.appEnabled===v[0],'operation-'+v[0]));
   }else{
    let size=30,value=this.value(item,cfg);while(size>18&&cv.textWidth(value,size)>850)size--;
    cv.text(value,1480,y+39,size,'#c1cddd',{align:'right'});targets.push({x:78,y,w:1460,h:h-1,act:()=>this.activate(i),label,id:key});
   }
   if(key==='autoStart'){cv.text(RENDERER_NOTICE,100,y+72,24,'#ff9e36');cv.text(cfg.sportHudOutput==='redline'||cfg.allHudOutput==='redline'?HUD_WARNING:MAP_WARNING,100,y+101,23,'#ff9e36');}
   cv.line(84,y+h-1,1536,y+h-1,0.6,'#292d34');y+=h;
  });
  if(this.tab===1||this.tab===2)cv.text('All modes Redline also applies in Sport.',84,492,23,'#91a1b6');
  if(this.tab===3)cv.text(HUD_WARNING,84,390,25,'#91a1b6');
 }
 backButton(cv,targets){this.button(cv,targets,'Back',1210,448,326,64,()=>this.back(),false,'back');}
 drawChoices(cv,cfg,targets){
  const item=this.item(),list=options(item,cfg),start=Math.max(0,Math.min(list.length-4,this.choice-1));cv.text(tr(item.label),100,126,32,'#ef4050');
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
   const x=84+i*740;this.button(cv,targets,label,x,106,712,64,()=>this.choose(i),this.choice===i,'design'+i);
   const preview=Object.assign({},cfg);preview[display+'AlertStyle']=i?'circle':'bar';this.preview(cv,preview,x+10,182,display==='cluster'?590:690,display);
  });if(display==='hud')this.button(cv,targets,tr('Redline app layouts')+(RL.active(cfg)?' · '+tr(RL.NAMES[RL.style(cfg)]):''),84,448,1100,64,()=>this.choose(2),RL.active(cfg),'design2');
  this.backButton(cv,targets);
 }
 // The Redline app's nine HUD layouts with live previews (sample: 6300 rpm, 3rd gear).
 drawRedlineDesigns(cv,cfg,targets){
  cv.text(tr('Redline app layouts'),100,126,32,'#ef4050',{literal:true});
  const current=RL.style(cfg),sample=Object.assign({},cfg),state={config:sample,rpm:6300,gear:'M3',shift:false,flash:false,mode:'SPORT',torqueNm:380,powerPS:260,aux:{boost:1.1,oil:96,outside:18,clock:'23:00'}};
  RL.STYLES.forEach((st,i)=>{const x=84+(i%3)*490,y=140+Math.floor(i/3)*100,on=st===current;
   this.button(cv,targets,'',x,y,464,94,()=>this.choose(i),on,'rl-'+st);
   sample.hudDesign='rl-'+st;RL.paint(cv,state,0.56,x+8,y+10);
   cv.text(tr(RL.NAMES[st]),x+456,y+86,20,on?'#ffffff':'#b8c5d4',{align:'right',literal:true});
  });
  cv.text(tr('Layout from the Redline app (appsKOR, MIT). Navigation, lanes and auxiliary items stay as set.'),84,470,20,'#a8b6c8',{literal:true});
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
 slotKey(i){return (this.tab===3?'nav':this.display())+'LayoutSlot'+i;}
 slot(i){try{const v=JSON.parse(this.settings.get(this.slotKey(i))||'null');return v&&v.values&&typeof v.values==='object'?v:null;}catch(e){return null;}}
 saveSlot(i){const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{values[k]=this.settings.get(k);});this.settings.set(this.slotKey(i),JSON.stringify({version:1,values}));this.presetMessage=tr('Saved to slot')+' '+i;this.changed();}
 loadSlot(i){const slot=this.slot(i);if(!slot){this.presetMessage=tr('Slot is empty');this.changed();return;}const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{const v=slot.values[k],d=this.settings.schema.find(s=>s.key===k);if(v!==undefined&&typeof v===typeof d.default)values[k]=v;});Object.assign(values,this.previewRefresh());this.setValues(values);this.presetMessage=tr('Loaded slot')+' '+i;this.changed();}
 resetLayout(){if(!this.resetArmed){this.resetArmed=true;this.presetMessage=tr('Press again to reset to defaults');this.changed();return;}this.resetArmed=false;const values={};layoutKeys(this.tab,this.settings.schema).forEach(k=>{const d=this.settings.schema.find(s=>s.key===k);values[k]=d.default!==undefined?d.default:DEFAULTS[k];});Object.assign(values,this.previewRefresh());this.setValues(values);this.presetMessage=tr('Reset to defaults');this.changed();}
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
 adjust(param,delta){
  this.layoutParam=param;const cfg=this.config(),nav=this.tab===3,parts=this.selectedLayoutParts();if(!parts.length)return;
  if(!nav&&parts.length>1&&param>=2){
   const values=parts.map(p=>{const prefix=this.layoutPrefix(p),w=cfg[prefix+'WidthScale'],h=cfg[prefix+'HeightScale'];return {prefix,w,h,lo:Math.max(20-w,20-h,Math.ceil((Math.max(w-1.3*h,h-1.3*w)/0.3-1e-7)/5)*5),hi:Math.min(200-w,200-h)};});
   const step=Math.max(...values.map(v=>v.lo),Math.min(delta*5,...values.map(v=>v.hi)));
   const changes=this.previewRefresh();values.forEach(v=>{changes[v.prefix+'WidthScale']=v.w+step;changes[v.prefix+'HeightScale']=v.h+step;});this.setValues(changes);this.changed();return;
  }
  const edits=parts.map(p=>{
   const prefix=this.layoutPrefix(p),key=param<2?prefix+(param?'OffsetY':'OffsetX'):nav?p.scale:prefix+(param===2?'WidthScale':'HeightScale');
   let lo=param<2?-1000:20,hi=param<2?1000:200;
   if(!nav&&param>=2){const other=cfg[prefix+(param===2?'HeightScale':'WidthScale')];lo=Math.max(lo,Math.ceil(other/1.3/5)*5);hi=Math.min(hi,Math.floor(other*1.3/5)*5);}
   return {key,value:cfg[key],lo,hi};
  });
  const step=Math.max(...edits.map(e=>e.lo-e.value),Math.min(delta*(param<2?10:5),...edits.map(e=>e.hi-e.value)));
  const changes=this.previewRefresh();edits.forEach(e=>{changes[e.key]=e.value+step;});this.setValues(changes);this.changed();
 }
 drawLayout(cv,cfg,targets){
  const local=[],nav=this.tab===3,display=this.display(),parts=this.layoutParts();this.layoutPart=Math.min(this.layoutPart,parts.length-1);
  const columns=5,cell=292;
  parts.forEach((p,i)=>this.button(cv,local,p.label,84+(i%columns)*cell,96+Math.floor(i/columns)*62,278,56,()=>this.selectLayoutPart(i),this.layoutSelected.has(p.key),'part'+i));
  const presetCell=parts.length<=4?4:9;
  this.button(cv,local,tr('Save / load'),84+(presetCell%columns)*cell,96+Math.floor(presetCell/columns)*62,278,56,()=>{this.open='layoutPresets';this.choice=0;this.resetArmed=false;this.presetMessage='';this.changed();},false,'presets');
  const selected=parts[this.layoutPart],prefix=this.layoutPrefix(selected),group=this.selectedLayoutParts();
  cv.text('Position',100,241,28,'#b8c5d4');
  const btn=(label,x,y,act,id)=>this.button(cv,local,label,x,y,110,56,act,false,id);
  btn('Up',300,246,()=>this.adjust(1,-1),'up');btn('Left',170,307,()=>this.adjust(0,-1),'left');btn('Right',430,307,()=>this.adjust(0,1),'right');btn('Down',300,368,()=>this.adjust(1,1),'down');
  const rows=nav||group.length>1?['Size']:['Width','Height'];rows.forEach((label,i)=>{
   const y=240+i*84,key=nav?selected.scale:prefix+(i?'HeightScale':'WidthScale');
   cv.text(label,790,y+20,28,'#b8c5d4');btn('−',1010,y+26,()=>this.adjust(i+2,-1),'size-minus'+i);btn('+',1140,y+26,()=>this.adjust(i+2,1),'size-plus'+i);cv.text(!nav&&group.length>1?cfg[prefix+'WidthScale']+' × '+cfg[prefix+'HeightScale']+' %':String(cfg[key])+' %',1500,y+67,30,'#f3f5f7',{align:'right',font:'num'});
  });
  let width,height;
  if(nav){const rect=D.navRect(cfg,selected.key);width=rect.w;height=rect.h;}
  else if(display==='hud'&&RL.active(cfg)){const r=RL.rect(cfg,placement(cfg,'hud',HUD));width=r.w;height=r.h;}
  else{const painter=display==='hud'?HUD:CLUSTER,b=measurePart(painter,{config:cfg,rpm:0,gear:this.liveState&&this.liveState.gear||'--'},display,selected.key,cv)||{w:0,h:0},r=placement(cfg,display==='hud'?'hud':cfg.displayTarget==='panel'?'panel':'map',painter);width=Math.round(b.w*cfg[prefix+'WidthScale']/100*r.w/painter.W);height=Math.round(b.h*cfg[prefix+'HeightScale']/100*r.h/painter.H);}
  cv.text(group.length?group.length+' '+t('selected')+' · '+t(selected.label):t('Select items to adjust'),84,456,21,'#b8c5d4',{literal:true});
  cv.text(group.length?'X '+cfg[prefix+'OffsetX']+' · Y '+cfg[prefix+'OffsetY']+' · '+width+' × '+height+' px':'',84,500,21,'#ffad45',{literal:true});
  cv.text(nav?'Width and height scale together.':'Width / height difference limited to 30%.',790,432,18,'#a8b6c8');
  const hidden=group.length&&group.every(p=>cfg[this.layoutPrefix(p)+'Hidden']);
  const marks=!nav&&group.some(p=>/^Mark/.test(p.key));
  this.button(cv,local,hidden?'Show selected':'Hide selected',650,448,marks?260:540,56,()=>this.toggleHidden(false),hidden,'toggle-Hidden');
  if(marks){const list=group.filter(p=>/^Mark/.test(p.key)),lines=list.every(p=>cfg[this.layoutPrefix(p)+'LineHidden']);this.button(cv,local,lines?'Show line':'Hide line',930,448,260,56,()=>this.toggleHidden(true),lines,'toggle-LineHidden');}
  this.layoutActions=local;targets.push.apply(targets,local);this.backButton(cv,targets);
 }

}
module.exports={SettingsPage,GROUPS,TABS,options,W,H,MAP_WARNING,HUD_WARNING,RENDERER_NOTICE,WARNING:MAP_WARNING};
