'use strict';
// 1.3.103: the HUD lamps' and the navigation's places never come with a BC page or a drive mode's own screen (the user:
// Comfort → Sport (BC mode on the HUD) → Comfort moved the lane picture for good; a favourite put it back).
const assert=require('assert'),D=require('../../apps/cluster_redline/display-config');
['hudHeadwayOffsetX','hudHeadwayOffsetY','hudHeadwayScale','hudLanesOffsetX','hudTurnOffsetX','hudTurnLeftOffsetY','hudTurnBlindOffsetX','hudDoorOffsetY','hudCarAlertOffsetX','hudNavOffsetX','hudTextOffsetY','hudThenOffsetX','hudNavHidden']
 .forEach(k=>assert.strictEqual(D.designKey(k),false,k+': kept out'));
['hudRpmGaugeOffsetX','hudGearOffsetY','hudAuxTextOffsetY','hudAlertWidthScale','hudMarkHidden','clusterRpmGaugeOffsetX','clusterAuxLeftOffsetY']
 .forEach(k=>assert.strictEqual(D.designKey(k),true,k+': the design\'s'));
// a drive mode's own screen
{const v=D.screenValues({design:'own',layout:{hudRpmGaugeOffsetX:20,hudHeadwayOffsetX:-90,hudHeadwayOffsetY:40,hudNavOffsetX:5}},'hud');
 assert.strictEqual(v.hudRpmGaugeOffsetX,20);assert(!('hudHeadwayOffsetX' in v)&&!('hudHeadwayOffsetY' in v)&&!('hudNavOffsetX' in v),'the lamps and the navigation keep their place');}
// a BC page in BC mode on the HUD
(async()=>{
 const {BcFollow,setNow}=require('../../apps/cluster_redline/bc-follow');
 const page={kind:'redline',design:'own',layout:{hudRpmGaugeOffsetX:12,hudHeadwayOffsetX:-80,hudHeadwayOffsetY:30,hudTurnOffsetX:7}};
 const values={allHudOutput:'bc',sportHudOutput:'bc',bcHmi:'ID7',bcHudPages:JSON.stringify({ID7:{torque:page}}),bcPages:'',bcStart:'last',bcIndex:3,bcCluster:''},L=[],applied=[];
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},onChange:f=>L.push(f)};
 const signals={loadConfig:()=>({fields:{IndicatorSteeringColumn:{}}}),watch:()=>Promise.resolve({shutdown(){}})};
 const f=new BcFollow({settings,signals,apply:(v,d)=>applied.push([d,v]),clock:()=>0});for(let i=0;i<8;i++)await Promise.resolve();
 setNow({cluster:false,hud:true});f.here('torque');
 const hud=applied.filter(a=>a[0]==='hud').map(a=>a[1]),last=hud[hud.length-1];
 assert(last&&last.hudRpmGaugeOffsetX===12,'the page\'s own design places: '+JSON.stringify(last));
 assert(!('hudHeadwayOffsetX' in last)&&!('hudHeadwayOffsetY' in last)&&!('hudTurnOffsetX' in last),'not the lamps\'');
 setNow(false);
 console.log('PASS: lamp places: the HUD lamps and the navigation keep their place through a drive mode\'s screen and a BC page');
})().catch(e=>{console.error(e);process.exitCode=1;});
