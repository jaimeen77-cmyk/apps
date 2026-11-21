'use strict';
// The worker end to end: with settings per driver on, the engine speed is subscribed even when no face needs it,
// and an engine start greets the recognised driver on the HUD overlay.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const {settings}=require('../../apps/cluster_redline/policy'),G=require('../../apps/cluster_redline/driver-greeting');
const source=fs.readFileSync(path.join(__dirname,'../../apps/cluster_redline/worker.js'),'utf8'),CDS='de.bmw.infotainment.vehicle.CDS';
(async()=>{
 let time=0,timer=null;const feeds={},shown=[];const config=settings({allHudOutput:'stock',allClusterOutput:'stock',sportHudOutput:'stock',sportClusterOutput:'stock'});
 class FakeClient extends EventEmitter{constructor(){super();this.ready=false;this.backend='id7';this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;}connect(){this.ready=true;this.emit('ready');}image(){return ++this.next;}pixels(){}set(){}drop(){}close(){}}
 const painter={W:1088,H:480,draw:()=>({d:Buffer.alloc(4)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})};
 const box={module:{exports:{}},require:name=>{
   if(name==='fs')return {readFileSync:f=>{if(/manifest\.json$/.test(f))throw new Error('none');return JSON.stringify({id:'cluster-render',version:'0.4.0'});},writeFileSync(){},renameSync(){}};
   if(name==='path')return path;if(name==='./cluster_render_client')return {ClusterRender:FakeClient};if(name==='./draw')return painter;
   if(name==='./hud-compose')return Object.assign({},painter,{W:800,H:480,fullTarget:true});
   if(name==='./turn-overlay')return {TurnOverlay:class{tick(){}hide(){}close(){}status(){return {};}}};
   if(name==='./greeting-overlay')return {GreetingOverlay:class{tick(v){if(v)shown.push(v);return !!v;}close(){}}};
   return require('../../apps/cluster_redline/'+name.slice(2));
  },process:{hrtime:()=>[Math.floor(time/1000),Math.floor((time%1000)*1e6)],once(){},removeListener(){}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},console};
 vm.runInNewContext(source,box,{filename:'worker.js'});
 G.reset();G.setEnabled(true);
 const worker=box.module.exports.start({dataDir:'/data',app:new EventEmitter(),settings:{get:k=>config[k]},log:{warn(){},info(){}},
  signals:{hasNative:()=>true,loadConfig:()=>{throw new Error('absent');},watch:(iface,instance,handlers)=>{feeds[iface]=handlers;return Promise.resolve({available:true,shutdown(){}});}}});
 const tick=async at=>{time=at;const fn=timer;timer=null;fn();for(let i=0;i<5;i++)await Promise.resolve();};
 await tick(500);await tick(550);
 assert(feeds[CDS]&&feeds[CDS].statusEngineSpeed2,'engine speed subscribed for the greeting (no face needs it)');
 G.driver('홍길동',false);
 for(let at=600;at<1500;at+=50){feeds[CDS].statusEngineSpeed2({actualValueRPMEngineCrankshaft:0});await tick(at);}
 assert.strictEqual(shown.length,0,'engine off: no greeting');
 for(let at=1500;at<2500;at+=50){feeds[CDS].statusEngineSpeed2({actualValueRPMEngineCrankshaft:800*4});await tick(at);}
 assert(shown.length&&shown[0].name==='홍길동','engine start: greeted on the HUD');
 worker.stop();G.reset();
 console.log('PASS: worker greeting: engine speed subscribed while settings per driver are on, an engine start greets the driver on the HUD');
})().catch(e=>{console.error(e);process.exitCode=1;});
