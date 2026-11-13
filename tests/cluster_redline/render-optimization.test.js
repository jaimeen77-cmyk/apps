'use strict';
// The Classic dial is a clock (Korean time): one fixed time, so a cached draw and a full draw see the same second.
Date.now=()=>Date.UTC(2026,10,14,1,8,37);
const assert=require('assert'),path=require('path'),{EventEmitter}=require('events');
const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{settings}=require(root+'/policy');
const HUD=require(root+'/hud-compose'),CLUSTER=require(root+'/draw'),{AuxInfo,SOURCES}=require(root+'/aux-info');
const base={rpm:4000,gear:'M3',shift:false,flash:false,torqueNm:360,powerPS:205,torquePeak:400,powerPeak:260,aux:{boost:.85,oil:95,outside:18,batteryCharge:78,batteryVoltage:14.2,economy:12.4,gforce:.35,gLat:.25}};
function visibleEqual(a,b){
 assert.strictEqual(a.d.length,b.d.length);let maximum=0,total=0;
 for(let i=0;i<a.d.length;i+=4){maximum=Math.max(maximum,Math.abs(a.d[i+3]-b.d[i+3]));for(let k=0;k<3;k++){const delta=Math.abs(a.d[i+k]*a.d[i+3]/255-b.d[i+k]*b.d[i+3]/255);maximum=Math.max(maximum,delta);total+=delta;}}
 assert(maximum<=8&&total/a.d.length<.03,'cached/reference visible pixels differ: max='+maximum+' mean='+total/a.d.length);
}
const lane={visible:true,lanes:[{directions:['UTURN_LEFT'],other:[],highlighted:true},{directions:['STRAIGHT_ON'],other:['RIGHT'],highlighted:false}]};
for(const [display,painter] of [['hud',HUD],['cluster',CLUSTER]])for(const style of ['circle','bar']){
 const scene=painter.createCache(),state=Object.assign({},base,{config:settings({hudAlertStyle:style,clusterAlertStyle:style}),navigation:{visible:true,maneuver:'RIGHT',distanceText:'300 m',description:'교차로',lanes:lane}});
 const image=painter.draw(Object.assign({},state,{renderCache:scene}));visibleEqual(image,painter.draw(state));
 const paints=scene.stats().paints,bytes=scene.stats().bytes;painter.draw(Object.assign({},state,{renderCache:scene}));assert.strictEqual(scene.stats().paints,paints);
 const mark=scene.nodes.get(display+'.'+(display==='hud'?'Mark':'MarkTop')+'.'),markImage=Buffer.from(mark.image.d);
 const aux=scene.nodes.get(display+'.AuxLeft.').key,track=scene.nodes.get(display+'.RpmGauge.track').key;
 state.rpm=4020;painter.draw(Object.assign({},state,{renderCache:scene}));assert.strictEqual(scene.nodes.get(display+'.RpmGauge.track').key,track);assert.strictEqual(scene.nodes.get(display+'.AuxLeft.').key,aux);assert(Buffer.from(mark.image.d).equals(markImage));assert(scene.stats().paints-paints<=4,'RPM does not repaint marks, track, ticks or unchanged auxiliaries');
 const checks=[{rpm:0},{rpm:5500,shift:true,flash:true},{rpm:5500,shift:true,flash:false},{rpm:7000,gear:'D'},{navigation:{visible:false}},{navigation:{visible:true,maneuver:'UTURN_LEFT',description:'유턴',distanceText:'10 m',lanes:lane}}];
 checks.forEach(change=>{Object.assign(state,change);const actual=painter.draw(Object.assign({},state,{renderCache:scene}));visibleEqual(actual,painter.draw(state));const fresh=painter.draw(Object.assign({},state,{renderCache:painter.createCache()}));assert(Buffer.from(actual.d).equals(Buffer.from(fresh.d)),'partial recomposition must match a fresh cached frame');});
 for(const change of [{[display+'RpmGaugeOffsetX']:30,[display+'GearOffsetY']:40},{[display+'AuxLeftHidden']:true},{[display+'AuxLeftHidden']:false,[display+'MarkHidden']:true},{[display+'RpmGaugeWidthScale']:120,[display+'RpmGaugeHeightScale']:110},{[display+'AuxConfig']:JSON.stringify({mode:'values',items:['oil','torque','outside','batteryCharge']})}]){
  state.config=settings(Object.assign({},state.config,change));const actual=painter.draw(Object.assign({},state,{renderCache:scene}));visibleEqual(actual,painter.draw(state));const fresh=painter.draw(Object.assign({},state,{renderCache:painter.createCache()}));assert(Buffer.from(actual.d).equals(Buffer.from(fresh.d)),'move/hide/scale must erase prior pixels');
 }
 assert(scene.stats().bytes<12*1024*1024&&scene.stats().nodes<20);scene.reset();assert.strictEqual(scene.stats().bytes,0);
}
{
 const scene=HUD.createCache(),s=Object.assign({},base,{config:settings(),navigation:{visible:true,maneuver:'RIGHT',description:'첫 안내',distanceText:'300 m',ageMs:1}});
 HUD.draw(Object.assign({},s,{renderCache:scene}));const direction=scene.nodes.get('nav.Direction').tile,key=HUD.key(s),clusterKey=CLUSTER.key(s),paints=scene.stats().paints;
 s.navigation=Object.assign({},s.navigation,{ageMs:999,updatedAt:123,reason:'refreshed'});assert.strictEqual(HUD.key(s),key,'freshness metadata must not invalidate raster pixels');
 s.navigation.description='다음 안내';assert.strictEqual(CLUSTER.key(s),clusterKey);HUD.draw(Object.assign({},s,{renderCache:scene}));assert.strictEqual(scene.nodes.get('nav.Direction').tile,direction);assert.strictEqual(scene.stats().paints,paints+1,'text-only update draws only text');
 const after=HUD.key(s);s.config=settings(Object.assign({},s.config,{clusterGearOffsetX:30,clusterAuxConfig:JSON.stringify({mode:'gauges',items:['oil']})}));s.aux=Object.assign({},s.aux,{outside:19});assert.strictEqual(HUD.key(s),after,'cluster settings and unselected metric do not repaint HUD');
}
{
 const ai=new AuxInfo(),oil=SOURCES.find(s=>s.members.oil),outside=SOURCES.find(s=>s.members.outside),boost=SOURCES.find(s=>s.members.boost),battery=SOURCES.find(s=>s.members.batteryCharge);
 assert.strictEqual(boost.pollMs,1000);assert.strictEqual(oil.pollMs,5000);assert.strictEqual(outside.pollMs,10000);assert.strictEqual(battery.pollMs,5000);
 ai.sample(oil,{temperatureEngineOilDrive:143},0);ai.sample(outside,{temperatureExterior:116},0);ai.sample(boost,{displayBoostPressure:85},0);
 assert.strictEqual(ai.read(5001).oil,95);assert.strictEqual(ai.read(10001).outside,18);assert.strictEqual(ai.read(2501).boost,null);assert.strictEqual(ai.read(15001).oil,null);ai.clearSource(outside);assert.strictEqual(ai.read(10002).outside,null);
}
{
 const {Controller}=require('../../apps/cluster_redline/controller');
 class Client extends EventEmitter{constructor(){super();this.ready=true;this.targets='hud:800x480';this.frames=[];this.blocked=false;this.creations=0;this.drops=0;}image(){return ++this.creations;}set(){}pixels(ref,rects,pixels){this.frames.push(Buffer.from(pixels));}drop(){this.drops++;}canPaint(){return !this.blocked;}close(){}}
 const c=new Client(),out=new Controller(c,CLUSTER,HUD,{liveLayout:true});out.gear='M3';out.aux=base.aux;const config=settings({displayTarget:'hud',displayMode:'all'});
 function tick(t,rpm){out.policy.modeSample(1,t-1000);out.policy.rpmSample(rpm,t);return out.tick(t,config);}
 tick(1000,3500);const paints=out.renderCache.stats().paints,ref=out.ref,snapshot=out.previous;c.blocked=true;
 for(let n=0;n<100;n++)tick(4000+n*10,4000+n*10);
 assert.strictEqual(out.renderCache.stats().paints,paints);assert.strictEqual(c.frames.length,1);assert.strictEqual(out.ref,ref);assert.strictEqual(c.drops,0);
 c.blocked=false;const restored=tick(6000,6100);assert.strictEqual(c.frames.length,2);assert.strictEqual(out.previous,snapshot,'sent snapshot allocation is reused');assert.strictEqual(c.creations,1);assert.strictEqual(out.ref,ref);assert(!Object.keys(restored).includes('renderCache'));assert(!JSON.stringify(restored).includes('rawBounds'),'diagnostics must never serialize cached pixel buffers');
 const s=out.tick(9000,config);assert.strictEqual(s.requested,false,'freshness checks must still release stale signals during rendering optimization');out.close();
}
console.log('PASS: static/unchanged component reuse, independent output/turn/text/lane keys, bounded partial recomposition with erasure and visual parity, slow optional polling/freshness, 100 blocked frames skipped, one reused snapshot and unchanged signal safety');
