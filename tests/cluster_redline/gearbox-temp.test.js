'use strict';
// Coolant and gearbox oil temperature readouts (1.3.106): the coolant from the engine temperature field the oil comes in;
// the gearbox oil from the gearbox unit (read only, 22 6000 then 22 DA12) else the car's BasicDataSet signal once it moves;
// both as auxiliary items (gauges and text, thermometers, Redline layouts' tones); the signal added at install.
const assert=require('assert'),path=require('path');
const src=path.join(__dirname,'../../apps/cluster_redline');
const {GearboxTemp,Moving,parse,DIDS,EGS,POLL_MS}=require(src+'/gearbox-temp');
const {AuxInfo,SOURCES,auxOf}=require(src+'/aux-info');
const flush=()=>new Promise(r=>setImmediate(r));

// a value that counts only once it moved (a sure one at once)
{const m=new Moving(false);m.put(70,0);assert.strictEqual(m.get(10),null,'not yet moved');m.put(70.5,100);assert.strictEqual(m.get(110),null);m.put(71,200);assert.strictEqual(m.get(210),71,'moved 1 °C');assert.strictEqual(m.get(30000),null,'stale after 20 s');
 const s=new Moving(true);s.put(60,0);assert.strictEqual(s.get(1),60,'sure: at once');s.put(500,2);assert.strictEqual(s.get(3),60,'out of range ignored');}
// a reply
assert.strictEqual(parse([0x62,0x60,0x00,120],DIDS[0]),80,'6000: °C + 40');assert.strictEqual(parse([0x62,0xDA,0x12,130],DIDS[1]),82,'DA12: °C + 48');
assert.strictEqual(parse([0x7F,0x22,0x31],DIDS[0]),'absent');assert.strictEqual(parse([0x7F,0x22,0x22],DIDS[0]),'refused');assert.strictEqual(parse([0x62,0xDA,0x12,1],DIDS[0]),null,'another identifier');

// a fake link: the unit's answers per identifier
function fake(answers){const asked=[];return {asked,woke:0,link:{ready:true,init(){return Promise.resolve();},wake(){this.w=(this.w||0)+1;},read(unit,did){asked.push([unit,did]);const a=answers[did];return typeof a==='function'?a():Promise.resolve(a);}}};}
(async()=>{
 // a ZF 8HP: 6000 answers, read every POLL_MS while wanted; the EGS value wins over the signal
 {const f=fake({0x6000:[0x62,0x60,0x00,118]}),g=new GearboxTemp(null,null,()=>f.link);
  g.tick(0,true,50);await flush();g.tick(10,true,50);await flush();
  assert.deepStrictEqual(f.asked,[[EGS,0x6000]],'asks the gearbox unit for 6000');assert.strictEqual(g.read(20),78);assert.strictEqual(g.source(20),'EGS 6000');
  g.tick(100,true,50);await flush();assert.strictEqual(f.asked.length,1,'not before POLL_MS');g.tick(10+POLL_MS,true,50);await flush();assert.strictEqual(f.asked.length,2,'again after POLL_MS');
  g.tick(20000,false,50);assert.strictEqual(g.link,null,'released when not wanted');const n=f.asked.length;g.tick(30000,false,50);await flush();assert.strictEqual(f.asked.length,n,'nothing asked while not wanted');}
 // no 6000 (refused as absent): DA12, taken once it moved; never asked for 6000 again
 {let t=130;const f=fake({0x6000:[0x7F,0x22,0x31],0xDA12:()=>Promise.resolve([0x62,0xDA,0x12,t])}),g=new GearboxTemp(null,null,()=>f.link);
  g.tick(0,true,null);await flush();for(let now=10,i=0;i<6;i++,now+=POLL_MS+200){g.tick(now,true,null);await flush();if(i===3)t=131;}
  assert(f.asked.filter(a=>a[1]===0x6000).length===1,'6000 asked once');assert(f.asked.some(a=>a[1]===0xDA12),'then DA12');
  assert.strictEqual(g.read(10+5*(POLL_MS+200)),83,'DA12 once it moved: 131 - 48');}
 // no gearbox unit answer at all: the car's signal, once it moved; a unit without either identifier is left alone
 {const f=fake({0x6000:[0x7F,0x22,0x31],0xDA12:[0x7F,0x22,0x31]}),g=new GearboxTemp(null,null,()=>f.link);
  for(let now=0;now<2000;now+=200){g.tick(now,true,now<1000?40:42);await flush();}
  assert.strictEqual(g.read(2000),42,'the signal once it moved');assert.strictEqual(g.source(2000),'signal');assert.deepStrictEqual(g.status(2000).gone,['6000','DA12']);
  const n=f.asked.length;g.tick(20000,true,42);await flush();assert.strictEqual(f.asked.length,n,'neither identifier: not asked again');}
 // a signal stuck at one number is never shown
 {const g=new GearboxTemp(null,null,()=>({ready:false,init(){return Promise.resolve();}}));for(let now=0;now<5000;now+=100)g.tick(now,false,57);assert.strictEqual(g.read(5000),null,'a stuck signal: none');}

 // the sources: coolant beside the oil; the gearbox signal (BasicDataSet, °C + 48, 255 none) feeds the gearbox item
 {const eng=SOURCES.find(s=>s.field==='statusEngineTemperature');assert.deepStrictEqual(eng.members.coolant,['temperatureEngineDrive',1,-48,255]);
  const bds=SOURCES.find(s=>s.field==='basicDataSet');assert.strictEqual(bds.iface,'de.bmw.infrastructure.analytics.BasicDataSet');assert(bds.subscribe);assert.strictEqual(auxOf('gearboxSignal'),'gearbox');
  const a=new AuxInfo();a.sample(eng,{temperatureEngineOilDrive:150,temperatureEngineDrive:138},1000);a.sample(bds,{valueTemperatureTransmissionOil:126},1000);
  const r=a.read(1100);assert.strictEqual(r.oil,102);assert.strictEqual(r.coolant,90);assert.strictEqual(r.gearboxSignal,78);
  a.sample(eng,{temperatureEngineOilDrive:150,temperatureEngineDrive:255},1200);assert.strictEqual(a.read(1300).coolant,null,'255: none');}
 // added at install where the catalog has it (a notifier only: subscribed); not without it
 {const {filterTraffic,INPUTS}=require(src+'/traffic-config'),I='de.bmw.infrastructure.analytics.BasicDataSet';
  assert(INPUTS.some(x=>x[0]===I&&x[1]==='basicDataSet'));
  const cat={interfaces:{[I]:{fields:{basicDataSet:{notifier:{id:32771}}}}},instanceIDs:{[I]:{'1':1}}};
  const m=filterTraffic({proxies:{}},cat);assert.deepStrictEqual(m.proxies[I],{instances:'1',attributes:{basicDataSet:'s'}});
  assert(!filterTraffic({proxies:{}},{interfaces:{},instanceIDs:{}}).proxies[I],'not in the catalog: not added');}
 // the items: in the list, labelled, their ranges and thermometers; the demand reads the engine speed for the gearbox unit
 {const D=require(src+'/display-config');['coolant','gearbox'].forEach(k=>assert(D.METRICS.includes(k),k));
  const {demand}=require(src+'/data-demand'),{settings}=require(src+'/policy');
  const cfg=settings({appEnabled:true,allHudOutput:'redline',sportHudOutput:'redline',hudAuxConfig:JSON.stringify({mode:'values',items:['coolant','gearbox']})});
  const d=demand(cfg,'SPORT');assert(d.aux.has('coolant')&&d.aux.has('gearbox'),'both demanded');
  assert(d.fields.has('de.bmw.infotainment.vehicle.CDS.statusEngineTemperature'),'coolant: the engine temperature field');
  assert(d.fields.has('de.bmw.infrastructure.analytics.BasicDataSet.basicDataSet'),'gearbox: the signal');assert(d.fields.has('de.bmw.infotainment.vehicle.CDS.statusEngineSpeed2'),'gearbox: the engine speed (the unit is asked only while it runs)');}
 // drawn (the built app: the kit's canvas)
 if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),A=require(path.join(dir,'aux-draw')),RL=require(path.join(dir,'redline-hud'));
  const {settings}=require(path.join(dir,'policy')),st={config:settings({}),aux:{coolant:92,gearbox:81}};const c=A.metric(st,'coolant'),g=A.metric(st,'gearbox');
  assert.deepStrictEqual([c.label,c.value,c.unit,c.maximum],['Coolant temp',92,'°C',140]);assert.deepStrictEqual([g.label,g.value,g.unit,g.maximum],['Gearbox temp',81,'°C',150]);
  const cfg=settings({hudDesign:'rl-standard',hudAuxConfig:JSON.stringify({mode:'values',items:['oil','coolant','gearbox']})});
  const items=RL.readouts?RL.readouts({config:cfg,aux:{oil:95,coolant:50,gearbox:125}},'hud'):null;
  if(items){const by=id=>items.find(i=>i.id===id);assert.strictEqual(by('coolant').value,'50°');assert.strictEqual(by('coolant').tone,'cold','coolant under 60: cold');assert.strictEqual(by('gearbox').tone,'hot','gearbox over 120: hot');}}
 console.log('PASS: coolant and gearbox oil temperature readouts: coolant beside the oil; gearbox oil from the gearbox unit (6000, else DA12 once it moves; asked only while shown and the engine runs; released after) else the car signal once it moves; added at install from the catalog; listed, labelled, ranged, toned');
})().catch(e=>{console.error(e);process.exit(1);});
