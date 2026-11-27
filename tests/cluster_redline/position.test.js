'use strict';
// 1.3.93 Position check: the install finds the car's latitude / longitude fields and events in the unit's catalog
// (position-config.js), adds the best ones read only, and position.js reads them only while the check is on, works
// out their unit and uses the one with fresh positions. Optional: node position.test.js <built package dir>.
const assert=require('assert'),path=require('path'),fs=require('fs');
const PC=require('../../apps/cluster_redline/position-config'),P=require('../../apps/cluster_redline/position');
// a catalog: the navigation's current position (a notified field, 1e-7 degrees), a positioning event (degrees), a
// destination (left out), a lateral acceleration (not a latitude) and a field without getter or notifier (left out)
const cat={
 instanceIDs:{'de.bmw.infotainment.navigation.positioning.Positioning':{'1':1},'de.bmw.infotainment.navigation.guiding.Guidance':{'Main_Instance':1},
  'de.bmw.infotainment.vehicle.Vehicle2':{'1':1},'de.bmw.gnss.Gnss':{'1':1}},
 datatypes:{Pos:{type:'struct',members:[{name:'latitude',dataRef:'Int32'},{name:'longitude',dataRef:'Int32'},{name:'altitude',dataRef:'Int32'}]},
  CurPos:{type:'struct',members:[{name:'currentPosition',dataRef:'Pos'},{name:'heading',dataRef:'Int16'}]},
  Fix:{type:'struct',members:[{name:'wgs84Lat',dataRef:'Double'},{name:'wgs84Lon',dataRef:'Double'}]},
  Accel:{type:'struct',members:[{name:'lateralAcceleration',dataRef:'Double'},{name:'longitudinalAcceleration',dataRef:'Double'}]}},
 interfaces:{
  'de.bmw.infotainment.navigation.positioning.Positioning':{fields:{currentPosition:{dataRef:'CurPos',notifier:{id:32769},getter:{id:1}},stalePosition:{dataRef:'Pos'}}},
  'de.bmw.gnss.Gnss':{events:{fix:{eventId:32800,arguments:[{dataRef:'Fix'}]}}},
  'de.bmw.infotainment.navigation.guiding.Guidance':{fields:{destination:{dataRef:'Pos',getter:{id:2},notifier:{id:32770}}}},
  'de.bmw.infotainment.vehicle.Vehicle2':{fields:{acceleration:{dataRef:'Accel',notifier:{id:32771}}}}}};
(async()=>{
 assert(PC.isLat('latitude')&&PC.isLat('wgs84Lat')&&!PC.isLat('lateralAcceleration')&&PC.isLon('longitude')&&!PC.isLon('longitudinalAcceleration'));
 const found=PC.scan(cat);
 assert.deepStrictEqual(found.map((c)=>c.name),['currentPosition','fix','destination'],'the position first, the destination last, no acceleration, no field without ids');
 assert(found[2].score<=0,'the destination scores below 0');
 const manifest={proxies:{'de.bmw.infotainment.vehicle.Vehicle2':{instances:'1',attributes:{statusCarSpeed2:'s'}}}};
 const list=PC.filterPosition(manifest,cat);
 assert.deepStrictEqual(list.map((c)=>[c.iface.split('.').pop(),c.name,c.kind]),[['Positioning','currentPosition','field'],['Gnss','fix','event']],'the destination left out');
 assert.deepStrictEqual(manifest.proxies['de.bmw.infotainment.navigation.positioning.Positioning'],{instances:'1',attributes:{currentPosition:'rs'}},'read only: get and notify');
 assert.deepStrictEqual(manifest.proxies['de.bmw.gnss.Gnss'],{instances:'1',broadcasts:['fix']});
 assert.deepStrictEqual(manifest.proxies['de.bmw.infotainment.vehicle.Vehicle2'],{instances:'1',attributes:{statusCarSpeed2:'s'}},'our other inputs untouched');
 assert.deepStrictEqual(PC.filterPosition({},{}),[],'no catalog: nothing');
 // an interface the app already uses is never changed, even with a position in it
 {const m2={proxies:{'de.bmw.infotainment.navigation.positioning.Positioning':{instances:'1',attributes:{other:'r'}}}},l2=PC.filterPosition(m2,cat);
  assert.deepStrictEqual(l2.map((c)=>c.name),['fix']);assert.deepStrictEqual(m2.proxies['de.bmw.infotainment.navigation.positioning.Positioning'],{instances:'1',attributes:{other:'r'}});}
 // an instance id of 0 (which the install's own check drops) is not used
 {const c0=JSON.parse(JSON.stringify(cat));c0.instanceIDs['de.bmw.gnss.Gnss']={'1':0};assert(!PC.scan(c0).some((c)=>c.name==='fix'));}
 // a big catalog with deeply nested types: walked once per type, quickly
 {const big={instanceIDs:{},interfaces:{},datatypes:{}};
  for(let t=0;t<4000;t++)big.datatypes['T'+t]={type:'struct',members:Array.from({length:12},(_,m)=>({name:'member'+m+(m===3?'Latitude':m===4?'Longitude':''),dataRef:m<2&&t>0?'T'+(t-1):'Int32'}))};
  for(let i=0;i<2500;i++){const f={};for(let k=0;k<15;k++)f['field'+k]={dataRef:'T'+((i*15+k)%4000),notifier:{id:32768+k}};big.interfaces['de.bmw.x.I'+i]={fields:f};big.instanceIDs['de.bmw.x.I'+i]={'1':1};}
  const t0=Date.now();PC.scan(big);const ms=Date.now()-t0;assert(ms<3000,'scan '+ms+' ms');}
 // units: Seoul City Hall (37.5665, 126.9780)
 const near=(a,b)=>Math.abs(a-b)<1e-4;
 [[37.5665,126.978,'deg'],[375665000,1269780000,'1e-7 deg'],[37566500,126978000,'1e-6 deg'],[37.5665*Math.PI/180,126.978*Math.PI/180,'rad'],
  [Math.round(37.5665/360*4294967296),Math.round(126.978/360*4294967296),'2^32/turn']].forEach(([a,o,name])=>{const s=P.scaleOf(a,o);assert(s&&s.kr,name);assert.strictEqual(s.name,name);assert(near(a*s.k,37.5665)&&near(o*s.k,126.978),name);});
 assert.strictEqual(P.scaleOf(0,0),null,'0 / 0: no fix');
 assert.strictEqual(P.scaleOf(48.85,2.35).kr,false,'Paris: a position, outside Korea');
 assert(P.inKR(33.5,126.5)&&P.inKR(37.24,131.86)&&!P.inKR(35.68,139.69),'Jeju and Dokdo in, Tokyo out');
 // the pair inside a reply: the current position before a destination
 assert.deepStrictEqual(P.findPair({destination:{latitude:1,longitude:2},currentPosition:{latitude:3,longitude:4}}),{lat:3,lon:4,path:'currentPosition'});
 assert.strictEqual(P.findPair({lateralAcceleration:1,longitude:2}),null);
 // reading: only while on; the fresh source used; the heading after 12 m
 let t=0,watched=[],shut=0;const signals={watch:(i,inst,h,log,o)=>{watched.push({i,inst,h,o});return Promise.resolve({available:true,shutdown(){shut++;}});}};
 const logs=[],log={info:(m)=>logs.push(m),warn:(m)=>logs.push(m)};
 const pos=new P.Position(signals,log,()=>t,{list,note:'2 found'});
 assert.strictEqual(pos.status(0).fix,null);assert.strictEqual(watched.length,0,'off: nothing read');
 pos.sync(true);await new Promise((r)=>setImmediate(r));assert.strictEqual(watched.length,2,'one watch per interface');
 const cur=watched.find((w)=>/Positioning$/.test(w.i)),gnss=watched.find((w)=>/Gnss$/.test(w.i));
 cur.h.currentPosition({currentPosition:{latitude:375665000,longitude:1269780000,altitude:30},heading:12});
 let st=pos.status(0);assert(st.fix&&near(st.fix.lat,37.5665)&&near(st.fix.lon,126.978)&&st.fix.korea,'1e-7 degrees, in Korea');
 assert.strictEqual(st.candidates[2].unit,'1e-7 deg');assert(st.candidates[2].inUse);assert.strictEqual(st.fix.heading,null,'no heading before 12 m');
 // 100 m north a second later: heading 0; the event source too, but the field has more fixes
 t=1000;cur.h.currentPosition({currentPosition:{latitude:375674000,longitude:1269780000}});
 gnss.h.fix({wgs84Lat:37.5674,wgs84Lon:126.978});
 st=pos.status(1000);assert.strictEqual(st.fix.heading,0,'north');assert(st.candidates[2].inUse&&!st.candidates[3].inUse);assert.strictEqual(st.candidates[3].unit,'deg');
 assert.strictEqual(st.candidates[2].rate,2,'2 per second');
 // the field goes quiet: the event takes over after 3 s
 t=4500;gnss.h.fix({wgs84Lat:37.568,wgs84Lon:126.978});st=pos.status(4500);assert(st.candidates[3].inUse,'the fresh one');
 // a reply without a pair: counted, its keys (never values) logged once
 t=4600;cur.h.currentPosition({nothing:1});t=4900;cur.h.currentPosition({nothing:2});assert.strictEqual(pos.status(4900).candidates[2].misses,2);
 // faster than 5 a second: the extra values are not looked at
 t=4950;cur.h.currentPosition({nothing:3});assert.strictEqual(pos.status(4950).candidates[2].misses,2);
 assert(logs.filter((l)=>/sent no lat\/lon pair/.test(l)).length===1&&!logs.some((l)=>/37\.5|126\.9/.test(l)),'no position in the log');
 pos.sync(false);assert.strictEqual(shut,2,'off: let go');
 // a getter-only field: read by our own timer once a second while on, never after
 {let reads=0;const sig={watch:()=>Promise.resolve({available:true,proxy:{getValue:()=>{reads++;return Promise.resolve({latitude:37.5,longitude:127});}},shutdown(){}})};
  const pp=new P.Position(sig,log,()=>Date.now(),{list:[{iface:'a.b.Pos',inst:'1',name:'pos',kind:'field',poll:true}],note:''});
  pp.sync(true);await new Promise((r)=>setTimeout(r,1150));const n=reads;assert(n>=1,'polled');pp.sync(false);await new Promise((r)=>setTimeout(r,1100));assert.strictEqual(reads,n,'the timer stops with the check');
  assert(pp.status(Date.now()).candidates[2].received>=1);}
 // a reply after off is ignored (an old subscription)
 cur.h.currentPosition({currentPosition:{latitude:1,longitude:1}});assert.strictEqual(pos.status(5000).fix,null);
 // without candidates
 assert.deepStrictEqual(new P.Position(signals,log,()=>0,{list:[],note:'x'}).status(0).candidates.map((c)=>c.kind),['helper','helper'],'only the helper sources');
 // settings: off by default
 const {settings}=require('../../apps/cluster_redline/policy');assert.strictEqual(settings({}).positionCheck,'off');assert.strictEqual(settings({positionCheck:'on'}).positionCheck,'on');
 // the install (store-build.js) with this catalog: the manifest and position-candidates.json
 {const os=require('os'),cp=require('child_process'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rl-pos-')),catFile=path.join(tmp,'cat.json');fs.writeFileSync(catFile,JSON.stringify(cat));
  const spec=require('../../apps/cluster_redline/app.json'),root=path.join(__dirname,'..','..');
  const {build}=require(path.join(root,'tools/store-build'));
  const file=build({template:'cluster_redline',id:'cluster_redline',version:spec.version,dir:'apps/cluster_redline',language:'ko',out:path.join(tmp,'o'),catalog:catFile});
  const stage=path.join(tmp,'s');fs.mkdirSync(stage);cp.execFileSync('tar',['-xzf',file,'-C',stage]);
  const m=JSON.parse(fs.readFileSync(path.join(stage,'package/manifest.json'),'utf8')),c=JSON.parse(fs.readFileSync(path.join(stage,'package/javascript/position-candidates.json'),'utf8'));
  assert.deepStrictEqual(c.list.map((x)=>x.name),['currentPosition','fix']);assert(/2 found/.test(c.note));
  assert.strictEqual(m.proxies['de.bmw.infotainment.navigation.positioning.Positioning'].attributes.currentPosition,'rs');
  fs.rmSync(tmp,{recursive:true,force:true});}
 // the screen, from the built package
 if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(dir+'/settings-ui'),{Canvas}=require(dir+'/kit/canvas'),sp=require(dir+'/kit/app-spec.json');
  const v={};sp.settings.forEach((s)=>v[s.key]=s.default);const page=new SettingsPage({schema:sp.settings,get:(k)=>v[k],set:(k,x)=>{v[k]=x;}},null,'t');
  page.selectTab(3);page.open='navMode';const tg=[];const texts=[],t0=Canvas.prototype.text;Canvas.prototype.text=function(s){texts.push(String(s));return t0.apply(this,arguments);};
  try{page.draw(new Canvas(1600,520),null,{});const b=page.layoutActions.find((x)=>x.id==='position');assert(b,'the Position check button');b.act();assert.strictEqual(page.open,'position');
   page.draw(new Canvas(1600,520),null,{position:pos.status(4500)});page.layoutActions.find((x)=>x.id==='position-on').act();assert.strictEqual(v.positionCheck,'on');
   texts.length=0;page.draw(new Canvas(1600,520),null,{position:{on:true,note:'',candidates:st.candidates,fix:{lat:37.5665,lon:126.978,korea:true,heading:0}}});
   assert(texts.some((x)=>/37\.5665, 126\.9780/.test(x)),'the position shown');page.back();assert.strictEqual(page.open,'navMode');}finally{Canvas.prototype.text=t0;}}
 // 1.3.96: the helper's position (redline-lead 0.6.0) first; its state shown while it is missing
 {let t=0;const p=new P.Position({watch:()=>Promise.resolve({available:true,shutdown(){}})},{info(){},warn(){}},()=>t,{list:[],note:''});
  p.sync(true);p.fromHelper(undefined,0,'absent');let st=p.status(0);assert.strictEqual(st.candidates[0].name,'redline-lead.Positioning.currentLocation');assert(/not installed/.test(st.candidates[0].error));
  p.fromHelper(undefined,0,'connected');assert(/older/.test(p.status(0).candidates[0].error));
  for(let k=0;k<8;k++){t=k*500;p.fromHelper({avail:true,map:{lat:37.5665,lon:126.978,valid:true,at:t},raw:{lat:null,lon:null,valid:false,at:t}},t,'connected');}
  st=p.status(t);assert(st.fix&&Math.abs(st.fix.lat-37.5665)<1e-9&&st.fix.korea,'the helper position used');assert(st.candidates[0].inUse&&st.candidates[0].received===8&&st.candidates[1].misses===8);
  p.fromHelper({avail:true,map:{lat:37.6,lon:127,valid:true,at:t}},t,'connected');assert.strictEqual(p.status(t).candidates[0].received,8,'the same message counted once');
  p.sync(false);p.fromHelper({avail:true,map:{lat:37.6,lon:127,valid:true,at:t+1}},t+1,'connected');assert.strictEqual(p.status(t+1).candidates[0].received,8,'off: nothing taken');}
 console.log('PASS: position check: catalog search and ranking, read only manifest entries, units, the fresh source, heading, nothing logged, off by default, the install, the screen');
})().catch((e)=>{console.error(e);process.exitCode=1;});
