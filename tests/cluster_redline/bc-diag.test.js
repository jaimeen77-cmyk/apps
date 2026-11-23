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
 // the Kombi scan (1.3.44): every field / event of the cluster's interfaces at install, all read on the scan screen
 {const {scanKombi,SCAN_MAX}=require('../../apps/cluster_redline/traffic-config'),K2='de.bmw.infotainment.KombiInterface_2';
  const c={interfaces:{[KOMBI]:{fields:{statusKombiSelection:{getter:{id:5},notifier:{id:32790}},statusA:{notifier:{id:32800}},statusB:{getter:{id:7}},none:{}},events:{bcEvent:{eventId:33001},badEvent:{eventId:5}}},
   [K2]:{fields:{}},'de.bmw.Other':{fields:{x:{getter:{id:3}}}}},instanceIDs:{[KOMBI]:{'1':1},[K2]:{'1':1},'de.bmw.Other':{'1':1}}};
  const m=scanKombi({proxies:{[KOMBI]:{instances:'1',attributes:{statusKombiSelection:'rs'}}}},c);
  assert.deepStrictEqual(m.proxies[KOMBI],{instances:'1',attributes:{statusKombiSelection:'rs',statusA:'s',statusB:'r'},broadcasts:['bcEvent']});
  assert(!m.proxies[K2]&&!m.proxies['de.bmw.Other'],'only Kombi interfaces with something readable');
  const many={};for(let i=0;i<200;i++)many['f'+i]={notifier:{id:33000+i}};
  assert.strictEqual(Object.keys(scanKombi({proxies:{}},{interfaces:{[KOMBI]:{fields:many}},instanceIDs:{[KOMBI]:{'1':1}}}).proxies[KOMBI].attributes).length,SCAN_MAX);
  assert.deepStrictEqual(scanKombi({proxies:{[KOMBI]:{instances:'2'}}},c).proxies[KOMBI],{instances:'2'},'another instance left alone');
  const {kombiProxies,flat}=require('../../apps/cluster_redline/bc-diag');
  assert.deepStrictEqual(kombiProxies(m),[{iface:KOMBI,instance:'1',names:['statusKombiSelection','statusA','statusB','bcEvent']}]);
  assert.strictEqual(flat({statusActivationInstrumentPackContent:65535,b:{x:1},c:[1]}),'ActivationInstrumentPackContent=65535 b={1} c=[1]');
  const sf={};const sd=new BcDiag({signals:Object.assign({},signals,{watch:(i,inst,h)=>{if(i===KOMBI&&h.statusA)sf.kombi=h;else feeds[i]=h;return Promise.resolve({available:true,shutdown(){sf.closed=true;}});}}),manifest:()=>m,clock:()=>0});
  sd.start();await flush();sd.scanStart();await flush();assert(sf.kombi.statusA&&sf.kombi.bcEvent);
  [1,2,3,1,2,3].forEach((pg,i)=>{feeds[LIGHT].IndicatorSteeringColumn({operationColumnStalks:64});feeds[LIGHT].IndicatorSteeringColumn({operationColumnStalks:0});sf.kombi.statusA({page:pg});sf.kombi.statusB(7);});
  let sc=sd.scanStatus();assert.strictEqual(sc.items[0].name,'KombiIF.statusA','the one that changed most first');assert.strictEqual(sc.items[0].changes,5);assert.strictEqual(sc.presses,6,'BC presses since the scan opened');
  assert.strictEqual(sc.count,4);assert.strictEqual(sc.received,2);sd.scanStop();assert(sf.closed&&sd.scanStatus()===null);
  const ns=new BcDiag({signals,manifest:()=>({proxies:{}})});ns.scanStart();assert.strictEqual(ns.scanStatus().state,'not_installed');}
 if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
  const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.bcDiag=d;page.selectTab(2);
  // since 1.3.40 opened from Follow the BC button (its button), and back there
  page.focus=page.keys().indexOf('bcFollow');assert(page.focus>=0,'Cluster tab row');page.activate();assert.strictEqual(page.open,'bc');
  let cv=new Canvas(1600,520);page.draw(cv,'',{});cv.targets.find(x=>x.id==='bc-check').run();assert.strictEqual(page.open,'bcCheck');cv=new Canvas(1600,520);page.draw(cv,'',{});cv.targets.find(x=>x.id==='bc-scan').run();assert.strictEqual(page.open,'bcScan');cv=new Canvas(1600,520);page.draw(cv,'',{});if(process.argv[3])require('fs').writeFileSync(process.argv[3],cv.png());page.back();assert.strictEqual(page.open,'bcCheck');page.back();assert.strictEqual(page.open,'bc');}
 console.log('PASS: BC button check: selection and stalk read once the screen opens, changes counted newest first, install-time input, Kombi scan'+(process.argv[2]?', screen':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
