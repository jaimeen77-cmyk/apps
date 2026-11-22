'use strict';
// Following the BC button (1.3.40): BC (the left stalk's bit 64) pressed moves to the next stock BC page in the
// cluster's order (left-out pages skipped), each page's screen applied (design / auxiliary values, Waze / the stock
// map, or no change); kept for the next drive, or the first page; "This page now"; nothing while off; a page set up on
// the settings screen (Set screen: auxiliary values, then design); the cluster shown / stepping aside per page.
const assert=require('assert'),path=require('path');
const {BcFollow,PAGES,pagesOf,cycleOf}=require('../../apps/cluster_redline/bc-follow');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.deepStrictEqual(PAGES.ID7.map(p=>p[0]),['none','efficiency','trip','torque','gmeter','media'],'the order of a BC press (the user\'s photos)');
 assert.strictEqual(pagesOf('',`ID7`).efficiency.kind,'yield');assert.strictEqual(pagesOf('','ID7').media.aux,JSON.stringify({mode:'gauges',items:['clock']}));
 assert.deepStrictEqual(cycleOf(JSON.stringify({ID7:{torque:{kind:'skip'}}}),'ID7'),['none','efficiency','trip','gmeter','media'],'left out: skipped');
 const values={bcFollow:'off',bcHmi:'ID7',bcPages:'',bcStart:'last',bcIndex:0,bcCluster:''},L=[],applied=[];let t=0,feed=null,watched=0;
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},onChange:f=>L.push(f)};
 const signals={loadConfig:()=>({fields:{IndicatorSteeringColumn:{}}}),watch:(i,inst,h)=>{watched++;feed=h;return Promise.resolve({shutdown(){}});}};
 const f=new BcFollow({settings,signals,apply:(v)=>applied.push(v),clock:()=>t});await flush();
 assert.strictEqual(watched,0,'off: nothing read');
 settings.set('bcFollow','on');await flush();assert.strictEqual(watched,1);assert.strictEqual(f.current(),'none');
 const press=()=>{t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:64});t+=150;feed.IndicatorSteeringColumn({operationColumnStalks:0});};
 press();assert.strictEqual(f.current(),'efficiency');assert.strictEqual(values.bcCluster,'yield','efficiency: Waze / the stock map');
 press();assert.strictEqual(f.current(),'trip');assert.strictEqual(values.bcCluster,'redline');assert.deepStrictEqual(applied.pop(),{clusterDesign:'rl-tyres',clusterAuxConfig:JSON.stringify({mode:'values',items:['outside','batteryVoltage','economy','avgSpeed']})});
 press();press();press();assert.strictEqual(f.current(),'media');assert.deepStrictEqual(applied.pop(),{clusterAuxConfig:JSON.stringify({mode:'gauges',items:['clock']})});
 press();assert.strictEqual(f.current(),'none','round again');assert.strictEqual(values.bcCluster,'','no display: no change');
 // held, a bounce, other stalk switches: one step only
 t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:64});feed.IndicatorSteeringColumn({operationColumnStalks:64});t+=50;feed.IndicatorSteeringColumn({operationColumnStalks:0});t+=50;feed.IndicatorSteeringColumn({operationColumnStalks:64});
 assert.strictEqual(f.current(),'efficiency','one press, its bounce ignored');t+=300;feed.IndicatorSteeringColumn({operationColumnStalks:0});
 t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:2});assert.strictEqual(f.current(),'efficiency','another switch: no step');
 f.here('gmeter');assert.strictEqual(f.current(),'gmeter');assert.deepStrictEqual(applied.pop(),{clusterAuxConfig:JSON.stringify({mode:'gauges',items:['torque','power']})},'This page now');
 // the next drive: the page reached, or the first
 const g=new BcFollow({settings,signals,apply:()=>{},clock:()=>t});await flush();assert.strictEqual(g.current(),'gmeter','kept');
 settings.set('bcStart','first');const h=new BcFollow({settings,signals,apply:()=>{},clock:()=>t});await flush();assert.strictEqual(h.current(),'none','the first page');
 settings.set('bcFollow','off');assert.strictEqual(values.bcCluster,'','off: the cluster as the drive modes say');const n=f.presses;press();assert.strictEqual(f.presses,n,'off: no step');
 // the cluster per page (outputs.js)
 {const {Outputs}=require('../../apps/cluster_redline/outputs'),{EventEmitter}=require('events');
  class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
  const pt=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
  for(const [bc,cl,want] of [['redline','stock',true],['yield','redline',false],['','stock',false]]){const out=new Outputs(new C(),pt(1088,480),Object.assign(pt(800,480),{fullTarget:true}));
   const cfg={allClusterOutput:cl,allHudOutput:'stock',sportHudOutput:'stock',sportClusterOutput:'stock',bcFollow:'on',bcCluster:bc};let o;
   out.policy.modeSample(4,0);for(let x=10;x<300;x+=50){out.policy.rpmSample(2000,x);o=out.tick(x,cfg).outputs;}assert.strictEqual(o.cluster.requested,want,'bcCluster '+bc);out.close();}}
 const {settings:norm}=require('../../apps/cluster_redline/policy');assert.strictEqual(norm({bcCluster:'redline'}).bcCluster,'','off: no override');assert.strictEqual(norm({bcFollow:'on',bcCluster:'yield'}).bcCluster,'yield');
 // the settings screen: Set screen (auxiliary values, then design) keeps the page's setup; This page now; back
 if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
  Object.assign(v,{bcFollow:'on',bcHmi:'ID7',bcPages:'',bcIndex:0});const LL=[],st={schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;LL.forEach(fn=>fn(k,x));},onChange:fn=>LL.push(fn)};
  const page=new SettingsPage(st,()=>{},'t');page.bcFollow=new BcFollow({settings:st,signals,apply:()=>{},clock:()=>t});await flush();page.selectTab(2);
  page.focus=page.keys().indexOf('bcFollow');assert(page.focus>=0);page.activate();assert.strictEqual(page.open,'bc');
  const scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};
  scr().find(x=>x.id==='bc-torque-edit').run();assert.strictEqual(page.open,'auxMode');page.choose(0);assert.strictEqual(page.open,'auxSelect');
  page.choose(require(root+'/display-config').METRICS.indexOf('oil'));page.choose(require(root+'/display-config').METRICS.length);assert.strictEqual(page.open,'design','then its design');
  page.choose(1);assert.strictEqual(page.open,'bc','back to the list');
  const saved=JSON.parse(v.bcPages).ID7.torque;assert.strictEqual(saved.kind,'redline');assert.deepStrictEqual(JSON.parse(saved.aux).items,['oil']);assert.strictEqual(saved.design,'own');assert.strictEqual(saved.alert,'circle');
  scr().find(x=>x.id==='bc-media-yield').run();assert.strictEqual(JSON.parse(v.bcPages).ID7.media.kind,'yield');
  scr().find(x=>x.id==='bc-trip-here').run();assert.strictEqual(page.bcFollow.current(),'trip');
  scr().find(x=>x.id==='bc-check').run();assert.strictEqual(page.open,'bcCheck');page.back();assert.strictEqual(page.open,'bc');page.back();assert.strictEqual(page.open,null);}
 console.log('PASS: following the BC button: a press (bit 64) steps through the stock pages in order, each page\'s screen, Waze, no change, left out; kept or first; This page now; off: nothing; the cluster per page'+(process.argv[2]?'; Set screen keeps the setup':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
