'use strict';
// Host JavaScript rendering benchmark. This does not measure the car CPU, GPU or SOME/IP transport.
// node --expose-gc tools/cluster-redline-benchmark.js <preview-or-Store-stage> [frames-per-case]
const path=require('path'),assert=require('assert');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {settings}=require(root+'/policy'),HUD=require(root+'/hud-compose'),CL=require(root+'/draw');
const frames=Number(process.argv[3]||1000);assert(Number.isInteger(frames)&&frames>=100&&frames<=20000);
if(!global.gc)throw new Error('Run with --expose-gc for comparable retained-memory samples');
const mb=n=>Math.round(n/1048576*100)/100;
const results=[];
for(const scenario of ['steady','rpm-changing','navigation-changing']){
 const caches=[HUD.createCache(),CL.createCache()],painters=[HUD,CL];
 const state={config:settings({appEnabled:true,allHudOutput:'redline',allClusterOutput:'redline',navDisplayMode:'all'}),mode:'COMFORT',rpm:2500,gear:'D4',shift:false,flash:false,renderRpm:true,aux:{oil:90,outside:20},torqueNm:180,powerPS:80,torquePeak:300,powerPeak:150,now:Date.UTC(2026,10,14,1)};
 function frame(i){
  if(scenario!=='steady')state.rpm=2000+(i%300)*10;
  if(scenario==='navigation-changing')state.navigation={visible:true,maneuver:i%2?'RIGHT':'LEFT',distanceText:(300-i%300)+' m',description:'Navigation'};
  painters.forEach((p,k)=>p.draw(Object.assign({},state,{renderCache:caches[k]})));
 }
 for(let i=0;i<100;i++)frame(i);
 global.gc();const start=process.memoryUsage(),cpu=process.cpuUsage(),time=process.hrtime(),samples=[];
 for(let i=0;i<frames;i++){frame(i);if((i+1)%250===0){global.gc();samples.push(process.memoryUsage());}}
 const dt=process.hrtime(time),usage=process.cpuUsage(cpu);global.gc();const end=process.memoryUsage();
 const stats=caches.map(c=>c.stats());assert(stats.every(s=>s.bytes<12*1048576&&s.nodes<30),'render caches must stay bounded');
 results.push({scenario,frames,wallMsPerFrame:Math.round((dt[0]*1000+dt[1]/1e6)/frames*1000)/1000,cpuMsPerFrame:Math.round((usage.user+usage.system)/frames)/1000,heapStartMB:mb(start.heapUsed),heapEndMB:mb(end.heapUsed),bufferStartMB:mb(start.arrayBuffers||start.external),bufferEndMB:mb(end.arrayBuffers||end.external),rssEndMB:mb(end.rss),heapSamplesMB:samples.map(s=>mb(s.heapUsed)),cacheMB:stats.map(s=>mb(s.bytes)),cacheNodes:stats.map(s=>s.nodes)});
 caches.forEach(c=>c.reset());
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,scope:'host JS; two cached output renders per frame; forced GC every 250 frames included',results},null,2));
