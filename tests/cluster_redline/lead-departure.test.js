'use strict';
// The car ahead pulling away (1.3.87): standing 2 s behind a car within 15 m, it moves 3 m off (or is lost from 10 m)
// for half a second: shown 3 s, once a stop; not in P, not while we move; the lane picture draws the car ahead by class.
const assert=require('assert'),path=require('path');
const {LeadDeparture}=require('../../apps/cluster_redline/lead-departure');
const run=(steps,gear)=>{const d=new LeadDeparture();let shown=[];steps.forEach(([t,v,g])=>{if(d.tick(t,v,gear||'D',g))shown.push(t);});return {d,shown};};
// stop behind a car 4 m ahead, it pulls away to 8 m: shown from half a second after it went 3 m off, for 3 s
let steps=[];for(let t=0;t<=8000;t+=100)steps.push([t,0,t<4000?4:4+Math.min(6,(t-4000)/250)]);
let r=run(steps);assert(r.shown.length>0,'shown');assert(r.shown[0]>=4600&&r.shown[0]<=4800,'after it moved 1.5 m and held 0.3 s '+r.shown[0]);assert(r.shown[r.shown.length-1]-r.shown[0]<=3000);
assert.strictEqual(r.d.fired,1,'once a stop');
// in P: never
assert.strictEqual(run(steps,'P').shown.length,0,'not in P');
// standing under 2 s: not armed
steps=[];for(let t=0;t<=4000;t+=100)steps.push([t,0,t<800?4:12]);assert.strictEqual(run(steps).shown.length,0,'stood too briefly');
// the car ahead lost from 6 m: shown; from 13 m (lost far): not
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,0,t<3000?6:null]);assert(run(steps).shown.length>0,'lost from close by');
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,0,t<3000?13:null]);assert.strictEqual(run(steps).shown.length,0,'lost from far');
// we move off first: no alert; a car beyond 15 m: no alert
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,t<3000?0:8,t<3000?5:9]);assert.strictEqual(run(steps).shown.length,0,'we moved first');
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,0,t<3000?25:35]);assert.strictEqual(run(steps).shown.length,0,'too far to wait on');
// (1.3.95) the car sends no speed while we stand: still a stand
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,t<500?0:null,t<3000?6:9]);assert(run(steps).shown.length>0,'no speed at rest: still standing');
// (1.3.95) the car right in front when the camera's lane says nothing: the nearest vehicle within 1.2 m of our axis
{const {LeadVehicle}=require('../../apps/cluster_redline/lead-vehicle');const lv=new LeadVehicle({loadConfig(){throw new Error('none');}},null,()=>'1',()=>1000);
 lv.helper.last={at:5000,cam:{at:4900,objects:[{id:1,type:3,x:7.3,y:0.4,tube:0},{id:2,type:3,x:5,y:3.2,tube:0},{id:3,type:0,x:4,y:0.1,tube:0}]}};lv.helper.lastAt=1000;
 assert.strictEqual(lv.frontGap(1500),7.3,'the car in front, not the one beside or the pedestrian');
 lv.helper.last.cam.at=3000;assert.strictEqual(lv.frontGap(1500),null,'an old list: none');}
// the next stop alerts again
const d=new LeadDeparture();let n=0;const go=(t0)=>{for(let t=t0;t<t0+7000;t+=100)if(d.tick(t,0,'D',t<t0+3000?4:9))n++;for(let t=t0+7000;t<t0+9000;t+=100)d.tick(t,30,'D',20);};go(0);const first=n;go(10000);assert(n>first,'again at the next stop');
// (1.3.106) how soon: faster 1 m / 0.2 s, quick 1.5 m / 0.3 s (default), relaxed 3 m / 0.5 s, off none
{const pull=(level)=>{const d=new LeadDeparture();for(let t=0;t<=9000;t+=100){const g=t<4000?4:4+(t-4000)/1000;if(d.tick(t,0,'D',g,level))return t;}return null;};   // 1 m a second
 const f=pull('faster'),q=pull('quick'),r=pull('relaxed'),dflt=pull(undefined);
 assert(f>=5000&&f<=5300,'faster: 1 m then 0.2 s '+f);assert(q>=5500&&q<=5900,'quick: 1.5 m then 0.3 s '+q);assert(r>=7000&&r<=7600,'relaxed: 3 m then 0.5 s '+r);
 assert(f<q&&q<r,'in that order');assert.strictEqual(dflt,q,'quick is the default');assert.strictEqual(pull('off'),null,'off: none');
 // standing still with the gap moving 0.15 m (the camera at rest, the user's clips): no alert even when faster
 const d=new LeadDeparture();let n=0;for(let t=0;t<=10000;t+=100)if(d.tick(t,0,'D',8.3+0.15*Math.sin(t/300),'faster'))n++;assert.strictEqual(n,0,'no alert from the camera at rest');}
// the badge and the lane picture
if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),Hw=require(path.join(dir,'headway-overlay')),X=require(path.join(dir,'lane-lines')),A=require(path.join(dir,'hud-art'));
 assert.strictEqual(Hw.content({gap:7,go:true},'detail').color,'#3ddc6a');
 const base={width:3.3,left:{y:1.6,slope:0,type:'dashed',color:'white',margin:0.65},right:{y:-1.6,slope:0,type:'solid',color:'white',margin:0.65},levels:{left:'ok',right:'ok'}};
 const lit=(im)=>{let n=0;for(let i=3;i<im.d.length;i+=4)if(im.d[i]>200)n++;return n;};
 const none=X.draw(base,112,84),car=X.draw(Object.assign({},base,{lead:{gap:12,level:'ok',type:3}}),112,84);assert(lit(car)>lit(none),'the car ahead drawn');
 const truck=X.draw(Object.assign({},base,{lead:{gap:12,level:'ok',type:4}}),112,84);assert(lit(truck)>lit(car),'a truck is wider');
 assert(A.loadedSets().includes('veh'),'the road users set read once drawn');
 // (1.3.106) the setting: kept in range, in favourites and drivers' settings with the options added since
 const D=require(path.join(dir,'display-config')),{settings}=require(path.join(dir,'policy')),UI=require(path.join(dir,'settings-ui'));
 assert.strictEqual(settings({}).hudHeadwayDepart,'quick');assert.strictEqual(settings({hudHeadwayDepart:'faster'}).hudHeadwayDepart,'faster');assert.strictEqual(settings({hudHeadwayDepart:'x'}).hudHeadwayDepart,'quick');
 const fav=UI.favKeys([]);['hudHeadwayDepart','hudModeSetup','clusterModeSetup','bcFollow','hudLaneLines','hudLaneSurface','hudLaneSensitivity','navArrowStyle','hudThenOffsetX','hudThenScale','calmTone','greetHello','myPicIds','clusterYieldAcc','hudHideWaze','hudRoadAlerts'].forEach(k=>assert(fav.includes(k),'favourites keep '+k));
 ['positionCheck','navProbeLog','navShare','bcIndex','bcCluster','logClearAt'].forEach(k=>assert(!fav.includes(k),'not a favourite: '+k));}
console.log('PASS: lead car departure: standing behind it, it moves off or is lost close by, once a stop, not in P; the car ahead in the lane picture by class');
