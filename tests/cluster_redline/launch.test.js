'use strict';
// 1.3.105: the 0-100 screen: the timer (from moving off to 100 km/h, interpolated; dropped when slowing; a new best),
// the picture (the speed, g, bar, time), the HUD overlay (a new picture only when it changes), its place (HUD lamps →
// 0-100 screen → Position / size), the speed and g read while on, off by default.
const assert=require('assert'),path=require('path');
const {LaunchTimer}=require('../../apps/cluster_redline/launch-timer'),D=require('../../apps/cluster_redline/display-config'),{settings}=require('../../apps/cluster_redline/policy');
const s0=settings({});assert.strictEqual(s0.hudLaunch,'off');assert.strictEqual(s0.launchBest,0);
const s1=settings({hudLaunch:'on',hudLaunchOffsetX:30,hudLaunchScale:150});assert.deepStrictEqual(D.launchRect(s1),{x:250,y:100,w:360,h:240});
assert.strictEqual(D.designKey('hudLaunchOffsetX'),false,'kept out of BC pages / drive mode screens');
{// a run at 25 km/h a second from standing: 4.0 s
 const L=new LaunchTimer(null);let t=0;for(;t<1000;t+=100)L.sample(t,0);let best=null;
 for(let v=0;t<6000;t+=100){v+=2.5;const nb=L.sample(t,v);if(nb)best=nb;}
 const v=L.view(t);assert.strictEqual(v.state,'done');assert(Math.abs(v.time-4.0)<=0.06,'about 4.0 s: '+v.time);assert.strictEqual(best,v.time,'a new best');assert(v.newBest);
 for(;t<8000;t+=100)L.sample(t,0);assert.strictEqual(L.view(t).state,'ready');assert.strictEqual(L.view(t).time,v.time,'the last time stays shown');
 // slower: not a new best
 for(let s=0;t<16000;t+=100){s+=1.5;L.sample(t,s);}assert.strictEqual(L.view(t).state,'done');assert(!L.view(t).newBest);assert.strictEqual(L.best,best);}
{// slowing down 10 km/h drops the run
 const L=new LaunchTimer(5);let t=0;for(;t<1000;t+=100)L.sample(t,0);for(let v=0;t<3000;t+=100){v+=2;L.sample(t,v);}
 for(let v=40;t<4000;t+=100){v-=3;L.sample(t,v);}assert.strictEqual(L.view(t).state,'dropped');for(;t<5000;t+=100)L.sample(t,0);assert.strictEqual(L.view(t).state,'ready');assert.strictEqual(L.view(t).time,null,'a dropped run shows no time');}
{// the timer counts up while running
 const L=new LaunchTimer(null);let t=0;for(;t<1000;t+=100)L.sample(t,0);L.sample(1000,0);L.sample(1100,3);const a=L.view(1500).time,b=L.view(2000).time;assert(a>0.3&&b>a,'running: '+a+' '+b);}
// the demand: speed and the longitudinal acceleration while on
{const {demand}=require('../../apps/cluster_redline/data-demand');const f=c=>Array.from(demand(settings(Object.assign({appEnabled:true,navDisplayMode:'stock',hudCarAlerts:'off'},c)),null).fields);
 assert(f({hudLaunch:'on'}).some(x=>/Vehicle2\.statusCarSpeed2/.test(x))&&f({hudLaunch:'on'}).some(x=>/statusLongitudinalAccelerationMassCenter/.test(x)),'speed and g read');
 assert(!f({}).some(x=>/statusLongitudinalAccelerationMassCenter/.test(x)),'off: no g');}
// the overlay: a new picture only when what it shows changes
{const {LaunchOverlay}=require('../../apps/cluster_redline/launch-overlay'),calls=[];
 const draw=require('../../apps/cluster_redline/launch-draw');
 const o=new LaunchOverlay({image:(x)=>{calls.push(['image',x]);return 1;},pixels:()=>calls.push(['pixels']),set:(r,x)=>calls.push(['set',x]),drop(){}});
 const Module=require('module'),orig=Module._load;Module._load=function(req,...a){if(req==='./launch-draw')return Object.assign({},draw,{drawSized:(v,w,h)=>({d:new Uint8Array(w*h*4)})});return orig.call(this,req,...a);};
 try{const cfg=s1;assert(o.tick({speed:50,g:0.5,time:2.1,state:'run',best:null},cfg));const n=calls.filter(c=>c[0]==='pixels').length;
  o.tick({speed:50,g:0.5,time:2.12,state:'run',best:null},cfg);assert.strictEqual(calls.filter(c=>c[0]==='pixels').length,n,'the same at 0.1 s: no new picture');
  o.tick({speed:51,g:0.5,time:2.2,state:'run',best:null},cfg);assert.strictEqual(calls.filter(c=>c[0]==='pixels').length,n+1);
  assert.strictEqual(o.tick(null,cfg),false);assert(calls.some(c=>c[0]==='set'&&c[1].visible===false),'hidden while off');
  assert(o.tick(null,settings({}),true),'the Position / size preview shows the sample');}finally{Module._load=orig;}}
if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),L=require(path.join(dir,'launch-draw'));
 const a=L.drawSized({speed:87,g:0.78,time:4.82,state:'done',best:4.08},240,160);let lit=0,cyan=0;for(let i=0;i<a.d.length;i+=4){if(a.d[i+3]>200)lit++;if(a.d[i+2]>200&&a.d[i+1]>180&&a.d[i]<80&&a.d[i+3]>200)cyan++;}
 assert(lit>2000&&cyan>300,'drawn: '+lit+' / '+cyan);
 const {SettingsPage}=require(dir+'/settings-ui'),{Canvas}=require(dir+'/kit/canvas'),spec=require(dir+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
 const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.selectTab(0);page.activate(page.keys().indexOf('hudLamps'));
 page.activate(page.keys().indexOf('hudLaunch'));assert.strictEqual(page.open,'launch');const scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};
 scr().find(t=>t.id==='launch-on').run();assert.strictEqual(v.hudLaunch,'on');
 scr().find(t=>t.id==='launch-layout').run();assert.strictEqual(page.open,'layout');assert(/:Launch@/.test(v.layoutPreview),'preview: '+v.layoutPreview);page.adjust(0,1);assert.strictEqual(v.hudLaunchOffsetX,10);page.back();assert.strictEqual(page.open,'launch');
 v.launchBest=4.08;v.launchRuns=JSON.stringify([{t:4.31,at:Date.UTC(2026,10,28,8,0)},{t:4.08,at:Date.UTC(2026,10,27,8,0)}]);
 {const texts=[],cv=new Canvas(1600,520),tx=cv.text;cv.text=function(t){texts.push(String(t));return tx.apply(this,arguments);};page.draw(cv,'',{});assert(texts.some(t=>/1\.\s+4\.31 s/.test(t))&&texts.some(t=>/2\.\s+4\.08 s/.test(t)),'the last runs listed, newest first');}
 scr().find(t=>t.id==='launch-clear').run();assert.strictEqual(v.launchBest,4.08,'once: armed');scr().find(t=>t.id==='launch-clear').run();assert.strictEqual(v.launchBest,0,'twice: cleared');assert.strictEqual(v.launchRuns,'[]','and the runs');}
{const D2=require('../../apps/cluster_redline/display-config');assert.deepStrictEqual(D2.launchRuns(settings({launchRuns:JSON.stringify([{t:4.1,at:1},{t:'x'},{t:5,at:2}].concat(Array(12).fill({t:6,at:3})))})).length,10,'at most 10, broken ones left out');}
console.log('PASS: 0-100 screen: the last 10 runs listed and cleared; timer (moving off to 100 km/h, dropped when slowing, the best), demand, overlay (new picture on change, off, preview), its place, the settings screen');
