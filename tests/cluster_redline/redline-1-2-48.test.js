'use strict';
// The Classic dial is a clock (Korean time): one fixed time, so a cached draw and a full draw see the same second.
Date.now=()=>Date.UTC(2026,10,14,1,8,37);
// 1.2.48: Tyres & trip at 150 % with the car at 110 % by default, temperatures drawn as thermometers (different
// from the other gauges, following the value), the clock only on horizontal gauges (left out on Hexagon /
// Classic dial, dimmed in the picker there), cached tiles equal full draws.
// Usage: node redline-1-2-48.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {settings}=require(root+'/policy'),RL=require(root+'/redline-hud'),HUD=require(root+'/hud-compose'),CL=require(root+'/draw');
const {SettingsPage}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json');
const diff=(a,b)=>{let n=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k]-b[k])>2)n++;return n;};

// 1. Tyres & trip defaults: the layout 150 % (as large as the screen allows), the car 110 %
{
 const face={x:0,y:0,w:1088,h:480},base=settings({clusterDesign:'rl-tyres'});
 assert.deepStrictEqual(RL.CLUSTER_BASE.tyres,{scale:150,size:{RlCar:110}});
 const r=RL.rect(base,face,'cluster'),r100=RL.rect(settings({clusterDesign:'rl-tyres',clusterRpmGaugeWidthScale:67}),face,'cluster');
 assert(r.w>r100.w*1.4,'150 % by default: '+r.w+' vs '+r100.w);
 const pl=c=>RL.placed({config:c,renderRpm:true,rpm:2000,gear:'D3',aux:{}},RL.rect(c,face,'cluster'),'cluster',face).find(p=>p.key==='RlCar'),car=pl(base);
 assert(car,'the car is placed');
 const car2=pl(settings({clusterDesign:'rl-tyres',clusterRlCarWidthScale:91}));
 assert(car.r.w>car2.r.w*1.08,'the car 110 % by default: '+car.r.w+' vs '+car2.r.w);
 // other cluster layouts unchanged
 assert.strictEqual(RL.rect(settings({clusterDesign:'rl-standard'}),face,'cluster').w,RL.rect(settings({clusterDesign:'rl-standard',clusterRpmGaugeWidthScale:100}),face,'cluster').w);
}

// 2. Thermometers: oil drawn unlike boost at the same fraction, follows the value, cached = full draw
const cfgOf=(d,st,items,mode)=>settings({[d+'Design']:'rl-'+st,[d+'AuxConfig']:JSON.stringify({mode:mode||'gauges',items})});
const state=(cfg,aux,i)=>({config:cfg,renderRpm:true,rpm:2500+(i||0)*200,gear:'D4',mode:'SPORT',aux,torqueNm:250,powerPS:180,shift:false,flash:false});
for(const [d,P] of [['hud',HUD],['cluster',CL]])for(const st of RL.GAUGE_LAYOUTS){
 if(!RL.stylesFor(d).includes(st))continue;
 const it=RL.readouts(state(cfgOf(d,st,['oil']),{oil:96}),d)[0];assert(it&&it.id==='oil'&&it.frac>0,d+' '+st);
 const a=Buffer.from(P.draw(state(cfgOf(d,st,['oil']),{oil:60})).d),b=Buffer.from(P.draw(state(cfgOf(d,st,['oil']),{oil:150})).d);
 assert(diff(a,b)>40,d+' '+st+': the thermometer follows the oil temperature');
 const cache=P.createCache();
 for(let i=0;i<12;i++){const cfg=cfgOf(d,st,i%3?['oil','outside']:['boost','gforce']),aux={oil:60+i*8,outside:5+i*3,boost:i/8,gforce:i/10},s=state(cfg,aux,i);Object.defineProperty(s,'renderCache',{value:cache});
  assert.strictEqual(diff(Buffer.from(P.draw(s).d),Buffer.from(P.draw(state(cfg,aux,i)).d)),0,d+' '+st+' frame '+i+': cached = full draw');}
}

// 3. The clock: kept on horizontal gauges, left out on upright ones
assert.deepStrictEqual(RL.VERTICAL_GAUGES,['hexagon','classic']);
for(const st of ['standard','ramp','shift','logger','ribbon','sportdial','tyres'])assert.deepStrictEqual(RL.readouts(state(cfgOf('cluster',st,['gforce','clock']),{gforce:0.5,clock:'01:52'}),'cluster').map(r=>r.id),['gforce','clock'],st);
for(const st of ['hexagon','classic'])assert.deepStrictEqual(RL.readouts(state(cfgOf('cluster',st,['gforce','clock']),{gforce:0.5,clock:'01:52'}),'cluster').map(r=>r.id),['gforce'],st+' leaves the clock out');
assert.deepStrictEqual(RL.readouts(state(cfgOf('hud','hexagon',['clock','oil']),{oil:90,clock:'01:52'}),'hud').map(r=>r.id),['oil']);

// 4. The picker: the clock can't be added on Hexagon (dimmed, a note), can on Standard, can be removed anywhere
for(const [design,ok] of [['rl-hexagon',false],['rl-classic',false],['rl-standard',true],['own',true]]){
 const values={};spec.settings.forEach(s=>values[s.key]=s.default);values.clusterDesign=design;
 const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>values[k]=v,setMany:o=>Object.assign(values,o)},page=new SettingsPage(store,null,'test');
 page.selectTab(2);page.activate(page.keys().indexOf('aux'));page.choose(0);
 page.toggleMetric('clock');assert.strictEqual(page.draft.items.includes('clock'),ok,design+': clock '+(ok?'can':'can\'t')+' be chosen');
 if(!page.draft.items.includes('clock'))page.draft.items.push('clock');page.toggleMetric('clock');assert(!page.draft.items.includes('clock'),design+': an old clock choice can be removed');
}
console.log('PASS: Tyres & trip 150 % / car 110 %, thermometers follow the value with cached = full draw, the clock only on horizontal gauges (picker dims it on Hexagon / Classic dial)');
