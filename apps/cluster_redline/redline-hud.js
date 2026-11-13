'use strict';
// The Redline app's HUD layouts (appsKOR apps/redline, MIT; see NOTICE) as Cluster Redline HUD and cluster designs.
// Every function takes the display d ('hud', the default, or 'cluster'): its design, readouts and part settings.
// Cluster Redline supplies the data (rpm, gear, the drive-mode shift point, the selected auxiliary items);
// rl-hud-draw.js draws its 400x130 image. Painted directly at the HUD size, so nothing is resampled.
// Redline's learning, shift grades, downshift cue and peak hold are not part of this port.
// The drawing modules need the kit; they load on first use so host tests can load the settings UI without it.
let drawing=null;const kit=()=>drawing||(drawing={DRAW:require('./rl-hud-draw'),Canvas:require('./kit/canvas').Canvas});
const {shiftSpec}=require('./shift-alert'),{auxConfig}=require('./display-config'),{gauges}=require('./units'),{language}=require('./strings');
// The Redline app's layouts (Minimal and Split wings not offered: Standard with parts hidden covers them),
// then Cluster Redline's own six (rl-hud-x.js, a taller 400x176 image).
const STYLES=['standard','digital','vfd','vector','arc','ramp','dial','shift','logger','needle','rings','ribbon','hexagon','sportdial','classic','luxury','sporthud','tyres'],TALL=['shift','logger','needle','rings','ribbon','hexagon','sportdial','classic','luxury','sporthud','tyres'];
const NAMES={standard:'Standard',minimal:'Minimal',wings:'Split wings',digital:'80s digital dash',vfd:'VFD glow',vector:'Vector arcade',arc:'Arc (F80 M3/M4)',ramp:'Ramp (G80 M3/M4)',dial:'Dial (E60 M5)',shift:'M shift lights',logger:'Data logger',needle:'Analog needle',rings:'G-force + RPM rings',ribbon:'Mode ribbon',hexagon:'Hexagon',sportdial:'Sport dial',classic:'Classic dial',luxury:'Luxury arc',sporthud:'Sport HUD',tyres:'Tyres & trip'};
// Layouts made for the cluster only (too detailed for the HUD's glass): not offered on the HUD.
// Layouts that draw the auxiliary items as bar gauges in gauge mode (the others show them as text).
const GAUGE_LAYOUTS=['standard','digital','vfd','vector','ramp','shift','logger','ribbon','hexagon','classic','sporthud','sportdial','tyres'];
const CLUSTER_ONLY=['sportdial','classic','tyres'],HUD_ONLY=['sporthud'],stylesFor=d=>STYLES.filter(s=>!(d==='hud'?CLUSTER_ONLY:HUD_ONLY).includes(s));
const IW=400,IH=130,heightOf=st=>TALL.includes(st)?176:IH,isNum=x=>typeof x==='number'&&isFinite(x);
function style(cfg,d){const m=/^rl-([a-z]+)$/.exec(cfg&&cfg[(d||'hud')+'Design']||'');return m&&STYLES.includes(m[1])?m[1]:null;}
function active(cfg,d){return !!style(cfg,d);}
// Cluster Redline's gear text ('M3', 'S4', 'D', 'P', '--') as Redline's { gear, stage } and mode letter.
function gearOf(text){
 const t=typeof text==='string'?text:'',m=/^([DSM])?(\d+)$/.exec(t);
 if(m)return {gear:Number(m[2]),stage:'D',mode:m[1]||null};
 if(/^[PRN]$/.test(t))return {gear:0,stage:t,mode:null};
 if(t==='D')return {gear:null,stage:'D',mode:null};
 return {gear:null,stage:null,mode:null};
}
const LABEL={boost:'BOOST',torque:'TORQUE',power:'POWER',gforce:'G',outside:'OUT',oil:'OIL',batteryCharge:'BATT',batteryVoltage:'VOLT',economy:'ECON',avgSpeed:'AVG SPD',tripTime:'TIME',clock:'CLOCK'};
const KO={BOOST:'부스트',TORQUE:'토크',POWER:'마력',G:'G',OUT:'외기',OIL:'오일',BATT:'배터리',VOLT:'전압',ECON:'연비','AVG SPD':'평속',TIME:'주행',CLOCK:'시계'};
function readouts(state,d){
 const cfg=state.config,a=auxConfig(cfg[(d||'hud')+'AuxConfig']),v=state.aux||{},g=gauges(state),label=id=>{const l=LABEL[id];return language()==='ko'&&KO[l]?KO[l]:l;};
 if(a.mode==='off')return [];
 return a.items.slice(0,4).map(id=>{
  let value='--',tone='text';
  if(id==='torque'||id==='power'){const x=g[id];value=x&&isNum(x.value)?String(Math.round(x.value)):'--';}
  else if(id==='clock')value=typeof v.clock==='string'?v.clock:'--:--';
  else if(id==='oil'||id==='outside'){if(isNum(v[id])){value=Math.round(v[id])+'°';if(id==='oil')tone=v[id]<70?'cold':v[id]>130?'hot':'text';}}
  else if(id==='boost')value=isNum(v.boost)?v.boost.toFixed(2):'--';
  else if(id==='gforce')value=isNum(v.gforce)?v.gforce.toFixed(2):'--';
  else if(id==='batteryCharge')value=isNum(v.batteryCharge)?Math.round(v.batteryCharge)+'%':'--';
  else if(id==='batteryVoltage')value=isNum(v.batteryVoltage)?v.batteryVoltage.toFixed(1):'--';
  else if(id==='economy')value=isNum(v.economy)?v.economy.toFixed(1):'--';
  else if(id==='avgSpeed')value=isNum(v.avgSpeed)?String(Math.round(v.avgSpeed)):'--';
  else if(id==='tripTime')value=isNum(v.tripTime)?Math.floor(v.tripTime/60)+':'+String(v.tripTime%60).padStart(2,'0'):'--:--';
  // a gauge's fraction and ends, for layouts that draw bars in gauge mode (Sport dial)
  let frac=null,lo=null,hi=null,unit='';try{const m=require('./aux-draw').metric(state,id);unit=m.unit||'';if(isNum(m.value)&&isNum(m.maximum)&&m.maximum>(m.minimum||0)){lo=m.minimum||0;hi=m.maximum;frac=Math.max(0,Math.min(1,(m.value-lo)/(hi-lo)));}}catch(e){}
  return {id,label:label(id),value,tone,gauge:a.mode==='gauges',frac,lo,hi,unit};
 });
}
// Redline's frame from Cluster Redline's render state. Lights count over the 1500 rpm before the shift
// point (Redline's plain span) and flash at it, with the comfort/sport shift point of the drive mode.
function frame(state,now,d){
 const cfg=state.config,rpm=isNum(state.rpm)?state.rpm:null,spec=shiftSpec(cfg,state.mode),g=gearOf(state.gear);
 const limiter=rpm!==null&&rpm>=cfg.maxRpm-50,flash=!!state.shift||limiter,blink=flash?state.flash!==false:true;
 return {d:{rpm,gear:g.gear,stage:g.stage},shift:spec.shift,redline:cfg.redlineRpm,max:cfg.maxRpm,blink,
  cue:{from:spec.shift-1500,at:spec.shift,shift:!!state.shift,limiter},drive:state.mode||null,oil:(state.aux||{}).oil,tyres:{temp:(state.aux||{}).tyreTemp||null,bar:(state.aux||{}).tyrePressure||null},g:{lat:(state.aux||{}).gLat,long:(state.aux||{}).gLong,total:(state.aux||{}).gforce},down:0,peak:0,chip:null,shake:null,readouts:readouts(state,d),mode:g.mode,
  opts:{style:style(cfg,d)||'standard',palette:'colour',gear:true,rpm:true,bar:true,lights:true,gt3:true,dim:true,lightStyle:'gt3',clearLabels:false}};
}
function paint(target,state,k,ox,oy,now,d){const {DRAW}=kit();DRAW.drawLayer(DRAW.scaled(target,k,ox||0,oy||0),frame(state,now,d));}
function drawSized(state,w,h){const {Canvas}=kit(),cv=new Canvas(Math.max(1,Math.round(w||IW)),Math.max(1,Math.round(h||heightOf(style(state&&state.config)))));cv.clear([0,0,0,0]);if(state&&state.config)paint(cv,state,(w||IW)/IW);return cv;}
function draw(state){return drawSized(state,IW);}
// Where it sits on the HUD: centred on the RPM face's placement, 400x130 at the default 75 % HUD size,
// moved and sized with the RPM gauge part (Position / size).
// The layout's drawn extent (union of its elements, the M mark aside) in image units, from a full frame.
function extent(cfg,d){
 const st={config:cfg,rpm:0,gear:'--',aux:{}};let u=null;
 elements(cfg,d).filter(e=>e.id!=='mark').forEach(e=>{const b=bounds(st,e.id,d);if(!b)return;u=u?{x0:Math.min(u.x0,b.x),y0:Math.min(u.y0,b.y),x1:Math.max(u.x1,b.x+b.w),y1:Math.max(u.y1,b.y+b.h)}:{x0:b.x,y0:b.y,x1:b.x+b.w,y1:b.y+b.h};});
 return u||{x0:0,y0:0,x1:IW,y1:heightOf(style(cfg,d))};
}
// Where the whole layout goes: each layout fitted to the visible area (the HUD's 600x180 window, or the
// cluster area) at 100 %, sized by Whole layout's Size and moved by its X / Y, and kept inside the area:
// its size is capped and its position clamped so the drawn extent never leaves it.
// The HUD's visible face is larger than what the windscreen shows clearly: a Redline layout is sized and placed
// at first inside the area the default design uses (the top 15 % and the outer edges stay empty). Whole layout
// and element X / Y may then move it anywhere on the HUD picture (as the default design's parts can), so a car
// whose HUD shows a lower band can bring it down.
function safe(face,d){if(!face||d==='cluster')return face;const x=Math.round(face.w*0.04),t=Math.round(face.h*0.15),b=Math.round(face.h*0.05);return {x:face.x+x,y:face.y+t,w:face.w-2*x,h:face.h-t-b};}
function room(face,d){return d==='cluster'||!face||!face.tw?face:{x:0,y:0,w:face.tw,h:face.th};}
// HUD defaults per layout, tuned on the car (1.2.21): Whole layout this many Down presses (10 each) lower,
// lift: an element's extra [x, y] (or y) in presses of 10,
// and the readouts (and Hexagon's RPM number) this much larger. Added to what Position / size stores, so
// stored 0 / 100 % is this default and Reset brings it back.
const HUD_BASE={standard:{y:10},vector:{y:10},digital:{y:10},vfd:{y:10},arc:{y:30},ramp:{y:10},dial:{y:20},
 shift:{y:30,read:200,lift:{RlRead:-40}},logger:{y:30},needle:{y:20,read:150,lift:{RlReadA:[60,-60],RlReadB:[-60,-60],RlReadC:[60,50],RlReadD:[-60,50]}},rings:{y:40,read:120,lift:{RlRead:-20}},ribbon:{y:20,read:120},hexagon:{y:30,read:200,rpm:150,lift:{RlReadA:[50,-20],RlReadB:[50,-30],RlReadC:[-50,-20],RlReadD:[-50,-30]},
  gauge:{read:140,lift:{RlReadA:[40,-10],RlReadB:[-40,-10]}}}};   // gauge mode: one tall box each side
function hudBase(cfg,d){if(d==='cluster')return {};const b=HUD_BASE[style(cfg,d)]||{};return b.gauge&&auxConfig(cfg[(d||'hud')+'AuxConfig']).mode==='gauges'?Object.assign({},b,b.gauge):b;}
function baseScale(cfg,d,key){const b=hudBase(cfg,d);return (/^RlRead/.test(key)?b.read:key==='RlRpm'?b.rpm:0)||100;}
function rect(cfg,face0,d){
 const face=safe(face0,d);
 const p=(d||'hud')+'RpmGauge',u=extent(cfg,d),uw=u.x1-u.x0,uh=u.y1-u.y0,cl=d==='cluster';
 const base=cl?face0.w/1088*2:face0.w/600,m=cl?8:0,fit=Math.min(1,(face.w-m)/(uw*base),(face.h-m)/(uh*base)),cap=Math.min((face.w-m/2)/uw,(face.h-m/2)/uh);
 const k=Math.min(cap,base*fit*(cfg[p+'WidthScale']||100)/100),w=Math.round(IW*k),h=Math.round(heightOf(style(cfg,d))*k);
 const ox=(cfg[p+'OffsetX']||0)*face0.w/(cl?1088:800),oy=((cfg[p+'OffsetY']||0)+(hudBase(cfg,d).y||0))*face0.h/(cl?480:240);
 const ex=face.x+(face.w-uw*k)/2+ox,ey=face.y+(face.h-uh*k)/2+oy;
 const a=room(face0,d)||face,e=m/4,cx=Math.max(a.x+e,Math.min(a.x+a.w-e-uw*k,ex)),cy=Math.max(a.y+e,Math.min(a.y+a.h-e-uh*k,ey));
 return {x:Math.round(cx-u.x0*k),y:Math.round(cy-u.y0*k),w,h};
}
// Elements of each layout that move, size and hide on their own (Position / size), in drawing order.
// Readouts are one group on the bar layouts and one element each on the M layouts.
const ELEMENTS={
 standard:['mode','gear','alert','gauge','read','mark'],minimal:['mode','gear','alert','mark'],wings:['mode','alert','gauge','gear','mark'],
 digital:['mode','alert','gauge','gear','rpm','read','mark'],vfd:['mode','alert','gauge','gear','rpm','read','mark'],vector:['mode','gear','alert','gauge','read','mark'],
 arc:['alert','gauge','gear','mode','readD','readA','readB','readC','mark'],ramp:['alert','gauge','gear','mode','rpm','readA','readB','readC','readD','mark'],dial:['gauge','readB','readC','readD','gear','mode','readA','mark'],
 shift:['alert','gear','mode','rpm','read','mark'],logger:['gauge','gear','mode','rpm','readA','readB','readC','readD','mark'],needle:['gauge','gear','mode','readA','readB','readC','readD','mark'],
 rings:['gmeter','gauge','gear','mode','rpm','read','mark'],ribbon:['gauge','gear','mode','readA','readB','readC','readD','mark'],
 hexagon:['gauge','alert','gear','mode','rpm','readA','readB','readC','readD','mark'],
 sportdial:['gauge','alert','rpm','gear','mode','readA','readB','readC','readD','mark'],
 classic:['gauge','alert','temp','gear','mode','readA','readB','readC','readD','mark'],
 luxury:['gauge','alert','rpm','gear','mode','readA','readB','readC','readD','mark'],
 sporthud:['gauge','alert','gear','rpm','mode','readA','readB','readC','readD','mark'],
 tyres:['car','gear','mode','readA','readB','readC','readD']};
const PART={gear:'RlGear',mode:'RlMode',alert:'RlAlert',rpm:'RlRpm',gauge:'RlGauge',read:'RlRead',readA:'RlReadA',readB:'RlReadB',readC:'RlReadC',readD:'RlReadD',gmeter:'RlGMeter',temp:'RlTemp',car:'RlCar',mark:'RlMark'};
const PART_NAMES=Object.keys(PART).map(k=>PART[k]);
const LABELS={RlCar:'Car and tyres',RlTemp:'Temperature gauge',RlGear:'Gear',RlMode:'Drive mode',RlAlert:'RPM alert',RlRpm:'RPM number',RlGauge:'RPM gauge',RlRead:'Readouts',RlReadA:'Readout 1',RlReadB:'Readout 2',RlReadC:'Readout 3',RlReadD:'Readout 4',RlGMeter:'G-force meter',RlMark:'M mark'};
function readoutCount(cfg,d){const a=auxConfig(cfg[(d||'hud')+'AuxConfig']);return a.mode==='off'?0:Math.min(4,a.items.length);}
// The elements the chosen layout draws with the chosen readouts: [{id, key}].
function elements(cfg,d){
 const st=style(cfg,d);if(!st)return [];const n=readoutCount(cfg,d);
 return ELEMENTS[st].filter(id=>id==='read'?n>0:/^read[A-D]$/.test(id)?'ABCD'.indexOf(id[4])<n:true).map(id=>({id,key:PART[id]}));
}
// An element's extent in the 400x130 image, measured from a full frame (top revs, all lights lit, a wide
// gear and readouts) so it doesn't change with the live values.
function bboxCanvas(){
 const {Canvas}=kit(),probe=new Canvas(1,1),b={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
 const add=(x,y)=>{if(!isNum(x)||!isNum(y))return;b.x0=Math.min(b.x0,x);b.y0=Math.min(b.y0,y);b.x1=Math.max(b.x1,x);b.y1=Math.max(b.y1,y);};
 const box=(x,y,w,h)=>{add(x,y);add(x+w,y+h);};
 const pt=(cx,cy,r,a)=>add(cx+r*Math.sin(a*Math.PI/180),cy-r*Math.cos(a*Math.PI/180));
 const width=(t,size,o)=>{try{return probe.textWidth(String(t),size,o);}catch(e){return String(t).length*size*0.6;}};
 return {b,
  circle:(cx,cy,r)=>box(cx-r,cy-r,2*r,2*r),
  arc:(cx,cy,r0,r1,a0,a1)=>{const lo=Math.min(a0,a1),hi=Math.max(a0,a1);for(let a=lo;;a=Math.min(hi,a+2)){pt(cx,cy,r0,a);pt(cx,cy,r1,a);if(a>=hi)break;}},
  fillRect:(x,y,w,h)=>box(x,y,w,h),
  quad:(pts)=>pts.forEach(p=>add(p[0],p[1])),
  polyline:(pts,w)=>pts.forEach(p=>box(p[0]-w/2,p[1]-w/2,w,w)),
  line:(xa,ya,xb,yb,w)=>{box(xa-w/2,ya-w/2,w,w);box(xb-w/2,yb-w/2,w,w);},
  text:(t,x,y,size,c,o)=>{const w=width(t,size,o),al=o&&o.align;box(al==='center'?x-w/2:al==='right'?x-w:x,y-size*0.8,w,size*1.05);},
  textWidth:(t,size,o)=>width(t,size,o),
 };
}
const boundsCache=new Map();
// The M mark (m-mark.js, as on the Cluster Redline design): off until added, top right of the image.
const MARK={x:IW-62,y:2,w:56,h:18};
// Where each layout has room for it by default (image units); the top right elsewhere.
const MARK_AT={standard:{x:2,y:106},wings:{x:2,y:0,w:44,h:14},digital:{x:2,y:108,w:50,h:16},vfd:{x:2,y:108,w:50,h:16},vector:{x:2,y:106},
 arc:{x:2,y:2},ramp:{x:2,y:2},dial:{x:2,y:108},shift:{x:322,y:78},needle:{x:172,y:2}};
function bounds(state,id,d){
 if(id==='mark')return Object.assign({},MARK,MARK_AT[style(state.config,d)]||{});
 const cfg=state.config,f=frame(Object.assign({},state,{rpm:cfg.maxRpm,gear:'M8',flash:true}),0,d);
 f.d=Object.assign({},f.d,{rpm:f.max,gear:8,stage:'D'});f.mode='M';f.blink=true;f.cue=Object.assign({},f.cue,{shift:true});
 f.readouts=(f.readouts||[]).map(r=>Object.assign({},r,{value:'88.88'},r.gauge?{frac:1,lo:888,hi:888}:{}));f.tyres={temp:{FL:-40,FR:-40,RL:-40,RR:-40},bar:{FL:9.9,FR:9.9,RL:9.9,RR:9.9}};f.drive='COMFORT';f.only=id;   // the longest drive-mode name
 const k=JSON.stringify([id,f.opts.style,f.max,f.redline,f.readouts.map(r=>r.label+(r.gauge?'|g':''))]);
 if(boundsCache.has(k))return boundsCache.get(k);
 const cv=bboxCanvas();kit().DRAW.drawLayer(cv,f);
 const b=cv.b,r=b.x1>b.x0?{x:Math.floor(b.x0)-2,y:Math.floor(b.y0)-2,w:Math.ceil(b.x1-b.x0)+4,h:Math.ceil(b.y1-b.y0)+4}:null;
 if(boundsCache.size>200)boundsCache.clear();boundsCache.set(k,r);return r;
}
// Where an element lands on the HUD: the whole layout's place (rect), then the element's own move and
// size (in the image's units, sized uniformly round its centre).
function partRect(cfg,layout,b,key,d,spread){
 const p=(d||'hud')+key,k=layout.w/IW,s=(cfg[p+'WidthScale']||100)/100*baseScale(cfg,d||'hud',key)/100,ox=(cfg[p+'OffsetX']||0)+(spread?spread.x:0),oy=(cfg[p+'OffsetY']||0)+(spread?spread.y:0);
 return {x:Math.round(layout.x+(b.x+b.w*(1-s)/2+ox)*k),y:Math.round(layout.y+(b.y+b.h*(1-s)/2+oy)*k),w:Math.max(1,Math.round(b.w*s*k)),h:Math.max(1,Math.round(b.h*s*k))};
}
// One element painted at its own size (no resampling): {W, H, draw(state) -> Canvas}.
// The heavy dials (Sport dial, Classic dial): their RPM gauge is two cached pictures, the still face (redrawn
// only when its look changes) and the live needle over it, so a new rpm does not repaint the whole dial.
const SPLIT=['sportdial','classic'];
function nodes(state,e,d,key){
 if(typeof key==='function')key=key(e.id);
 if(e.id!=='gauge'||!SPLIT.includes(style(state.config,d)))return [{id:e.id,key,painter:partPainter(state,e.id,e.b,e.r,d)}];
 const f=frame(state,0,d),still=JSON.stringify([f.opts.style,'face',f.redline,f.max,require('./strings').language(),/ECO/.test(String(f.drive||''))?'eco':/SPORT/.test(String(f.drive||''))||!f.drive?'sport':'comfort']);
 return [{id:'gauge.face',key:still,painter:partPainter(state,'gauge',e.b,e.r,d,'face')},{id:'gauge',key,painter:partPainter(state,'gauge',e.b,e.r,d,'live')}];
}
function partPainter(state,id,b,r,d,sel){
 // draw(v): a new transparent canvas with the element; into(cv,v): the same, drawn on a cleared canvas of that size
 // (the render cache's tile, without an extra canvas and copy each time the element changes).
 if(id==='mark'){const into=cv=>{require('./m-mark').drawMark(cv,r.w/2,0,r.w,r.h);return cv;};return {W:r.w,H:r.h,into,draw:()=>{const {Canvas}=kit(),cv=new Canvas(r.w,r.h);cv.clear([0,0,0,0]);return into(cv);}};}
 const into=(cv,v)=>{const {DRAW}=kit(),k=r.w/b.w,f=frame(v,0,d);f.only=id;f.sel=sel;DRAW.drawLayer(DRAW.scaled(cv,k,-b.x*k,-b.y*k),f);return cv;};
 return {W:r.w,H:r.h,into,draw:v=>{const {Canvas}=kit(),cv=new Canvas(r.w,r.h);cv.clear([0,0,0,0]);return into(cv,v);}};
}
// The visible elements with their places: [{id, key, b, r}].
function clampTo(r,face){if(!face)return r;const w=Math.min(r.w,face.w),h=Math.min(r.h,face.h),s=Math.min(w/r.w,h/r.h),W=Math.max(1,Math.round(r.w*s)),H=Math.max(1,Math.round(r.h*s));
 return {x:Math.max(face.x,Math.min(face.x+face.w-W,r.x)),y:Math.max(face.y,Math.min(face.y+face.h-H,r.y)),w:W,h:H};}
// face: the visible area; a moved or enlarged element is kept inside it.
function placed(state,layout,d,face0){
 const cfg=state.config,p=d||'hud',face=room(face0,d||'hud'),band=safe(face0,d||'hud'),wholeMoved=!!(cfg[p+'RpmGaugeOffsetX']||cfg[p+'RpmGaugeOffsetY']||hudBase(cfg,p).y);
 // Unmoved, an element (the M mark included) stays in the default band; moved, anywhere on the HUD picture.
 const list=elements(cfg,d).filter(e=>!cfg[p+e.key+'Hidden']).map(e=>({e,b:bounds(state,e.id,d)})).filter(v=>v.b);
 // Readouts enlarged by the layout's default grow apart from their group centre, so they do not overlap.
 const reads=list.filter(v=>/^RlRead/.test(v.e.key)),f=reads.length>1?baseScale(cfg,p,'RlRead')/100:1;
 const C=reads.length?{x:reads.reduce((a,v)=>a+v.b.x+v.b.w/2,0)/reads.length,y:reads.reduce((a,v)=>a+v.b.y+v.b.h/2,0)/reads.length}:null;
 const lift=hudBase(cfg,p).lift||{};
 return list.map(({e,b})=>{const L=Array.isArray(lift[e.key])?lift[e.key]:[0,lift[e.key]||0],spread=f!==1&&/^RlRead/.test(e.key)?{x:(b.x+b.w/2-C.x)*(f-1)+L[0],y:(b.y+b.h/2-C.y)*(f-1)+L[1]}:L[0]||L[1]?{x:L[0],y:L[1]}:null;
  return Object.assign({b,r:clampTo(partRect(cfg,layout,b,e.key,d,spread),wholeMoved||cfg[p+e.key+'OffsetX']||cfg[p+e.key+'OffsetY']?face:band)},e);});
}
function key(state,d){const f=frame(state,0,d);return JSON.stringify([f.opts.style,f.d,f.shift,f.redline,f.max,f.cue,f.blink,f.readouts,f.mode]);}
// Each element's own key, so a tile repaints only when what it shows changes (the mode, readouts, M mark,
// temperature and G-meter do not follow the revs; the gear does on the layouts that light it towards the
// shift point, and on the others flashes at the limiter). One frame is read for all of them.
const GEAR_FOLLOWS_REVS=['ramp','sportdial','classic'];
function keys(state,d){
 const f=frame(state,0,d),st=f.opts.style,full=JSON.stringify([st,f.d,f.shift,f.redline,f.max,f.cue,f.blink,f.readouts,f.mode,f.drive]);
 const base=[st,f.redline,f.max,f.drive,f.mode,f.d.gear,f.d.stage,language()],memo={};
 return id=>{if(memo[id])return memo[id];let v;
  if(id==='gauge'||id==='alert'||id==='rpm'||id==='gear'&&GEAR_FOLLOWS_REVS.includes(st))v=full;
  else if(id==='gear')v=JSON.stringify(base.concat([f.cue.shift,f.cue.limiter,f.blink]));
  else if(id==='read')v=JSON.stringify(base.concat([f.readouts]));
  else if(/^read[A-D]$/.test(id))v=JSON.stringify(base.concat([f.readouts['ABCD'.indexOf(id[4])]||null]));
  else if(id==='gmeter')v=JSON.stringify(base.concat([f.g]));
  else if(id==='temp')v=JSON.stringify(base.concat([f.oil]));
  else v=JSON.stringify(base.concat([id]));
  return (memo[id]=v);};
}
module.exports={GAUGE_LAYOUTS,CLUSTER_ONLY,HUD_ONLY,stylesFor,HUD_BASE,safe,room,STYLES,NAMES,IW,IH,heightOf,extent,clampTo,ELEMENTS,PART,PART_NAMES,LABELS,style,active,gearOf,readouts,frame,paint,draw,drawSized,rect,key,keys,elements,bounds,partRect,partPainter,nodes,placed};
