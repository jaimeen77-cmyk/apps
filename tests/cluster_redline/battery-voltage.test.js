'use strict';
const assert=require('assert'),{BatteryVoltage,supported,IFACE,LOCK_MISSES}=require('../../apps/cluster_redline/battery-voltage');
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
(async()=>{
 let now=0,created=0,shut=0,resolveRead,requests=[],initResolve;
 const create=()=>{created++;return {available:true,p:{shutdown(){shut++;}},init(){return Promise.resolve(this);},removeAllListeners(){},physical(ecu,sid,bytes,timeout,accept,opts){requests.push({ecu,sid,bytes,timeout,accept,opts});return new Promise(r=>{resolveRead=r;});}};};
 const b=new BatteryVoltage({}, {},()=>now,create);
 b.tick(now,false,true);await settle();assert.strictEqual(created,0,'no voltage proxy until selected');
 b.tick(now,true,true);await settle();assert.strictEqual(created,1);
 now=2100;b.tick(now,true,true);b.tick(now+1,true,true);assert.strictEqual(requests.length,0);await settle();assert.strictEqual(requests.length,1);
 assert.deepStrictEqual([requests[0].ecu,requests[0].sid,requests[0].bytes],[18,1,[0x42]]);assert.strictEqual(requests[0].opts.maxRetries,2,'a busy transport is asked again briefly, not left for 30 s');assert(requests[0].accept([0x41,0x42,0x36,0xB0]));assert(!requests[0].accept([0x41,0x43,0,0]));
 resolveRead([0x41,0x42,0x36,0xB0]);await settle();assert.strictEqual(b.read(now),14);assert.strictEqual(b.read(now+600000),14,'kept until the next good reading');
 now+=2100;b.tick(now,true,true);await settle();assert.strictEqual(requests.length,1,'valid voltage is polled at a slower five-second cadence');now+=3000;b.tick(now,true,true);await settle();b.tick(now+50,true,true);await settle();assert.strictEqual(requests.length,2,'one request in flight');b.tick(now,false,true);await settle();resolveRead([0x41,0x42,0x35,0x10]);await settle();assert.strictEqual(b.read(now),null,'late result after deselection must not reappear');assert(shut>=1);
 b.stop();now+=4000;b.tick(now,true,true);await settle();assert.strictEqual(created,1,'stopped reader cannot reinitialize');
 let closes=0,calls=0,finishOld,finishNew;
 const racing=new BatteryVoltage({}, {},()=>now,()=>{calls++;const d={p:{shutdown(){closes++;}},available:true,removeAllListeners(){},init(){return new Promise(r=>{if(calls===1)finishOld=()=>r(d);else finishNew=()=>r(d);});}};return d;});
 racing.tick(now,true,true);await settle();racing.tick(now,false,true);now+=2100;racing.tick(now,true,true);await settle();assert.strictEqual(calls,2);finishOld();await settle();assert.strictEqual(racing.initializing,true,'late old init cannot clear newer pending init');assert.strictEqual(closes,1);finishNew();await settle();assert(racing.diag);racing.stop();await settle();assert.strictEqual(closes,2);
 // Dropouts: a way that answered keeps its value and is asked again soon after a missed, refused or busy reply.
 {
  let t=0,reply,fail=null;const asked=[];
  const make=()=>({available:true,p:{shutdown(){}},init(){return Promise.resolve(this);},removeAllListeners(){},physical(ecu,sid,bytes,timeout,accept,opts){asked.push([ecu,sid]);if(fail){const e=fail;fail=null;return Promise.reject(e);}return Promise.resolve(reply);}});
  const v=new BatteryVoltage({}, {},()=>t,make),step=async ms=>{t+=ms;v.tick(t,true,true);await settle();};
  await step(0);reply=[0x41,0x42,0x31,0x38];await step(10);assert.strictEqual(v.read(t),12.6);assert.strictEqual(asked.length,1);
  reply=null;await step(5000);assert.strictEqual(asked.length,2);reply=[0x41,0x42,0x31,0x38];assert.strictEqual(v.read(t),12.6,'one missed reply keeps the last value');
  await step(1000);assert.strictEqual(asked.length,3,'asked again after one second');assert.deepStrictEqual(asked[2],[18,1],'the working way is kept');
  reply=[0x7F,0x01,0x21];await step(5000);assert.deepStrictEqual(asked[3],[18,1],'a busy refusal (maybe another app\'s) is no reason to switch');
  fail=new Error('transport refused: APP_REQUEST_TEMPORARILY_NOT_ACCEPTED');reply=[0x41,0x42,0x31,0x40];await step(2000);assert.strictEqual(asked.length,5);
await step(1000);assert.strictEqual(asked.length,6,'a busy transport is retried within a second, not after 30 s');assert.strictEqual(v.read(t),12.608);
  for(let i=0;i<LOCK_MISSES;i++){reply=null;await step(5000);}
  reply=[0x62,0xF4,0x42,0x31,0x38];await step(2000);assert.deepStrictEqual(asked[asked.length-1],[18,0x22],'only repeated misses move on to the next way');assert.strictEqual(v.read(t),12.6);
  for(let i=0;i<20;i++){reply=null;await step(5000);}assert.strictEqual(v.read(t),12.6,'a long run of misses still shows the last good value');
  v.tick(t,false,true);assert.strictEqual(v.read(t),null,'cleared when deselected');
  v.stop();
 }
 // A way the ECU says it does not have is left at once while still searching.
 {
  let t=0;const asked=[];const v=new BatteryVoltage({}, {},()=>t,()=>({available:true,p:{shutdown(){}},init(){return Promise.resolve(this);},removeAllListeners(){},physical(ecu,sid){asked.push([ecu,sid]);return Promise.resolve(sid===1&&ecu===18?[0x7F,0x01,0x12]:[0x62,0xF4,0x42,0x30,0xD4]);}}));
  v.tick(t,true,true);await settle();v.tick(t,true,true);await settle();t+=2000;v.tick(t,true,true);await settle();
  assert.deepStrictEqual(asked,[[18,1],[18,0x22]]);assert.strictEqual(v.read(t),12.5);v.stop();
 }
 const good={interfaces:{[IFACE]:{serviceId:63654,version:{major:1},methods:{sendTasuRequest:{methodId:1}},events:{sendTasuResponse:{eventId:32769}}}},instanceIDs:{[IFACE]:{SystemFunctionsInternalTasuInst1:128}}};
 assert(supported(good));assert(!supported({}));const bad=JSON.parse(JSON.stringify(good));bad.interfaces[IFACE].methods.sendTasuRequest.methodId=3;assert(!supported(bad));
 console.log('PASS: lazy standardized voltage reads, no dropouts on a missed, refused or busy reply, one in-flight request, last value kept until the next good one, stop/deselect and initialization-race guards, bounded request options and strict catalog whitelist');
})().catch(e=>{console.error(e);process.exitCode=1;});
