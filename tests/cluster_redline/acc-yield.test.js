'use strict';
// 1.3.97: the cluster gives way while the car's cruise control (ACC) display shows (the helper 0.7.0 reads FASuS), and
// comes back 2 s after it goes; the HUD is not affected. Without the helper nothing changes.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
// the helper's reading of the car's own messages (2026-11-28): ACC off, then on
{const L=require('../../native/redline-lead/redline-lead.js');
 assert(/^0\.[78]\./.test(L.VERSION));assert.deepStrictEqual(L.ACC_SPECS,['0xb50e:1:1:2:0x8002:f']);
 assert.strictEqual(L.decodeAcc(Buffer.from('8f47000000000200','hex')).on,false,'ACC off');
 assert.strictEqual(L.decodeAcc(Buffer.from('d54800130020e601','hex')).on,true,'ACC on');
 assert.strictEqual(L.decodeAcc(Buffer.from('d548','hex')),null,'too short');}
// the outputs: the cluster released with acc_yield, the HUD stays
{const {Outputs}=require('../../apps/cluster_redline/outputs');
 class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
 const p=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
 const out=new Outputs(new C(),p(1088,480),Object.assign(p(800,480),{fullTarget:true})),cfg={allClusterOutput:'redline',allHudOutput:'redline'};
 const t=at=>{out.policy.modeSample(4,at-1);out.policy.rpmSample(2000,at);return out.tick(at,cfg).outputs;};
 assert(t(1000).cluster.requested,'ACC off: the cluster shows');
 out.accYield=true;const o=t(1200);assert(!o.cluster.requested,'ACC on: the cluster gives way');assert.strictEqual(o.cluster.reason,'acc_yield');assert(o.hud.requested,'the HUD stays');
 out.accYield=false;assert(t(1400).cluster.requested,'ACC off again: back');out.close();}
// the worker: asks the helper for acc, releases the cluster while it shows, back 2 s after
(async()=>{
 const {settings}=require('../../apps/cluster_redline/policy'),source=fs.readFileSync(path.join(__dirname,'../../apps/cluster_redline/worker.js'),'utf8');
 let time=0,timer=null;const sent=[],helper={state:'connected',last:null};
 class FakeHelper{constructor(){this.state='off';this.last=null;}sync(on){this.state=on?helper.state:'off';this.last=on?helper.last:null;}send(c){sent.push(c);return true;}status(){return {state:this.state};}read(){return null;}frontGap(){return null;}}
 class FakeClient extends EventEmitter{constructor(){super();this.ready=false;this.backend='id7';this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;}connect(){this.ready=true;this.emit('ready');}image(){return ++this.next;}pixels(){}set(){}drop(){}close(){}}
 const painter={W:1088,H:480,draw:()=>({d:Buffer.alloc(4)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})};
 const config=settings({allHudOutput:'stock',allClusterOutput:'redline',sportClusterOutput:'redline'});
 const box={module:{exports:{}},require:name=>{
   if(name==='fs')return {readFileSync:f=>{if(/manifest\.json$/.test(f))throw new Error('none');return JSON.stringify({id:'cluster-render',version:'0.4.0'});},writeFileSync(){},renameSync(){},mkdirSync(){}};
   if(name==='path')return path;if(name==='./cluster_render_client')return {ClusterRender:FakeClient};if(name==='./draw')return painter;
   if(name==='./hud-compose')return Object.assign({},painter,{W:800,H:480,fullTarget:true});
   if(name==='./lead-helper')return {LeadHelper:FakeHelper};
   return require('../../apps/cluster_redline/'+name.slice(2));
  },process:{hrtime:()=>[Math.floor(time/1000),Math.floor((time%1000)*1e6)],once(){},removeListener(){}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},console};
 vm.runInNewContext(source,box,{filename:'worker.js'});
 const feeds={},worker=box.module.exports.start({dataDir:'/data',app:new EventEmitter(),settings:{get:k=>config[k]},log:{warn(){},info(){}},
  signals:{hasNative:()=>true,loadConfig:()=>{throw new Error('absent');},watch:(iface,instance,handlers)=>{feeds[iface]=Object.assign(feeds[iface]||{},handlers);return Promise.resolve({available:true,shutdown(){}});}}});
 const CDS='de.bmw.infotainment.vehicle.CDS';
 const tick=async at=>{time=at;if(feeds[CDS]&&feeds[CDS].statusEngineSpeed2)feeds[CDS].statusEngineSpeed2({actualValueRPMEngineCrankshaft:2000*4});const fn=timer;timer=null;if(fn)fn();for(let i=0;i<5;i++)await Promise.resolve();};
 const cluster=()=>worker.status().outputs.cluster;
 for(let at=500;at<=4000;at+=50)await tick(at);
 assert(sent.some(c=>c.acc===true),'the helper is asked for the ACC state');
 assert.notStrictEqual(cluster().reason,'acc_yield','no ACC: not released');
 helper.last={acc:{on:true,value:{on:true}}};for(let at=4050;at<=5000;at+=50)await tick(at);
 assert.strictEqual(cluster().reason,'acc_yield','ACC on: the cluster released');
 helper.last={acc:{on:true,value:{on:false}}};for(let at=5050;at<=6500;at+=50)await tick(at);
 assert.strictEqual(cluster().reason,'acc_yield','held 2 s after ACC goes');
 for(let at=6550;at<=9000;at+=50)await tick(at);
 assert.notStrictEqual(cluster().reason,'acc_yield','back after 2 s');
 helper.state='absent';helper.last=null;for(let at=9050;at<=10000;at+=50)await tick(at);
 assert.notStrictEqual(cluster().reason,'acc_yield','no helper: nothing changes');
 worker.stop();
 console.log('PASS: ACC: the helper reads the car\'s FASuS (off / on), the cluster gives way while ACC shows and is back 2 s after, the HUD stays, nothing without the helper');
})().catch(e=>{console.error(e);process.exitCode=1;});
