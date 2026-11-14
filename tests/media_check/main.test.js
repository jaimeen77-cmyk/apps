'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const {Session}=require('../../apps/media_check/session');
(async()=>{
 let entry,loop,vis,now=1000,feed,resolveWatch,subCloses=0,pageCloses=0,images=0,inflight=0,maximum=0,session,spawns=0;
 const clicks={},callbacks=[],app=new EventEmitter(),proc=new EventEmitter(),children=[];
 proc.memoryUsage=()=>({rss:40000000,heapUsed:8000000});
 class FakeSession extends Session{constructor(dir,changed){super(dir,changed,{now:()=>now,spawn:()=>{spawns++;const child=new EventEmitter();child.stderr=new EventEmitter();children.push(child);return child;},kill:()=>{}});session=this;}}
 const mocks={fs:{statSync(){throw Error('absent');},mkdirSync(){}},path,'./kit/mgu':{run:e=>entry=e},
  './probe':{inspect:()=>({arch:'x64',node:'test',gpu:[],browser:null}),libc:cb=>cb('test libc')},'./session':{Session:FakeSession},
  './view':{W:1280,H:480,draw:(cv,m)=>{cv.targets=[];callbacks.push(m);return cv;}},
  './local-page':{start:async()=>({url:'http://127.0.0.1:12345/',close:()=>pageCloses++})}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../apps/media_check/main.js'),'utf8'),{require:n=>{assert(n in mocks,n);return mocks[n];},Date:{now:()=>now},process:proc});
 const s={available:true,shutdown:()=>subCloses++,proxy:{getValue:async()=>({speedVehicleCentreOfGravity:0})}};
 const ctx={dataDir:'/tmp',spec:{id:'media_check'},log:{},app,canvas:()=>({}),signals:{hasNative:()=>true,watch:(i,n,handlers,l,opts)=>{assert(!opts.pollMs,'no unowned SDK poll interval');feed=handlers;return new Promise(r=>resolveWatch=r);}},ui:{onClick:(n,f)=>clicks[n]=f,onVisible:f=>vis=f,image:async()=>{images++;maximum=Math.max(maximum,++inflight);await Promise.resolve();inflight--; }},onTap(){},onTab(){},onLayout(){},loop:(name,fps,f)=>loop=f};
 await entry.start(ctx);assert.equal(spawns,0);assert.equal(images,1);assert(callbacks[0].caps.localUrl.startsWith('http://127.0.0.1:'));
 resolveWatch(s);for(let i=0;i<5;i++)await Promise.resolve();feed.statusCarSpeed2({speedVehicleCentreOfGravity:0});
 clicks.BTN_LOCAL();assert.equal(session.state.phase,'unsupported');assert.equal(spawns,0);
 for(let i=0;i<120;i++){now+=1000/60;await loop();}assert(images<10,'ordinary page must not redraw at GPU frame rate');assert.equal(maximum,1);
 const before=images;vis('MAIN',false);now+=2000;await loop();assert.equal(images,before);assert(!session.parked());
 vis('MAIN',true);await loop();app.emit('shutdown');assert.equal(subCloses,1);assert.equal(pageCloses,1);assert.equal(proc.listenerCount('exit'),0);assert.equal(app.listenerCount('shutdown'),0);
 feed.statusCarSpeed2({speedVehicleCentreOfGravity:0});assert(session.closed);assert(!session.start('youtube',{browser:'/bin/nonexistent'}));
 console.log('PASS actual entry point: no autostart, unsupported browser, bounded rendering, no hidden polling, visible/shutdown cleanup and no stale callbacks');
})().catch(e=>{console.error(e);process.exitCode=1;});
