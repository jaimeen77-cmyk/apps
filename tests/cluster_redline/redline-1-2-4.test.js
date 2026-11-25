'use strict';
// 1.2.4: comfort/sport shift alert, clock gauge, exterior-temperature diagnostics,
// layout presets and preview, crisp navigation text and simplified junction diagrams.
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {Canvas}=require(root+'/kit/canvas'),{getLanguage,t}=require(root+'/kit/i18n'),spec=require(root+'/kit/app-spec.json');
const D=require(root+'/display-config'),{settings,Policy}=require(root+'/policy'),{shiftSpec,alertState}=require(root+'/shift-alert');
const {AuxInfo,SOURCES}=require(root+'/aux-info'),HUD=require(root+'/hud-compose'),CLUSTER=require(root+'/draw'),NAV=require(root+'/nav-draw'),TEXT=require(root+'/nav-text');
const {SettingsPage}=require(root+'/settings-ui'),{previewConfig,sampleNavigation}=require(root+'/outputs');
const alpha=(im,x0,y0,x1,y1)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(im.d[(y*im.w+x)*4+3])n++;return n;};

// Shift alert: sport keeps 65/85/100 % of the shift RPM; comfort uses 90 % of it with 50/80/100 %.
const cfg=settings({});
assert.deepStrictEqual(shiftSpec(cfg,'SPORT'),{style:'sport',shift:5500,start:5500*0.65,yellow:5500*0.85});
assert.deepStrictEqual(shiftSpec(cfg,'COMFORT'),{style:'comfort',shift:5000,start:2500,yellow:4000});
assert.strictEqual(shiftSpec(cfg,null).style,'sport','unknown mode keeps the original alert');
assert.strictEqual(shiftSpec(settings({engineProfile:'diesel'}),'ECO_PRO').shift,3800);
const at=(mode,rpm)=>alertState({config:cfg,mode,rpm,shift:false});
assert.strictEqual(at('COMFORT',2400).lit,0);assert(at('COMFORT',2600).lit>0);assert.strictEqual(at('COMFORT',3900).stage,'green');
assert.strictEqual(at('COMFORT',4100).stage,'yellow');assert.strictEqual(at('COMFORT',5000).stage,'red');
assert.strictEqual(at('SPORT',4100).stage,'green');assert.strictEqual(at('SPORT',5000).stage,'yellow');
const policy=new Policy();policy.modeSample(4,0);policy.rpmSample(5100,0);
assert.strictEqual(policy.evaluate(10,true,settings({displayMode:'all'})).shift,true,'comfort shift flag at the comfort shift RPM');
policy.modeSample(1,20);policy.rpmSample(5100,20);assert.strictEqual(policy.evaluate(30,true,settings({displayMode:'all'})).shift,false,'sport keeps 5500');

// Clock: gauge-only item; HH:MM in local or fixed UTC+9 time; drawn on HUD and cluster.
assert.deepStrictEqual(D.auxConfig({mode:'values',items:['clock','oil']}).items,['oil']);
assert.deepStrictEqual(D.auxConfig({mode:'gauges',items:['clock','oil']}).items,['clock','oil']);
assert.strictEqual(D.clockText(settings({clockZone:'utc9'}),new Date('2026-11-11T14:05:00Z')),'23:05');
assert.strictEqual(settings({clockZone:'bad'}).clockZone,getLanguage()==='ko'?'utc9':'auto','unknown: Korean time in the Korean version, else the head unit time');assert.strictEqual(settings({clockZone:'auto'}).clockZone,'auto','a chosen zone is kept');
const clockConfig=settings({hudAuxConfig:JSON.stringify({mode:'gauges',items:['boost','clock']}),clusterAuxConfig:JSON.stringify({mode:'gauges',items:['boost','clock']})});
const face=(painter,clock)=>painter.draw({config:clockConfig,renderRpm:true,rpm:3000,gear:'M3',torqueNm:300,powerPS:200,mode:'SPORT',aux:{boost:0.8,clock}});
for(const painter of [HUD,CLUSTER])assert(!Buffer.from(face(painter,'23:00').d).equals(Buffer.from(face(painter,'09:41').d)),'clock value is drawn');
assert(D.visibleMetrics(clockConfig,'hud').includes('clock'));

// Exterior temperature: decoded as before, and every unusable value records why.
const outside=SOURCES.find(s=>s.field==='ExteriorTemperature'),info=new AuxInfo();
info.sample(outside,{temperatureExterior:116},0);assert.strictEqual(info.read(1).outside,18);assert.strictEqual(info.diag.outside.result,'ok');
[[{temperatureExterior:255},'invalid_or_out_of_range'],[{temperatureExterior:-3},'negative'],[{exteriorTemp:116},'member_missing'],[{temperatureExterior:'18'},'not_number']].forEach(([value,reason])=>{
 info.sample(outside,value,2);assert.strictEqual(info.read(3).outside,18,'an invalid reading keeps the last good value, as eDrive does');assert.strictEqual(info.diag.outside.result,reason);
 const fresh=new AuxInfo();fresh.sample(outside,value,2);assert.strictEqual(fresh.read(3).outside,null,'nothing good yet: no value');});
info.sample(outside,{temperatureExterior:116.5},4);assert.strictEqual(info.read(5).outside,18.25,'a fractional raw value is accepted, as the eDrive app does');
info.clearSource(outside,'read_failed');assert.strictEqual(info.diag.outside.result,'read_failed');

// Layout presets (3 slots per tab), reset and the preview marker.
const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});
const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}};
const page=new SettingsPage(store,null,'1.2.4');
page.selectTab(1);page.activate(page.keys().indexOf('layout'));
assert(/^hud:RpmGauge@\d+$/.test(values.layoutPreview),'opening Position / size marks the adjusted part');
const before=values.hudRpmGaugeOffsetX;page.adjust(0,1);assert.strictEqual(values.hudRpmGaugeOffsetX,before+10);
page.open='layoutPresets';page.saveSlot(1);assert(page.slot(1));page.adjust(0,1);page.adjust(0,1);assert.strictEqual(values.hudRpmGaugeOffsetX,before+30);
page.loadSlot(1);assert.strictEqual(values.hudRpmGaugeOffsetX,before+10,'load restores the saved position');
page.loadSlot(2);assert.strictEqual(values.hudRpmGaugeOffsetX,before+10,'an empty slot changes nothing');
page.resetLayout();assert.strictEqual(values.hudRpmGaugeOffsetX,before+10,'first reset press only arms');page.resetLayout();assert.strictEqual(values.hudRpmGaugeOffsetX,0,'second press resets to defaults');
assert.strictEqual(values.clusterLayoutSlot1,undefined,'HUD presets never touch cluster slots');
page.selectTab(3);page.activate(page.keys().indexOf('layout'));const navBefore=values.hudLanesOffsetX;page.selectLayoutPart(2,true);page.adjust(0,1);page.open='layoutPresets';page.saveSlot(3);page.resetLayout();page.resetLayout();
assert.strictEqual(values.hudLanesOffsetX,D.defaults.hudLanesOffsetX);page.loadSlot(3);assert.strictEqual(values.hudLanesOffsetX,navBefore+10);
assert(/^nav:Lanes@\d+$/.test(values.layoutPreview));page.back();page.back();assert.strictEqual(values.layoutPreview,'','leaving Position / size ends the preview');
// Every new screen is Korean in the Korean edition.
if(getLanguage()==='ko'){const english=[];page.selectTab(1);page.activate(page.keys().indexOf('layout'));page.open='layoutPresets';
 for(const draw of [()=>page.draw(new Canvas(1600,520)),()=>{page.open='layout';page.draw(new Canvas(1600,520));}]){
  const cv=new Canvas(1600,520),text=cv.text;cv.text=function(v,x,y,z,c,o){const shown=o&&o.literal?String(v):t(v);if(/[A-Za-z]{3,}/.test(shown.replace(/\b(HUD|RPM|UTC|iDrive|BMW Coding)\b|Http:\S+/g,'')))english.push(shown);return text.apply(this,arguments);};page.draw(cv);draw();}
 page.back();page.back();page.selectTab(1);page.activate(page.keys().indexOf('design'));page.choose(0);page.choose(0);page.toggleMetric('clock');
 const cv=new Canvas(1600,520),text=cv.text;cv.text=function(v,x,y,z,c,o){const shown=o&&o.literal?String(v):t(v);if(/[A-Za-z]{3,}/.test(shown.replace(/\b(HUD|RPM|UTC|iDrive|BMW Coding)\b|Http:\S+/g,'')))english.push(shown);return text.apply(this,arguments);};page.draw(cv);
 assert.deepStrictEqual(english,[],'untranslated new labels');}

// Preview: the selected part is drawn even when hidden or without guidance; markers expire.
const now=Date.now(),hidden=settings({hudLanesHidden:true,navDisplayMode:'stock',layoutPreview:'nav:Lanes@'+now});
assert(D.layoutPreview(hidden,now+1000));assert.strictEqual(D.layoutPreview(hidden,now+130000),null,'a stale preview expires');
const local=previewConfig(hidden,'hud',D.layoutPreview(hidden,now));assert.strictEqual(local.hudLanesHidden,false);assert.strictEqual(local.navDisplayMode,'all');
const sample=sampleNavigation();assert(sample.visible&&sample.lanes.visible&&sample.lanes.lanes.some(l=>l.highlighted));
const shown=HUD.draw({config:local,renderRpm:false,mode:'COMFORT',navigation:sample});assert(alpha(shown,0,240,800,480)>500,'sample guidance and lanes are drawn');
assert.strictEqual(previewConfig(settings({hudAlertHidden:true}),'hud',{display:'hud',tab:'hud',part:'Gear'}).hudAlertHidden,false);

// Navigation text and diagrams paint at their HUD size.
for(const scale of [40,65,100,180]){const c=settings({hudTextScale:scale,navUniformScale:scale}),tr=D.navRect(c,'Text'),dr=D.navRect(c,'Direction');
 const t=TEXT.drawSized({visible:true,description:'강남대로 테헤란로'},tr.w,tr.h);assert.strictEqual(t.w,tr.w);assert.strictEqual(t.h,tr.h);assert(alpha(t,0,0,t.w,t.h)>20);
 const n=NAV.drawSized({visible:true,maneuver:'ROUNDABOUT',kind:'roundabout',exitNumber:2,distanceText:'300 m'},dr.w,dr.h);assert.strictEqual(n.w,dr.w);assert.strictEqual(n.h,dr.h);}
const kinds=[['branch',{kind:'branch',branchType:'FORK_RIGHT',maneuver:'SLIGHT_RIGHT'}],['branch',{kind:'branch',branchType:'TRIPLE_FORK_LEFT',maneuver:'SLIGHT_LEFT'}],['branch',{kind:'branch',branchType:'BRANCH_LEFT',maneuver:'SLIGHT_LEFT'}],
 ['roundabout',{kind:'roundabout',maneuver:'ROUNDABOUT',exitNumber:4}],['road',{kind:'alongMainRoad',maneuver:'KEEP_RIGHT'}],['road',{kind:'laneChange',maneuver:'LANE_LEFT'}],['highway',{kind:'branch',branchType:'HIGHWAY_OUT_LEFT',maneuver:'SLIGHT_LEFT'}],
 [null,{kind:'intersection',maneuver:'RIGHT'}],[null,{kind:'intersection',maneuver:'UTURN_LEFT'}],[null,{kind:'destinationManeuver',maneuver:'ARRIVAL_LEFT'}]];
for(const [kind,state] of kinds){
 const full=Object.assign({visible:true,distanceText:''},state);assert.strictEqual(NAV.diagramKind(full),kind,JSON.stringify(state));
 const im=NAV.draw(full);assert(alpha(im,0,0,106,112)>150,'drawn: '+JSON.stringify(state));
 if(kind&&kind!=='highway')assert.strictEqual(alpha(im,106,0,240,112),0,'road diagrams stay clear of the text column');
}
assert(!Buffer.from(NAV.draw({visible:true,kind:'branch',branchType:'FORK_LEFT',maneuver:'SLIGHT_LEFT',distanceText:'1 km'}).d).equals(Buffer.from(NAV.draw({visible:true,kind:'branch',branchType:'FORK_RIGHT',maneuver:'SLIGHT_RIGHT',distanceText:'1 km'}).d)));
console.log('PASS: comfort/sport shift alert, clock gauge, exterior-temperature diagnostics, 3-slot layout presets with reset, expiring layout preview, Korean new screens, HUD-size navigation text/diagrams');
