'use strict';
// The cluster and the HUD share one upload allowance (1.3.60): an output refused for want of credit keeps what
// builds up for itself, and the two take turns when both want more than there is. Before, the HUD's small changes
// (an animation, twenty a second) spent the credit as it came and the cluster's bigger ones never went.
const assert=require('assert'),{UploadPacer,HOLD_MS}=require('../../apps/cluster_redline/upload');
function run(rateKB,hudKB,clKB,only){
 const p=new UploadPacer();p.rate=rateKB*1024;p.reset();const HUD={n:0},CL={n:0};let order=0;
 for(let t=0;t<10000;t+=50){const seq=(order++%2?[HUD,CL]:[CL,HUD]).filter(o=>!only||o===only);
  for(const o of seq){if(!p.ready(t))continue;if(p.allow((o===HUD?hudKB:clKB)*1024,t,false,o))o.n++;}}
 return {hud:HUD.n/10,cluster:CL.n/10};
}
let r=run(600,40,160);assert(r.cluster>=2&&r.hud>=2,'tight budget: both move ('+JSON.stringify(r)+')');
r=run(1024,20,160);assert(r.cluster>=4.5&&r.hud>=8,'enough for both: '+JSON.stringify(r));
const p=new UploadPacer();p.rate=1024*1024;p.reset();const a={},b={};
assert(!p.allow(400*1024,0,false,a),'too big now');assert(!p.allow(1024,10,false,b),'the other output waits behind it');
assert(p.allow(400*1024,500,false,a),'the waiting one goes when its credit is there');
assert(p.hold&&p.hold.who===b,'then the other one holds');
const q=new UploadPacer();q.rate=1024*1024;q.reset();assert(!q.allow(900*1024,0,false,a));assert(q.allow(1024,HOLD_MS+50,false,b),'a hold lapses after '+HOLD_MS+' ms');
r=run(1024,0,160,null);console.log('PASS: shared upload allowance: neither the cluster nor the HUD starves, turns when short, holds lapse');
