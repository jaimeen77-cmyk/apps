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
 // its own HUD part (1.3.43, Position / size: Next turn): redrawn when it changes, Direction not
 const {navKey}=require('../../apps/cluster_redline/render-state'),{settings}=require('../../apps/cluster_redline/policy'),D=require('../../apps/cluster_redline/display-config');
 const s=(then,extra)=>({config:settings(Object.assign({hudNavigationEnabled:true,navDisplayMode:'all'},extra||{})),mode:'COMFORT',navigation:{visible:true,maneuver:'RIGHT',distanceText:'150 m',then}});
 assert.deepStrictEqual(navKey(s(null),'Direction'),navKey(s({maneuver:'LEFT',gap:120}),'Direction'),'Direction unchanged');
 assert.strictEqual(navKey(s(null),'Then'),null,'no next turn: nothing');assert(navKey(s({maneuver:'LEFT',gap:120}),'Then'));
 assert.notDeepStrictEqual(navKey(s({maneuver:'LEFT',gap:120}),'Then'),navKey(s({maneuver:'LEFT',gap:90}),'Then'));
 assert.strictEqual(navKey(s({maneuver:'LEFT',gap:120},{hudThenHidden:true}),'Then'),null,'hidden in Position / size');
 assert(D.NAV_LAYOUT_PARTS.some(p=>p.key==='Then'),'in Position / size');
 // placed where it was drawn (under Direction's distance) and following Direction; then moved and sized on its own
 {const c=settings({}),d=D.navRect(c,'Direction'),r=D.navRect(c,'Then'),k=d.w/240;
  assert.deepStrictEqual([r.x,r.y],[Math.round(d.x+108*k),Math.round(d.y+66*k)]);
  const m=D.navRect(settings({hudNavOffsetX:c.hudNavOffsetX+40}),'Then');assert.strictEqual(m.x,r.x+40,'follows Direction');
  const o=D.navRect(settings({hudThenOffsetX:-30,hudThenOffsetY:12,hudThenScale:100}),'Then');assert.deepStrictEqual([o.x,o.y,o.w,o.h],[r.x-30,r.y+12,132,44]);}
 assert.strictEqual(settings({}).hudNavThen,'on','on by default');assert.strictEqual(settings({hudNavThen:'off'}).hudNavThen,'off');
 // drawn under the distance (with a built package)
 if(process.argv[2]){const path=require('path');
  // Navigation tab → Navigation display: its own screen with the drive modes and the next turn (1.3.36)
  {const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
   const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.selectTab(3);assert(page.keys().indexOf('hudNavThen')<0,'no row of its own');
   page.focus=page.keys().indexOf('navDisplayMode');page.activate();assert.strictEqual(page.open,'navMode');
   const scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};scr().find(t=>t.id==='navthen-off').run();scr().find(t=>t.id==='navmode-excludeSport').run();
   assert.deepStrictEqual([v.hudNavThen,v.navDisplayMode],['off','excludeSport']);page.back();assert.strictEqual(page.open,null);}
 }
 if(process.argv[2]){const path=require('path'),N=require(path.join(path.resolve(process.argv[2]),'source/javascript/nav-draw'));
  const ink=(cv)=>{let n=0;for(let i=3;i<cv.d.length;i+=4)if(cv.d[i]>128)n++;return n;};
  const plain=N.drawSized({visible:true,maneuver:'RIGHT',distanceText:'150 m'},240,112),with_=N.drawSized({visible:true,maneuver:'RIGHT',distanceText:'150 m',then:{maneuver:'LEFT',gap:120}},240,112);
  assert.strictEqual(ink(with_),ink(plain),'Direction alone: the next turn is its own part');
  assert(ink(N.then.drawSized({visible:true,then:{maneuver:'LEFT',gap:120}},92,31))>80,'"Then" line drawn');
  assert.strictEqual(ink(N.then.drawSized({visible:true,then:null},92,31)),0);}
 console.log('PASS: next turn on the HUD: the list\'s second event within 250 m (distances to the destination), not a passed one, only for the turn shown, fresh; render key; on by default; set in Navigation display'+(process.argv[2]?', drawn':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
