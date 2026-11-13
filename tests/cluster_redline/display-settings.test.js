'use strict';
const assert=require('assert'),path=require('path'),fs=require('fs');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {SettingsPage,TABS}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),{settings}=require(root+'/policy');
const D=require(root+'/display-config'),{AuxInfo,SOURCES,filterAux}=require(root+'/aux-info'),{decodeDart,descriptionText}=require(root+'/native-navigation');
const HUD=require(root+'/hud-compose'),FACE=require(root+'/hud-draw'),CLUSTER=require(root+'/draw'),{migrate}=require(root+'/migrate');
const spec=require(root+'/kit/app-spec.json');
function store(old){const values={};spec.settings.forEach(s=>values[s.key]=s.default);Object.assign(values,old);const writes=[];return {schema:spec.settings,get:k=>values[k],set:(k,v)=>{writes.push([k,v]);values[k]=v;},writes,values};}
function draw(page){const cv=page.draw(new Canvas(1600,520));for(const target of cv.targets)assert(target.x>=0&&target.y>=0&&target.x+target.w<=1600&&target.y+target.h<=520);return cv;}
assert.strictEqual(TABS.length,5);assert.strictEqual(TABS[4],'Favorites');assert(!TABS.some(x=>/Advanced/.test(x)));
for(const tab of [1,2]){
 const s=store(),page=new SettingsPage(s,null,'test');page.selectTab(tab);const disp=tab===1?'hud':'cluster';draw(page);
 assert.deepStrictEqual(D.auxConfig(s.get(disp+'AuxConfig')),{mode:'gauges',items:['boost','torque']});
 page.activate(2);page.choose(1);assert.strictEqual(page.draft.items.length,0);const old=s.get(disp+'AuxConfig');
 page.toggleMetric('oil');page.toggleMetric('boost');page.back();assert.strictEqual(s.get(disp+'AuxConfig'),old,'Back must not commit a draft');
 page.choose(1);['outside','power','boost','oil','torque'].forEach(id=>page.toggleMetric(id));assert.deepStrictEqual(page.draft.items,['outside','power','boost','oil']);draw(page);
 const count=s.writes.length;page.commitAux();assert.strictEqual(s.writes.length-count,1,'mode plus ordered selection is one atomic setting');assert.deepStrictEqual(D.auxConfig(s.get(disp+'AuxConfig')).items,['outside','power','boost','oil']);
 page.activate(2);page.choose(0);['oil','boost','power'].forEach(id=>page.toggleMetric(id));assert.deepStrictEqual(page.draft.items,['oil','boost']);page.commitAux();
 page.activate(2);page.choose(1);page.toggleMetric('torque');page.selectTab(0);assert.deepStrictEqual(D.auxConfig(s.get(disp+'AuxConfig')).items,['oil','boost'],'changing tab discards draft');
 page.selectTab(tab);page.activate(3);draw(page);page.choose(0);assert.strictEqual(s.get(disp+'AlertStyle'),'bar');page.activate(3);page.choose(1);assert.strictEqual(s.get(disp+'AlertStyle'),'circle');
 page.activate(4);draw(page);page.selectLayoutPart(0,true);for(let n=0;n<50;n++)page.adjust(2,1);let cfg=page.config();assert(cfg[disp+'RpmGaugeWidthScale']/cfg[disp+'RpmGaugeHeightScale']<=1.3);
 for(let n=0;n<50;n++)page.adjust(3,-1);cfg=page.config();assert(cfg[disp+'RpmGaugeWidthScale']/cfg[disp+'RpmGaugeHeightScale']<=1.3);
 const gear=s.get(disp+'GearOffsetX');page.selectLayoutPart(D.partsFor(disp,page.config()).findIndex(p=>p.key==='RpmValue'),true);page.adjust(0,1);assert.strictEqual(s.get(disp+'GearOffsetX'),gear,'editing RPM number must leave gear placement unchanged');
}
assert.deepStrictEqual(D.metricSlots(['boost','torque','oil']).map(s=>[s.side,s.row]),[[0,0],[0,1],[1,0]]);
assert.deepStrictEqual(D.metricSlots(['boost','torque']).map(s=>s.side),[0,1]);assert.deepStrictEqual(D.metricSlots(['oil']).map(s=>s.side),[0]);
{
 const s=store(),page=new SettingsPage(s);page.selectTab(3);page.activate(0);page.choose(1);assert.strictEqual(s.get('navDisplayMode'),'excludeSport');assert(!D.navAllowed(page.config(),'SPORT_PLUS'));assert(D.navAllowed(page.config(),'COMFORT_PLUS'));
 page.activate(1);draw(page);page.choose(0);assert.strictEqual(s.get('navColor'),'gray');
 page.activate(2);draw(page);page.selectLayoutPart(0,true);page.adjust(0,1);page.adjust(2,1);const arrowX=s.get('hudNavOffsetX'),scale=s.get('navUniformScale');
 page.selectLayoutPart(1,true);page.adjust(0,-1);page.adjust(2,1);assert.strictEqual(s.get('hudNavOffsetX'),arrowX);assert.strictEqual(s.get('navUniformScale'),scale);assert.strictEqual(page.config().hudNavWidthScale,page.config().hudNavHeightScale);
}
{
 const old={_outputsV:1,displayMode:'sport',sportHudOutput:'redline',allHudOutput:'redline',allClusterOutput:'redline',hudAlertStyle:'bar',hudNavOffsetY:0,hudNavWidthScale:125};
 const s=store(old);migrate(s,old);assert.strictEqual(s.get('hudAlertStyle'),'circle');assert.strictEqual(s.get('allHudOutput'),'stock');assert.strictEqual(s.get('allClusterOutput'),'stock');assert.strictEqual(s.get('sportHudOutput'),'redline');assert.strictEqual(s.get('navUniformScale'),70);assert.strictEqual(s.get('hudNavOffsetY'),30);
 s.set('hudAlertStyle','bar');const n=s.writes.length;migrate(s,s.values);assert.strictEqual(s.writes.length,n);assert.strictEqual(s.get('hudAlertStyle'),'bar','later chosen design is never reset');
}
for(const y of [20,80]){const old={_outputsV:1,hudNavOffsetY:y},saved=store(old);migrate(saved,old);assert.strictEqual(saved.get('hudNavOffsetY'),30);assert.strictEqual(saved.get('hudTextOffsetY'),10);}
const cfg=settings();assert.strictEqual(cfg.hudAlertStyle,'circle');assert.strictEqual(cfg.clusterAlertStyle,'circle');
const aux=new AuxInfo();for(const source of SOURCES){const raw={};Object.entries(source.members).forEach(([id,scale])=>{raw[scale[0]]=id==='boost'?85:id==='outside'?116:id==='oil'||id==='oilFallback'?143:32500;});aux.sample(source,raw,0);}
let data=aux.read(100);assert.strictEqual(data.boost,0.85);assert.strictEqual(data.outside,18);assert.strictEqual(data.oil,95);assert(Math.abs(data.gforce)<0.001);assert.strictEqual(aux.read(2501).boost,null);
aux.sample(SOURCES[0],{displayBoostPressure:255},3000);assert.strictEqual(aux.read(3000).boost,null);
const m={proxies:{}};for(const source of SOURCES){const p=m.proxies[source.iface]||(m.proxies[source.iface]={attributes:{}});p.attributes[source.field]='rw';}
m.proxies[SOURCES[0].iface].attributes.statusActualValueTorque2='rs';m.proxies[SOURCES[1].iface].attributes.statusEngineSpeed2='rs';filterAux(m,{interfaces:{}});assert.strictEqual(m.proxies[SOURCES[0].iface].attributes.statusActualValueTorque2,'rs');assert.strictEqual(m.proxies[SOURCES[1].iface].attributes.statusEngineSpeed2,'rs');assert(!m.proxies['de.bmw.infotainment.vehicle.CDS2']);
const font=require(root+'/kit/fonts').get('bold',34,'교차로');for(const ch of '교차로다음안내')assert(font.glyphs[ch.codePointAt(0)],'received Hangul must be available in every language package');
const dart=decodeDart({maneuver:{intersection:{direction:'RIGHT',formattedDistance:{distance:'300',unit:'METER'},description:{elements:[{text:'교차로'}]}}}});assert.strictEqual(dart.description,'교차로');assert(descriptionText({elements:[{text:'가'.repeat(1000)}]}).length===64);
assert.strictEqual(decodeDart({maneuver:{tunnel:{description:{elements:[{text:'터널'}]},formattedDistance:{distance:'300',unit:'METER'}}}}),null,'unsupported tunnel cannot be guessed as a straight arrow');
assert(FACE.gearLayout(new Canvas(800,240),'--',settings()).diameter>25,'unknown optional gear must not shrink the warning to a dash-height dot');
const state={config:settings(),rpm:4000,gear:'M3',shift:false,flash:true,torqueNm:300,powerPS:180,torquePeak:350,powerPeak:220,aux:{boost:0.85,outside:18,oil:95,gforce:0.2,gLat:0.12,gLong:0.16},navigation:Object.assign({visible:true},dart)};
const frame=HUD.draw(state),alternate=HUD.draw(Object.assign({},state,{navigation:Object.assign({},state.navigation,{description:'다음 안내'})}));assert(!Buffer.from(frame.d).equals(Buffer.from(alternate.d)),'new text repaints without changing arrow or distance');
const navOnly=HUD.draw(Object.assign({},state,{renderRpm:false}));assert(!navOnly.d.subarray(0,230*800*4).some(v=>v),'navigation-only frame contains no RPM or metric pixels');
const movedGear=HUD.draw(Object.assign({},state,{navigation:null,config:settings({hudGearOffsetY:300})}));
let movedCount=0;for(let y=250;y<400;y++)for(let x=620;x<700;x++)if(movedGear.d[(y*800+x)*4+3])movedCount++;
assert(movedCount>20,'component placement must use the full HUD target, not clip at the former 240px face boundary');
const off=HUD.draw(Object.assign({},state,{navigation:{visible:false}}));assert(Buffer.from(frame.d).subarray(0,230*800*4).equals(Buffer.from(off.d).subarray(0,230*800*4)));
const shifted=HUD.draw(Object.assign({},state,{config:settings({hudTextOffsetX:100})}));assert(Buffer.from(frame.d).subarray(300*800*4).equals(Buffer.from(shifted.d).subarray(300*800*4)),'moving text does not move the direction panel');
function delta(painter,a,b){const old=Buffer.from(a.d),next=Buffer.from(b.d),copy=Buffer.from(old),d=painter.difference(old,next);let at=0;for(const r of d.rects)for(let y=r.y;y<r.y+r.h;y++){const n=r.w*4;d.pixels.copy(copy,(y*painter.W+r.x)*4,at,at+n);at+=n;}assert(copy.equals(next));}
delta(HUD,frame,alternate);delta(HUD,frame,off);delta(HUD,frame,shifted);
for(const display of ['hud','cluster']){
 const painter=display==='hud'?FACE:CLUSTER,original=painter.draw(state);
 for(const part of D.partsFor(display,state.config).map(p=>p.key)){const config=settings({[display+part+'OffsetX']:10,[display+part+'WidthScale']:125,[display+part+'HeightScale']:105});const image=painter.draw(Object.assign({},state,{config}));assert(!Buffer.from(image.d).equals(Buffer.from(original.d)),display+' '+part+' must transform independently');delta(painter,original,image);}
 for(const mode of ['gauges','values'])for(const items of [['oil'],['outside','oil'],['boost','torque','power','gforce'],['boost','torque','outside','oil']]){
  if(mode==='gauges'&&items.length>2)continue;const image=painter.draw(Object.assign({},state,{config:settings({[display+'AuxConfig']:JSON.stringify({mode,items})})}));delta(painter,original,image);
 }
}
console.log('PASS: four tabs, transactional ordered aux choices, defaults and migration, six live signal decoders/TTL/filtering, circle designs, independent component transforms/aspect limits, NAV mode/color/independent text and direction, received Hangul lifecycle and pixel-delta erasure.');

// Placement sizes describe actual transformed display areas; migration runs once.
{
 const s=store(),page=new SettingsPage(s);page.selectTab(1);page.activate(4);
 const labels=[],cv=new Canvas(1600,520),text=cv.text;cv.text=function(v){labels.push(v);return text.apply(this,arguments);};page.draw(cv);
 assert(labels.some(v=>String(v).includes('435 × 59 px')),'HUD RPM region dimensions include global scaling');
 const saved=store({_outputsV:1,_displaySettingsV:2,hudNavOffsetX:0,hudTextOffsetX:0});migrate(saved,saved.values);
 assert.strictEqual(saved.get('hudNavOffsetX'),210);assert.strictEqual(saved.get('hudTextOffsetX'),180);
 saved.set('hudNavOffsetX',190);saved.set('hudTextOffsetX',200);migrate(saved,saved.values);assert.strictEqual(saved.get('hudNavOffsetX'),190);assert.strictEqual(saved.get('hudTextOffsetX'),200);
 const r=require(root+'/layout').placement(settings(),'hudNav',require(root+'/nav-draw'));
 const face=require(root+'/layout').placement(settings(),'hud',FACE),barEnd=face.x+612*face.w/FACE.W;
 assert.deepStrictEqual([r.w,r.h],[168,78]);assert.strictEqual(settings().hudNavOffsetX,210);assert.strictEqual(settings().hudTextOffsetX,180);assert(r.x+r.w<=800);
 const nt=require(root+'/nav-text');assert.strictEqual(nt.W,240);
 assert(nt.draw({visible:true,description:'아주 긴 한글 안내 문구입니다 '.repeat(12)}).d.some((v,i)=>i%4===3&&v),'long text still renders within its column');
}
