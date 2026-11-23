'use strict';
// The BC button check (1.3.39; lever only since 1.3.46): the left stalk's switches, read once the check screen opens
// (read only), each change counted and kept newest first, each BC press (bit 64) counted; the stalk added at install,
// the cluster's (Kombi) values no longer; opened from BC mode and back there.
const assert=require('assert'),path=require('path');
const {BcDiag,stalkOf,LIGHT}=require('../../apps/cluster_redline/bc-diag');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.strictEqual(stalkOf({operationColumnStalks:16}),'16');assert.strictEqual(stalkOf({}),null);
 const feeds={};let redraws=0;const signals={loadConfig:(i)=>i===LIGHT?{fields:{IndicatorSteeringColumn:{}}}:{},watch:(i,inst,h)=>{feeds[i]=h;return Promise.resolve({available:true,shutdown(){}});}};
 const d=new BcDiag({signals,changed:()=>{redraws++;},clock:()=>0});
 assert.strictEqual(Object.keys(feeds).length,0,'nothing read before the check screen opens');
 d.start();await flush();assert(feeds[LIGHT].IndicatorSteeringColumn);assert.deepStrictEqual(Object.keys(feeds),[LIGHT],'the stalk only');
 [0,64,0,64,64,0,2,0].forEach(v=>feeds[LIGHT].IndicatorSteeringColumn({operationColumnStalks:v}));
 const s=d.status();assert.strictEqual(s.presses,2,'BC presses: bit 64 pressed');assert.strictEqual(s.stalk.changes,6);assert.strictEqual(s.stalk.history[0].value,'0','newest first');assert(redraws>3);
 const none=new BcDiag({signals:{loadConfig:()=>({fields:{}}),watch:()=>{throw new Error('x');}}});none.start();assert.deepStrictEqual(none.status().state,{stalk:'not_installed'});
 // at install: the stalk, no cluster (Kombi) value any more
 const {filterTraffic,INPUTS}=require('../../apps/cluster_redline/traffic-config'),K='de.bmw.infotainment.KombiIF';
 assert(!INPUTS.some(i=>/Kombi/i.test(i[0])),'no Kombi input');
 const cat={interfaces:{[K]:{fields:{statusKombiSelection:{getter:{id:5},notifier:{id:32790}},statusA:{notifier:{id:32800}}}},[LIGHT]:{fields:{IndicatorSteeringColumn:{getter:{id:6},notifier:{id:32791}}}}},instanceIDs:{[K]:{'1':1},[LIGHT]:{'1':1}}};
 const m=filterTraffic({proxies:{}},cat);assert(!m.proxies[K],'no Kombi proxy');assert.deepStrictEqual(m.proxies[LIGHT],{instances:'1',attributes:{IndicatorSteeringColumn:'rs'}},'the stalk added at install');
 if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
  const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.bcDiag=d;page.selectTab(2);
  page.focus=page.keys().indexOf('bcFollow');assert(page.focus>=0,'Cluster tab row');page.activate();assert.strictEqual(page.open,'bc');
  let cv=new Canvas(1600,520);page.draw(cv,'',{});cv.targets.find(x=>x.id==='bc-check').run();assert.strictEqual(page.open,'bcCheck');cv=new Canvas(1600,520);page.draw(cv,'',{});
  assert(!cv.targets.some(x=>x.id==='bc-scan'),'no Kombi values screen');if(process.argv[3])require('fs').writeFileSync(process.argv[3],cv.png());page.back();assert.strictEqual(page.open,'bc');}
 console.log('PASS: BC button check: the stalk read once the screen opens, changes counted newest first, BC presses, added at install; no Kombi values'+(process.argv[2]?', screen':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
