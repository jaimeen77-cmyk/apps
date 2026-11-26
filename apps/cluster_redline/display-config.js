'use strict';
const METRICS=['boost','torque','power','gforce','outside','oil','batteryCharge','batteryVoltage','economy','avgSpeed','tripTime','clock'];
// The clock is a gauge-only item (it has no text-mode form).
const GAUGE_ONLY=['clock'];
// HUD designs: Cluster Redline's own face, or a Redline app layout (redline-hud.js).
const HUD_DESIGNS=['own','rl-standard','rl-digital','rl-vfd','rl-vector','rl-arc','rl-ramp','rl-dial','rl-shift','rl-logger','rl-needle','rl-rings','rl-ribbon','rl-hexagon','rl-sportdial','rl-classic','rl-luxury','rl-sporthud','rl-tyres','rl-calm','rl-vu','rl-navfocus','rl-gg','rl-car','rl-mypic'];
// The HUD offers every layout but the cluster-only ones.
const HUD_ONLY_DESIGNS=HUD_DESIGNS.filter(d=>d!=='rl-sportdial'&&d!=='rl-classic'&&d!=='rl-tyres'&&d!=='rl-vu'&&d!=='rl-navfocus'&&d!=='rl-mypic');
const LABELS={boost:'Boost',torque:'Torque',power:'Power*',gforce:'G-force',outside:'Outside temperature',oil:'Oil temperature',batteryCharge:'12 V battery charge',batteryVoltage:'Battery voltage',economy:'Average fuel economy',avgSpeed:'Average speed',tripTime:'Driving time',clock:'Clock'};
const PARTS=['RpmGauge','Gear','Alert','AuxLeft','AuxRight','RpmValue','Mark','MarkTop','MarkBottom'];
const PART_LABELS=['RPM gauge','Gear','RPM alert','Auxiliary left','Auxiliary right','RPM number','M mark','Upper M mark','Lower M mark'];
const LEGACY_PARTS=['Aux'];
// The Redline app layouts' elements (redline-hud.js), on the HUD and the cluster. Kept in the saved settings like hudDesign,
// outside app.json, so the Store's settings templates stay valid.
const RL_PARTS=['RlNav','RlClock','RlSpeed','RlCar','RlCarPic','RlGear','RlMode','RlAlert','RlRpm','RlGauge','RlGMeter','RlTemp','RlRead','RlReadA','RlReadB','RlReadC','RlReadD','RlMark'];
const NAV_PARTS=[{key:'Direction',label:'Direction',prefix:'hudNav',scale:'navUniformScale',w:240,h:112},{key:'Text',label:'Text',prefix:'hudText',scale:'hudTextScale',w:240,h:48},{key:'Lanes',label:'Lane guidance',prefix:'hudLanes',scale:'hudLanesScale',w:240,h:72},
 // the turn after the next one (1.3.43, its own part; until then drawn inside Direction): placed from Direction's own
 // place, so it follows Direction, then moved and sized on its own
 {key:'Then',label:'Next turn',prefix:'hudThen',scale:'hudThenScale',w:132,h:44}];
const defaults={hudTurnBlindSpot:'off',hudTurnSignals:'off',hudTurnStyle:'arrow',hudTurnColor:'green',hudTurnOffsetX:0,hudTurnOffsetY:0,hudTurnScale:100,hudTurnLeftOffsetX:0,hudTurnLeftOffsetY:0,hudTurnRightOffsetX:0,hudTurnRightOffsetY:0,hudTurnHidden:false,hudTurnLeftHidden:false,hudTurnRightHidden:false,displaySettingsRevision:4,clusterAlertStyle:'circle',navDisplayMode:'all',navColor:'blue',navUniformScale:70,hudTextOffsetX:180,hudTextOffsetY:10,hudTextScale:65,hudLanesOffsetX:210,hudLanesOffsetY:115,hudLanesScale:70,hudAuxTextOffsetY:10,clockZone:'auto',layoutPreview:'',hudDesign:'own',clusterDesign:'own'};
NAV_PARTS.forEach(p=>{defaults[p.prefix+'Hidden']=false;});
// Navigation colours: the arrow (navColor, also the recommended lanes) and the text (navTextColor: distance, road and
// exit names). navTextColor is kept outside app.json, like the turn signal colour.
const NAV_COLORS={orange:'#ff9a1f',green:'#3ddc6a',blue:'#37c6ff',white:'#f4f7fb'};
const NAV_COLOR_NAMES=['orange','green','blue','white'];
// Vehicle alerts (vehicle-alerts.js): the car's own speeding, school zone and speed camera alerts on the HUD.
// Moved and sized in the NAV tab's Position / size with the navigation parts, but drawn on an overlay of their
// own (alert-overlay.js), so NAV_PARTS (the navigation picture) is unchanged.
const ALERT_MODES=['off','speed','school','camera','all'];
const ALERT_PART={key:'CarAlert',label:'Vehicle alerts',prefix:'hudCarAlert',scale:'hudCarAlertScale',w:330,h:150};
const NAV_LAYOUT_PARTS=NAV_PARTS.concat([ALERT_PART]);
// The door-open warning's picture (door-alert.js): placed by its own rectangle like the turn signals, in the middle
// of the HUD below the RPM face by default; moved and sized in Basic → Door-open warning → Position / size.
const DOOR_PARTS=[{key:'Door',label:'Door-open warning',prefix:'hudDoor',scale:'hudDoorScale',w:120,h:150}];
function doorRect(cfg){const s=(cfg.hudDoorScale||75)/100,w=Math.round(120*s),h=Math.round(150*s);return {x:Math.round((800-w)/2+(cfg.hudDoorOffsetX||0)),y:Math.round(286+(cfg.hudDoorOffsetY||0)),w,h};}
// The blind spot signs (blind-spot-overlay.js): their own place and size, not the turn arrows' (1.3.24). By default each
// sits under the default place of its side's turn arrow; moved and sized in HUD turn signals → Position / size, next to the arrows.
const BLIND_PARTS=[{key:'Blind',label:'Both blind spot signs',prefix:'hudTurnBlind',scale:'hudTurnBlindScale'},{key:'BlindLeft',label:'Left blind spot sign',prefix:'hudTurnBlindLeft',scale:'hudTurnBlindScale'},{key:'BlindRight',label:'Right blind spot sign',prefix:'hudTurnBlindRight',scale:'hudTurnBlindScale'}];
const BLIND_BASE={w:51,h:54,gap:6};
Object.assign(defaults,{hudTurnBlindOffsetX:0,hudTurnBlindOffsetY:0,hudTurnBlindLeftOffsetX:0,hudTurnBlindLeftOffsetY:0,hudTurnBlindRightOffsetX:0,hudTurnBlindRightOffsetY:0,hudTurnBlindScale:100,hudTurnBlindHidden:false,hudTurnBlindLeftHidden:false,hudTurnBlindRightHidden:false});
// The greeting at the engine start and the goodbye when it is switched off (settings per driver), each on / off (1.3.34).
Object.assign(defaults,{greetHello:'on',greetBye:'on'});
// The HUD headway badge (lead-vehicle.js, headway-overlay.js, 1.3.37): off / simple (time gap + distance) / detail
// (+ closing speed); placed by its own rectangle, between the turn arrows under the RPM face by default.
const HEADWAY_PARTS=[{key:'Headway',label:'Lead-car headway',prefix:'hudHeadway',scale:'hudHeadwayScale',w:112,h:60}];
// Lane lines (lane-lines.js, 1.3.77): just above the headway badge, at its size
function laneRect(cfg){const h0=headwayRect(cfg),s=(cfg.hudHeadwayScale||100)/100,w=Math.round(112*s),h=Math.round(56*s);return {x:Math.max(0,Math.min(800-w,Math.round(h0.x+(h0.w-w)/2))),y:Math.max(0,h0.y-h-4),w,h};}
function headwayRect(cfg){const s=(cfg.hudHeadwayScale||100)/100,w=Math.round(112*s),h=Math.round(60*s);return {x:Math.max(0,Math.min(800-w,Math.round((800-w)/2+(cfg.hudHeadwayOffsetX||0)))),y:Math.max(0,Math.min(480-h,Math.round(238+(cfg.hudHeadwayOffsetY||0)))),w,h};}
Object.assign(defaults,{hudHeadway:'off',hudHeadwayOffsetX:0,hudHeadwayOffsetY:0,hudHeadwayScale:100,hudHeadwayHidden:false});
// Following the BC button (bc-follow.js, 1.3.40): on / off, the head unit's list (ID7 / ID8), each page's setup (JSON),
// where the next drive starts (the page reached last / the first page); bcIndex: the page in step now; bcCluster: what
// it asks of the cluster ('redline' shows it in every mode, 'yield' steps it aside for Waze / the stock map, '' leaves
// the drive mode rules). bcIndex and bcCluster are the car's state, not a favourite's or a driver's.
Object.assign(defaults,{bcFollow:'off',bcHmi:'ID7',bcPages:'',bcHudPages:'',bcStart:'last',bcIndex:0,bcCluster:''});
// HUD navigation: the turn after the next one under the arrow when it follows close behind (1.3.35)
Object.assign(defaults,{myPicIds:'',hudNavThen:'on',hudThenOffsetX:0,hudThenOffsetY:0,hudThenScale:70,navProbeLog:'off',calmTone:'cool',hudLaneLines:'off'});
Object.assign(defaults,{hudDoorOffsetX:0,hudDoorOffsetY:0,hudDoorScale:75,hudDoorHidden:false});
Object.assign(defaults,{hudDoorAlert:'on',navTextColor:'white',hudCarAlerts:'all',hudCarAlertOffsetX:-260,hudCarAlertOffsetY:30,hudCarAlertScale:70,hudCarAlertHidden:false});
['hud','cluster'].forEach(d=>{
 defaults[d+'AuxConfig']=JSON.stringify({mode:'gauges',items:['boost','torque']});
 PARTS.concat(LEGACY_PARTS).forEach(p=>{defaults[d+p+'OffsetX']=0;defaults[d+p+'OffsetY']=d==='cluster'&&/^Aux(Left|Right)$/.test(p)?50:0;defaults[d+p+'WidthScale']=100;defaults[d+p+'HeightScale']=100;defaults[d+p+'Hidden']=false;});
 ['Mark','MarkTop','MarkBottom'].forEach(p=>{defaults[d+p+'Hidden']=false;defaults[d+p+'LineHidden']=false;});
});
['hud','cluster'].forEach(d=>RL_PARTS.forEach(p=>{defaults[d+p+'OffsetX']=0;defaults[d+p+'OffsetY']=0;defaults[d+p+'WidthScale']=100;defaults[d+p+'HeightScale']=100;defaults[d+p+'Hidden']=p==='RlMark';}));
// The displays showing the Car layout's car picture (car-meter.js) or My picture's GIFs (my-picture.js) now.
function carMeterFaces(cfg){return ['cluster','hud'].filter(d=>cfg[d+'Design']==='rl-car'&&!cfg[d+'RlCarPicHidden']&&!cfg[d+'RpmGaugeHidden']);}
function partsFor(display,cfg){
 // A Redline app layout: the RPM gauge part moves and sizes it whole, then each of its elements on its own.
 if(cfg[display+'Design']&&cfg[display+'Design']!=='own'){const RL=require('./redline-hud');const order=['RlNav','RlClock','RlSpeed','RlCar','RlCarPic','RlGear','RlMode','RlAlert','RlRpm','RlGauge','RlGMeter','RlTemp','RlRead','RlReadA','RlReadB','RlReadC','RlReadD','RlMark'];return [{key:'RpmGauge',label:'Whole layout',uniform:true}].concat(RL.elements(cfg,display).sort((x,y)=>order.indexOf(x.key)-order.indexOf(y.key)).map(e=>({key:e.key,label:RL.LABELS[e.key],uniform:true})));}
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
 out.navDisplayMode=['all','excludeSport','stock'].includes(raw.navDisplayMode)?raw.navDisplayMode:'all';out.navColor=raw.navColor==='gray'?'white':NAV_COLOR_NAMES.includes(raw.navColor)?raw.navColor:'blue';out.navTextColor=NAV_COLOR_NAMES.includes(raw.navTextColor)?raw.navTextColor:'white';
 ['hud','cluster'].forEach(d=>{
  let value=raw[d+'AuxConfig'];if(value===undefined&&d==='hud'&&raw.hudAuxDisplay!==undefined)value={mode:raw.hudAuxDisplay,items:['torque','power']};out[d+'AuxConfig']=JSON.stringify(auxConfig(value));
  PARTS.concat(LEGACY_PARTS).forEach(p=>{
   out[d+p+'Hidden']=raw[d+p+'Hidden']===true;
   ['OffsetX','OffsetY','WidthScale','HeightScale'].forEach(s=>{const k=d+p+s,v=raw[k];if(typeof v==='number'&&isFinite(v))out[k]=/Offset/.test(s)?Math.max(-1000,Math.min(1000,Math.round(v))):Math.max(20,Math.min(200,Math.round(v/5)*5));});
   const w=d+p+'WidthScale',h=d+p+'HeightScale';out[h]=Math.max(Math.ceil(out[w]/1.3/5)*5,Math.min(Math.floor(out[w]*1.3/5)*5,out[h]));
  });
  ['Mark','MarkTop','MarkBottom'].forEach(p=>['Hidden','LineHidden'].forEach(s=>{out[d+p+s]=raw[d+p+s]===true;}));
 });
 // Redline layout elements size uniformly (text can't stretch): height follows width.
 ['hud','cluster'].forEach(d=>RL_PARTS.forEach(p=>{const k=d+p;out[k+'Hidden']=p==='RlMark'?raw[k+'Hidden']!==false:raw[k+'Hidden']===true;['OffsetX','OffsetY'].forEach(s=>{const v=raw[k+s];if(typeof v==='number'&&isFinite(v))out[k+s]=Math.max(-1000,Math.min(1000,Math.round(v)));});const v=raw[k+'WidthScale'];if(typeof v==='number'&&isFinite(v))out[k+'WidthScale']=Math.max(20,Math.min(200,Math.round(v/5)*5));out[k+'HeightScale']=out[k+'WidthScale'];}));
 ['hudText','hudLanes','hudThen'].forEach(prefix=>['OffsetX','OffsetY','Scale'].forEach(s=>{const k=prefix+s,v=raw[k];if(typeof v==='number'&&isFinite(v))out[k]=s==='Scale'?Math.max(20,Math.min(200,Math.round(v/5)*5)):Math.max(-1000,Math.min(1000,Math.round(v)));}));
 NAV_PARTS.forEach(p=>{out[p.prefix+'Hidden']=raw[p.prefix+'Hidden']===true;});
 if(typeof raw.hudAuxTextOffsetY==='number'&&isFinite(raw.hudAuxTextOffsetY))out.hudAuxTextOffsetY=Math.max(-1000,Math.min(1000,raw.hudAuxTextOffsetY));
 if(raw.navUniformScale!==undefined||raw.displaySettingsRevision>=2){const n=typeof raw.navUniformScale==='number'&&isFinite(raw.navUniformScale)?raw.navUniformScale:out.hudNavWidthScale;out.hudNavWidthScale=out.hudNavHeightScale=Math.max(20,Math.min(200,n));}
 out.navUniformScale=out.hudNavWidthScale;
 // Clock: Korean time (UTC+9) unless chosen otherwise in the Korean version (the head unit's own clock is
 // usually UTC); the English version keeps the head unit's time.
 out.clockZone=['auto','utc9'].includes(raw.clockZone)?raw.clockZone:require('./strings').language()==='ko'?'utc9':'auto';
 out.hudDesign=HUD_ONLY_DESIGNS.includes(raw.hudDesign)?raw.hudDesign:'own';
 // My design (1.3.50-1.3.54) is part of the Animation (Car) layout since 1.3.55: its GIFs show there on the cluster
 out.clusterDesign=raw.clusterDesign==='rl-mypic'?'rl-car':HUD_DESIGNS.includes(raw.clusterDesign)&&raw.clusterDesign!=='rl-sporthud'?raw.clusterDesign:'own';
 out.hudTurnBlindSpot=raw.hudTurnBlindSpot==='on'?'on':'off';out.hudTurnSignals=raw.hudTurnSignals==='on'?'on':'off';out.hudTurnStyle=TURN_STYLES.includes(raw.hudTurnStyle)?raw.hudTurnStyle:'arrow';out.hudTurnColor=Object.prototype.hasOwnProperty.call(TURN_COLORS,raw.hudTurnColor)?raw.hudTurnColor:'green';
 TURN_PARTS.forEach(p=>{['OffsetX','OffsetY'].forEach(s=>{const v=raw[p.prefix+s];if(typeof v==='number'&&isFinite(v))out[p.prefix+s]=Math.max(-1000,Math.min(1000,Math.round(v)));});out[p.prefix+'Hidden']=raw[p.prefix+'Hidden']===true;});
 if(typeof raw.hudTurnScale==='number'&&isFinite(raw.hudTurnScale))out.hudTurnScale=Math.max(20,Math.min(300,Math.round(raw.hudTurnScale/5)*5));
 out.bcFollow=raw.bcFollow==='on'?'on':'off';out.bcHmi=raw.bcHmi==='ID8'?'ID8':'ID7';out.bcPages=typeof raw.bcPages==='string'?raw.bcPages:'';out.bcHudPages=typeof raw.bcHudPages==='string'?raw.bcHudPages:'';out.bcStart=raw.bcStart==='first'?'first':'last';
 out.bcIndex=Number.isInteger(raw.bcIndex)&&raw.bcIndex>=0&&raw.bcIndex<20?raw.bcIndex:0;out.bcCluster=raw.bcCluster==='redline'||raw.bcCluster==='yield'?raw.bcCluster:'';
 out.hudNavThen=raw.hudNavThen==='off'?'off':'on';out.navProbeLog=raw.navProbeLog==='on'?'on':'off';out.calmTone=raw.calmTone==='warm'?'warm':'cool';out.hudLaneLines=raw.hudLaneLines==='on'?'on':'off';out.myPicIds=typeof raw.myPicIds==='string'&&raw.myPicIds.length<2000?raw.myPicIds:'';out.hudHeadway=['simple','detail'].indexOf(raw.hudHeadway)>=0?raw.hudHeadway:'off';out.hudHeadwayHidden=raw.hudHeadwayHidden===true;
 ['OffsetX','OffsetY'].forEach(s=>{const v=raw['hudHeadway'+s];if(typeof v==='number'&&isFinite(v))out['hudHeadway'+s]=Math.max(-1000,Math.min(1000,Math.round(v)));});
 if(typeof raw.hudHeadwayScale==='number'&&isFinite(raw.hudHeadwayScale))out.hudHeadwayScale=Math.max(20,Math.min(200,Math.round(raw.hudHeadwayScale/5)*5));out.greetHello=raw.greetHello==='off'?'off':'on';out.greetBye=raw.greetBye==='off'?'off':'on';
 out.hudDoorAlert=raw.hudDoorAlert==='off'?'off':'on';out.hudDoorHidden=raw.hudDoorHidden===true;
 ['OffsetX','OffsetY'].forEach(s=>{const v=raw['hudDoor'+s];if(typeof v==='number'&&isFinite(v))out['hudDoor'+s]=Math.max(-1000,Math.min(1000,Math.round(v)));});
 BLIND_PARTS.forEach(p=>{['OffsetX','OffsetY'].forEach(s=>{const v=raw[p.prefix+s];if(typeof v==='number'&&isFinite(v))out[p.prefix+s]=Math.max(-1000,Math.min(1000,Math.round(v)));});out[p.prefix+'Hidden']=raw[p.prefix+'Hidden']===true;});
 if(typeof raw.hudTurnBlindScale==='number'&&isFinite(raw.hudTurnBlindScale))out.hudTurnBlindScale=Math.max(20,Math.min(200,Math.round(raw.hudTurnBlindScale/5)*5));
 if(typeof raw.hudDoorScale==='number'&&isFinite(raw.hudDoorScale))out.hudDoorScale=Math.max(20,Math.min(200,Math.round(raw.hudDoorScale/5)*5));
 // vehicle alerts (1.3.48): all of them by default and no option any more (main.js sets 'all' at the start); hidden
 // only in the Navigation tab's Position / size
 out.hudCarAlerts=ALERT_MODES.includes(raw.hudCarAlerts)?raw.hudCarAlerts:'all';out.hudCarAlertHidden=raw.hudCarAlertHidden===true;
 ['OffsetX','OffsetY'].forEach(s=>{const v=raw['hudCarAlert'+s];if(typeof v==='number'&&isFinite(v))out['hudCarAlert'+s]=Math.max(-1000,Math.min(1000,Math.round(v)));});
 if(typeof raw.hudCarAlertScale==='number'&&isFinite(raw.hudCarAlertScale))out.hudCarAlertScale=Math.max(20,Math.min(200,Math.round(raw.hudCarAlertScale/5)*5));
 out.layoutPreview=typeof raw.layoutPreview==='string'&&/^(hud|cluster|nav):[A-Za-z]{1,20}@[0-9]{1,15}$/.test(raw.layoutPreview)?raw.layoutPreview:'';
 return out;
}
function metricSlots(items){if(items.length<3)return items.map((id,i)=>({id,side:i,row:0,rows:1,index:i+1}));return items.map((id,i)=>({id,side:i<2?0:1,row:i%2,rows:i<2||items.length===4?2:1,index:i+1}));}
function sportMode(mode){return /^(SPORT|PHEV_SPORT)/.test(String(mode||''));}
function navAllowed(cfg,mode){return cfg.hudNavigationEnabled&&cfg.navDisplayMode!=='stock'&&!(cfg.navDisplayMode==='excludeSport'&&sportMode(mode));}
// All modes RPM display: 'redline' every mode, 'nosport' every mode but Sport (Sport then follows its own row).
function allOutput(cfg,name,mode){const v=cfg['all'+name+'Output'];return v==='redline'||v==='nosport'&&!sportMode(mode);}
function rpmOutput(cfg,name,mode){return allOutput(cfg,name,mode)||sportMode(mode)&&cfg['sport'+name+'Output']==='redline';}
// Whether some drive mode shows the Redline display (the mode not known yet).
function rpmOutputPossible(cfg,name){return ['redline','nosport','bc'].includes(cfg['all'+name+'Output'])||['redline','bc'].includes(cfg['sport'+name+'Output']);}
// BC mode (1.3.42, the cluster only): in Sport its own row decides (BC mode, or Redline over an All modes BC mode);
// in the other modes the All modes row.
// 1.3.48: the HUD too (name 'Hud'); 'Cluster' when not given
function bcModeNow(cfg,mode,name){const n=name==='Hud'?'Hud':'Cluster',s=cfg['sport'+n+'Output'],a=cfg['all'+n+'Output'];return sportMode(mode)?s==='bc'||s!=='redline'&&a==='bc':a==='bc';}
// HUD turn signals: the pair (Turn: position and size of both), then each side's own position.
const TURN_STYLES=['arrow','chevron3','chevron'],TURN_COLORS={green:'#2fd65a',blue:'#3d8bff',orange:'#ff9a1f'};
const TURN_PARTS=[{key:'Turn',label:'Both turn signals',prefix:'hudTurn',scale:'hudTurnScale'},{key:'TurnLeft',label:'Left turn signal',prefix:'hudTurnLeft',scale:'hudTurnScale'},{key:'TurnRight',label:'Right turn signal',prefix:'hudTurnRight',scale:'hudTurnScale'}];
// Default: a pair just under the default HUD design's RPM gauge (it spans x 146-559, y 93-234), centred on it.
const TURN_BASE={w:44,h:36,gap:44,x:352,y:264};
function turnRect(cfg,side){
 const s=(cfg.hudTurnScale||100)/100,w=Math.round(TURN_BASE.w*s),h=Math.round(TURN_BASE.h*s),own=side==='left'?'hudTurnLeft':'hudTurnRight';
 const cx=TURN_BASE.x+(side==='left'?-1:1)*(TURN_BASE.gap*s+w/2)+(cfg.hudTurnOffsetX||0)+(cfg[own+'OffsetX']||0),cy=TURN_BASE.y+(cfg.hudTurnOffsetY||0)+(cfg[own+'OffsetY']||0);
 return {x:Math.max(0,Math.min(800-w,Math.round(cx-w/2))),y:Math.max(0,Math.min(480-h,Math.round(cy-h/2))),w,h};
}
/** A side's blind spot sign: under the default place of that side's turn arrow, then its own offsets and size. */
function blindRect(cfg,side){
 const a=turnRect({},side),s=(cfg.hudTurnBlindScale||100)/100,w=Math.round(BLIND_BASE.w*s),h=Math.round(BLIND_BASE.h*s),own=side==='left'?'hudTurnBlindLeft':'hudTurnBlindRight';
 const x=a.x+a.w/2-w/2+(cfg.hudTurnBlindOffsetX||0)+(cfg[own+'OffsetX']||0),y=a.y+a.h+BLIND_BASE.gap+(cfg.hudTurnBlindOffsetY||0)+(cfg[own+'OffsetY']||0);
 return {x:Math.max(0,Math.min(800-w,Math.round(x))),y:Math.max(0,Math.min(480-h,Math.round(y))),w,h};
}
// The sides drawn now: lit ones, or both while a turn signal part is being moved in Position / size.
// <<< >>> does not go dark: it fills one, two, three chevrons in turn (turnStep) while the signal is on.
const TURN_SIDES={left:['left'],right:['right'],both:['left','right']};
function turnSides(cfg,indicator,lit,preview){
 if(preview)return ['left','right'];
 if(cfg.hudTurnSignals!=='on'||cfg.hudTurnHidden)return [];
 const sides=TURN_SIDES[indicator]||[],shown=cfg.hudTurnStyle==='chevron3'||lit;
 return shown?sides.filter(side=>!cfg[(side==='left'?'hudTurnLeft':'hudTurnRight')+'Hidden']):[];
}
// Chevrons <<< >>> draws now (1-3); every other shape, and the Position / size preview, is whole (0).
function turnCount(cfg,step,preview){return cfg.hudTurnStyle==='chevron3'&&!preview?Math.max(1,Math.min(3,step||3)):0;}
function navVisible(cfg,mode){const on=navAllowed(cfg,mode);return {direction:on&&!cfg.hudNavHidden,text:on&&!cfg.hudTextHidden,lanes:on&&!cfg.hudLanesHidden};}
// Settings layout editor: the part being adjusted, honoured for two minutes after the last edit.
function layoutPreview(cfg,now){const m=/^(hud|cluster|nav):([A-Za-z]+)@([0-9]+)$/.exec(cfg.layoutPreview||'');if(!m)return null;const at=Number(m[3]),t=typeof now==='number'?now:Date.now();return t>=at-5000&&t-at<=120000?{display:m[1]==='nav'?'hud':m[1],tab:m[1],part:m[2]}:null;}
// HH:MM in the head unit's local time, or fixed UTC+9 when the system clock has no Korean time zone.
function clockText(cfg,date){const d=date||new Date(),t=cfg.clockZone==='utc9'?new Date(d.getTime()+9*3600000):d,h=cfg.clockZone==='utc9'?t.getUTCHours():t.getHours(),m=cfg.clockZone==='utc9'?t.getUTCMinutes():t.getMinutes();return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}
function navRect(cfg,key){const p=NAV_LAYOUT_PARTS.find(p=>p.key===key),s=cfg[p.scale]/100,w=Math.round(p.w*s),h=Math.round(p.h*s);
 if(key==='Then'){const d=navRect(cfg,'Direction'),k=d.w/240;return {x:Math.round(d.x+108*k+cfg.hudThenOffsetX),y:Math.round(d.y+66*k+cfg.hudThenOffsetY),w,h};}
 return {x:Math.round((800-w)/2+cfg[p.prefix+'OffsetX']),y:Math.round(240+cfg[p.prefix+'OffsetY']),w,h};}
function visibleMetrics(cfg,display){const a=auxConfig(cfg[display+'AuxConfig']);if(a.mode==='off')return [];
 // A Redline app layout shows its readouts whatever the default design's Aux left / right hide settings are.
 if(cfg[display+'Design']&&cfg[display+'Design']!=='own')return a.items.slice(0,4);return metricSlots(a.items).filter(s=>!cfg[display+(s.side?'AuxRight':'AuxLeft')+'Hidden']).map(s=>s.id);}
function faceVisible(cfg,d){if(cfg[d+'Design']&&cfg[d+'Design']!=='own')return !cfg[d+'RpmGaugeHidden']&&partsFor(d,cfg).some(p=>p.key!=='RpmGauge'&&!cfg[d+p.key+'Hidden']);return partsFor(d,cfg).some(p=>!cfg[d+p.key+'Hidden'])||(d==='hud'?!cfg.hudMarkLineHidden:!cfg.clusterMarkTopLineHidden||!cfg.clusterMarkBottomLineHidden);}
function faceRpmNeeded(cfg,d){return !cfg[d+'RpmGaugeHidden']||!cfg[d+'RpmValueHidden']||!cfg[d+'AlertHidden']&&(d!=='hud'||cfg.hudAlertStyle!=='circle'||!cfg.hudGearHidden)||visibleMetrics(cfg,d).includes('power');}
module.exports={laneRect,carMeterFaces,bcModeNow,HEADWAY_PARTS,headwayRect,BLIND_PARTS,blindRect,DOOR_PARTS,doorRect,NAV_COLORS,NAV_COLOR_NAMES,ALERT_MODES,ALERT_PART,NAV_LAYOUT_PARTS,allOutput,rpmOutputPossible,TURN_STYLES,TURN_COLORS,TURN_PARTS,turnRect,turnSides,turnCount,METRICS,GAUGE_ONLY,HUD_DESIGNS,layoutPreview,clockText,LABELS,PARTS,PART_LABELS,NAV_PARTS,RL_PARTS,defaults,normalize,auxConfig,metricSlots,sportMode,navAllowed,navVisible,navRect,rpmOutput,partsFor,visibleMetrics,faceVisible,faceRpmNeeded};
