'use strict';
// 1.2.19: the cluster yields to route guidance (Navigation tab), HUD layouts kept inside the area the default
// design uses, All + proportional group size for the default design, no dead zone at the HUD edges.
// Usage: node redline-1-2-19.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),{EventEmitter}=require('events'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {Controller}=require(root+'/controller'),{settings}=require(root+'/policy'),{demand}=require(root+'/data-demand'),RL=require(root+'/redline-hud'),{placement}=require(root+'/layout'),HUDP=require(root+'/hud-draw');
const {SettingsPage}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json');

// Setting: kept outside app.json, off by default, three choices in the Navigation tab.
assert(!spec.settings.some(s=>s.key==='clusterYieldGuidance'));
// The background app reads its settings by the DEFAULTS keys: the yield setting must be one of them (1.2.22 missed it).
assert.strictEqual(require(root+'/policy').DEFAULTS.clusterYieldGuidance,'off');
assert.strictEqual(settings({}).clusterYieldGuidance,'off');assert.strictEqual(settings({clusterYieldGuidance:'phone'}).clusterYieldGuidance,'phone');assert.strictEqual(settings({clusterYieldGuidance:'x'}).clusterYieldGuidance,'off');
assert.strictEqual(settings({clusterYieldGuidance:'any'}).clusterYieldGuidance,'phone','the retired third choice reads as on');
assert.strictEqual(settings({clusterYieldGuidance:'nosport'}).clusterYieldGuidance,'nosport');
const page=(values)=>new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}},null,'1.2.19');
{const v={};spec.settings.forEach(s=>{v[s.key]=s.default;});const p=page(v);p.selectTab(3);const at=p.keys().indexOf('clusterYieldGuidance');assert(at>=0&&at<p.keys().indexOf('layout'));assert.strictEqual(require(root+'/settings-ui').SettingsPage&&p.keys().length,5,'NAV tab: + Vehicle alerts (the next turn is inside Navigation display since 1.3.36)');
 p.activate(at);assert.strictEqual(p.open,'clusterYieldGuidance');p.choose(2);assert.strictEqual(v.clusterYieldGuidance,'nosport','except Sport');p.activate(at);p.choose(1);assert.strictEqual(v.clusterYieldGuidance,'phone');assert.strictEqual(p.config().clusterYieldGuidance,'phone');}

// Outputs: with guidance running the cluster output is released; the HUD is not affected.
const {Outputs}=require(root+'/outputs');
class Client extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
const pt={W:1088,H:480,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})},ph=Object.assign({},pt,{W:800,H:353});
const run=(raw,yieldNow)=>{const o=new Outputs(new Client(),pt,ph);o.policy.modeSample(1,0);o.policy.rpmSample(5000,1000);o.guidanceYield=yieldNow;return o.tick(1000,Object.assign({sportClusterOutput:'redline',sportHudOutput:'redline'},raw)).outputs;};
assert.notStrictEqual(run({clusterYieldGuidance:'phone'},false).cluster.reason,'cluster_yield');
{const s=run({clusterYieldGuidance:'phone'},true);assert.strictEqual(s.cluster.reason,'cluster_yield');assert(!s.cluster.requested,'cluster layer released');assert.notStrictEqual(s.hud.reason,'cluster_yield','HUD unaffected');}
assert.notStrictEqual(run({clusterYieldGuidance:'off'},true).cluster.reason,'cluster_yield','off: the cluster stays');
// 'any' reads the route guidance state even with HUD navigation off.
{const f=demand(settings({clusterYieldGuidance:'phone',hudNavigationEnabled:false,sportClusterOutput:'redline',allClusterOutput:'redline'}),null).fields;assert(f.has('de.bmw.infotainment.navigation.guiding.Guidance.guidanceState'));}

// Every Redline layout stays inside the area the default HUD design uses, at any size or position.
// Moved by the user, it stays on the HUD picture (800 x 480) and can go lower than the default band.
for(const st of RL.stylesFor('hud'))for(const extra of [{},{hudRpmGaugeWidthScale:200},{hudRpmGaugeOffsetY:900},{hudRpmGaugeOffsetY:-900,hudRpmGaugeOffsetX:-900}]){
 const cfg=settings(Object.assign({hudDesign:'rl-'+st},extra)),face=placement(cfg,'hud',HUDP),moved=!!(extra.hudRpmGaugeOffsetY)||!!((RL.HUD_BASE[st]||{}).y||(RL.HUD_BASE[st]||{}).read),sa=moved?{x:0,y:0,w:800,h:480}:RL.safe(face,'hud'),lay=RL.rect(cfg,face,'hud');
 if(extra.hudRpmGaugeOffsetY===900)assert(lay.y>RL.rect(settings({hudDesign:'rl-'+st}),face,'hud').y+20,st+' moves well below the default band');
 RL.placed({config:cfg,rpm:0,gear:'--',aux:{}},lay,'hud',face).forEach(e=>assert(e.r.x>=sa.x-1&&e.r.y>=sa.y-1&&e.r.x+e.r.w<=sa.x+sa.w+1&&e.r.y+e.r.h<=sa.y+sa.h+1,st+' '+e.id+' '+JSON.stringify(extra)));}

// Default design: All selects every part; Size scales them as one picture (same factor, gaps scaled too).
{const v={};spec.settings.forEach(s=>{v[s.key]=s.default;});const p=page(v);p.selectTab(1);p.activate(p.keys().indexOf('layout'));p.selectAllParts();
 assert.strictEqual(p.selectedLayoutParts().length,p.layoutParts().length);const before=p.config(),keys=p.selectedLayoutParts().map(x=>'hud'+x.key);
 for(let i=0;i<4;i++)p.adjust(2,-1);const after=p.config();
 keys.forEach(k=>{const f=after[k+'WidthScale']/before[k+'WidthScale'];assert(f<0.85&&f>0.75,k+' '+f);assert(Math.abs(after[k+'HeightScale']/before[k+'HeightScale']-f)<0.02,k+' keeps its shape');});
 assert(keys.some(k=>after[k+'OffsetX']!==before[k+'OffsetX']),'the gaps between parts shrink with them');
 p.selectAllParts();assert.strictEqual(p.selectedLayoutParts().length,1,'All again: back to one part');}

// No dead zone: a layout pushed against the HUD edge comes back on the first opposite press, and a stored
// overshoot from an earlier version is skipped.
{const v={};spec.settings.forEach(s=>{v[s.key]=s.default;});v.hudDesign='rl-standard';v.hudRpmGaugeOffsetY=900;const p=page(v);p.selectTab(1);p.activate(p.keys().indexOf('layout'));p.selectLayoutPart(0,true);
 const part=p.layoutParts()[0],y0=p.rlRect(p.config(),part).y;p.adjust(1,-1);assert(p.rlRect(p.config(),part).y<y0,'moves up at once');
 for(let i=0;i<50;i++)p.adjust(1,1);const low=p.rlRect(p.config(),part).y,stored=v.hudRpmGaugeOffsetY;p.adjust(1,1);assert.strictEqual(v.hudRpmGaugeOffsetY,stored,'nothing stored past the edge');
 p.adjust(1,-1);assert(p.rlRect(p.config(),part).y<low,'and back up on the first press');}
console.log('PASS: cluster yields to phone / any route guidance (Navigation tab, HUD unaffected), Redline layouts inside the default design area, All + proportional group size, no edge dead zone');
