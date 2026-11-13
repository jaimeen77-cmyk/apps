'use strict';
// Redline app layouts on the HUD: each element (gear, drive mode, RPM alert, RPM number, RPM gauge, readouts)
// moves, sizes and hides on its own in Position / size, and is saved, loaded and reset with the other parts.
// Usage: node redline-layout-parts.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const RL=require(root+'/redline-hud'),D=require(root+'/display-config'),{settings}=require(root+'/policy');
const {Canvas}=require(root+'/kit/canvas'),{blitScaled}=require(root+'/component-canvas'),{SettingsPage}=require(root+'/settings-ui');
const spec=require(root+'/kit/app-spec.json');
const AUX=JSON.stringify({mode:'values',items:['boost','torque','outside','oil']});
const stateOf=cfg=>({config:cfg,rpm:5200,gear:'M4',aux:{boost:1.2,outside:18,oil:95},mode:'SPORT'});
const layout={x:200,y:100,w:400,h:130};
function compose(state,at){const cv=new Canvas(800,480);cv.clear([0,0,0,0]);RL.placed(state,at||layout).forEach(e=>blitScaled(cv,RL.partPainter(state,e.id,e.b,e.r).draw(state),e.r));return cv;}
function litBox(cv,r){let n=0;for(let y=Math.max(0,r.y);y<Math.min(cv.h,r.y+r.h);y++)for(let x=Math.max(0,r.x);x<Math.min(cv.w,r.x+r.w);x++)if(cv.d[(y*cv.w+x)*4+3])n++;return n;}

// 1. At default positions every layout looks as the single Redline image did.
const expected={standard:['mode','gear','alert','gauge','read','mark'],minimal:['mode','gear','alert','mark'],wings:['mode','alert','gauge','gear','mark'],digital:['mode','alert','gauge','gear','rpm','read','mark'],
 vfd:['mode','alert','gauge','gear','rpm','read','mark'],vector:['mode','gear','alert','gauge','read','mark'],arc:['alert','gauge','gear','mode','readD','readA','readB','readC','mark'],
 ramp:['alert','gauge','gear','mode','rpm','readA','readB','readC','readD','mark'],dial:['gauge','readB','readC','readD','gear','mode','readA','mark'],
 shift:['alert','gear','mode','rpm','read','mark'],logger:['gauge','gear','mode','rpm','readA','readB','readC','readD','mark'],needle:['gauge','gear','mode','readA','readB','readC','readD','mark'],
 rings:['gmeter','gauge','gear','mode','rpm','read','mark'],ribbon:['gauge','gear','mode','readA','readB','readC','readD','mark'],
 hexagon:['gauge','alert','gear','mode','rpm','readA','readB','readC','readD','mark'],sportdial:['gauge','alert','rpm','gear','mode','readA','readB','readC','readD','mark'],classic:['gauge','alert','readA','readB','readC','readD','mark'],luxury:['gauge','alert','rpm','gear','mode','readA','readB','readC','readD','mark'],sporthud:['gauge','alert','gear','rpm','mode','readA','readB','readC','readD','mark'],tyres:['car','gear','mode','readA','readB','readC','readD']};
RL.stylesFor('hud').forEach(st=>{
 const cfg=settings({hudDesign:'rl-'+st,hudAuxConfig:AUX}),state=stateOf(cfg);
 assert.deepStrictEqual(RL.elements(cfg).map(e=>e.id),expected[st],st+' elements');
 const ih=RL.heightOf(st),at={x:200,y:100,w:400,h:ih};assert.strictEqual(ih,['shift','logger','needle','rings','ribbon','hexagon','sportdial','classic','luxury','sporthud','tyres'].includes(st)?176:130);
 const a=new Canvas(800,480);a.clear([0,0,0,0]);blitScaled(a,RL.drawSized(state,400,ih),at);const b=compose(state,at);
 let worst=0;for(let i=0;i<a.d.length;i++)worst=Math.max(worst,Math.abs(a.d[i]-b.d[i]));
 const tuned=RL.HUD_BASE[st]&&(RL.HUD_BASE[st].read||RL.HUD_BASE[st].rpm);if(!tuned)assert(worst<=48,st+': default positions match the original image (worst channel difference '+worst+')');
 const off=settings({hudDesign:'rl-'+st,hudAuxConfig:JSON.stringify({mode:'off',items:['boost']})});
 assert(!RL.elements(off).some(e=>/^read/.test(e.id)),st+': no readout elements without readouts');
});

// 2. Move, size and hide one element; the others stay put.
const base=settings({hudDesign:'rl-standard',hudAuxConfig:AUX}),moved=settings(Object.assign({},base,{hudRlGearOffsetX:120,hudRlAlertHidden:true,hudRlReadWidthScale:150,hudRlReadHeightScale:100}));
assert.strictEqual(moved.hudRlReadHeightScale,150,'element size is uniform: height follows width');
const before=RL.placed(stateOf(base),layout),after=RL.placed(stateOf(moved),layout),at=(list,id)=>list.find(e=>e.id===id);
assert.strictEqual(at(after,'gear').r.x-at(before,'gear').r.x,120,'gear moved by its offset (400-unit image at scale 1)');
assert.deepStrictEqual(at(after,'gauge').r,at(before,'gauge').r,'other elements stay');
assert(!at(after,'alert'),'hidden element not drawn');
assert(Math.abs(at(after,'read').r.w-Math.round(at(before,'read').r.w*1.5))<=1,'readouts sized 150 %');
const cv=compose(stateOf(moved));assert(litBox(cv,at(after,'gear').r)>100,'moved gear is drawn where it went');
const hideAll=settings(Object.assign({},base,{hudRpmGaugeHidden:true}));assert.strictEqual(RL.elements(hideAll).length,6);assert(!D.faceVisible(hideAll,'hud'),'Whole layout hidden hides every element');
assert(D.faceVisible(base,'hud'));

// 3. Position / size: parts listed, uniform size, save / load / reset with the other parts.
const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});values.hudDesign='rl-arc';values.hudAuxConfig=AUX;
const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}};
const page=new SettingsPage(store,null,'test');page.selectTab(1);page.activate(page.keys().indexOf('layout'));
const parts=page.layoutParts();
assert.deepStrictEqual(parts.map(p=>p.key),['RpmGauge','RlGear','RlMode','RlAlert','RlGauge','RlReadA','RlReadB','RlReadC','RlReadD','RlMark']);
assert.strictEqual(parts[0].label,'Whole layout');
page.selectLayoutPart(1,true);page.adjust(0,1);page.adjust(1,-1);
assert.strictEqual(values.hudRlGearOffsetX,10);assert.strictEqual(values.hudRlGearOffsetY,-10);
page.adjust(2,1);assert.strictEqual(values.hudRlGearWidthScale,105);assert.strictEqual(values.hudRlGearHeightScale,105,'one Size control');
page.toggleHidden(false);assert.strictEqual(values.hudRlGearHidden,true);
page.saveSlot(1);assert.strictEqual(JSON.parse(values.hudLayoutSlot1).values.hudRlGearOffsetX,10,'saved with the slot');
page.resetLayout();page.resetLayout();assert.strictEqual(values.hudRlGearOffsetX,0);assert.strictEqual(values.hudRlGearHidden,false,'reset to defaults');
page.loadSlot(1);assert.strictEqual(values.hudRlGearOffsetX,10);assert.strictEqual(values.hudRlGearWidthScale,105);assert.strictEqual(values.hudRlGearHidden,true,'loaded back');
assert(!spec.settings.some(s=>/^hudRl/.test(s.key)),'kept outside app.json: the Store settings templates stay valid');
// 4. The cluster: its own design, readouts and element settings; drawn element by element in the cluster area.
const CL=require(root+'/draw');
const cl=settings({clusterDesign:'rl-arc',clusterAuxConfig:AUX,hudDesign:'own'}),clState=Object.assign(stateOf(cl),{mode:'SPORT'});
assert(RL.active(cl,'cluster')&&!RL.active(cl,'hud'),'cluster and HUD designs are separate');
assert.deepStrictEqual(D.partsFor('cluster',cl).map(p=>p.key),['RpmGauge','RlGear','RlMode','RlAlert','RlGauge','RlReadA','RlReadB','RlReadC','RlReadD','RlMark']);
const area={x:0,y:0,w:1088,h:480},lay=RL.rect(cl,area,'cluster');assert.deepStrictEqual([lay.w,lay.h],[800,260],'800x260 at 100 %');{const u=RL.extent(cl,'cluster'),k=lay.w/RL.IW;assert(Math.abs(lay.x+(u.x0+u.x1)/2*k-544)<=1,'drawn extent centred');}
const img=CL.draw(clState);assert.strictEqual(img.w,1088);
let lit=0;for(let i=3;i<img.d.length;i+=4)if(img.d[i])lit++;assert(lit>20000,'cluster layout drawn ('+lit+' px)');
const clMoved=settings(Object.assign({},cl,{clusterRlGearOffsetX:100,clusterRlReadDHidden:true}));
const p0=RL.placed(clState,lay,'cluster'),p1=RL.placed(Object.assign({},clState,{config:clMoved}),RL.rect(clMoved,area,'cluster'),'cluster');
assert.strictEqual(p1.find(e=>e.id==='gear').r.x-p0.find(e=>e.id==='gear').r.x,200,'cluster offsets in image units (x2 on the cluster)');
assert(!p1.find(e=>e.id==='readD'),'hidden on the cluster');
assert.strictEqual(RL.placed(stateOf(settings(Object.assign({},base,{clusterRlGearOffsetX:100}))),layout).find(e=>e.id==='gear').r.x,before.find(e=>e.id==='gear').r.x,'cluster settings leave the HUD alone');
// 5. Cluster Redline's five layouts: readouts follow the auxiliary setting, the rings read the G-force,
// the ribbon takes the drive mode's colour.
const demand=require(root+'/data-demand').demand;
const rings=settings({clusterDesign:'rl-rings',clusterAuxConfig:JSON.stringify({mode:'values',items:['oil']}),allClusterOutput:'redline',sportClusterOutput:'redline'});
assert(demand(rings,'SPORT').aux.has('gforce'),'G-force read for the G meter even when it is not a readout');
assert(!demand(settings(Object.assign({},rings,{clusterRlGMeterHidden:true})),'SPORT').aux.has('gforce'),'not with the G meter hidden');
assert.deepStrictEqual(D.partsFor('cluster',rings).map(p=>p.key),['RpmGauge','RlGear','RlMode','RlRpm','RlGauge','RlGMeter','RlRead','RlMark']);
const labels=items=>RL.frame(stateOf(settings({clusterDesign:'rl-logger',clusterAuxConfig:JSON.stringify({mode:'values',items})})),0,'cluster').readouts.map(r=>r.label);
assert.notDeepStrictEqual(labels(['boost','torque']),labels(['oil','economy']),'readouts follow the chosen auxiliary items');assert.strictEqual(labels(['oil','torque','economy']).length,3);
const ribbon=mode=>{const st=Object.assign(stateOf(settings({hudDesign:'rl-ribbon'})),{mode,rpm:4000});const cv=new Canvas(800,480);cv.clear([0,0,0,0]);RL.placed(st,{x:200,y:100,w:400,h:176}).filter(e=>e.id==='gauge').forEach(e=>blitScaled(cv,RL.partPainter(st,e.id,e.b,e.r).draw(st),e.r));
 const n={};for(let i=0;i<cv.d.length;i+=4)if(cv.d[i+3]>200){const k=cv.d[i]>200&&cv.d[i+2]<80?'orange':cv.d[i+2]>200&&cv.d[i]<120?'blue':cv.d[i+1]>180&&cv.d[i]<120?'green':'';if(k)n[k]=(n[k]||0)+1;}return Object.keys(n).sort((x,y)=>n[y]-n[x])[0];};
assert.strictEqual(ribbon('SPORT'),'orange');assert.strictEqual(ribbon('COMFORT'),'blue');assert.strictEqual(ribbon('ECO_PRO'),'green');
// 6. M mark: on every layout, HUD and cluster; off until added (Add / Remove M mark), then a normal element.
RL.stylesFor('hud').forEach(st=>assert(RL.elements(settings({hudDesign:'rl-'+st}),'hud').some(e=>e.id==='mark'),st+' offers the M mark'));
const plain=settings({clusterDesign:'rl-hexagon'});assert.strictEqual(plain.clusterRlMarkHidden,true,'off by default');assert.strictEqual(plain.hudRlMarkHidden,true);
assert(!RL.placed(stateOf(plain),{x:0,y:0,w:800,h:352},'cluster').some(e=>e.id==='mark'));
const withMark=settings({clusterDesign:'rl-hexagon',clusterRlMarkHidden:false}),m=RL.placed(stateOf(withMark),{x:0,y:0,w:800,h:352},'cluster').find(e=>e.id==='mark');
assert(m,'drawn once added');const mi=RL.partPainter(stateOf(withMark),'mark',m.b,m.r,'cluster').draw();let mpx=0;for(let i=3;i<mi.d.length;i+=4)if(mi.d[i])mpx++;assert(mpx>mi.w*mi.h*0.3,'the mark is painted');
const mv={};spec.settings.forEach(x=>{mv[x.key]=x.default;});mv.hudDesign='rl-ramp';
const mp=new SettingsPage({schema:spec.settings,get:k=>mv[k],set:(k,v)=>{mv[k]=v;},setMany(c){Object.assign(mv,c);}},null,'1.2.15');
mp.selectTab(1);mp.activate(mp.keys().indexOf('layout'));mp.toggleMMark();assert.strictEqual(mv.hudRlMarkHidden,false,'added');assert.deepStrictEqual([...mp.layoutSelected],['RlMark'],'and selected');
mp.adjust(0,1);assert.strictEqual(mv.hudRlMarkOffsetX,10);mp.saveSlot(2);mp.toggleMMark();assert.strictEqual(mv.hudRlMarkHidden,true,'removed');
mp.loadSlot(2);assert.strictEqual(mv.hudRlMarkHidden,false,'saved and loaded with the layout');mp.resetLayout();mp.resetLayout();assert.strictEqual(mv.hudRlMarkHidden,true,'reset: off');
const drawn=[];const ecv=new Canvas(1600,520),text=ecv.text;ecv.text=function(v){drawn.push(String(v));return text.apply(this,arguments);};mp.toggleMMark();mp.draw(ecv,null,null);
assert(mp.layoutActions.every(a=>a.x+a.w<=1600&&a.y+a.h<=520),'editor buttons fit');
// 7. Each layout keeps its own positions; every layout stays inside the visible area (HUD 600x180 window,
// cluster area) at any size or offset, elements too; Whole layout has one Size control; the design page's
// two own-design pictures stay themselves while a Redline layout is chosen.
{const {placement}=require(root+'/layout'),HUDP=require(root+'/hud-draw'),pv={};spec.settings.forEach(x=>{pv[x.key]=x.default;});pv.hudAuxConfig=AUX;
 const pg=new SettingsPage({schema:spec.settings,get:k=>pv[k],set:(k,v)=>{pv[k]=v;},setMany(c){Object.assign(pv,c);}},null,'1.2.18');pg.selectTab(1);
 const pick=st=>{pg.activate(pg.keys().indexOf('design'));pg.choose(2);pg.choose(RL.stylesFor('hud').indexOf(st));};
 pick('arc');pg.activate(pg.keys().indexOf('layout'));pg.selectLayoutPart(1,true);pg.adjust(0,1);pg.adjust(0,1);pg.back();assert.strictEqual(pv.hudRlGearOffsetX,20);
 pick('ramp');assert.strictEqual(pv.hudRlGearOffsetX,0,'another layout starts from its own (default) positions');pv.hudRlGearOffsetX=-30;
 pick('arc');assert.strictEqual(pv.hudRlGearOffsetX,20,'back on Arc: its positions again');pick('ramp');assert.strictEqual(pv.hudRlGearOffsetX,-30);
 pg.activate(pg.keys().indexOf('design'));pg.choose(0);assert.strictEqual(pv.hudDesign,'own');assert.strictEqual(pv.hudRlGearOffsetX,0);
 pg.activate(pg.keys().indexOf('design'));assert.strictEqual(pg.choice,0,'own design focused');pick('arc');pg.activate(pg.keys().indexOf('design'));assert.strictEqual(pg.choice,2,'Redline layout focused');pg.back();
 assert(D.partsFor('hud',settings({hudDesign:'rl-arc'}))[0].uniform,'Whole layout: one Size control');
 const inside=(r,f)=>r.x>=f.x-1&&r.y>=f.y-1&&r.x+r.w<=f.x+f.w+1&&r.y+r.h<=f.y+f.h+1;
 for(const d of ['hud','cluster'])for(const st of RL.stylesFor(d))for(const ex of [{},{[d+'RpmGaugeWidthScale']:200,[d+'RpmGaugeOffsetX']:900,[d+'RpmGaugeOffsetY']:900},{[d+'RpmGaugeOffsetX']:-900,[d+'RpmGaugeOffsetY']:-900},{[d+'RlGearWidthScale']:200,[d+'RlGearOffsetX']:700,[d+'RlMarkHidden']:false,[d+'RlMarkOffsetY']:-700}]){
  const c=settings(Object.assign({[d+'Design']:'rl-'+st,[d+'AuxConfig']:AUX},ex)),f=d==='hud'?placement(c,'hud',HUDP):{x:0,y:0,w:1088,h:480},l=RL.rect(c,f,d);
  RL.placed({config:c,rpm:0,gear:'--',aux:{}},l,d,f).forEach(e=>assert(inside(e.r,RL.room(f,d)),[d,st,JSON.stringify(ex),e.id,JSON.stringify(e.r)].join(' ')));}
 const own=settings({clusterDesign:'rl-hexagon'}),a1=CL.draw({config:Object.assign({},own,{clusterDesign:'own',clusterAlertStyle:'bar'}),rpm:4000,gear:'D3',aux:{}});
 const page2=new SettingsPage({schema:spec.settings,get:k=>({clusterDesign:'rl-hexagon'})[k]!==undefined?'rl-hexagon':pv[k],set(){},setMany(){}},null,'1.2.18');
 let calls=[];page2.preview=function(cv,c,x,y,w,d){calls.push(c[d+'Design']);};page2.selectTab(2);page2.activate(page2.keys().indexOf('design'));page2.draw(new Canvas(1600,520),null,null);
 assert.deepStrictEqual(calls,['own','own'],'the two design pictures stay the own designs');}
{const rb=settings({hudDesign:'rl-ribbon'}),m0=RL.bounds({config:rb,rpm:0,gear:'--',aux:{}},'mode','hud'),m1=RL.bounds({config:rb,rpm:0,gear:'--',aux:{},mode:'SPORT'},'mode','hud');
 assert.deepStrictEqual(m0,m1,'mode extent independent of the live drive mode');const {Canvas:C2}=require(root+'/kit/canvas'),w=new C2(1,1).textWidth(require(root+'/strings').language()==='ko'?'컴포트':'COMFORT',34*400/1088,{font:'bold'});assert(m0.w>=w,'room for the longest drive-mode name');}
console.log('PASS: Redline layouts split into elements matching the original image; each moves, sizes uniformly and hides; Whole layout still moves all; Position / size lists them and saves, loads and resets them; the same on the cluster with its own settings');
