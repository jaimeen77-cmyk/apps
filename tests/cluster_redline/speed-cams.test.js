'use strict';
// 1.3.99: speed cameras from the public list (speed-cams-data.js, tools/speed-cams/build.py) with the helper's position:
// a camera ahead within 25 m to the side, getting nearer, let go once passed; none behind or off to the side; a section's
// average speed after its start camera; the worker merges them into the one vehicle alert badge, the car navigation's own
// camera event first; "Navigation only" leaves the list out.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const SC=require('../../apps/cluster_redline/speed-cams'),data=require('../../apps/cluster_redline/speed-cams-data');
const t=SC.load();assert(t.n>20000&&t.n===data.count,'the list loads: '+t.n);assert(/^20\d\d-\d\d-\d\d$/.test(data.date));
for(let i=0;i<t.n;i+=997)assert(t.lat[i]>33&&t.lat[i]<39&&t.lon[i]>124&&t.lon[i]<132&&t.limit[i]>0,'in Korea, with a limit');
const mk=rows=>{const b=Buffer.alloc(rows.length*12);rows.forEach((r,k)=>{b.writeInt32LE(Math.round(r[0]*1e6),k*12);b.writeInt32LE(Math.round(r[1]*1e6),k*12+4);b[k*12+8]=r[2];b[k*12+9]=r[3];b.writeUInt16LE(r[4]||0,k*12+10);});return {b64:b.toString('base64'),date:'test'};};
const lat0=37.5,lon0=127,dl=m=>m/110540,dx=m=>m/(111320*Math.cos(lat0*Math.PI/180));
{// north at 72 km/h (20 m/s): a camera 250 m ahead, one behind, one 60 m to the side; a children's zone one; a section
 const sc=new SC.SpeedCams(mk([[lat0+dl(250),lon0,60,0],[lat0-dl(250),lon0,50,0],[lat0+dl(150),lon0+dx(60),40,0],[lat0+dl(700),lon0+dx(8),30,SC.F.CHILD],[lat0+dl(1000),lon0,100,SC.F.START,200]]));
 const seen=[];let v=null;
 for(let s=0;s<90;s++){const at=s*1000;sc.position({lat:lat0+dl(s*20),lon:lon0,at},at);v=sc.tick(at,72);seen.push(v&&v.camera);}
 assert.strictEqual(seen[0],null,'no heading yet: nothing');
 assert(seen[5]&&seen[5].limit===60&&Math.abs(seen[5].m-150)<=25&&seen[5].over,'the camera ahead, nearer, over 60');
 assert(seen.slice(0,14).every(c=>!c||c.limit!==50),'the one behind never');assert(seen.every(c=>!c||c.limit!==40),'the one 60 m to the side never');
 assert(seen[15]===null,'passed: let go');
 assert(seen[30]&&seen[30].limit===30&&seen[30].zone==='child','a children\'s zone camera');
 assert(seen[46]&&seen[46].section&&!seen[46].inside,'the section start ahead');
 assert(seen[60]&&seen[60].inside&&seen[60].avg===72&&seen[60].remain<2000&&!seen[60].over,'in the section: the average, what is left');}
{// fast: 500 m ahead from 80 km/h; slow: only 300 m
 const sc=new SC.SpeedCams(mk([[lat0+dl(500),lon0,100,0]]));sc.position({lat:lat0,lon:lon0,at:0},0);sc.position({lat:lat0+dl(20),lon:lon0,at:1},1000);
 assert.strictEqual(sc.tick(1000,50),null,'50 km/h: 480 m is too far');assert(sc.tick(1100,90),'90 km/h: shown from 500 m');}
{// a stale position: nothing
 const sc=new SC.SpeedCams(mk([[lat0+dl(100),lon0,60,0]]));sc.position({lat:lat0,lon:lon0,at:0},0);sc.position({lat:lat0+dl(20),lon:lon0,at:1},1000);
 assert(sc.tick(1000,30));assert.strictEqual(sc.tick(6000,30),null,'4 s without a position: let go');}
// the worker: the list's camera in the badge, the navigation's own first, "Navigation only" leaves it out
(async()=>{
 const {settings}=require('../../apps/cluster_redline/policy'),source=fs.readFileSync(path.join(__dirname,'../../apps/cluster_redline/worker.js'),'utf8');
 const i0=0,cLat=t.lat[i0],cLon=t.lon[i0];
 async function run(cams,navCam){
  let time=0,timer=null;const shown=[],sent=[],pos={at:0,lat:cLat-dl(330),lon:cLon};
  class FakeHelper{constructor(){this.state='off';this.last=null;}sync(on){this.state=on?'connected':'off';this.last=on?{position:{map:Object.assign({valid:true},pos)}}:null;}send(c){sent.push(c);return true;}status(){return {state:this.state};}read(){return null;}frontGap(){return null;}}
  class FakeClient extends EventEmitter{constructor(){super();this.ready=false;this.backend='id7';this.targets='map:1088x480,panel:1920x720,hud:800x480';this.next=0;}connect(){this.ready=true;this.emit('ready');}image(){return ++this.next;}pixels(){}set(){}drop(){}close(){}}
  const painter={W:1088,H:480,draw:()=>({d:Buffer.alloc(4)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})};
  const config=settings({allHudOutput:'stock',allClusterOutput:'stock',hudCarCams:cams});
  const box={module:{exports:{}},require:name=>{
    if(name==='fs')return {readFileSync:f=>{if(/manifest\.json$/.test(f))throw new Error('none');return JSON.stringify({id:'cluster-render',version:'0.4.0'});},writeFileSync(){},renameSync(){},mkdirSync(){}};
    if(name==='path')return path;if(name==='./cluster_render_client')return {ClusterRender:FakeClient};if(name==='./draw')return painter;
    if(name==='./hud-compose')return Object.assign({},painter,{W:800,H:480,fullTarget:true});
    if(name==='./lead-helper')return {LeadHelper:FakeHelper};
    if(name==='./alert-overlay')return {AlertOverlay:class{tick(cfg,v){shown.push(v);return {};}hide(){}close(){}status(){return {};}}};
    if(name==='./vehicle-alerts'){const real=require('../../apps/cluster_redline/vehicle-alerts');return Object.assign({},real,{VehicleAlerts:class{attach(){}stop(){}tick(){}read(){return navCam?{camera:navCam}:null;}status(){return {};}}});}
    return require('../../apps/cluster_redline/'+name.slice(2));
   },process:{hrtime:()=>[Math.floor(time/1000),Math.floor((time%1000)*1e6)],once(){},removeListener(){}},setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;},console};
  vm.runInNewContext(source,box,{filename:'worker.js'});
  const feeds={},worker=box.module.exports.start({dataDir:'/data',app:new EventEmitter(),settings:{get:k=>config[k]},log:{warn(){},info(){}},
   signals:{hasNative:()=>true,loadConfig:()=>{throw new Error('absent');},watch:(iface,instance,handlers)=>{feeds[iface]=Object.assign(feeds[iface]||{},handlers);return Promise.resolve({available:true,shutdown(){}});}}});
  const V2='de.bmw.infotainment.vehicle.Vehicle2';
  for(let at=500;at<=6000;at+=100){time=at;if(at%1000===0){pos.at=at;pos.lat=cLat-dl(330)+dl((at-1000)/1000*15);}
   if(feeds[V2]&&feeds[V2].statusCarSpeed2)feeds[V2].statusCarSpeed2({speedVehicleCentreOfGravity:54*64});
   const fn=timer;timer=null;if(fn)fn();for(let k=0;k<5;k++)await Promise.resolve();}
  worker.stop();return {shown:shown.filter(Boolean),sent};
 }
 {const r=await run('db',null);assert(r.sent.some(c=>c.position===true),'the helper is asked for the position');
  const last=r.shown[r.shown.length-1];assert(last&&last.camera&&last.camera.limit===t.limit[i0]&&'speed' in last,'the list\'s camera in the badge, with the speed: '+JSON.stringify(last));}
 {const nav={m:420,text:'420 m',section:false,inside:false,limit:77};const r=await run('db',nav);assert(r.shown.length&&r.shown.every(v=>v.camera===nav||v.camera&&v.camera.limit===77),'the navigation\'s own camera first');}
 {const r=await run('nav',null);assert(!r.sent.some(c=>c.position),'Navigation only: no position asked');assert(!r.shown.some(v=>v.camera),'and no list camera');}
 console.log('PASS: speed cameras: the public list loads ('+t.n+', '+data.date+'), ahead / passed / behind / to the side, zone, section average, range by speed, stale position; the worker\'s one badge, the navigation first, Navigation only');
})().catch(e=>{console.error(e);process.exitCode=1;});
