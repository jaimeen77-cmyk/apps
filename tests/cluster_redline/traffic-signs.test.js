'use strict';
const assert=require('assert');
const {TrafficSigns,SPEED,TSR,CAMERA,FIELDS}=require('../../apps/cluster_redline/traffic-signs');
const {settings}=require('../../apps/cluster_redline/policy');
const {demand}=require('../../apps/cluster_redline/data-demand');
const tsr=(c=6,u=0,w=1)=>({presentClassLimitSpeed:c,unitOfMeasurementSpeedLimit:u,presentWithdrawalLimitSpeed:w});
const sign=(type='SPEED_LIMIT',value=30)=>({type,value,additionalInfo:'NO_ADDITIONAL_RESTRICTION',firstSupplementalType:'SIGNAL_UNFILLED',secondSupplementalType:'SIGNAL_UNFILLED',position:{left:false,right:true,overhead:false},location:{locationInvalidFlags:0}});
const camera=(signs=[sign()],quality=80,unit='KM_H')=>({eventDataQualifier:'EVENT_DATA_AVAILABLE',extendedQualifier:'NORMAL_OPERATION_MODE',trafficSignRecognition:{numberSigns:signs.length,speedLimitUnit:unit},trafficSign:signs,trafficSignRecognitionQuality:signs.map(()=>({qualityType:100,qualityValue:quality}))});
let m=new TrafficSigns();m.sample(CAMERA,camera(),0);
assert.equal(m.read(0,'both',true).limit,null,'camera candidate alone is insufficient');
m.sample(TSR,tsr(),0);assert.equal(m.read(0,'both',true).limit,30);
m.sample(SPEED,{speedVehicleCentreOfGravity:35*64},0);assert.equal(m.read(0,'both',true).over,false);
m.sample(TSR,tsr(),500);m.sample(SPEED,{speedVehicleCentreOfGravity:35*64},1000);
assert.equal(m.read(1000,'both',true).over,true,'repeated TSR packets do not reset overspeed dwell');
m.sample(SPEED,{speedVehicleCentreOfGravity:31*64},1100);assert.equal(m.read(1100,'both',true).over,false);
m.sample(SPEED,{speedVehicleCentreOfGravity:65535},1200);assert.equal(m.read(1200,'both',true).over,false);
assert.equal(m.read(1200,'off',true).visible,false);
assert.equal(m.read(1200,'both',false).visible,false);
assert.equal(m.read(30001,'both',true).visible,false,'stale inputs disappear');
for(const v of [tsr(254),tsr(12),tsr(6,2),tsr(6,0,0),tsr(8)]){
 m=new TrafficSigns();m.sample(CAMERA,camera(),0);m.sample(TSR,v,0);assert.equal(m.read(0,'speed',true).limit,null,'invalid, unvalidated, withdrawn or disagreeing classes hide limit');
}
for(const c of [camera([sign()],23),camera([sign()],80,'MP_H'),camera([Object.assign(sign(),{firstSupplementalType:'SS_DISTANCE_IN'})]),camera([Object.assign(sign(),{position:{left:true,right:false}})]),camera([sign('SPEED_LIMIT',30),sign('SPEED_LIMIT',40)])]){
 m=new TrafficSigns();m.sample(TSR,tsr(),0);m.sample(CAMERA,c,0);assert.equal(m.read(0,'speed',true).limit,null);
}
m=new TrafficSigns();m.sample(TSR,tsr(),0);m.sample(CAMERA,camera(),0);m.sample(CAMERA,camera([sign('WITHDRAWAL_SPEED_LIMIT_2_DIGITS',0)]),100);
assert.equal(m.read(100,'speed',true).limit,null,'withdrawal clears cached camera candidate');
m=new TrafficSigns();const child=camera([sign('DS_CHILDREN',0)],46);m.sample(CAMERA,child,0);
assert.equal(m.read(0,'children',true).children,true,'children works without TSR or speed');
assert.equal(m.read(0,'speed',true).children,false);
m.sample(CAMERA,child,4000);assert.equal(m.read(6001,'children',true).visible,false,'repeat packets do not extend alert indefinitely');
m.sample(CAMERA,child,30000);assert.equal(m.read(30000,'children',true).visible,true,'cooldown allows a later sign');
m.clear();assert.equal(m.read(30000,'both',true).visible,false);
const base={appEnabled:true,allHudOutput:'redline',hudTrafficMode:'both'};
const d=demand(settings(base),'COMFORT');FIELDS.forEach(([i,f])=>assert(d.fields.has(i+'.'+f)));
for(const cfg of [{...base,hudTrafficMode:'off'},{...base,appEnabled:false},{...base,allHudOutput:'stock'}])FIELDS.forEach(([i,f])=>assert(!demand(settings(cfg),'COMFORT').fields.has(i+'.'+f)));
console.log('PASS traffic signs: matching sources, units/invalids/withdrawal, freshness, dwell, children cooldown and demand gating');
