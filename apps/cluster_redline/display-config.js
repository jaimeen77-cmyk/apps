'use strict';
const METRICS=['boost','torque','power','gforce','outside','oil','batteryCharge','batteryVoltage','economy','clock'];
// The clock is a gauge-only item (it has no text-mode form).
const GAUGE_ONLY=['clock'];
// HUD designs: Cluster Redline's own face, or a Redline app layout (redline-hud.js).
const HUD_DESIGNS=['own','rl-standard','rl-minimal','rl-wings','rl-digital','rl-vfd','rl-vector','rl-arc','rl-ramp','rl-dial'];
const LABELS={boost:'Boost',torque:'Torque',power:'Power*',gforce:'G-force',outside:'Outside temperature',oil:'Oil temperature',batteryCharge:'12 V battery charge',batteryVoltage:'Battery voltage',economy:'Average fuel economy',clock:'Clock'};
const PARTS=['RpmGauge','Gear','Alert','AuxLeft','AuxRight','RpmValue','Mark','MarkTop','MarkBottom'];
const PART_LABELS=['RPM gauge','Gear','RPM alert','Auxiliary left','Auxiliary right','RPM number','M mark','Upper M mark','Lower M mark'];
const LEGACY_PARTS=['Aux'];
const NAV_PARTS=[{key:'Direction',label:'Direction',prefix:'hudNav',scale:'navUniformScale',w:240,h:112},{key:'Text',label:'Text',prefix:'hudText',scale:'hudTextScale',w:240,h:48},{key:'Lanes',label:'Lane guidance',prefix:'hudLanes',scale:'hudLanesScale',w:240,h:72}];
const defaults={displaySettingsRevision:4,clusterAlertStyle:'circle',navDisplayMode:'all',navColor:'blue',navUniformScale:70,hudTextOffsetX:180,hudTextOffsetY:10,hudTextScale:65,hudLanesOffsetX:210,hudLanesOffsetY:115,hudLanesScale:70,hudAuxTextOffsetY:10,clockZone:'auto',clusterWazeYield:'off',layoutPreview:'',hudDesign:'own'};
NAV_PARTS.forEach(p=>{defaults[p.prefix+'Hidden']=false;});
['hud','cluster'].forEach(d=>{
 defaults[d+'AuxConfig']=JSON.stringify({mode:'gauges',items:['boost','torque']});
 PARTS.concat(LEGACY_PARTS).forEach(p=>{defaults[d+p+'OffsetX']=0;defaults[d+p+'OffsetY']=d==='cluster'&&/^Aux(Left|Right)$/.test(p)?50:0;defaults[d+p+'WidthScale']=100;defaults[d+p+'HeightScale']=100;defaults[d+p+'Hidden']=false;});
 ['Mark','MarkTop','MarkBottom'].forEach(p=>{defaults[d+p+'Hidden']=false;defaults[d+p+'LineHidden']=false;});
});
function partsFor(display,cfg){
 // A Redline app layout is one image: the RPM gauge part moves and sizes it.
 if(display==='hud'&&cfg.hudDesign&&cfg.hudDesign!=='own')return [{key:'RpmGauge',label:'Redline HUD'}];
 const keys=display==='hud'?['RpmGauge','Gear'].concat(cfg.hudAlertStyle==='circle'?[]:['Alert'],['AuxLeft','AuxRight','RpmValue','Mark']):['RpmGauge','Gear','Alert','AuxLeft','AuxRight','RpmValue','MarkTop','MarkBottom'];
 return keys.map(key=>({key,label:display==='hud'&&key==='Gear'&&cfg.hudAlertStyle==='circle'?'Gear + circle alert':PART_LABELS[PARTS.indexOf(key)]}));
}
function auxConfig(value){
 let v=value;try{if(typeof v==='string')v=JSON.parse(v);}catch(e){v=null;}
 if(!v||!['gauges','values','off'].includes(v.mode)||!Array.isArray(v.items))return {mode:'gauges',items:['boost','torque']};
 const items=v.items.filter((x,i,a)=>METRICS.includes(x)&&a.indexOf(x)===i&&(v.mode==='gauges'||!GAUGE_ONLY.includes(x))).slice(0,v.mode==='gauges'?2:4);
 return {mode:v.mode,items:items.length?items:['boost','torque']};
}
function normalize(raw,out){
 Object.keys(defaults).forEach(k=>{out[k]=defaults[k];});out.displaySettingsRevision=4;
 out.clusterAlertStyle=['circle','bar'].includes(raw.clusterAlertStyle)?raw.clusterAlertStyle:'circle';
 out.navDisplayMode=['all','excludeSport','stock'].includes(raw.navDisplayMode)?raw.navDisplayMode:'all';out.navColor=['blue','white','gray'].includes(raw.navColor)?raw.navColor:'blue';
 ['hud','cluster'].forEach(d=>{
  let value=raw[d+'AuxConfig'];if(value===undefined&&d==='hud'&&raw.hudAuxDisplay!==undefined)value={mode:raw.hudAuxDisplay,items:['torque','power']};out[d+'AuxConfig']=JSON.stringify(auxConfig(value));
  PARTS.concat(LEGACY_PARTS).forEach(p=>{
   out[d+p+'Hidden']=raw[d+p+'Hidden']===true;
   ['OffsetX','OffsetY','WidthScale','HeightScale'].forEach(s=>{const k=d+p+s,v=raw[k];if(typeof v==='number'&&isFinite(v))out[k]=/Offset/.test(s)?Math.max(-1000,Math.min(1000,Math.round(v))):Math.max(20,Math.min(200,Math.round(v/5)*5));});
   const w=d+p+'WidthScale',h=d+p+'HeightScale';out[h]=Math.max(Math.ceil(out[w]/1.3/5)*5,Math.min(Math.floor(out[w]*1.3/5)*5,out[h]));
  });
  ['Mark','MarkTop','MarkBottom'].forEach(p=>['Hidden','LineHidden'].forEach(s=>{out[d+p+s]=raw[d+p+s]===true;}));
 });
 ['hudText','hudLanes'].forEach(prefix=>['OffsetX','OffsetY','Scale'].forEach(s=>{const k=prefix+s,v=raw[k];if(typeof v==='number'&&isFinite(v))out[k]=s==='Scale'?Math.max(20,Math.min(200,Math.round(v/5)*5)):Math.max(-1000,Math.min(1000,Math.round(v)));}));
 NAV_PARTS.forEach(p=>{out[p.prefix+'Hidden']=raw[p.prefix+'Hidden']===true;});
 if(typeof raw.hudAuxTextOffsetY==='number'&&isFinite(raw.hudAuxTextOffsetY))out.hudAuxTextOffsetY=Math.max(-1000,Math.min(1000,raw.hudAuxTextOffsetY));
 if(raw.navUniformScale!==undefined||raw.displaySettingsRevision>=2){const n=typeof raw.navUniformScale==='number'&&isFinite(raw.navUniformScale)?raw.navUniformScale:out.hudNavWidthScale;out.hudNavWidthScale=out.hudNavHeightScale=Math.max(20,Math.min(200,n));}
 out.navUniformScale=out.hudNavWidthScale;
 out.clockZone=['auto','utc9'].includes(raw.clockZone)?raw.clockZone:'auto';
 out.clusterWazeYield=['all','excludeSport','off'].includes(raw.clusterWazeYield)?raw.clusterWazeYield:'off';
 out.hudDesign=HUD_DESIGNS.includes(raw.hudDesign)?raw.hudDesign:'own';
 out.layoutPreview=typeof raw.layoutPreview==='string'&&/^(hud|cluster|nav):[A-Za-z]{1,20}@[0-9]{1,15}$/.test(raw.layoutPreview)?raw.layoutPreview:'';
 return out;
}
function metricSlots(items){if(items.length<3)return items.map((id,i)=>({id,side:i,row:0,rows:1,index:i+1}));return items.map((id,i)=>({id,side:i<2?0:1,row:i%2,rows:i<2||items.length===4?2:1,index:i+1}));}
function sportMode(mode){return /^(SPORT|PHEV_SPORT)/.test(String(mode||''));}
function navAllowed(cfg,mode){return cfg.hudNavigationEnabled&&cfg.navDisplayMode!=='stock'&&!(cfg.navDisplayMode==='excludeSport'&&sportMode(mode));}
// Cluster map layer under other apps' map layers (Waze on cluster) in the chosen drive modes.
function wazeYield(cfg,mode){return cfg.clusterWazeYield==='all'||cfg.clusterWazeYield==='excludeSport'&&!sportMode(mode);}
function rpmOutput(cfg,name,mode){return cfg['all'+name+'Output']==='redline'||sportMode(mode)&&cfg['sport'+name+'Output']==='redline';}
function navVisible(cfg,mode){const on=navAllowed(cfg,mode);return {direction:on&&!cfg.hudNavHidden,text:on&&!cfg.hudTextHidden,lanes:on&&!cfg.hudLanesHidden};}
// Settings layout editor: the part being adjusted, honoured for two minutes after the last edit.
function layoutPreview(cfg,now){const m=/^(hud|cluster|nav):([A-Za-z]+)@([0-9]+)$/.exec(cfg.layoutPreview||'');if(!m)return null;const at=Number(m[3]),t=typeof now==='number'?now:Date.now();return t>=at-5000&&t-at<=120000?{display:m[1]==='nav'?'hud':m[1],tab:m[1],part:m[2]}:null;}
// HH:MM in the head unit's local time, or fixed UTC+9 when the system clock has no Korean time zone.
function clockText(cfg,date){const d=date||new Date(),t=cfg.clockZone==='utc9'?new Date(d.getTime()+9*3600000):d,h=cfg.clockZone==='utc9'?t.getUTCHours():t.getHours(),m=cfg.clockZone==='utc9'?t.getUTCMinutes():t.getMinutes();return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
function navRect(cfg,key){const p=NAV_PARTS.find(p=>p.key===key),s=cfg[p.scale]/100,w=Math.round(p.w*s),h=Math.round(p.h*s);return {x:Math.round((800-w)/2+cfg[p.prefix+'OffsetX']),y:Math.round(240+cfg[p.prefix+'OffsetY']),w,h};}
function visibleMetrics(cfg,display){const a=auxConfig(cfg[display+'AuxConfig']);return a.mode==='off'?[]:metricSlots(a.items).filter(s=>!cfg[display+(s.side?'AuxRight':'AuxLeft')+'Hidden']).map(s=>s.id);}
function faceVisible(cfg,d){return partsFor(d,cfg).some(p=>!cfg[d+p.key+'Hidden'])||(d==='hud'?!cfg.hudMarkLineHidden:!cfg.clusterMarkTopLineHidden||!cfg.clusterMarkBottomLineHidden);}
function faceRpmNeeded(cfg,d){return !cfg[d+'RpmGaugeHidden']||!cfg[d+'RpmValueHidden']||!cfg[d+'AlertHidden']&&(d!=='hud'||cfg.hudAlertStyle!=='circle'||!cfg.hudGearHidden)||visibleMetrics(cfg,d).includes('power');}
module.exports={METRICS,GAUGE_ONLY,HUD_DESIGNS,layoutPreview,clockText,LABELS,PARTS,PART_LABELS,NAV_PARTS,defaults,normalize,auxConfig,metricSlots,sportMode,navAllowed,navVisible,navRect,rpmOutput,wazeYield,partsFor,visibleMetrics,faceVisible,faceRpmNeeded};
