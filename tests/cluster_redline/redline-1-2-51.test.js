'use strict';
// 1.2.51: the speed limit data collection polls route events of every kind itself (school zones, speed cameras,
// speed limits), on the worker's GuidanceEventList proxy, with BMW navigation or a phone alike, only while on.
// includedTypes: the INCLUDE_* names in the car's catalog first, then guesses; a rejected set moves on, a working
// one is kept. School-zone names count as speed-limit names in the catalog scan.
// Usage: node redline-1-2-51.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {SpeedProbe,includeNames,LIMIT_NAME,ROUTE_GUESSES}=require(root+'/speed-probe');
function memfs(files){const f=Object.assign({},files||{}),err=()=>Object.assign(new Error('ENOENT'),{code:'ENOENT'});
 return {f,readFileSync:p=>{if(!(p in f))throw err();return f[p];},writeFileSync:(p,d)=>{f[p]=String(d);},appendFileSync:(p,d)=>{f[p]=(f[p]||'')+d;},unlinkSync:p=>{if(!(p in f))throw err();delete f[p];},
  statSync:p=>{if(!(p in f))throw err();return {size:Buffer.byteLength(f[p])};},renameSync:(a,b)=>{f[b]=f[a];delete f[a];},readdirSync:()=>{throw err();}};}
assert(LIMIT_NAME.test('schoolZoneInfo')&&LIMIT_NAME.test('statusChildZone'),'school zones are collected');
assert.deepStrictEqual(Array.from(includeNames({types:{IncludedType:{enumerators:{INCLUDE_ACTIVE_MANEUVERS:0,INCLUDE_SCHOOL_ZONES:7}},x:['INCLUDE_POIS','other']}})).sort(),['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_POIS','INCLUDE_SCHOOL_ZONES']);
(async()=>{
 const IF='de.bmw.infotainment.navigation.guiding.GuidanceEventList';
 const catalog={interfaces:{[IF]:{methods:{queryContent:{in:{includedTypes:{enumerators:['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_SCHOOL_ZONES']}}}}}}};
 const fs=memfs({'/etc/oap/someip/someip-interfaces.json':JSON.stringify(catalog)});let t=Date.UTC(2026,10,14,1,0,0);
 const p=new SpeedProbe({fs,signals:null,dataDir:'/d',someipDirs:[],manifestFiles:[],now:()=>t});
 const sent=[];let reject=1;
 const call=(proxy,method,args)=>{sent.push(args.viewConfigs[0].viewport.includedTypes);if(reject-->0)return Promise.resolve({GuidanceEventListError:'INVALID_ARGUMENT'});
  return Promise.resolve({GuidanceEventListError:'NO_ERROR',viewContent:[{speedLimitAssistInfo:{limit:30},eventsInView:[{schoolZone:{formattedDistance:{value:'200'}}},{intersection:{}}]}]});};
 const sub={available:true,proxy:{}};p.attachRoute(sub,call);
 p.queryRoute();assert.strictEqual(sent.length,0,'off: no queries');
 p.setOn(true);
 assert.deepStrictEqual(p.candidates[0],['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_SCHOOL_ZONES'],'catalog names first');assert.deepStrictEqual(p.candidates.slice(1),ROUTE_GUESSES);
 for(let i=0;i<3;i++){p.queryRoute();await new Promise(r=>setTimeout(r,5));t+=1500;}
 assert.deepStrictEqual(sent[0],['INCLUDE_ACTIVE_MANEUVERS','INCLUDE_SCHOOL_ZONES']);assert.deepStrictEqual(sent[1],ROUTE_GUESSES[0],'rejected: the next set');assert.deepStrictEqual(sent[2],ROUTE_GUESSES[0],'working: kept');
 const lines=fs.f['/d/speed-probe.log'].trim().split('\n').map(l=>JSON.parse(l));
 const g=lines.find(l=>l.ev==='guidance');assert.deepStrictEqual(g.events,[{schoolZone:{formattedDistance:{value:'200'}}}]);assert.deepStrictEqual(g.info,[{limit:30}]);
 assert(lines.some(l=>l.ev==='route-raw'),'first reply with a school zone kept raw');
 assert(lines.some(l=>l.ev==='value'&&l.name==='route-query'&&l.value.error==='INVALID_ARGUMENT'),'rejection recorded');
 assert.strictEqual(p.status().route,'ok');
 p.setOn(false);const n=sent.length;p.queryRoute();assert.strictEqual(sent.length,n,'off again: no queries');assert.strictEqual(p.timer,null);
 console.log('PASS: the collection queries route events of every kind itself while on (catalog INCLUDE_* names first, then guesses; rejected sets move on, a working one is kept), records school zones / speed limit info, stops when off');
})().catch(e=>{console.error(e);process.exitCode=1;});
