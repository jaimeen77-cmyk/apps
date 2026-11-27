'use strict';
// The car ahead pulling away (1.3.87): standing 2 s behind a car within 15 m, it moves 3 m off (or is lost from 10 m)
// for half a second: shown 3 s, once a stop; not in P, not while we move; the lane picture draws the car ahead by class.
const assert=require('assert'),path=require('path');
const {LeadDeparture}=require('../../apps/cluster_redline/lead-departure');
const run=(steps,gear)=>{const d=new LeadDeparture();let shown=[];steps.forEach(([t,v,g])=>{if(d.tick(t,v,gear||'D',g))shown.push(t);});return {d,shown};};
// stop behind a car 4 m ahead, it pulls away to 8 m: shown from half a second after it went 3 m off, for 3 s
let steps=[];for(let t=0;t<=8000;t+=100)steps.push([t,0,t<4000?4:4+Math.min(6,(t-4000)/250)]);
let r=run(steps);assert(r.shown.length>0,'shown');assert(r.shown[0]>=5250&&r.shown[0]<=5400,'after it moved 3 m and held '+r.shown[0]);assert(r.shown[r.shown.length-1]-r.shown[0]<=3000);
assert.strictEqual(r.d.fired,1,'once a stop');
// in P: never
assert.strictEqual(run(steps,'P').shown.length,0,'not in P');
// standing under 2 s: not armed
steps=[];for(let t=0;t<=4000;t+=100)steps.push([t,0,t<1500?4:12]);assert.strictEqual(run(steps).shown.length,0,'stood too briefly');
// the car ahead lost from 6 m: shown; from 13 m (lost far): not
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,0,t<3000?6:null]);assert(run(steps).shown.length>0,'lost from close by');
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,0,t<3000?13:null]);assert.strictEqual(run(steps).shown.length,0,'lost from far');
// we move off first: no alert; a car beyond 15 m: no alert
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,t<3000?0:8,t<3000?5:9]);assert.strictEqual(run(steps).shown.length,0,'we moved first');
steps=[];for(let t=0;t<=6000;t+=100)steps.push([t,0,t<3000?20:30]);assert.strictEqual(run(steps).shown.length,0,'too far to wait on');
// the next stop alerts again
const d=new LeadDeparture();let n=0;const go=(t0)=>{for(let t=t0;t<t0+7000;t+=100)if(d.tick(t,0,'D',t<t0+3000?4:9))n++;for(let t=t0+7000;t<t0+9000;t+=100)d.tick(t,30,'D',20);};go(0);const first=n;go(10000);assert(n>first,'again at the next stop');
// the badge and the lane picture
if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),Hw=require(path.join(dir,'headway-overlay')),X=require(path.join(dir,'lane-lines')),A=require(path.join(dir,'hud-art'));
 assert.strictEqual(Hw.content({gap:7,go:true},'detail').color,'#3ddc6a');
 const base={width:3.3,left:{y:1.6,slope:0,type:'dashed',color:'white',margin:0.65},right:{y:-1.6,slope:0,type:'solid',color:'white',margin:0.65},levels:{left:'ok',right:'ok'}};
 const lit=(im)=>{let n=0;for(let i=3;i<im.d.length;i+=4)if(im.d[i]>200)n++;return n;};
 const none=X.draw(base,112,84),car=X.draw(Object.assign({},base,{lead:{gap:12,level:'ok',type:3}}),112,84);assert(lit(car)>lit(none),'the car ahead drawn');
 const truck=X.draw(Object.assign({},base,{lead:{gap:12,level:'ok',type:4}}),112,84);assert(lit(truck)>lit(car),'a truck is wider');
 assert(A.loadedSets().includes('veh'),'the road users set read once drawn');}
console.log('PASS: lead car departure: standing behind it, it moves off or is lost close by, once a stop, not in P; the car ahead in the lane picture by class');
