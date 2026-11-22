'use strict';
// The turn after the next one on the HUD (1.3.35): the route's event list's second event, when it follows within
// 250 m (from the distances to the destination), not a turn already passed (a smaller uid); the RouteEvents reader
// gives it only for the turn the HUD shows, on the same route; the HUD part's render key changes with it.
const assert=require('assert');
const {RouteEvents,decodeReply,nextTurn,THEN_M}=require('../../apps/cluster_redline/route-events');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const ev=(dir,dist,dtd,uid,extra)=>({intersection:Object.assign({direction:dir,unreliable:false,formattedDistance:dist===null?undefined:{distance:String(dist),unit:'METER'},distanceToDestination:dtd,uid},extra||{})});
const reply=(...events)=>({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:events}]});
(async()=>{
 assert.strictEqual(THEN_M,250);
 let d=decodeReply(reply(ev('RIGHT',150,5000,1),ev('LEFT',270,4880,2)));
 assert.strictEqual(d.value.maneuver,'RIGHT');assert.deepStrictEqual(d.then,{maneuver:'LEFT',exitNumber:null,kind:'intersection',gap:120},'120 m behind: then');
 assert.strictEqual(decodeReply(reply(ev('RIGHT',150,5000,1),ev('LEFT',900,4100,2))).then,null,'900 m behind: none');
 assert.strictEqual(decodeReply(reply(ev('RIGHT',150,5000,5),ev('LEFT',270,4880,4))).then,null,'a turn already passed (smaller uid): none');
 assert.strictEqual(decodeReply(reply(ev('RIGHT',150,null,1),ev('LEFT',270,null,2))).then,null,'no distances to the destination: none');
 assert.strictEqual(decodeReply(reply(ev('RIGHT',150,5000,1))).then,null,'one event: none');
 assert.deepStrictEqual(decodeReply(reply(ev('RIGHT',150,5000,1),ev('LEFT',null,4900,2))).then.maneuver,'LEFT','the second without its own distance text');
 assert.strictEqual(nextTurn(null,null),null);
 // the reader: only for the turn on the HUD, fresh, the same route
 let t=0,answer=reply(ev('RIGHT',150,5000,1),ev('LEFT',270,4880,2));const sub={available:true,proxy:{}};
 const r=new RouteEvents(()=>t,()=>Promise.resolve(answer));r.attach(sub);r.tick(0,'route');await flush();
 assert.deepStrictEqual(r.next(100,'route',{maneuver:'RIGHT'}).maneuver,'LEFT');
 assert.strictEqual(r.next(100,'route',{maneuver:'STRAIGHT_ON'}),null,'the HUD shows another turn: none');
 assert.strictEqual(r.next(100,'other',{maneuver:'RIGHT'}),null,'another route: none');
 assert.strictEqual(r.next(2500,'route',{maneuver:'RIGHT'}),null,'stale after 2 s');
 answer=reply(ev('RIGHT',150,5000,1));t=3000;r.tick(3000,'route');await flush();assert.strictEqual(r.next(3100,'route',{maneuver:'RIGHT'}),null,'gone from the list: gone');
 // the HUD's Direction part redraws when it changes
 const {navKey}=require('../../apps/cluster_redline/render-state'),{settings}=require('../../apps/cluster_redline/policy');
 const s=(then)=>({config:settings({hudNavigationEnabled:true,navDisplayMode:'all'}),mode:'COMFORT',navigation:{visible:true,maneuver:'RIGHT',distanceText:'150 m',then}});
 assert.notDeepStrictEqual(navKey(s(null),'Direction'),navKey(s({maneuver:'LEFT',gap:120}),'Direction'));
 assert.strictEqual(settings({}).hudNavThen,'on','on by default');assert.strictEqual(settings({hudNavThen:'off'}).hudNavThen,'off');
 // drawn under the distance (with a built package)
 if(process.argv[2]){const path=require('path'),N=require(path.join(path.resolve(process.argv[2]),'source/javascript/nav-draw'));
  const ink=(cv)=>{let n=0;for(let y=Math.round(cv.h*0.72);y<cv.h;y++)for(let x=Math.round(cv.w*0.45);x<cv.w;x++)if(cv.d[(y*cv.w+x)*4+3]>128)n++;return n;};
  const plain=N.drawSized({visible:true,maneuver:'RIGHT',distanceText:'150 m'},240,112),with_=N.drawSized({visible:true,maneuver:'RIGHT',distanceText:'150 m',then:{maneuver:'LEFT',gap:120}},240,112);
  assert(ink(with_)>ink(plain)+150,'"Then" line drawn under the distance');}
 console.log('PASS: next turn on the HUD: the list\'s second event within 250 m (distances to the destination), not a passed one, only for the turn shown, fresh; render key; on by default'+(process.argv[2]?', drawn':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
