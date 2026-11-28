'use strict';
// The HUD headway badge (1.3.37): the car ahead from GapVehicleAhead (read only, only while on), its distance (the
// finer DataFrontVehicle x 0.0625 m first), the time gap at our speed (none below 12 km/h), the closing speed from the
// gap's change, the colour steps; added at install where the catalog has it; its own overlay with Position / size.
const assert=require('assert'),path=require('path');
const {LeadVehicle,level,IFACE}=require('../../apps/cluster_redline/lead-vehicle');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.deepStrictEqual([level(0.5),level(0.8),level(1.2),level(null)],['red','amber','ok','ok']);assert.strictEqual(level(0.8,-6),'red','1.3.102: under 1.0 s while closing in at 5 km/h or more');assert.strictEqual(level(0.8,-3),'amber');
 let t=0,watched=null,shut=0;const signals={loadConfig:(i)=>i===IFACE?{fields:{GapVehicleDrivingAhead:{},DataFrontVehicle:{},DataFrontVehicleExtended:{}}}:(()=>{throw new Error('none');})(),watch:(i,inst,h)=>{watched={i,inst,h};return Promise.resolve({available:true,shutdown(){shut++;}});}};
 const L=new LeadVehicle(signals,null,()=>'1',()=>t);
 L.sync(false);assert.strictEqual(watched,null,'off: nothing read');
 L.sync(true);await flush();assert(watched&&watched.i===IFACE&&watched.h.DataFrontVehicle&&watched.h.GapVehicleDrivingAhead,'on: subscribed');
 L.sampleSpeed({speedVehicleCentreOfGravity:72*64},0);           // 72 km/h = 20 m/s
 watched.h.DataFrontVehicle({qualifierEventDataFunctionFrontVehicle:1,frontVehicleObjectID:7,frontVehicleGapX:36/0.0625});
 let r=L.read(0);assert.strictEqual(r.gap,36);assert.strictEqual(r.headway,1.8);assert.strictEqual(r.level,'ok');
 // closing in: 36 m -> 34 m in 1 s = -7.2 km/h
 t=1000;watched.h.DataFrontVehicle({qualifierEventDataFunctionFrontVehicle:1,frontVehicleObjectID:7,frontVehicleGapX:34/0.0625});r=L.read(1000);
 assert(r.closing<-7&&r.closing>-7.5,'closing '+r.closing);assert.strictEqual(r.level,'ok');
 t=1300;watched.h.DataFrontVehicle({frontVehicleObjectID:7,frontVehicleGapX:18/0.0625});assert.strictEqual(L.read(1300).level,'red','18 m at 72 km/h: 0.9 s while closing in at 7 km/h, red');
 t=1600;watched.h.DataFrontVehicle({frontVehicleObjectID:7,frontVehicleGapX:26/0.0625});assert.strictEqual(L.read(1600).level,'ok','1.3 s: cyan since 1.3.102');
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
 const Module=require('module'),orig=Module._load;Module._load=function(n){if(n==='./kit/canvas'){class C{constructor(w,h){this.w=w;this.h=h;this.d=new Uint8Array(w*h*4);}}return {ScaledCanvas:class{constructor(w,h,k){this.canvas=new C(Math.round(w*k),Math.round(h*k));}clear(){}roundRect(){}fillRect(){}polyline(){}fill(){}line(){}text(){}textWidth(s){return String(s).length*8;}}};}return orig.apply(this,arguments);};
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
  // 1.3.92: a word in the big place ("Moving off") in the bold face (the thin one has digits and units only: "Mig")
  {const {Canvas}=require(path.join(dir,'kit/canvas')),t0=Canvas.prototype.text,seen=[];Canvas.prototype.text=function(v,x,y,sz,c,o){seen.push([String(v),o&&o.font]);return t0.apply(this,arguments);};
   try{O.draw({gap:6,go:true},'detail',112,60);O.draw({gap:18,headway:1.6,closing:-3,level:'ok'},'detail',112,60);O.draw({gap:6,headway:null,closing:null,level:'ok'},'detail',112,60);}finally{Canvas.prototype.text=t0;}
   const big=seen.filter(e=>e[1]==='light'||e[1]==='bold');const go=big.find(e=>!/^[0-9.,\s+\-ms]*$/.test(e[0]));
   assert(go&&go[1]==='bold','the departure word in bold: '+JSON.stringify(big));assert(big.some(e=>e[0]==='1.6s'&&e[1]==='light')&&big.some(e=>e[0]==='6 m'&&e[1]==='light'),'figures stay thin');}
  const cv=O.draw({gap:36,headway:0.8,closing:-6,level:'red'},'detail',112,60);let red=0;for(let i=0;i<cv.d.length;i+=4)if(cv.d[i]>200&&cv.d[i+1]<80&&cv.d[i+3]>200)red++;assert(red>80,'drawn red');}
 // 1.3.65: nothing offered on the manifest's instance for 20 s: subscribed again on instance 1 (as cluster-metrics), once;
 // the screen shows whether the radar's service is offered and on which instance
 {let t2=0;const seen=[];const sig={loadConfig:()=>({fields:{GapVehicleDrivingAhead:{},DataFrontVehicle:{}}}),watch:(i,inst)=>{if(i===IFACE)seen.push(inst);return Promise.resolve({available:false,shutdown(){}});}};
  const L2=new LeadVehicle(sig,null,()=>'Main_Instance',()=>t2);L2.sync(true);await flush();
  assert.deepStrictEqual([L2.status(0).instance,L2.status(0).available],['Main_Instance',false]);
  t2=10000;L2.sync(true);await flush();assert.deepStrictEqual(seen,['Main_Instance'],'not before 20 s');
  t2=21000;L2.sync(true);await flush();assert.deepStrictEqual(seen,['Main_Instance','1'],'then instance 1');assert.strictEqual(L2.status(t2).instance,'1');
  t2=60000;L2.sync(true);await flush();assert.strictEqual(seen.length,2,'once');
  const seen3=[];const L3=new LeadVehicle({loadConfig:sig.loadConfig,watch:(i,inst)=>{if(i===IFACE)seen3.push(inst);return Promise.resolve({available:false,shutdown(){}});}},null,()=>'1',()=>t2);
  L3.sync(true);await flush();t2=200000;L3.sync(true);await flush();assert.deepStrictEqual(seen3,['1'],'already instance 1: nothing else to try');}
 // 1.3.68: the car's Drive assist view when the radar's service is not offered: the cruise control's target in the
 // object list (centimetres over 300), else the nearest in our lane; the radar first when it comes
 {let t4=0;const subs={};const sig={loadConfig:(i)=>{if(i===IFACE)throw new Error('none');return {};},watch:(i,inst,h)=>{subs[i]=h;return Promise.resolve({available:true,shutdown(){}});}};
  const L4=new LeadVehicle(sig,null,()=>'1',()=>t4);L4.sync(true);await flush();
  const A=require('../../apps/cluster_redline/assist-view');assert(subs[A.ACC_IF]&&subs[A.OBJ_IF],'both broadcasts');assert.strictEqual(L4.status(0).state,'not_installed');
  const list=(objs)=>({objectList:objs.map(([id,x,y,lane])=>({objectID:id,objectPosition:{x,y},objectPrediction:{laneAssignment:lane}}))});
  L4.sampleSpeed({speedVehicleCentreOfGravity:72*64},0);
  subs[A.OBJ_IF][A.OBJ_EV](list([[4,1200,-350,'RIGHT'],[9,3600,20,'EGO'],[11,5200,40,'EGO']]));
  let r=L4.read(0);assert(r&&Math.abs(r.gap-36)<0.01,'the nearest in our lane: 3600 cm = 36 m');assert.strictEqual(L4.status(0).source,'assist');
  subs[A.ACC_IF][A.ACC_EV]({assistedDrivingViewACCTargetObjectId:11,assistedDrivingViewACCTargetDistance:52,assistedDrivingViewStateXcc:3});
  t4=500;subs[A.OBJ_IF][A.OBJ_EV](list([[9,3500,20,'EGO'],[11,5100,40,'EGO']]));r=L4.read(500);assert(Math.abs(r.gap-51)<0.01,'the cruise control\'s target');
  const st=L4.status(500).assist;assert.deepStrictEqual([st.received.acc,st.received.objects,st.raw.objects,st.raw.lead.id,st.raw.lead.x,st.raw.target,st.raw.accDistance],[1,2,2,11,5100,11,52]);
  t4=900;subs[A.OBJ_IF][A.OBJ_EV](list([[4,900,-350,'RIGHT']]));assert.strictEqual(L4.read(900),null,'nobody in our lane: none');
  assert.strictEqual(A.metres(38),38,'metres as they are');assert.strictEqual(A.metres(3800),38);
  {const a=L4.status(900).assist;assert.deepStrictEqual([a.acc.offered,a.acc.instance,a.objects.offered],[true,'1',true],'1.3.69: each source offered, its instance');}
  L4.sync(false);assert.strictEqual(L4.assist.state,'off');}
 // 1.3.70: nothing of the car ahead offered at all, 10 s on: this car does not give it to apps
 {let t5=0;const sig={loadConfig:()=>({fields:{GapVehicleDrivingAhead:{},DataFrontVehicle:{}}}),watch:()=>Promise.resolve({available:false,shutdown(){}})};
  const L5=new LeadVehicle(sig,null,()=>'1',()=>t5);L5.sync(true);await flush();
  assert.strictEqual(L5.status(5000).unsupported,false,'not before 10 s');assert.strictEqual(L5.status(11000).unsupported,true);
  const sig2={loadConfig:sig.loadConfig,watch:(i)=>Promise.resolve({available:/ObjectList/.test(i),shutdown(){}})};const L6=new LeadVehicle(sig2,null,()=>'1',()=>t5);L6.sync(true);await flush();
  assert.strictEqual(L6.status(20000).unsupported,false,'one source offered: not yet decided');}
 // 1.3.73: the front camera's object list: the nearest vehicle in our lane (metres as sent), before the Drive assist view
 {let t6=0;const subs={};const C=require('../../apps/cluster_redline/camera-objects');
  const sig={loadConfig:(i)=>{if(i===IFACE)throw new Error('none');return {};},watch:(i,inst,h)=>{subs[i]=h;return Promise.resolve({available:true,shutdown(){}});}};
  const L7=new LeadVehicle(sig,null,()=>'1',()=>t7);var t7=0;L7.sync(true);await flush();assert(subs[C.IFACE],'subscribed to the camera objects');
  const rec=(objs)=>({eventDataQualifier:0,numberOfObjects:objs.length,objectRecognitionInfo:objs.map(([id,lane,type])=>({objectID:id,statusMeasurement:1,classificationType:type,drivingTubeMapping:lane}))});
  const pos=(objs)=>({eventDataQualifier:0,numberOfObjects:objs.length,objectPositionInfo:objs.map(([x,y])=>({objectPositionInfoInvalidFlags:0,positionX:x,positionY:y}))});
  L7.sampleSpeed({speedVehicleCentreOfGravity:72*64},0);
  subs[C.IFACE][C.REC](rec([[3,2,3],[7,1,3],[9,1,0],[11,1,4]]));subs[C.IFACE][C.POS](pos([[12,3.4],[28.5,0.2],[6,0.1],[44,0]]));
  let r=L7.read(0);assert(r&&Math.abs(r.gap-28.5)<0.01,'the nearest vehicle in our lane (a pedestrian nearer is not followed)');assert.strictEqual(L7.status(0).source,'camera');
  const cs=L7.status(0).camera;assert.deepStrictEqual([cs.offered,cs.instance,cs.received.rec,cs.received.pos,cs.raw.objects,cs.raw.lead.id],[true,'1',1,1,4,7]);
  // the Drive assist view does not take over while the camera is fresh
  const A=require('../../apps/cluster_redline/assist-view');subs[A.OBJ_IF][A.OBJ_EV]({objectList:[{objectID:4,objectPosition:{x:900,y:0},objectPrediction:{laneAssignment:'EGO'}}]});assert(Math.abs(L7.read(0).gap-28.5)<0.01);
  t7=300;subs[C.IFACE][C.REC](rec([[3,2,3]]));subs[C.IFACE][C.POS](pos([[12,3.4]]));assert.strictEqual(L7.read(300),null,'nobody in our lane: none');
  assert.deepStrictEqual(C.objectsOf({eventDataQualifier:2,numberOfObjects:1,objectRecognitionInfo:[{objectID:1}]},{numberOfObjects:1,objectPositionInfo:[{positionX:5,positionY:0}]}),[],'data not available: nothing');}
 // 1.3.74: the root helper (native/redline-lead): its camera car first; the radar's "no car" values ignored; absent: retried
 {const {EventEmitter}=require('events'),H=require('../../apps/cluster_redline/lead-helper');let sock=null,tries=0,t8=0;
  const L8=new LeadVehicle({loadConfig:()=>{throw new Error('none');},watch:()=>Promise.resolve({available:false,shutdown(){}})},null,()=>'1',()=>t8);
  L8.helper=new H.LeadHelper((m,now)=>L8.fromHelper(m,now),()=>t8,()=>{tries++;sock=new EventEmitter();sock.destroy=()=>{};return sock;});
  L8.sync(true);await flush();sock.emit('connect');L8.sampleSpeed({speedVehicleCentreOfGravity:72*64},0);
  const send=(o)=>sock.emit('data',Buffer.from(JSON.stringify(Object.assign({t:'lead',at:1000},o))+'\n'));
  send({cam:{rx:40,n:6,at:990,lead:{m:31.4,y:0.3,id:12,type:3}},radar:{rx:20,front:{id:253,gapX:4093,qualifier:2},gap:null}});
  let r=L8.read(0);assert(r&&Math.abs(r.gap-31.4)<0.01,'the camera car through the helper');assert.strictEqual(L8.status(0).source,'camera');
  assert.strictEqual(L8.status(0).helper.state,'connected');assert.strictEqual(L8.status(0).unsupported,false);
  send({cam:{rx:41,n:6,at:990,lead:null},radar:{rx:21,front:{id:4,gapX:480,qualifier:0},gap:null}});r=L8.read(0);assert(Math.abs(r.gap-30)<0.01,'a valid radar reading wins (480 x 0.0625 m)');
  sock.emit('close');assert.strictEqual(L8.helper.state,'lost');t8=5000;L8.sync(true);assert.strictEqual(tries,1,'not before 10 s');t8=11000;L8.sync(true);assert.strictEqual(tries,2,'tried again');
  L8.sync(false);assert.strictEqual(L8.helper.state,'off');}
 // the helper's decoders (native/redline-lead/redline-lead.js)
 {const R=require('../../native/redline-lead/redline-lead.js');
  const head=(n)=>'00ac01780100000e93068d0636084691000001e0'+'00'+'00'+'00'+n;
  const rec=Buffer.from(head('02')+'01000300010301'+'01000400010701'+'00'.repeat(7*18),'hex');
  const pos=Buffer.from('01d701780100000f548715c036084691000001e0'+'00'+'00'+'02'+'fc41e40000c0000000'+'0041500000'+'00000000'+'00'.repeat(9*18),'hex');
  const lead=R.leadOf(R.decodeRecognition(rec),R.decodePosition(pos));assert.deepStrictEqual([lead.id,lead.m],[7,13],'the nearest vehicle in our lane, metres as sent (big endian floats)');
  assert.deepStrictEqual(R.decodeFront(Buffer.from('fd0ffd0ffd0ffd0ffd0201','hex')),{id:253,speedX:4093,speedY:4093,gapX:4093,gapY:4093,qualifier:2,ext:1},'the radar parked, as on the car');}
 // 1.3.91 (issue appsKOR#5): the distance shown from the bumper, -2 m by default (0 to -3 m, 0.5 m steps), the time gap with it
 {const {corrected}=require('../../apps/cluster_redline/lead-vehicle'),{settings:S}=require('../../apps/cluster_redline/policy');
  assert.strictEqual(S({}).hudHeadwayCorrection,-2,'-2 m by default');assert.strictEqual(S({hudHeadwayCorrection:-0.7}).hudHeadwayCorrection,-0.5);
  assert.strictEqual(S({hudHeadwayCorrection:-9}).hudHeadwayCorrection,-3);assert.strictEqual(S({hudHeadwayCorrection:2}).hudHeadwayCorrection,0);assert.strictEqual(S({hudHeadwayCorrection:'x'}).hudHeadwayCorrection,-2);
  const c=corrected({gap:20,headway:1.0,closing:-3,level:'amber'},-2);assert.strictEqual(c.gap,18);assert(Math.abs(c.headway-0.9)<1e-9);assert.strictEqual(c.level,'amber','the time gap from the corrected distance (0.9 s, not closing in fast: amber since 1.3.102)');assert.strictEqual(c.closing,-3);
  assert.strictEqual(corrected({gap:2,headway:null,closing:null,level:'ok'},-2).gap,0,'right behind it: 0 m');assert.strictEqual(corrected({gap:1.2,headway:null,level:'ok'},-2).gap,0,'never under 0');
  const raw={gap:20,headway:1,level:'amber'};assert.strictEqual(corrected(raw,0),raw,'0: as the car sends');assert.strictEqual(corrected(null,-2),null);
  assert.deepStrictEqual(corrected({gap:5,go:true},-2),{gap:3,go:true},'the moving-off badge too');}
 console.log('PASS: HUD headway badge: GapVehicleAhead read only while on, fine distance first, time gap from our speed (none below 12 km/h), closing speed, colour steps, install-time input, settings, overlay'+(process.argv[2]?', drawn':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
