'use strict';
// Vehicle alerts: decoding the car's route events, the includedTypes fallback, freshness and modes, the HUD
// overlay, the demand set (GuidanceEventList subscribed only while alerts are on) and the settings screen.
// Optional argument: a built stage (dist/cluster_redline) to also draw the icons and the NAV tab.
const assert=require('assert'),path=require('path');
const {VehicleAlerts,decode,TYPES,SAMPLE}=require('../../apps/cluster_redline/vehicle-alerts');
const {AlertOverlay}=require('../../apps/cluster_redline/alert-overlay');
const {demand}=require('../../apps/cluster_redline/data-demand');
const {settings}=require('../../apps/cluster_redline/policy');
const D=require('../../apps/cluster_redline/display-config');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const dist=(m)=>({distance:String(m),unit:'METER',rawDistance:m});
const tooFast=(limit)=>({value:{reason:{speedLimitInfo:{speedLimit:limit,speedUnit:'KM_P_H',speedingInfo:'TOO_FAST'}},suggestionType:'NONE',accepted:false}});
const ok=(events)=>({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:events}]});
(async()=>{
 // decode
 {const d=decode(ok([{speedCamera:{formattedDistance:dist(420),speedLimitAssistInfo:{value:{reason:{speedLimitInfo:{speedLimit:60,speedUnit:'KM_P_H',speedingInfo:'SPEED_OKAY'}}}}}},
   {schoolZone:{formattedDistance:dist(150),isInsideEvent:false,speedLimitAssistInfo:tooFast(30)}},{intersection:{formattedDistance:dist(80)}}]));
  assert(d.ok);assert.deepStrictEqual(d.kinds,{speedCamera:1,schoolZone:1,intersection:1});
  assert.deepStrictEqual(d.camera,{m:420,text:'420 m',section:false,inside:false,limit:60});
  assert.deepStrictEqual(d.school,{m:150,text:'150 m',inside:false,limit:30});assert.deepStrictEqual(d.speeding,{limit:30},'the car\'s own TOO_FAST');}
 {const d=decode(ok([{speedSectionCamera:{formattedDistance:dist(0),isInsideEvent:true,averageSpeed:80,speedUnit:'KM_P_H'}}]));
  assert.deepStrictEqual(d.camera,{m:0,text:null,section:true,inside:true,limit:80},'inside a section: its average speed limit');}
 {const d=decode(ok([{speedCamera:{formattedDistance:dist(1800)}},{schoolZone:{formattedDistance:dist(900)}},{speedCamera:{formattedDistance:dist(300),unreliable:true}}]));
  assert.strictEqual(d.camera,null,'far camera: not yet');assert.strictEqual(d.school,null,'far school zone: not yet');}
 assert.strictEqual(decode({GuidanceEventListError:'UNKNOWN_VIEW_ID'}).ok,false);assert.strictEqual(decode(null).ok,false);
 {const d=decode(ok([{speedCamera:{formattedDistance:{distance:'0,5',unit:'KM',rawDistance:0.5}}}]));assert.strictEqual(d.camera.m,500,'km');}
 // query, includedTypes fallback, freshness, modes
 {let t=0,replies=[];const asked=[];const sub={proxy:{},available:false};
  const v=new VehicleAlerts(()=>t,(proxy,method,args)=>{asked.push(args.viewConfigs[0].viewport.includedTypes);const r=replies.shift();return r instanceof Error?Promise.reject(r):Promise.resolve(r);});
  v.attach(sub);v.tick(0,false);assert.strictEqual(asked.length,0,'off: no query');
  replies.push({GuidanceEventListError:'INVALID_VIEW_PARAMS'},ok([]),new Error('refused'),ok([{schoolZone:{formattedDistance:dist(0),isInsideEvent:true}}]));
  for(let i=0;i<4;i++){t+=1000;v.tick(t,true);await settle();}
  assert.deepStrictEqual(asked,[TYPES,[TYPES[0]],[TYPES[1]],[TYPES[2]]],'full set, then each kind alone');
  assert.deepStrictEqual(v.types,[TYPES[0],TYPES[2]],'only the accepted kinds are kept');assert.strictEqual(v.state,'ready','availability not reported: still asked');
  assert.deepStrictEqual(v.read(t,'all').school,{m:0,text:null,inside:true,limit:null});
  assert.strictEqual(v.read(t,'speed'),null,'mode speed: no school zone');assert.strictEqual(v.read(t,'off'),null);
  replies.push(ok([]));t+=1000;v.tick(t,true);await settle();assert.deepStrictEqual(asked[4],v.types);assert.strictEqual(v.read(t,'all'),null,'cleared when the car stops reporting it');
  replies.push(ok([{speedCamera:{formattedDistance:dist(200)}}]));t+=1000;v.tick(t,true);await settle();assert(v.read(t,'camera'));
  assert.strictEqual(v.read(t+4000,'camera'),null,'stale after 3 s');
  v.tick(t+5000,false);assert.strictEqual(v.state,'off');assert.strictEqual(v.read(t+5000,'all'),null);v.stop();}
 {let t=0;const v=new VehicleAlerts(()=>t,()=>Promise.resolve({GuidanceEventListError:'INVALID_VIEW_PARAMS'}));v.attach({proxy:{}});
  for(let i=0;i<5;i++){t+=1000;v.tick(t,true);await settle();}assert.strictEqual(v.state,'types_rejected');
  t+=1000;v.tick(t,true);await settle();assert.strictEqual(v.queries,5,'rejected (empty list too): not asked again for 30 s');}
 // the 2026-11-14 drive log: every named type refused, the empty list accepted
 {let t=0;const asked=[];const v=new VehicleAlerts(()=>t,(p,m,args)=>{const ty=args.viewConfigs[0].viewport.includedTypes;asked.push(ty);return Promise.resolve(ty.length?{GuidanceEventListError:'INVALID_VIEW_PARAMS'}:ok([{speedCamera:{formattedDistance:dist(300)}}]));});
  v.attach({proxy:{}});for(let i=0;i<6;i++){t+=1000;v.tick(t,true);await settle();}
  assert.deepStrictEqual(asked[4],[],'then the empty list');assert.deepStrictEqual(v.types,[]);assert.deepStrictEqual(asked[5],[],'kept');assert(v.read(t,'camera'));}
 // demand: GuidanceEventList only while alerts are on; yield follows the phone's guidance flags
 {const on=demand(settings({appEnabled:true,hudCarAlerts:'all',navDisplayMode:'stock'}),null),off=demand(settings({appEnabled:true,navDisplayMode:'stock'}),null);
  assert(on.fields.has('de.bmw.infotainment.navigation.guiding.GuidanceEventList'));assert(!off.fields.has('de.bmw.infotainment.navigation.guiding.GuidanceEventList'));
  assert(!demand(settings({appEnabled:true,hudCarAlerts:'all',hudCarAlertHidden:true,navDisplayMode:'stock'}),null).fields.has('de.bmw.infotainment.navigation.guiding.GuidanceEventList'),'hidden: not read');
  const y=demand(settings({appEnabled:true,clusterYieldGuidance:'phone',allClusterOutput:'redline',hudNavigationEnabled:false}),null);
  assert(Array.from(y.fields).some(f=>/CarPlayManager\.projectedGuidanceActive$/.test(f)),'yield reads CarPlay guidance flags');
  assert(Array.from(y.fields).some(f=>/AndroidAutoProjectedManager\.projectedGuidanceMetadataAvailable$/.test(f)));}
 // settings
 {assert.strictEqual(settings({}).hudCarAlerts,'off');assert.strictEqual(settings({hudCarAlerts:'bogus'}).hudCarAlerts,'off');
  ['speed','school','camera','all'].forEach(m=>assert.strictEqual(settings({hudCarAlerts:m}).hudCarAlerts,m));
  const c=settings({hudCarAlertOffsetX:40,hudCarAlertOffsetY:-20,hudCarAlertScale:100}),r=D.navRect(c,'CarAlert');
  assert.deepStrictEqual(r,{x:Math.round((800-330)/2+40),y:220,w:330,h:150});assert(!D.NAV_PARTS.some(p=>p.key==='CarAlert'),'navigation picture unchanged');
  assert.strictEqual(settings({}).hudAlertOffsetX,0,'the shift alert part keeps its own keys');}
 // overlay (stub painter: the kit canvas is not loaded on the host)
 {const Module=require('module'),orig=Module._load;Module._load=function(req){if(req==='./alert-draw')return {key:v=>JSON.stringify(v),drawSized:(v,w,h)=>({w,h,d:new Uint8Array(w*h*4)})};return orig.apply(this,arguments);};
  const layers=new Map();let n=0,uploads=0;const client={image(o){layers.set(++n,Object.assign({},o));return n;},pixels(){uploads++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
  const ov=new AlertOverlay(client),cfg=settings({hudCarAlerts:'all'});
  ov.tick(cfg,null);assert.strictEqual(layers.size,0);
  ov.tick(cfg,{camera:{text:'300 m'}});const l=[...layers.values()][0];assert.strictEqual(l.target,'hud');assert.strictEqual(l.klass,'overlay');assert.strictEqual(l.visible,true);
  const r=D.navRect(cfg,'CarAlert');assert.deepStrictEqual([l.x,l.y,l.w,l.h],[r.x,r.y,r.w,r.h]);
  ov.tick(cfg,{camera:{text:'300 m'}});assert.strictEqual(uploads,1,'unchanged: no pixels');
  ov.tick(cfg,{camera:{text:'250 m'}});assert.strictEqual(uploads,2);
  ov.tick(cfg,null);assert.strictEqual(l.visible,false,'no alert: hidden');
  ov.tick(settings({hudCarAlerts:'all',hudCarAlertOffsetX:50}),{school:{inside:true}});assert.strictEqual(l.visible,true);assert.strictEqual(l.x,D.navRect(settings({hudCarAlertOffsetX:50}),'CarAlert').x,'moves with Position / size');
  ov.tick(settings({hudCarAlerts:'all',hudCarAlertHidden:true}),{school:{inside:true}});assert.strictEqual(l.visible,false,'hidden in Position / size');
  ov.tick(settings({hudCarAlerts:'all',hudCarAlertHidden:true}),Object.assign({preview:true},SAMPLE));assert.strictEqual(l.visible,true,'preview while adjusting');
  ov.close();assert.strictEqual(layers.size,0);Module._load=orig;}
 // speeding and children signs from the camera's sign recognition (shapes as in the 2026-11-14 drive log)
 {const {TrafficSigns}=require('../../apps/cluster_redline/traffic-signs');const {filterTraffic}=require('../../apps/cluster_redline/traffic-config');
  const sign=(type,value)=>({type,value,trafficSignForm:'ROUND',position:{left:false,right:true,overhead:false},firstSupplementalType:'SIGNAL_UNFILLED',secondSupplementalType:'SIGNAL_UNFILLED',additionalInfo:'NO_ADDITIONAL_RESTRICTION',variable:false,location:{locationInvalidFlags:0,x:30,y:-12,z:1.5}});
  const cam=signs=>({eventDataQualifier:'EVENT_DATA_AVAILABLE',extendedQualifier:'NORMAL_OPERATION_MODE',trafficSignRecognition:{version:98,numberSigns:signs.length,speedLimitUnit:'KM_H'},trafficSign:signs,trafficSignRecognitionQuality:signs.map(()=>({qualityType:100,qualityValue:47}))});
  const tsr=cls=>({presentWithdrawalLimitSpeed:1,presentClassLimitSpeed:cls,nextClassLimitSpeed:254,unitOfMeasurementSpeedLimit:0});
  const t=new TrafficSigns();t.sample('TrafficSignRecognition',tsr(6),0);t.sample('TrafficSignRecognitionFrontCamera',cam([sign('SPEED_LIMIT',30)]),0);
  t.sample('statusCarSpeed2',{speedVehicleCentreOfGravity:36*64},0);
  assert.strictEqual(t.alerts(500,'all',true),null,'over for less than a second: nothing yet');
  t.sample('statusCarSpeed2',{speedVehicleCentreOfGravity:36*64},1500);assert.deepStrictEqual(t.alerts(1600,'speed',true),{speeding:{limit:30},school:null},'36 in a 30 for a second: speeding');
  assert.strictEqual(t.alerts(1600,'camera',true),null,'camera mode: not from signs');
  t.sample('statusCarSpeed2',{speedVehicleCentreOfGravity:30*64},1700);assert.strictEqual(t.alerts(1800,'speed',true),null,'back at the limit');
  t.sample('TrafficSignRecognitionFrontCamera',cam([sign('DS_CHILDREN',0),sign('SPEED_LIMIT',30)]),2000);
  assert.deepStrictEqual(t.alerts(2100,'school',true),{speeding:null,school:{sign:true}},'children sign');assert.strictEqual(t.alerts(8500,'school',true),null,'6 s');
  t.sample('TrafficSignRecognitionFrontCamera',cam([sign('DS_CHILDREN',0)]),9000);assert.strictEqual(t.alerts(9100,'school',true),null,'30 s between children alerts');
  assert.strictEqual(t.alerts(9100,'all',false),null,'camera input not live: nothing');
  // install time: added read-only from the catalog, only with valid ids and a known instance
  const catalog={interfaces:{'de.bmw.infotainment.vehicle.Vehicle2':{fields:{statusCarSpeed2:{getter:{id:7},notifier:{id:32775}}}},'de.bmw.dass.TrafficSignRecognition':{events:{TrafficSignRecognition:{eventId:32900}}},'de.bmw.environmentalmodel.SignRecognitionFrontCamera':{events:{TrafficSignRecognitionFrontCamera:{eventId:5}}}},
   instanceIDs:{'de.bmw.infotainment.vehicle.Vehicle2':{'1':1},'de.bmw.dass.TrafficSignRecognition':{'1':1},'de.bmw.environmentalmodel.SignRecognitionFrontCamera':{'1':1}}};
  const m=filterTraffic({proxies:{}},catalog).proxies;
  assert.deepStrictEqual(m['de.bmw.infotainment.vehicle.Vehicle2'],{instances:'1',attributes:{statusCarSpeed2:'rs'}});
  assert.deepStrictEqual(m['de.bmw.dass.TrafficSignRecognition'],{instances:'1',broadcasts:['TrafficSignRecognition']});
  assert(!m['de.bmw.environmentalmodel.SignRecognitionFrontCamera'],'invalid eventId: not added');assert.deepStrictEqual(filterTraffic({proxies:{}},{}).proxies,{},'no catalog: nothing');
  // demand: signs for speeding / school / all, route events for camera / all
  const f=mode=>Array.from(demand(settings({appEnabled:true,hudCarAlerts:mode,navDisplayMode:'stock'}),null).fields);
  assert(f('speed').some(x=>/SignRecognitionFrontCamera/.test(x))&&f('speed').some(x=>/Vehicle2\.statusCarSpeed2/.test(x))&&!f('speed').some(x=>/GuidanceEventList/.test(x)));
  assert(f('camera').some(x=>/GuidanceEventList/.test(x))&&!f('camera').some(x=>/TrafficSign/.test(x)));
  assert(f('all').some(x=>/GuidanceEventList/.test(x))&&f('all').some(x=>/TrafficSignRecognition\.TrafficSignRecognition$/.test(x)));
  assert(!f('off').some(x=>/TrafficSign|Vehicle2|GuidanceEventList/.test(x)));}
 if(process.argv[2]){
  const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),A=require(path.join(dir,'alert-draw'));
  const count=cv=>{let k=0;for(let i=3;i<cv.d.length;i+=4)if(cv.d[i])k++;return k;};
  const one=k=>count(A.draw({[k]:SAMPLE[k]}));assert(one('speeding')>500&&one('school')>500&&one('camera')>500,'each icon draws');
  assert(count(A.draw(SAMPLE))>one('camera')+one('school'),'all three side by side');assert.strictEqual(count(A.draw(null)),0);
  const s=A.drawSized(SAMPLE,231,105);assert(s.w<=231&&s.h<=105);
  const {SettingsPage}=require(path.join(dir,'settings-ui')),{Canvas}=require(path.join(dir,'kit/canvas')),spec=require(path.join(dir,'kit/app-spec.json'));
  const vals={};spec.settings.forEach(x=>{vals[x.key]=x.default;});
  const page=new SettingsPage({schema:spec.settings,get:k=>vals[k],set:(k,v)=>{vals[k]=v;},onChange(){}},()=>{},'test');
  page.selectTab(3);assert(page.keys().includes('hudCarAlerts'));page.focus=page.keys().indexOf('hudCarAlerts');page.activate();page.choose(4);assert.strictEqual(vals.hudCarAlerts,'all');
  page.focus=page.keys().indexOf('layout');page.activate();const i=page.layoutParts().findIndex(p=>p.key==='CarAlert');assert(i>=0,'Vehicle alerts in the NAV Position / size');
  page.selectLayoutPart(i,true);assert(/^nav:CarAlert@/.test(vals.layoutPreview));page.adjust(0,1);page.adjust(2,1);
  assert.strictEqual(vals.hudCarAlertOffsetX,D.defaults.hudCarAlertOffsetX+10);assert.strictEqual(vals.hudCarAlertScale,75);
  page.back();assert.strictEqual(vals.layoutPreview,'');
  const cv=new Canvas(1600,520);page.draw(cv,'',{vehicleAlerts:{state:'ready',queries:3,replies:2,kinds:{speedCamera:1}}});
 }
 console.log('PASS: vehicle alerts: speeding and children signs from the camera sign recognition (log shapes), install-time inputs, route event decoding (camera, section, school zone, the car\'s TOO_FAST), includedTypes fallback, freshness and modes, HUD overlay, demand (alerts, yield flags), NAV tab row and Position / size'+(process.argv[2]?', icons and settings screen':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
