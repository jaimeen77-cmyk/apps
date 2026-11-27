'use strict';
// 1.3.100: cut-in and pedestrian / cyclist warnings (road-alerts.js, the rules worked out on the user's 32 recorded scenes):
// a car that drove beside us coming into our lane warns; a car crossing at a junction, a car overtaking beside us, our own
// lane change and a far person crossing do not; a pedestrian in our path within 2.5 s does; one object 3 s apart; the
// warning follows its object up to 2.5 s; the lane picture draws it; the option (HUD lamps) is on by default.
const assert=require('assert'),path=require('path');
const {RoadAlerts}=require('../../apps/cluster_redline/road-alerts'),{settings}=require('../../apps/cluster_redline/policy');
assert.strictEqual(settings({}).hudRoadAlerts,'on');assert.strictEqual(settings({hudRoadAlerts:'off'}).hudRoadAlerts,'off');
const lines=[{y:1.65,angle:0},{y:-1.65,angle:0}];
function drive(objAt,o){const r=new RoadAlerts(),hits=[];const kmh=(o&&o.kmh)||40;for(let k=0;k<=80;k++){const t=k*100,objs=objAt(t/1000).filter(Boolean),ls=o&&o.lines?o.lines(t/1000):lines;const h=r.frame(t,kmh,objs,ls);if(h)hits.push(Object.assign({t},h));}return {r,hits};}
{// a car beside us on the left for 3 s at our speed, then coming in at 1.2 m/s from 20 m ahead
 const {hits,r}=drive(s=>[{id:7,type:3,x:20-Math.max(0,s-3)*1,y:s<3?3.3:Math.max(0.3,3.3-(s-3)*1.2)}]);
 assert.strictEqual(hits.length,1,'one cut-in warning');assert.strictEqual(hits[0].kind,'cutin');assert(hits[0].t>3000&&hits[0].t<5000,'while it comes in: '+hits[0].t);
 const v=r.view();assert(v===null||v.kind==='cutin');}
{// the same, but warned again only after 3 s; the view follows it and reds on the line
 const r=new RoadAlerts();let shownRed=false;for(let k=0;k<=70;k++){const s=k/10,y=s<3?3.3:Math.max(0.2,3.3-(s-3)*1.2);r.frame(k*100,40,[{id:7,type:3,x:20,y}],lines);const v=r.view();if(v&&v.level==='red')shownRed=true;}
 assert(shownRed,'red once it is on the line (|y| < 1.6)');}
{// crossing at a junction: never beside us first
 const {hits}=drive(s=>[{id:9,type:3,x:18,y:12-s*4}],{kmh:25});assert.strictEqual(hits.length,0,'a crossing car does not warn');}
{// overtaking beside us and staying in its lane
 const {hits}=drive(s=>[{id:4,type:3,x:2+s*3,y:3.4}]);assert.strictEqual(hits.length,0,'an overtaking car does not warn');}
{// our own lane change: a line under the car, so the drifting car is not taken
 const {hits}=drive(s=>[{id:7,type:3,x:20,y:s<3?3.3:Math.max(0.3,3.3-(s-3)*1.2)}],{lines:s=>s<3?lines:[{y:0.3,angle:0},{y:-3,angle:0}]});assert.strictEqual(hits.length,0,'our lane change: nothing');}
{// slow: under 20 km/h no cut-in
 const {hits}=drive(s=>[{id:7,type:3,x:20,y:s<3?3.3:Math.max(0.3,3.3-(s-3)*1.2)}],{kmh:15});assert.strictEqual(hits.length,0,'under 20 km/h: no cut-in');}
{// a pedestrian stepping into our path 18 m ahead at 40 km/h (11 m/s: 1.6 s)
 const {hits,r}=drive(s=>s<4?[{id:3,type:0,x:Math.max(2,30-s*11),y:Math.max(0.2,2.6-s*0.8)}]:[]);
 assert(hits.some(h=>h.kind==='vru'),'a pedestrian in our path warns');}
{// a pedestrian crossing far ahead, well to the side: no
 const {hits}=drive(s=>[{id:3,type:0,x:28,y:6-s*0.5}],{kmh:30});assert.strictEqual(hits.length,0,'far to the side: no');}
// the lane picture draws it (the build)
if(process.argv[2]){const X=require(path.join(path.resolve(process.argv[2]),'source/javascript','lane-lines'));
 const v0={left:{y:1.6,type:'dashed',color:'white',margin:0.65},right:{y:-1.6,type:'solid',color:'white',margin:0.65},levels:{left:'ok',right:'ok'},lead:{gap:30,level:'ok',type:3}};
 const a=X.draw(v0,112,84),b=X.draw(Object.assign({},v0,{alert:{kind:'cutin',type:3,x:14,y:2.2,dir:-1,level:'amber',label:'Cut-in'}}),112,84);
 let diff=0,orange=0;for(let i=0;i<a.d.length;i+=4){if(a.d[i]!==b.d[i]||a.d[i+3]!==b.d[i+3])diff++;if(b.d[i]>200&&b.d[i+1]>100&&b.d[i+1]<190&&b.d[i+2]<90&&b.d[i+3]>150)orange++;}
 assert(diff>300,'the cut-in car drawn');assert(orange>20,'in amber');}
console.log('PASS: road alerts: cut-in after driving beside us, red on the line, none for crossing / overtaking / our lane change / under 20 km/h; a pedestrian in our path; the lane picture draws it; on by default');
