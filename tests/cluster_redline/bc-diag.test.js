'use strict';
// The BC button check (1.3.39): the cluster's BC selection and the left stalk's switches, read once the check screen
// opens (read only), each change counted and kept newest first; added at install where the catalog has them; the
// Cluster tab's row and screen.
const assert=require('assert'),path=require('path');
const {BcDiag,selection,stalkOf,KOMBI,LIGHT}=require('../../apps/cluster_redline/bc-diag');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.strictEqual(selection({statusActivationInstrumentPackContent:2,statusActivationInstrumentPackBC:11}),'2:11');
 assert.strictEqual(selection({statusActivationInstrumentPackBC:'BC_PAGE_3'}),'-:BC_PAGE_3');assert.strictEqual(selection({}),null);assert.strictEqual(stalkOf({operationColumnStalks:16}),'16');
 const feeds={};let redraws=0;const signals={loadConfig:(i)=>i===KOMBI?{fields:{statusKombiSelection:{}}}:i===LIGHT?{fields:{IndicatorSteeringColumn:{}}}:{},watch:(i,inst,h)=>{feeds[i]=h;return Promise.resolve({available:true,shutdown(){}});}};
 const d=new BcDiag({signals,changed:()=>{redraws++;},clock:()=>0});
 assert.strictEqual(Object.keys(feeds).length,0,'nothing read before the check screen opens');
 d.start();await flush();assert(feeds[KOMBI].statusKombiSelection&&feeds[LIGHT].IndicatorSteeringColumn);
 [[1,10],[2,11],[3,12],[1,10]].forEach(([c,b])=>feeds[KOMBI].statusKombiSelection({statusActivationInstrumentPackContent:c,statusActivationInstrumentPackBC:b}));
 feeds[KOMBI].statusKombiSelection({statusActivationInstrumentPackContent:1,statusActivationInstrumentPackBC:10});
 let s=d.status();assert.strictEqual(s.kombi.now,'1:10');assert.strictEqual(s.kombi.changes,3);assert.strictEqual(s.kombi.received,5);
 assert.deepStrictEqual(s.kombi.history.map(h=>h.value),['1:10','3:12','2:11','1:10'],'newest first');
 feeds[LIGHT].IndicatorSteeringColumn({operationColumnStalks:0});feeds[LIGHT].IndicatorSteeringColumn({operationColumnStalks:16});feeds[LIGHT].IndicatorSteeringColumn({operationColumnStalks:0});
 assert.strictEqual(d.status().stalk.changes,2);assert(redraws>3,'redrawn on changes');
 const none=new BcDiag({signals:{loadConfig:()=>({fields:{}}),watch:()=>{throw new Error('x');}}});none.start();assert.deepStrictEqual(none.status().state,{kombi:'not_installed',stalk:'not_installed'});
 const {filterTraffic}=require('../../apps/cluster_redline/traffic-config');
 const cat={interfaces:{[KOMBI]:{fields:{statusKombiSelection:{getter:{id:5},notifier:{id:32790}}}}},instanceIDs:{[KOMBI]:{'1':1}}};
 assert.deepStrictEqual(filterTraffic({proxies:{}},cat).proxies[KOMBI],{instances:'1',attributes:{statusKombiSelection:'rs'}},'added at install');
 if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
  const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.bcDiag=d;page.selectTab(2);
  page.focus=page.keys().indexOf('bcCheck');assert(page.focus>=0,'Cluster tab row');page.activate();assert.strictEqual(page.open,'bcCheck');const cv=new Canvas(1600,520);page.draw(cv,'',{});page.back();assert.strictEqual(page.open,null);}
 console.log('PASS: BC button check: selection and stalk read once the screen opens, changes counted newest first, install-time input'+(process.argv[2]?', screen':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
