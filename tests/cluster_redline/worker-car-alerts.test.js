'use strict';
// The worker end to end: with Vehicle alerts on, the vehicle speed and the camera sign recognition are subscribed
// (availability never reported, as on the 2026-11-14 drive) and speeding / children signs reach the HUD overlay.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const {settings}=require('../../apps/cluster_redline/policy');
const source=fs.readFileSync(path.join(__dirname,'../../apps/cluster_redline/worker.js'),'utf8');
const SPEED='de.bmw.infotainment.vehicle.Vehicle2',TSR='de.bmw.dass.TrafficSignRecognition',CAM='de.bmw.environmentalmodel.SignRecognitionFrontCamera';
async function run(mode){
 let time=0,timer=null;const feeds={},shown=[];const config=settings({hudCarAlerts:mode});
 class FakeClient extends EventEmitter{constructor(){super();this.ready=false;this.backend='id7';this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;}connect(){this.ready=true;this.emit('ready');}image(){return ++this.next;}pixels(){}set(){}drop(){}close(){}}
 const painter={W:1088,H:480,draw:()=>({d:Buffer.alloc(4)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})};
 const box={module:{exports:{}},require:name=>{
   if(name==='fs')return {readFileSync:f=>{if(/manifest\.json$/.test(f))throw new Error('none');return JSON.stringify({id:'cluster-render',version:'0.4.0'});},writeFileSync(){},renameSync(){}};
   if(name==='path')return path;if(name==='./cluster_render_client')return {ClusterRender:FakeClient};if(name==='./draw')return painter;
   if(name==='./hud-compose')return Object.assign({},painter,{W:800,H:480,fullTarget:true});
   if(name==='./turn-overlay')return {TurnOverlay:class{tick(){}hide(){}close(){}status(){return {};}}};
   if(name==='./alert-overlay')return {AlertOverlay:class{tick(cfg,v){shown.push(v);return {shown:!!v};}close(){}status(){return {};}}};
   return require('../../apps/cluster_redline/'+name.slice(2));
  },process:{hrtime:()=>[Math.floor(time/1000),Math.floor((time%1000)*1e6)],once(){},removeListener(){}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},console};
 vm.runInNewContext(source,box,{filename:'worker.js'});
 const worker=box.module.exports.start({dataDir:'/data',app:new EventEmitter(),settings:{get:k=>config[k]},log:{warn(){},info(){}},
  signals:{hasNative:()=>true,loadConfig:iface=>{if(iface===SPEED)return {fields:{statusCarSpeed2:{getter:{id:7},notifier:{id:32775}}}};if(iface===TSR)return {events:{TrafficSignRecognition:{}}};if(iface===CAM)return {events:{TrafficSignRecognitionFrontCamera:{}}};throw new Error('absent');},
   watch:(iface,instance,handlers)=>{feeds[iface]=handlers;return Promise.resolve({available:false,shutdown(){}});}}});
 const tick=async at=>{time=at;const fn=timer;timer=null;fn();for(let i=0;i<5;i++)await Promise.resolve();};
 await tick(500);
 return {worker,feeds,tick,shown};
}
const sign=(type,value)=>({type,value,position:{left:false,right:true,overhead:false},firstSupplementalType:'SIGNAL_UNFILLED',secondSupplementalType:'SIGNAL_UNFILLED',additionalInfo:'NO_ADDITIONAL_RESTRICTION',location:{locationInvalidFlags:0}});
const cam=signs=>({eventDataQualifier:'EVENT_DATA_AVAILABLE',extendedQualifier:'NORMAL_OPERATION_MODE',trafficSignRecognition:{numberSigns:signs.length,speedLimitUnit:'KM_H'},trafficSign:signs,trafficSignRecognitionQuality:signs.map(()=>({qualityType:100,qualityValue:47}))});
(async()=>{
 {const t=await run('all');
  await t.tick(550);assert(t.feeds[SPEED]&&t.feeds[TSR]&&t.feeds[CAM],'speed and sign recognition subscribed: '+Object.keys(t.feeds).join());
  t.feeds[TSR].TrafficSignRecognition({presentWithdrawalLimitSpeed:1,presentClassLimitSpeed:6,unitOfMeasurementSpeedLimit:0});
  t.feeds[CAM].TrafficSignRecognitionFrontCamera(cam([sign('SPEED_LIMIT',30),sign('DS_CHILDREN',0)]));
  for(let at=600;at<=2600;at+=100){t.feeds[SPEED].statusCarSpeed2({speedVehicleCentreOfGravity:37*64});await t.tick(at);}
  const last=t.shown[t.shown.length-1];
  assert(last&&last.speeding&&last.speeding.limit===30,'speeding 37 in a 30 reaches the overlay: '+JSON.stringify(last));
  assert(t.shown.some(v=>v&&v.school&&v.school.sign),'children sign reaches the overlay');
  t.worker.stop();}
 {const t=await run('off');assert(!t.feeds[SPEED]&&!t.feeds[CAM],'off: not subscribed');t.worker.stop();}
 {const t=await run('camera');assert(!t.feeds[CAM],'camera only: signs not subscribed');t.worker.stop();}
 console.log('PASS: worker vehicle alerts: speed and sign recognition subscribed while on, speeding and children signs reach the HUD overlay without an availability report');
})().catch(e=>{console.error(e);process.exitCode=1;});
