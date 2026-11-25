'use strict';
// BC mode on the HUD (1.3.48): the HUD's RPM rows can be BC mode; each stock BC page then gets its own HUD screen
// (Set screen / No change / This page now: no Waze, no Left out), applied only while the HUD is in BC mode now; the
// cluster's and the HUD's pages kept apart; the HUD stays the Redline HUD in BC mode (outputs).
const assert=require('assert'),path=require('path');
const {BcFollow,setNow,pagesOf}=require('../../apps/cluster_redline/bc-follow');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 const values={allHudOutput:'bc',sportHudOutput:'stock',allClusterOutput:'stock',sportClusterOutput:'stock',bcHmi:'ID7',bcPages:'',bcHudPages:'',bcStart:'last',bcIndex:0,bcCluster:''},L=[],applied=[];let t=0,feed=null;
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},onChange:f=>L.push(f)};
 const signals={loadConfig:()=>({fields:{IndicatorSteeringColumn:{}}}),watch:(i,inst,h)=>{feed=h;return Promise.resolve({shutdown(){}});}};
 const f=new BcFollow({settings,signals,apply:(v,d)=>applied.push([d,v]),clock:()=>t});await flush();
 const press=()=>{t+=500;feed.IndicatorSteeringColumn({operationColumnStalks:64});t+=150;feed.IndicatorSteeringColumn({operationColumnStalks:0});};
 setNow({cluster:false,hud:true});press();
 assert.deepStrictEqual(applied.pop(),['hud',{hudDesign:'rl-needle',hudAuxConfig:JSON.stringify({mode:'values',items:['avgSpeed','outside']})}],'efficiency on the HUD');
 assert.strictEqual(values.bcCluster,'','the cluster not in BC mode: left alone');
 press();assert.deepStrictEqual(applied.pop()[1],{hudDesign:'own',hudAuxConfig:JSON.stringify({mode:'values',items:['outside','batteryVoltage','avgSpeed','economy']}),hudAlertStyle:'bar'},'trip: no Tyres & trip on the HUD');
 // the HUD's own saved page; the cluster's pages are not the HUD's
 values.bcHudPages=JSON.stringify({ID7:{torque:{kind:'keep'}}});values.bcPages=JSON.stringify({ID7:{torque:{kind:'redline',design:'rl-dial'}}});const n=applied.length;press();assert.strictEqual(applied.length,n,'No change on the HUD');
 // both in BC mode: each display its own
 values.allClusterOutput='bc';setNow({cluster:true,hud:true});press();const last=applied.slice(-2).map(a=>a[0]).sort();assert.deepStrictEqual(last,['cluster','hud'],'gmeter on both');
 setNow({cluster:false,hud:false});const m=applied.length;press();assert.strictEqual(applied.length,m,'not in BC mode now: nothing applied');f.stop();
 assert.deepStrictEqual(pagesOf('','ID8','hud').map,{kind:'keep'});
 // outputs: the HUD in BC mode shows the Redline HUD
 {const {Outputs}=require('../../apps/cluster_redline/outputs'),{EventEmitter}=require('events');
  class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
  const pt=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
  for(const [hudOut,want] of [['bc',true],['stock',false]]){const out=new Outputs(new C(),pt(1088,480),Object.assign(pt(800,480),{fullTarget:true}));
   const cfg={allHudOutput:hudOut,sportHudOutput:'stock',allClusterOutput:'stock',sportClusterOutput:'stock',bcCluster:''};let o;
   out.policy.modeSample(4,0);for(let x=10;x<300;x+=50){out.policy.rpmSample(2000,x);o=out.tick(x,cfg).outputs;}assert.strictEqual(o.hud.requested,want,'HUD '+hudOut);out.close();}}
 // the settings screen: the HUD tab's BC mode screens (no Waze), Set screen saved as the HUD's page
 if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
  Object.assign(v,{allHudOutput:'bc',bcHmi:'ID7',bcPages:'',bcHudPages:'',bcIndex:0});const LL=[],st={schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;LL.forEach(fn=>fn(k,x));},onChange:fn=>LL.push(fn)};
  const page=new SettingsPage(st,()=>{},'t');page.bcFollow=new BcFollow({settings:st,signals,apply:()=>{},clock:()=>t});await flush();page.selectTab(1);
  page.focus=page.keys().indexOf('bcFollow');assert(page.focus>=0,'HUD tab: BC mode screens');page.activate();assert.strictEqual(page.open,'bc');
  const scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};
  assert(!scr().some(x=>/-yield$|-skip$/.test(x.id)),'no Waze, no Left out on the HUD');
  scr().find(x=>x.id==='bc-media-edit').run();assert.strictEqual(page.open,'rlDesign');page.choose(0);assert.strictEqual(page.open,'auxMode');page.choose(2);
  assert.strictEqual(page.open,'layout','no auxiliary values: straight to Position / size');page.back();assert.strictEqual(page.open,'bc');
  const saved=JSON.parse(v.bcHudPages).ID7.media;assert.strictEqual(saved.design,'own');assert.strictEqual(saved.alert,'bar');assert.strictEqual(JSON.parse(saved.aux).mode,'off');
  assert(Object.keys(saved.layout).every(k=>/^hud/.test(k)),'the HUD\'s positions only');assert.strictEqual(v.bcPages,'','the cluster\'s pages untouched');page.bcFollow.stop();}
 console.log('PASS: BC mode on the HUD: its own pages and defaults, applied only in BC mode, apart from the cluster; the Redline HUD shown; HUD tab screens'+(process.argv[2]?' (Set screen, no Waze)':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
