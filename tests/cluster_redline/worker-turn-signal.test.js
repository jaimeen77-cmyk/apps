'use strict';
// The worker keeps the car's turn signal although the light module never reports availability (Cluster Info does
// not look at it either); a provider that was available and goes away, or an error, clears it.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const {settings}=require('../../apps/cluster_redline/policy');
const source=fs.readFileSync(path.join(__dirname,'../../apps/cluster_redline/worker.js'),'utf8');
const LIGHT='de.bmw.body.Light';
const config0={hudTurnSignals:'on'};
async function run(lightSub){
 let time=0,timer=null,feed=null;const config=settings(config0),images=[];
 class FakeClient extends EventEmitter{constructor(){super();this.ready=false;this.backend='id7';this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;}
  connect(){this.ready=true;this.emit('ready');}image(o){images.push(o);return ++this.next;}pixels(){}set(){}drop(){}close(){this.ready=false;}}
 const painter={W:1088,H:480,draw:()=>({d:Buffer.alloc(4)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})};
 const real=n=>require('../../apps/cluster_redline/'+n.slice(2));
 const box={module:{exports:{}},require:name=>{
   if(name==='fs')return {readFileSync:()=>JSON.stringify({id:'cluster-render',version:'0.4.0'}),writeFileSync(){},renameSync(){}};
   if(name==='path')return path;
   if(name==='./cluster_render_client')return {ClusterRender:FakeClient};
   if(name==='./draw')return painter;
   if(name==='./hud-compose')return Object.assign({},painter,{W:800,H:480,fullTarget:true});
   if(name==='./turn-overlay')return {TurnOverlay:class{tick(){}hide(){}close(){}status(){return {};}}};
   return real(name);
  },process:{hrtime:()=>[Math.floor(time/1000),Math.floor((time%1000)*1e6)],once(){},removeListener(){}},
  setTimeout:(fn)=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},console};
 vm.runInNewContext(source,box,{filename:'worker.js'});
 const worker=box.module.exports.start({dataDir:'/data',app:new EventEmitter(),settings:{get:k=>config[k]},log:{warn(){},info(){}},
  signals:{hasNative:()=>true,loadConfig:iface=>{if(iface===LIGHT)return {fields:{StatusFunctionsIndicators:{notifier:{id:1}},StatusFunctionsIndicators2:{notifier:{id:2}}}};throw new Error('absent');},
   watch:(iface,instance,handlers)=>{if(iface===LIGHT){feed=handlers;return Promise.resolve(lightSub);}return Promise.resolve({available:true,shutdown(){}});}}});
 for(let i=0;i<5;i++)await Promise.resolve();
 const tick=at=>{time=at;const fn=timer;timer=null;fn();},status=()=>JSON.parse(JSON.stringify(worker.status())).turnSignal;
 time=500;const fn=timer;timer=null;fn();for(let i=0;i<5;i++)await Promise.resolve();
 return {worker,get feed(){return feed;},tick,status,sub:lightSub};
}
(async()=>{
 {const t=await run({available:false,shutdown(){}});assert(t.feed,'light module subscribed (in the demand set while the arrows are on)');
  t.tick(1000);assert.strictEqual(t.status().received,0);
  t.feed.StatusFunctionsIndicators({controlIndicateDirection:'DAUER_BLINKEN_LINKS_EIN'});t.tick(1050);t.tick(1100);t.tick(3000);
  assert.strictEqual(t.status().indicator,'left','kept although availability was never reported');assert.strictEqual(t.status().received,1);
  t.feed.StatusFunctionsIndicators2({controlIndicateDirection:8});t.tick(5000);assert.strictEqual(t.status().indicator,'both','hazards');
  t.feed.StatusFunctionsIndicators({controlIndicateDirection:0,activeFunctionIndicateDirection:0});t.tick(7000);assert.strictEqual(t.status().indicator,'off');
  t.worker.stop();}
 {const t=await run({available:true,shutdown(){}});t.feed.StatusFunctionsIndicators({controlIndicateDirection:4});t.tick(1000);assert.strictEqual(t.status().indicator,'right');
  t.sub.available=false;t.tick(3000);assert.strictEqual(t.status().indicator,'off','a provider that goes away clears it');t.worker.stop();}
 {const t=await run({available:false,error:'boom',shutdown(){}});t.feed.StatusFunctionsIndicators({controlIndicateDirection:3});t.tick(1000);assert.strictEqual(t.status().indicator,'off','error clears');assert.strictEqual(t.status().state,'error');t.worker.stop();}
 {config0.hudTurnSignals='off';const t=await run({available:true,shutdown(){}});assert.strictEqual(t.feed,null,'arrows off: the light module is not subscribed');t.worker.stop();config0.hudTurnSignals='on';}
console.log('PASS: worker turn signal subscribed while the arrows are on, kept without an availability report, cleared on provider loss or error; notifications counted for the settings screen');
})().catch(e=>{console.error(e);process.exitCode=1;});
