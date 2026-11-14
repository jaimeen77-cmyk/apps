'use strict';
// 1.2.50: the hidden speed limit data collection. Basic settings tapped three times within 2 s opens it; it
// records nothing until turned on (the app keeps no logs otherwise); when on it writes the catalog's speed-limit
// names, what this install can read, the vehicle speed and speed-limit values on change (at most once a second),
// and route guidance speed info, to <dataDir>/speed-probe.log (1 MB, one older file); off stops its readers.
// Usage: node redline-1-2-50.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {SpeedProbe,scanCatalog,speedOf,guidanceOf}=require(root+'/speed-probe');
const {SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json');
const {RouteEvents}=require(root+'/route-events');

// a small in-memory file system
function memfs(files){
 const f=Object.assign({},files||{});
 const err=()=>{const e=new Error('ENOENT');e.code='ENOENT';return e;};
 return {f,readFileSync:p=>{if(!(p in f))throw err();return f[p];},writeFileSync:(p,d)=>{f[p]=String(d);},appendFileSync:(p,d)=>{f[p]=(f[p]||'')+d;},
  unlinkSync:p=>{if(!(p in f))throw err();delete f[p];},statSync:p=>{if(!(p in f))throw err();return {size:Buffer.byteLength(f[p])};},renameSync:(a,b)=>{f[b]=f[a];delete f[a];},
  readdirSync:d=>{const out=Object.keys(f).filter(p=>path.dirname(p)===d).map(p=>path.basename(p));if(!out.length)throw err();return out;}};
}
const CAT='/etc/oap/someip/someip-interfaces.json';
const catalog={interfaces:{'de.bmw.infotainment.KombiIF':{fields:{statusSpeedLimitDisplay:{notifier:{id:32790}},statusBordcomputerAverage:{getter:{id:3}}}},
 'de.bmw.x.SLI':{fields:{trafficSignInfo:{getter:{id:2}}},events:{noPassingRestrictionChanged:{}}},'de.bmw.x.Other':{fields:{temperature:{getter:{id:1}}}}}};

// 1. helpers
assert.deepStrictEqual(scanCatalog(catalog).map(x=>x.iface.split('.').pop()+'.'+x.name+':'+x.kind),['KombiIF.statusSpeedLimitDisplay:field','SLI.trafficSignInfo:field','SLI.noPassingRestrictionChanged:event']);
assert.strictEqual(speedOf({speedVehicleCentreOfGravity:5568}),87);assert.strictEqual(speedOf({speedVehicleCentreOfGravity:65535}),null);assert.strictEqual(speedOf(null),null);
assert.deepStrictEqual(guidanceOf({viewContent:[{speedLimitAssistInfo:{nil:'NO_VALUE'},eventsInView:[{speedCamera:{d:1}},{intersection:{}},{schoolZone:{d:2}}]}]}),{info:[{nil:'NO_VALUE'}],events:[{speedCamera:{d:1}},{schoolZone:{d:2}}]});

// 2. off by default: nothing written, no readers
{
 const fs=memfs({[CAT]:JSON.stringify(catalog)});let watched=0;
 const p=new SpeedProbe({fs,signals:{watch:()=>{watched++;return Promise.resolve({shutdown(){}});}},dataDir:'/d',someipDirs:['/s'],manifestFiles:[]});
 p.guidance({viewContent:[]});p.sample('x',1);
 assert.strictEqual(p.on,false);assert.strictEqual(watched,0);assert.deepStrictEqual(Object.keys(fs.f).filter(k=>k.startsWith('/d')),[],'nothing written while off');
}

// 3. on: catalog names, readable fields, values on change at most once a second, guidance on change; flag kept;
//    off stops the readers; clear removes the files; 1 MB then one older file
(async()=>{
 const fs=memfs({[CAT]:JSON.stringify(catalog),'/s/de_bmw_infotainment_vehicle_Vehicle2.json':JSON.stringify({fields:{statusCarSpeed2:{}}}),
  '/s/de_bmw_infotainment_KombiIF.json':JSON.stringify({fields:{statusSpeedLimitDisplay:{},statusBordcomputerAverage:{}}}),
  '/m/manifest.json':JSON.stringify({proxies:{'de.bmw.infotainment.KombiIF':{instances:'1'}}})});
 let t=Date.UTC(2026,10,14,1,0,0),closed=0;const handlers={},insts={};
 const signals={watch:(iface,inst,h)=>{insts[iface]=inst;Object.assign(handlers,h);return Promise.resolve({available:true,shutdown(){closed++;}});}};
 const p=new SpeedProbe({fs,signals,dataDir:'/d',someipDirs:['/s'],manifestFiles:['/m/manifest.json'],now:()=>t,version:'test'});
 p.setOn(true);await new Promise(r=>setTimeout(r,10));
 assert.deepStrictEqual(JSON.parse(fs.f['/d/speed-probe.json']),{on:true});
 assert.deepStrictEqual(Object.keys(handlers).sort(),['statusCarSpeed2','statusSpeedLimitDisplay'],'speed + speed-limit fields only');
 assert.strictEqual(insts['de.bmw.infotainment.KombiIF'],'1');
 handlers.statusCarSpeed2({speedVehicleCentreOfGravity:5568});handlers.statusCarSpeed2({speedVehicleCentreOfGravity:5632});   // within a second: one line
 t+=1500;handlers.statusCarSpeed2({speedVehicleCentreOfGravity:5632});handlers.statusSpeedLimitDisplay({limit:80});
 p.guidance({viewContent:[{speedLimitAssistInfo:{nil:'NO_VALUE'},eventsInView:[]}]});p.guidance({viewContent:[{speedLimitAssistInfo:{nil:'NO_VALUE'},eventsInView:[]}]});
 const lines=fs.f['/d/speed-probe.log'].trim().split('\n').map(l=>JSON.parse(l));
 assert.deepStrictEqual(lines.map(l=>l.ev),['start','catalog','readable','value','value','value','guidance']);
 assert.strictEqual(lines[1].found.length,3);assert.deepStrictEqual(lines[2].fields,['Vehicle2.statusCarSpeed2','KombiIF.statusSpeedLimitDisplay']);
 assert.deepStrictEqual(lines.filter(l=>l.ev==='value').map(l=>[l.name,l.value]),[['speed',87],['speed',88],['KombiIF.statusSpeedLimitDisplay',{limit:80}]]);
 assert.strictEqual(p.status().latest.speed,88);
 // a new probe (the app restarted) is still on
 assert.strictEqual(new SpeedProbe({fs,signals:{watch:()=>Promise.resolve({shutdown(){}})},dataDir:'/d',someipDirs:[],manifestFiles:[]}).on,true);
 // 1 MB then .1
 fs.f['/d/speed-probe.log']='x'.repeat((1<<20)-10);p.write({ev:'big'});assert(fs.f['/d/speed-probe.log.1']&&fs.f['/d/speed-probe.log'].length<200,'rotated');
 p.clear();assert(!fs.f['/d/speed-probe.log.1']&&/"cleared"/.test(fs.f['/d/speed-probe.log']));
 p.setOn(false);assert.strictEqual(closed,2,'readers stopped');assert(!('/d/speed-probe.json' in fs.f));
 const n=fs.f['/d/speed-probe.log'].length;handlers.statusCarSpeed2({speedVehicleCentreOfGravity:9000});p.guidance({viewContent:[{speedLimitAssistInfo:1}]});assert.strictEqual(fs.f['/d/speed-probe.log'].length,n,'nothing after off');

 // 4. the hidden menu: three taps within 2 s on Basic settings; two, or slow taps, just select the tab
 const values={};spec.settings.forEach(s=>values[s.key]=s.default);
 const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>values[k]=v,setMany:o=>Object.assign(values,o)},page=new SettingsPage(store,null,'test');page.probe=p;
 page.tapBasic(0);page.tapBasic(800);assert.strictEqual(page.open,null);page.tapBasic(3000);page.tapBasic(4000);page.tapBasic(5500);assert.strictEqual(page.open,null,'too slow');
 page.tapBasic(10000);page.tapBasic(10500);page.tapBasic(11000);assert.strictEqual(page.open,'probe');
 const cv=page.draw(new Canvas(1600,520));assert(cv.targets.some(r=>r.id==='probe-0'));
 page.choose(0);assert.strictEqual(p.on,true,'start');page.move(1);assert.strictEqual(page.choice,1);page.choose(0);assert.strictEqual(p.on,false,'stop');
 page.choose(2);assert.strictEqual(page.open,null,'close');

 // 5. route events hand each reply to the collection
 let seen=null;const re=new RouteEvents(()=>0,()=>Promise.resolve({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[]}]}));re.onReply=r=>seen=r;
 re.attach({available:true,proxy:{}});re.tick(5000,'k');await new Promise(r=>setTimeout(r,10));assert(seen&&seen.viewContent,'reply seen');
 console.log('PASS: hidden speed limit data collection: three taps open it, off writes nothing, on records catalog names, readable fields, values on change (1 s), guidance speed info; kept across restarts, 1 MB rotation, clear, off stops readers');
})().catch(e=>{console.error(e);process.exitCode=1;});
