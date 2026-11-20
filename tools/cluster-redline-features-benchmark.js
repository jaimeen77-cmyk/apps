'use strict';
// Host JavaScript cost of what 1.3.x added to every worker frame and to the settings host: HUD turn signals (in the
// Redline HUD image and on their overlay), the vehicle alert overlay, sign recognition and route event decoding, and
// switching drivers. Like cluster-redline-benchmark.js this does not measure the car CPU, GPU or SOME/IP transport;
// overlay pixels go to a client that only counts them.
// node --expose-gc tools/cluster-redline-features-benchmark.js <Store-stage> [frames-per-case]
const path=require('path'),assert=require('assert');
const root=path.join(path.resolve(process.argv[2]),'source/javascript');
const frames=Number(process.argv[3]||1500);assert(Number.isInteger(frames)&&frames>=100&&frames<=20000);
if(!global.gc)throw new Error('Run with --expose-gc for comparable retained-memory samples');
const {settings}=require(root+'/policy'),HUD=require(root+'/hud-compose');
const {TurnOverlay}=require(root+'/turn-overlay'),{AlertOverlay}=require(root+'/alert-overlay'),{TurnSignal}=require(root+'/turn-signal');
const {TrafficSigns}=require(root+'/traffic-signs'),{decode}=require(root+'/vehicle-alerts'),{DriverProfiles}=require(root+'/driver-profiles');
const spec=require(root+'/kit/app-spec.json'),{driverKeys}=require(root+'/settings-ui');
const mb=n=>Math.round(n/1048576*100)/100,results=[];
const client=()=>{let n=0;const c={uploads:0,bytes:0,sets:0,image(){return ++n;},pixels(r,x,b){c.uploads++;c.bytes+=b.length;},set(){c.sets++;},drop(){}};return c;};
async function run(name,setup){
 const {frame,after,ready}=setup();if(ready)await ready();for(let i=0;i<100;i++)frame(i);
 global.gc();const start=process.memoryUsage(),cpu=process.cpuUsage(),time=process.hrtime();
 for(let i=0;i<frames;i++){frame(i+100);if((i+1)%250===0)global.gc();}
 const dt=process.hrtime(time),usage=process.cpuUsage(cpu);global.gc();const end=process.memoryUsage();
 results.push(Object.assign({case:name,frames,cpuMsPerFrame:Math.round((usage.user+usage.system)/frames)/1000,wallMsPerFrame:Math.round((dt[0]*1000+dt[1]/1e6)/frames*1000)/1000,heapStartMB:mb(start.heapUsed),heapEndMB:mb(end.heapUsed),rssEndMB:mb(end.rss)},after?after():{}));
}
const at=i=>i*50;   // the worker's 20 fps
(async()=>{
// 0. Baseline: the Redline HUD image alone, RPM changing (no turn signals).
await run('hud-baseline',()=>{const cache=HUD.createCache(),config=settings({appEnabled:true,allHudOutput:'redline'});
 return {frame:i=>{HUD.draw({config,mode:'COMFORT',rpm:2000+(i%300)*10,gear:'D4',renderRpm:true,aux:{},renderCache:cache});}};});
// 1. The Redline HUD image with the turn signals in it, flashing (the RPM changes too, as while driving).
await run('hud+turn-signals-in-layer',()=>{const cache=HUD.createCache(),turn=new TurnSignal(),config=settings({appEnabled:true,allHudOutput:'redline',hudTurnSignals:'on',hudTurnStyle:'chevron3'});
 turn.sample({controlIndicateDirection:3},0);
 return {frame:i=>{const t=turn.read(at(i));HUD.draw({config,mode:'COMFORT',rpm:2000+(i%300)*10,gear:'D4',renderRpm:true,aux:{},indicator:t.indicator,turnLit:t.lit,turnStep:t.step,turnInLayer:true,renderCache:cache});}};});
// 2. The turn signal overlay (stock HUD): flashing switches opacity only.
await run('turn-overlay',()=>{const c=client(),o=new TurnOverlay(c),turn=new TurnSignal(),cfg=settings({hudTurnSignals:'on'});turn.sample({controlIndicateDirection:8},0);
 return {frame:i=>o.tick(at(i),cfg,turn.read(at(i)),false),after:()=>({uploads:c.uploads,opacitySets:c.sets})};});
// 3. The vehicle alert overlay approaching a camera at 60 km/h (0.83 m a frame, from 1000 m, then again): the car's
// own text in 10 m steps, against the 50 m steps the app shows (vehicle-alerts.js shownDistance).
const {shownDistance}=require(root+'/vehicle-alerts');
for(const [label,text] of [['alert-overlay-10m-steps',m=>Math.round(m/10)*10+' m'],['alert-overlay-50m-steps',m=>shownDistance(m,'')]]){
 await run(label,()=>{const c=client(),o=new AlertOverlay(c),cfg=settings({hudCarAlerts:'all'});
  return {frame:i=>{const m=1000-(i*0.8333)%1000;o.tick(cfg,{speeding:{limit:30},school:{sign:true},camera:{m,text:text(m),limit:60}});},after:()=>({uploads:c.uploads,uploadKBps:Math.round(c.bytes/1024/((frames+100)/20))})};});
}
// 4. Sign recognition: a camera event with four signs and a speed every frame (more often than the car sends them).
await run('sign-recognition',()=>{const t=new TrafficSigns();
 const sign=(type,value)=>({type,value,position:{left:false,right:true,overhead:false},firstSupplementalType:'SIGNAL_UNFILLED',secondSupplementalType:'SIGNAL_UNFILLED',additionalInfo:'NO_ADDITIONAL_RESTRICTION',location:{locationInvalidFlags:0}});
 const cam={eventDataQualifier:'EVENT_DATA_AVAILABLE',extendedQualifier:'NORMAL_OPERATION_MODE',trafficSignRecognition:{numberSigns:4,speedLimitUnit:'KM_H'},trafficSign:[sign('SPEED_LIMIT',30),sign('DS_CHILDREN',0),sign('NO_STANDING_ANYTIME',0),sign('MANDATORY_PASSING_STRAIGHT',0)],trafficSignRecognitionQuality:[1,2,3,4].map(()=>({qualityType:100,qualityValue:47}))};
 return {frame:i=>{t.sample('TrafficSignRecognition',{presentWithdrawalLimitSpeed:1,presentClassLimitSpeed:6,unitOfMeasurementSpeedLimit:0},at(i));t.sample('TrafficSignRecognitionFrontCamera',cam,at(i));
  t.sample('statusCarSpeed2',{speedVehicleCentreOfGravity:(30+i%10)*64},at(i));t.alerts(at(i),'all',true);}};});
// 5. Route events: an eight-event reply decoded every frame (the worker asks once a second).
await run('route-event-decode',()=>{const d=m=>({distance:String(m),unit:'METER',rawDistance:m});
 const reply={GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[{intersection:{formattedDistance:d(80)}},{speedCamera:{formattedDistance:d(420)}},{schoolZone:{formattedDistance:d(150),isInsideEvent:false}},{speedSectionCamera:{formattedDistance:d(0),isInsideEvent:true,averageSpeed:80}},{speedLimitAssist:{formattedDistance:d(30)}},{tunnel:{}},{intersection:{formattedDistance:d(900)}},{branch:{formattedDistance:d(1200)}}]}]};
 return {frame:()=>decode(reply)};});
// 6. Switching drivers: every 50th frame another of three drivers, the whole per-driver set applied in one write.
await run('driver-switch',()=>{const values={},L=[];spec.settings.forEach(s=>{values[s.key]=s.default;});values.driverProfiles='on';
 const st={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},setMany:c=>Object.keys(c).forEach(k=>{values[k]=c[k];L.forEach(f=>f(k,c[k]));}),onChange:f=>L.push(f)};
 let feed=null,writes=0;const files={},fs={readFileSync:f=>{if(!(f in files))throw new Error('ENOENT');return files[f];},writeFileSync:(f,x)=>{writes++;files[f]=x;}};
 const p=new DriverProfiles({settings:st,signals:{hasNative:()=>true,watch:(i,inst,h)=>{if(/SessionManager/.test(i))feed=h.currentUserAccountReference;return Promise.resolve({available:true,shutdown(){}});}},fs,file:'/p',keys:()=>driverKeys(spec.settings)});
 const ids=['A','B','C'];
 return {ready:async()=>{for(let i=0;i<10&&!feed;i++)await Promise.resolve();assert(feed,'driver feed');},frame:i=>{if(i%50===0){feed(ids[(i/50)%3]);st.set('hudDesign',['own','rl-ramp','rl-dial'][(i/50)%3]);}},after:()=>({fileKB:Math.round((files['/p']||'').length/1024),fileWrites:writes,keys:p.keys().length})};});
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,scope:'host JS; 1.3.x additions per worker frame (20 fps) and driver switches; forced GC every 250 frames included',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
