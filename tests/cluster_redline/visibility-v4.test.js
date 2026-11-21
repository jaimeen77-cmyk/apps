'use strict';
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {Canvas}=require(root+'/kit/canvas'),D=require(root+'/display-config'),{settings}=require(root+'/policy'),{SettingsPage}=require(root+'/settings-ui'),{demand}=require(root+'/data-demand');
const spec=require(root+'/kit/app-spec.json');
function store(){const values={};spec.settings.forEach(s=>values[s.key]=s.default);return {values,schema:spec.settings,get:k=>values[k],set:(k,v)=>values[k]=v};}
for(const tab of [1,2,3])for(const style of ['circle','bar']){
 const s=store(),page=new SettingsPage(s);s.set('hudAlertStyle',style);s.set('clusterAlertStyle',style);page.selectTab(tab);page.activate(page.keys().indexOf('layout'));
 const parts=page.layoutParts();page.selectLayoutPart(0,true);page.selectLayoutPart(1);assert.strictEqual(page.layoutSelected.size,2);const initial=page.config();page.adjust(0,1);
 for(const p of parts.slice(0,2)){const prefix=page.layoutPrefix(p);assert.strictEqual(page.config()[prefix+'OffsetX'],initial[prefix+'OffsetX']+10);}
 const moved=page.config();page.adjust(2,1);
 for(const p of parts.slice(0,2)){const prefix=page.layoutPrefix(p);if(tab===3){assert.strictEqual(page.config()[p.scale],initial[p.scale]+5);continue;}
  const c=page.config(),f=c[prefix+'WidthScale']/moved[prefix+'WidthScale'];assert(f>1,'multi-selection grows');
  assert(Math.abs(c[prefix+'HeightScale']/moved[prefix+'HeightScale']-f)<0.02,'multi-selection keeps each part\'s shape (same factor for width and height)');}
 page.toggleHidden(false);for(const p of parts.slice(0,2))assert(page.config()[page.layoutPrefix(p)+'Hidden']);
 page.toggleHidden(false);for(const p of parts.slice(0,2))assert(!page.config()[page.layoutPrefix(p)+'Hidden']);
 page.selectLayoutPart(1);assert.strictEqual(page.layoutSelected.size,1);page.selectLayoutPart(0);assert.strictEqual(page.layoutSelected.size,0);const prev=JSON.stringify(s.values);page.adjust(0,1);page.toggleHidden(false);assert.strictEqual(JSON.stringify(s.values),prev,'empty selection cannot alter settings');
 for(let i=0;i<parts.length;i++){
  page.selectLayoutPart(i,true);const cv=page.draw(new Canvas(1600,520)),buttons=cv.targets;
  assert(buttons.some(b=>b.id==='toggle-Hidden'),'every component has visibility control');
  for(const b of buttons)assert(b.x>=0&&b.y>=0&&b.x+b.w<=1600&&b.y+b.h<=520);
  for(let a=0;a<buttons.length;a++)for(let b=a+1;b<buttons.length;b++){const x=buttons[a],y=buttons[b];assert(!(x.x<y.x+y.w&&x.x+x.w>y.x&&x.y<y.y+y.h&&x.y+x.h>y.y),'click targets must not overlap: '+x.id+' / '+y.id);}
 }
}
const cfg=settings({allHudOutput:'redline',allClusterOutput:'redline'}),hidden=Object.assign({},cfg,{navDisplayMode:'stock',hudDoorAlert:'off',hudMarkLineHidden:true,clusterMarkTopLineHidden:true,clusterMarkBottomLineHidden:true});
for(const d of ['hud','cluster'])D.PARTS.forEach(p=>hidden[d+p+'Hidden']=true);
assert.strictEqual(demand(settings(hidden),'COMFORT').fields.size,0,'all hidden / stock NAV requests no data');
const onlyGear=Object.assign({},hidden,{hudGearHidden:false,hudAlertHidden:true});let q=demand(settings(onlyGear),'COMFORT');assert(q.gear&&!q.rpm&&!q.torque);assert(!q.fields.has('de.bmw.infotainment.vehicle.CDS.statusEngineSpeed2'));
const shared=Object.assign({},hidden,{hudAuxLeftHidden:false,clusterAuxRightHidden:false,hudAuxConfig:JSON.stringify({mode:'values',items:['batteryVoltage','outside','oil','economy']}),clusterAuxConfig:JSON.stringify({mode:'gauges',items:['torque','batteryVoltage']})});
q=demand(settings(shared),'COMFORT');assert(q.aux.has('batteryVoltage')&&q.aux.has('outside')&&!q.aux.has('oil')&&!q.aux.has('economy'),'only visible sides contribute, shared voltage retained');
const lanesOnly=settings(Object.assign({},hidden,{navDisplayMode:'all',hudLanesHidden:false,hudNavHidden:true,hudTextHidden:true}));q=demand(lanesOnly,'COMFORT');assert(q.nav&&q.lanes&&!q.turns);assert(!q.fields.has('de.bmw.infotainment.navigation.guiding.GuidanceEventList'));assert(!q.fields.has('de.bmw.infotainment.navigation.guiding.Guidance.conclusiveDart'));
assert.strictEqual(settings().hudAuxTextOffsetY,10);assert(!D.navAllowed(settings({navDisplayMode:'stock'}),'COMFORT'));
const policy=new (require(root+'/policy').Policy)();policy.modeSample('COMFORT',0);assert(policy.evaluate(100,true,settings({displayMode:'all'}),false).show,'non-RPM components do not require a hidden RPM input');
const sample={rpm:4000,gear:'M3',shift:false,flash:false,torqueNm:360,powerPS:205,aux:{batteryCharge:78}};
for(const [display,name] of [['hud','hud-draw'],['cluster','draw']]){
 const paint=require(root+'/'+name),off=paint.draw(Object.assign({},sample,{config:settings(hidden)}));assert(!off.d.some(v=>v),'all hidden parts, including M lines, paint no pixels');
 const config=Object.assign({},hidden,{[display+'AuxLeftHidden']:false,[display+'AuxConfig']:JSON.stringify({mode:'gauges',items:['batteryCharge']})});
 const count=(image,r,g,b)=>{let n=0;for(let i=0;i<image.d.length;i+=4)if(image.d[i]===r&&image.d[i+1]===g&&image.d[i+2]===b&&image.d[i+3])n++;return n;};
 assert(count(paint.draw(Object.assign({},sample,{config:settings(config)})),25,238,103)>10,'healthy charge uses Battery12V-style green segments');
 assert(count(paint.draw(Object.assign({},sample,{aux:{batteryCharge:25},config:settings(config)})),255,42,42)>10,'low charge uses warning-coloured segments');
}
{
 const paint=require(root+'/hud-draw'),config=Object.assign({},hidden,{hudAuxLeftHidden:false,hudAuxConfig:JSON.stringify({mode:'values',items:['torque']})});
 const before=paint.draw(Object.assign({},sample,{config:settings(Object.assign({},config,{hudAuxTextOffsetY:0}))})),after=paint.draw(Object.assign({},sample,{config:settings(config)}));
 const moved=new Canvas(paint.W,paint.H);moved.clear([0,0,0,0]);moved.d.set(before.d.subarray(0,(paint.H-10)*paint.W*4),10*paint.W*4);assert(Buffer.from(after.d).equals(Buffer.from(moved.d)),'HUD text defaults move exactly one 10px step');
 const actual=paint.draw(Object.assign({},sample,{config:settings(Object.assign({},config,{hudAuxLeftOffsetX:10}))})),expected=new Canvas(paint.W,paint.H);expected.clear([0,0,0,0]);expected.blit(after,10,0);const ink=image=>Buffer.from(image.d.filter((v,i)=>i%4===3).map(v=>v?1:0));assert(ink(actual).equals(ink(expected)),'moved component preserves full Hangul glyphs rather than clipping their tops');
}
console.log('PASS: all hide/show controls, non-overlapping touch targets, multi-select/deselect/group transforms, empty-selection safety, shared vs hidden data, NAV Stock/lane-only demand and non-RPM policy');
