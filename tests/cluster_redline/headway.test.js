'use strict';
// The HUD headway badge (1.3.37): the car ahead from GapVehicleAhead (read only, only while on), its distance (the
// finer DataFrontVehicle x 0.0625 m first), the time gap at our speed (none below 12 km/h), the closing speed from the
// gap's change, the colour steps; added at install where the catalog has it; its own overlay with Position / size.
const assert=require('assert'),path=require('path');
const {LeadVehicle,level,IFACE}=require('../../apps/cluster_redline/lead-vehicle');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.deepStrictEqual([level(0.8),level(1.2),level(1.6),level(null)],['red','amber','ok','ok']);
 let t=0,watched=null,shut=0;const signals={loadConfig:(i)=>i===IFACE?{fields:{GapVehicleDrivingAhead:{},DataFrontVehicle:{},DataFrontVehicleExtended:{}}}:{},watch:(i,inst,h)=>{watched={i,inst,h};return Promise.resolve({available:true,shutdown(){shut++;}});}};
 const L=new LeadVehicle(signals,null,()=>'1',()=>t);
 L.sync(false);assert.strictEqual(watched,null,'off: nothing read');
 L.sync(true);await flush();assert(watched&&watched.i===IFACE&&watched.h.DataFrontVehicle&&watched.h.GapVehicleDrivingAhead,'on: subscribed');
 L.sampleSpeed({speedVehicleCentreOfGravity:72*64},0);           // 72 km/h = 20 m/s
 watched.h.DataFrontVehicle({qualifierEventDataFunctionFrontVehicle:1,frontVehicleObjectID:7,frontVehicleGapX:36/0.0625});
 let r=L.read(0);assert.strictEqual(r.gap,36);assert.strictEqual(r.headway,1.8);assert.strictEqual(r.level,'ok');
 // closing in: 36 m -> 34 m in 1 s = -7.2 km/h
 t=1000;watched.h.DataFrontVehicle({qualifierEventDataFunctionFrontVehicle:1,frontVehicleObjectID:7,frontVehicleGapX:34/0.0625});r=L.read(1000);
 assert(r.closing<-7&&r.closing>-7.5,'closing '+r.closing);assert.strictEqual(r.level,'ok');
 t=1300;watched.h.DataFrontVehicle({frontVehicleObjectID:7,frontVehicleGapX:18/0.0625});assert.strictEqual(L.read(1300).level,'red','18 m at 72 km/h: 0.9 s, red');
 t=1600;watched.h.DataFrontVehicle({frontVehicleObjectID:7,frontVehicleGapX:26/0.0625});assert.strictEqual(L.read(1600).level,'amber','1.3 s: amber');
 // another car ahead: its closing speed starts again
 t=1900;watched.h.DataFrontVehicle({frontVehicleObjectID:9,frontVehicleGapX:50/0.0625});assert.strictEqual(L.read(1900).closing,null);
 // nothing ahead: gone; the coarse metres only while the fine distance is not coming
 t=2000;watched.h.DataFrontVehicle({frontVehicleObjectID:255,frontVehicleGapX:4095});assert.strictEqual(L.read(2000),null);
 t=4000;watched.h.GapVehicleDrivingAhead({statusMeasurementVehicleDrivingAhead:'ELEMENT_GEMESSEN',gapVehicleDrivingAhead:42});assert.strictEqual(L.read(4000).gap,42,'coarse metres');
 t=4100;watched.h.GapVehicleDrivingAhead({statusMeasurementVehicleDrivingAhead:'KEIN_ELEMENT_GEMESSEN',gapVehicleDrivingAhead:0});assert.strictEqual(L.read(4100),null,'none measured');
 // slow: no time gap, the distance only; stale after 2.5 s
 t=5000;L.sampleSpeed({speedVehicleCentreOfGravity:8*64},5000);watched.h.DataFrontVehicle({frontVehicleObjectID:3,frontVehicleGapX:6/0.0625});
 assert.strictEqual(L.read(5000).headway,null);assert.strictEqual(L.read(5000).gap,6);assert.strictEqual(L.read(7600),null,'stale');
 L.sync(false);assert.strictEqual(shut,1,'off: let go');assert.strictEqual(L.read(5000),null);
 // a car without the interface: quietly nothing
 const none=new LeadVehicle({loadConfig:()=>({fields:{}}),watch:()=>{throw new Error('no');}},null,null,()=>0);none.sync(true);assert.strictEqual(none.status(0).state,'not_installed');assert.strictEqual(none.read(0),null);
 // install time: added where the catalog has it
 const {filterTraffic}=require('../../apps/cluster_redline/traffic-config');
 const cat={interfaces:{[IFACE]:{fields:{GapVehicleDrivingAhead:{notifier:{id:32769}},DataFrontVehicle:{notifier:{id:32770}},DataFrontVehicleExtended:{notifier:{id:32771}}}}},instanceIDs:{[IFACE]:{'1':1}}};
 const m=filterTraffic({proxies:{}},cat);assert.deepStrictEqual(m.proxies[IFACE],{instances:'1',attributes:{GapVehicleDrivingAhead:'s',DataFrontVehicle:'s',DataFrontVehicleExtended:'s'}});
 assert.deepStrictEqual(filterTraffic({proxies:{}},{interfaces:{},instanceIDs:{}}).proxies,{},'not in the catalog: nothing added');
 // settings
 const {settings}=require('../../apps/cluster_redline/policy'),D=require('../../apps/cluster_redline/display-config');
 assert.strictEqual(settings({}).hudHeadway,'off','off by default');assert.strictEqual(settings({hudHeadway:'detail'}).hudHeadway,'detail');assert.strictEqual(settings({hudHeadway:'x'}).hudHeadway,'off');
 const r0=D.headwayRect(settings({}));assert.strictEqual(r0.x+r0.w/2,400,'centred');assert(r0.y>=234&&r0.y+r0.h<=300&&r0.w===112&&r0.h===60,'between the turn arrows under the RPM face');
 assert.strictEqual(D.headwayRect(settings({hudHeadwayOffsetX:40,hudHeadwayScale:150})).w,168);
 // the overlay (stub drawing): shown with a car ahead, hidden without, redrawn only on change, the preview
 const Module=require('module'),orig=Module._load;Module._load=function(n){if(n==='./kit/canvas'){class C{constructor(w,h){this.w=w;this.h=h;this.d=new Uint8Array(w*h*4);}}return {ScaledCanvas:class{constructor(w,h,k){this.canvas=new C(Math.round(w*k),Math.round(h*k));}clear(){}roundRect(){}fillRect(){}polyline(){}text(){}textWidth(s){return String(s).length*8;}}};}return orig.apply(this,arguments);};
 const {HeadwayOverlay,content}=require('../../apps/cluster_redline/headway-overlay');
 const layers=new Map();let k=0,up=0;const client={image(o){layers.set(++k,Object.assign({},o));return k;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
 const ov=new HeadwayOverlay(client),cfg=settings({hudHeadway:'detail'});
 ov.tick(null,cfg,'detail',false);assert.strictEqual(layers.size,0);
 ov.tick({gap:36,headway:1.8,closing:-6,level:'ok'},cfg,'detail',false);const l=layers.get(1);assert(l.target==='hud'&&l.klass==='overlay'&&l.visible);assert.strictEqual(up,1);
 ov.tick({gap:36.2,headway:1.81,closing:-6.2,level:'ok'},cfg,'detail',false);assert.strictEqual(up,1,'the same on the HUD: not redrawn');
 ov.tick(null,cfg,'detail',false);assert.strictEqual(l.visible,false);ov.tick(null,cfg,'detail',true);assert.strictEqual(l.visible,true,'preview');ov.close();Module._load=orig;
 assert.deepStrictEqual(content({gap:36,headway:1.8,closing:-6,level:'red'},'detail'),{big:'1.8s',dist:'36 m',closing:'-6 km/h',color:'#ff2b3a'});
 assert.strictEqual(content({gap:36,headway:1.8,closing:-6,level:'ok'},'simple').closing,null,'simple: no closing speed');
 assert.deepStrictEqual(content({gap:6,headway:null,closing:null,level:'ok'},'detail'),{big:'6 m',dist:null,closing:null,color:'#3ec8f5'},'slow: the distance big');
 if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),O=require(path.join(dir,'headway-overlay'));
  const cv=O.draw({gap:36,headway:0.8,closing:-6,level:'red'},'detail',112,60);let red=0;for(let i=0;i<cv.d.length;i+=4)if(cv.d[i]>200&&cv.d[i+1]<80&&cv.d[i+3]>200)red++;assert(red>80,'drawn red');}
 console.log('PASS: HUD headway badge: GapVehicleAhead read only while on, fine distance first, time gap from our speed (none below 12 km/h), closing speed, colour steps, install-time input, settings, overlay'+(process.argv[2]?', drawn':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
