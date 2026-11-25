'use strict';
// Following the BC button (1.3.40): BC (the left stalk's bit 64) pressed moves to the next stock BC page in the
// cluster's order (left-out pages skipped), each page's screen applied (design / auxiliary values, Waze / the stock
// map, or no change); kept for the next drive, or the first page; "This page now"; nothing while off; a page set up on
// the settings screen (Set screen: auxiliary values, then design); the cluster shown / stepping aside per page.
const assert=require('assert'),path=require('path');
const {BcFollow,PAGES,pagesOf,cycleOf,setNow,KINDS}=require('../../apps/cluster_redline/bc-follow');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.deepStrictEqual(PAGES.ID7.map(p=>p[0]),['none','efficiency','trip','torque','gmeter','media'],'the order of a BC press (the user\'s photos)');
 // the defaults (1.3.48, the user's list)
 const V=(items)=>JSON.stringify({mode:'values',items}),G=(items)=>JSON.stringify({mode:'gauges',items});
 const want={none:{kind:'yield'},efficiency:{kind:'redline',design:'rl-needle',aux:V(['avgSpeed','outside'])},trip:{kind:'redline',design:'rl-tyres',aux:V(['outside','batteryVoltage','avgSpeed','economy'])},
  torque:{kind:'redline',design:'rl-rings',aux:G(['boost','oil'])},gmeter:{kind:'redline',design:'own',alert:'bar',aux:G(['power','torque'])},media:{kind:'redline',design:'rl-car',aux:G(['clock'])}};
 assert.deepStrictEqual(pagesOf('','ID7'),want,'cluster defaults');
 const hud=pagesOf('','ID7','hud');assert.deepStrictEqual(hud.none,{kind:'keep'},'HUD: no display = no change');assert.strictEqual(hud.trip.design,'own','HUD: no Tyres & trip');assert.deepStrictEqual(hud.efficiency,want.efficiency);
 assert.strictEqual(pagesOf('','ID7','hud').media.design,'rl-car','current media: the Animation layout on the HUD too (1.3.56)');
 assert.deepStrictEqual(KINDS,{cluster:['redline','yield','keep'],hud:['redline','keep']},'Waze on the cluster only; no Left out');
 assert.deepStrictEqual(pagesOf(JSON.stringify({ID7:{torque:{kind:'skip'}}}),'ID7').torque,{kind:'keep'},'a saved Left out counts as No change');
 assert.deepStrictEqual(cycleOf(JSON.stringify({ID7:{torque:{kind:'skip'}}}),'ID7'),['none','efficiency','trip','torque','gmeter','media'],'every page counted');
 assert.strictEqual(pagesOf(JSON.stringify({ID7:{efficiency:{kind:'yield'}}}),'ID7','hud').efficiency.kind,'redline','no Waze on the HUD');
 const values={sportClusterOutput:'redline',allClusterOutput:'stock',bcHmi:'ID7',bcPages:'',bcStart:'last',bcIndex:0,bcCluster:''},L=[],applied=[];let t=0,feed=null,watched=0;
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},onChange:f=>L.push(f)};
 const signals={loadConfig:()=>({fields:{IndicatorSteeringColumn:{}}}),watch:(i,inst,h)=>{watched++;feed=h;return Promise.resolve({shutdown(){}});}};
 const f=new BcFollow({settings,signals,apply:(v)=>applied.push(v),clock:()=>t});await flush();
 assert.strictEqual(watched,1,'read whenever the app runs, BC mode or not (1.3.45)');
 // BC mode chosen on a cluster RPM row (1.3.42); the worker says the drive mode now is one in BC mode
 settings.set('allClusterOutput','bc');setNow(true);await flush();assert.strictEqual(watched,1,'one reader');assert.strictEqual(f.current(),'none');
 const press=()=>{t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:64});t+=150;feed.IndicatorSteeringColumn({operationColumnStalks:0});};
 assert.strictEqual(values.bcCluster,'yield','no display: Waze / the stock map');
 press();assert.strictEqual(f.current(),'efficiency');assert.strictEqual(values.bcCluster,'redline');assert.deepStrictEqual(applied.pop(),{clusterDesign:'rl-needle',clusterAuxConfig:want.efficiency.aux});
 press();assert.strictEqual(f.current(),'trip');assert.deepStrictEqual(applied.pop(),{clusterDesign:'rl-tyres',clusterAuxConfig:want.trip.aux});
 press();press();press();assert.strictEqual(f.current(),'media');assert.deepStrictEqual(applied.pop(),{clusterDesign:'rl-car',clusterAuxConfig:want.media.aux});
 press();assert.strictEqual(f.current(),'none','round again');assert.strictEqual(values.bcCluster,'yield');
 // held, a bounce, other stalk switches: one step only
 t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:64});feed.IndicatorSteeringColumn({operationColumnStalks:64});t+=50;feed.IndicatorSteeringColumn({operationColumnStalks:0});t+=50;feed.IndicatorSteeringColumn({operationColumnStalks:64});
 assert.strictEqual(f.current(),'efficiency','one press, its bounce ignored');t+=300;feed.IndicatorSteeringColumn({operationColumnStalks:0});
 t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:2});assert.strictEqual(f.current(),'efficiency','another switch: no step');
 f.here('gmeter');assert.strictEqual(f.current(),'gmeter');assert.deepStrictEqual(applied.pop(),{clusterDesign:'own',clusterAuxConfig:want.gmeter.aux,clusterAlertStyle:'bar'},'This page now');
 // the next drive: the page reached, or the first
 const g=new BcFollow({settings,signals,apply:()=>{},clock:()=>t});await flush();assert.strictEqual(g.current(),'gmeter','kept');
 settings.set('bcStart','first');const h=new BcFollow({settings,signals,apply:()=>{},clock:()=>t});await flush();assert.strictEqual(h.current(),'none','the first page');
 // a drive mode not in BC mode: the presses still counted (in step), no screen applied
 setNow(false);const before=applied.length;press();press();assert.strictEqual(f.current(),'trip','counted all the same');assert.strictEqual(applied.length,before,'not in BC mode now: nothing applied');setNow(true);assert(applied.length>before,'back in BC mode: the page applied');
 settings.set('allClusterOutput','stock');assert.strictEqual(values.bcCluster,'','no BC mode: the cluster as the drive modes say');const n=f.presses,was=f.current();t+=500;f.stalk({operationColumnStalks:64});t+=150;f.stalk({operationColumnStalks:0});assert.strictEqual(f.presses,n+1,'no BC mode: still counted (1.3.45)');assert.notStrictEqual(f.current(),was,'in step');assert.strictEqual(values.bcCluster,'','no BC mode: no screen');
 settings.set('allClusterOutput','bc');assert.strictEqual(f.current(),PAGES.ID7.map(p=>p[0])[(PAGES.ID7.map(p=>p[0]).indexOf(was)+1)%6],'BC mode chosen again: the page counted meanwhile');settings.set('allClusterOutput','stock');
 // the cluster per page (outputs.js)
 {const {Outputs}=require('../../apps/cluster_redline/outputs'),{EventEmitter}=require('events');
  class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
  const pt=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
  for(const [bc,cl,want] of [['redline','bc',true],['yield','bc',false],['','bc',true],['redline','stock',false]]){const out=new Outputs(new C(),pt(1088,480),Object.assign(pt(800,480),{fullTarget:true}));
   const cfg={allClusterOutput:cl,allHudOutput:'stock',sportHudOutput:'stock',sportClusterOutput:'stock',bcCluster:bc};let o;
   out.policy.modeSample(4,0);for(let x=10;x<300;x+=50){out.policy.rpmSample(2000,x);o=out.tick(x,cfg).outputs;}assert.strictEqual(o.cluster.requested,want,'bcCluster '+bc);out.close();}}
 const {settings:norm}=require('../../apps/cluster_redline/policy'),DC=require('../../apps/cluster_redline/display-config');assert.strictEqual(norm({allClusterOutput:'bc'}).allClusterOutput,'bc');assert.strictEqual(norm({allHudOutput:'bc'}).allHudOutput,'bc','the HUD has BC mode too (1.3.48)');assert.strictEqual(DC.bcModeNow(norm({allHudOutput:'bc'}),'COMFORT','Hud'),true);assert.strictEqual(DC.bcModeNow(norm({allHudOutput:'bc'}),'COMFORT'),false,'the cluster rows apart');
 assert.strictEqual(DC.bcModeNow(norm({allClusterOutput:'bc',sportClusterOutput:'redline'}),'SPORT'),false,'Sport on Redline over All modes BC');assert.strictEqual(DC.bcModeNow(norm({allClusterOutput:'bc',sportClusterOutput:'redline'}),'COMFORT'),true);assert.strictEqual(DC.bcModeNow(norm({sportClusterOutput:'bc'}),'SPORT'),true);
 // the settings screen: Set screen (auxiliary values, then design) keeps the page's setup; This page now; back
 if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
  Object.assign(v,{allClusterOutput:'bc',bcHmi:'ID7',bcPages:'',bcIndex:0});const LL=[],st={schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;LL.forEach(fn=>fn(k,x));},onChange:fn=>LL.push(fn)};
  const page=new SettingsPage(st,()=>{},'t');page.bcFollow=new BcFollow({settings:st,signals,apply:()=>{},clock:()=>t});await flush();page.selectTab(2);
  // the RPM rows offer BC mode
  assert(require(root+'/settings-ui').options(spec.settings.find(x=>x.key==='allClusterOutput'),page.config()).some(o=>o[0]==='bc'));assert(require(root+'/settings-ui').options(spec.settings.find(x=>x.key==='allHudOutput'),page.config()).some(o=>o[0]==='bc'),'the HUD rows too (1.3.48)');
  page.focus=page.keys().indexOf('bcFollow');assert(page.focus>=0);page.activate();assert.strictEqual(page.open,'bc');
  const scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};
  assert(!scr().some(x=>/-skip$/.test(x.id)),'no Left out (1.3.48)');
  // Set screen (1.3.48): its design first (the Jam circle alert), then its auxiliary values, then its Position / size
  scr().find(x=>x.id==='bc-torque-edit').run();assert.strictEqual(page.open,'rlDesign');page.choose(1);assert.strictEqual(page.open,'auxMode','then its auxiliary values');
  page.choose(0);assert.strictEqual(page.open,'auxSelect');
  page.choose(require(root+'/display-config').METRICS.indexOf('oil'));page.choose(require(root+'/display-config').METRICS.length);assert.strictEqual(page.open,'layout','then its Position / size (1.3.41)');
  page.adjust(0,1);const moved=v.clusterOffsetX;page.back();assert.strictEqual(page.open,'bc','back to the list');
  const saved=JSON.parse(v.bcPages).ID7.torque;assert.strictEqual(saved.kind,'redline');assert.deepStrictEqual(JSON.parse(saved.aux).items,['oil']);assert.strictEqual(saved.design,'own');assert.strictEqual(saved.alert,'circle');
  assert(saved.layout&&Object.keys(saved.layout).length>4,'positions and sizes kept');assert(Object.keys(saved.layout).every(k=>/^cluster/.test(k)),'the cluster\'s only');
  // applied again when BC comes to that page
  const got=[];const ff=new BcFollow({settings:st,signals,apply:(x)=>got.push(x),clock:()=>t});await flush();ff.here('torque');assert.strictEqual(got.pop().clusterAuxConfig,saved.aux);
  // a favourite loaded in BC mode: the page count stays, the page's screen comes back over the favourite's design (1.3.47)
  {setNow(true);page.bcFollow.here('torque');const idx=v.bcIndex;page.registerFavorite(5);page.lastFavLoad=0;const shown=[];const keep=page.bcFollow;
   page.bcFollow={show(){shown.push(keep.current());keep.show();}};v.clusterDesign='rl-tyres';assert(page.loadFavorite(5));
   assert.strictEqual(v.bcIndex,idx,'the page count kept');assert.deepStrictEqual(shown,['torque'],'the page\'s screen again');page.bcFollow=keep;
   assert(!require(root+'/settings-ui').favKeys(spec.settings).includes('bcIndex'),'never in a favourite');}
  scr().find(x=>x.id==='bc-media-yield').run();assert.strictEqual(JSON.parse(v.bcPages).ID7.media.kind,'yield');
  scr().find(x=>x.id==='bc-trip-here').run();assert.strictEqual(page.bcFollow.current(),'trip');
  scr().find(x=>x.id==='bc-check').run();assert.strictEqual(page.open,'bcCheck');page.back();assert.strictEqual(page.open,'bc');page.back();assert.strictEqual(page.open,null);}
 console.log('PASS: following the BC button (BC mode on the cluster RPM rows): a press (bit 64) steps through the stock pages in order, each page\'s screen, Waze, no change, left out; kept or first; This page now; off: nothing; the cluster per page'+(process.argv[2]?'; Set screen (aux, design, Position / size) keeps the setup':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
