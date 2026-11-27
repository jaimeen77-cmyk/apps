'use strict';
// Drive-mode display (1.3.84): each display's output and screen per group of drive modes (sport / comfort / eco / other),
// the older Sport / All modes rows as the meaning of a group not saved, the group's own screen over the common one.
const assert=require('assert'),{EventEmitter}=require('events');
const D=require('../../apps/cluster_redline/display-config'),{settings,screenSettings}=require('../../apps/cluster_redline/policy');
const {demand}=require('../../apps/cluster_redline/data-demand');
// the groups
const G={SPORT:'sport',SPORT_PLUS:'sport',SPORT_INDIVIDUAL:'sport',PHEV_SPORT_PLUS:'sport',BOOST:'sport',COMFORT:'comfort',COMFORT_PLUS:'comfort',COMFORT_INDIVIDUAL:'comfort',
 PHEV_HYBRID_COMFORT:'comfort',PHEV_HYBRID_STANDARD:'comfort',ECO_PRO:'eco',ECO_PRO_PLUS:'eco',ECO_PRO_INDIVIDUAL:'eco',PHEV_HYBRID_ECO:'eco',ADAPTIVE:'other',PHEV_ELECTRIC_STANDARD:'other',OFFROAD_GRIP:'other',EASE_MODUS:'other'};
Object.keys(G).forEach(m=>assert.strictEqual(D.groupOf(m),G[m],m));assert.strictEqual(D.groupOf(null),'comfort','the mode not known yet: as Comfort');
// not saved: exactly the older rows (every Sport / All pair, every kind of mode)
const sportOld=m=>/^(SPORT|PHEV_SPORT)/.test(m);
const oldAll=(c,m)=>c.allHudOutput==='redline'||c.allHudOutput==='nosport'&&!sportOld(m),oldRpm=(c,m)=>oldAll(c,m)||sportOld(m)&&c.sportHudOutput==='redline';
const oldBc=(c,m)=>sportOld(m)?c.sportHudOutput==='bc'||c.sportHudOutput!=='redline'&&c.allHudOutput==='bc':c.allHudOutput==='bc';
['redline','stock','bc'].forEach(sp=>['redline','nosport','stock','bc'].forEach(al=>['SPORT','COMFORT','ECO_PRO','ADAPTIVE',null].forEach(m=>{
 const c=settings({sportHudOutput:sp,allHudOutput:al}),k=sp+'/'+al+'/'+m;
 if(!(sp==='bc'&&al==='redline'&&sportOld(m)))assert.strictEqual(D.rpmOutput(c,'Hud',m),oldRpm(c,m),'rpm '+k);
 assert.strictEqual(D.bcModeNow(c,m,'Hud'),oldBc(c,m),'bc '+k);
 if(D.rpmOutput(c,'Hud',m))assert.strictEqual(D.allOutput(c,'Hud',m),oldAll(c,m),'all '+k);
})));
// saved: each group its own; other follows Comfort until set
const setup={sport:{out:'redline',screen:{design:'rl-gg',layout:{hudRpmGaugeOffsetX:40,clusterRpmGaugeOffsetX:99}}},comfort:{out:'redline'},eco:{out:'stock'},other:{out:'comfort'}};
let c=settings({sportHudOutput:'stock',allHudOutput:'stock',hudModeSetup:JSON.stringify(setup),hudDesign:'rl-classic'});
assert.deepStrictEqual(['SPORT','COMFORT','ECO_PRO','ADAPTIVE'].map(m=>D.rpmOutput(c,'Hud',m)),[true,true,false,true]);
assert(D.allOutput(c,'Hud','SPORT'),'a saved setup: shown at once in Sport too');assert(D.rpmOutputPossible(c,'Hud'));
assert.strictEqual(D.rpmOutput(c,'Cluster','SPORT'),D.rpmOutput(settings({}),'Cluster','SPORT'),'the cluster keeps its own');
c=settings(Object.assign({},c,{hudModeSetup:JSON.stringify(Object.assign({},setup,{other:{out:'bc'}}))}));assert(D.bcModeNow(c,'ADAPTIVE','Hud'));assert(!D.bcModeNow(c,'COMFORT','Hud'));
// the screen: the group's own over the common one, only that display's keys; the same object while nothing changes
c=settings({hudModeSetup:JSON.stringify(setup),hudDesign:'rl-classic',hudRpmGaugeOffsetX:0});
const sp=screenSettings(c,'hud','SPORT_PLUS');assert.strictEqual(sp.hudDesign,'rl-gg');assert.strictEqual(sp.hudRpmGaugeOffsetX,40);assert.strictEqual(sp.clusterRpmGaugeOffsetX,c.clusterRpmGaugeOffsetX,'not the other display');
assert.strictEqual(screenSettings(Object.assign({},c),'hud','SPORT'),sp,'kept per normalised settings');
assert.strictEqual(screenSettings(c,'hud','COMFORT'),c,'common');assert.strictEqual(screenSettings(c,'cluster','SPORT'),c);
// what is read follows the screen of the mode: the G-G trail's G in Sport only
c=settings({hudModeSetup:JSON.stringify(setup),hudDesign:'own',appEnabled:true});
assert(demand(c,'SPORT').aux.has('gforce'),'Sport: its G-G screen reads the G');assert(!demand(c,'COMFORT').aux.has('gforce'),'Comfort: the common screen does not');
// the outputs: HUD Redline in Sport (its own screen), stock in Eco
const {Outputs}=require('../../apps/cluster_redline/outputs');
class Client extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.next=0;this.active=new Map();}
 image(o){const r=++this.next;this.active.set(r,Object.assign({},o));return r;}pixels(){}showWhenSent(){}set(r,o){Object.assign(this.active.get(r),o);}drop(r){this.active.delete(r);}close(){this.ready=false;}}
const face={W:1088,H:480,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})},hudFace=Object.assign({},face,{W:800,H:353});
const raw={appEnabled:true,hudModeSetup:JSON.stringify(setup),clusterModeSetup:JSON.stringify({sport:{out:'stock'},comfort:{out:'stock'},eco:{out:'stock'},other:{out:'stock'}})};
for(const [mode,want] of [[1,true],[7,false]]){const o=new Outputs(new Client(),face,hudFace);o.policy.modeSample(mode,0);o.policy.rpmSample(3000,1000);
 o.tick(1000,raw);const st=o.tick(1300,raw);assert.strictEqual(!!st.outputs.hud.requested,want,'HUD in mode '+mode);assert(!st.outputs.cluster.requested);
 if(want)assert.strictEqual(st.outputs.hud.config.hudDesign,'rl-gg','its own screen');}
// the settings: a group's own screen set up with the BC page's steps, kept for the group; the common screen put back
if(process.argv[2]){
 const path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
 const {SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json');
 const values={};spec.settings.forEach(x=>values[x.key]=x.default);Object.assign(values,{hudDesign:'rl-classic',hudRpmGaugeOffsetX:0});
 const page=new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},onChange(){}},null,'test');
 page.selectTab(1);page.activate(0);let cv=page.draw(new Canvas(1600,520));cv.targets.find(t=>t.id==='mode-sport-redline').run();
 cv=page.draw(new Canvas(1600,520));cv.targets.find(t=>t.id==='mode-sport-own').run();assert.strictEqual(page.open,'rlDesign');
 const list=page.draw(new Canvas(1600,520)).targets.map(t=>t.id).filter(x=>/^rl-/.test(x||''));const i=list.indexOf('rl-gg');assert(i>=0,'G-G in the list '+list);
 page.choose(i);for(let n=0;n<4&&page.open!=='layout';n++){if(page.open==='auxMode')page.choose(2);else break;}
 assert.strictEqual(page.open,'layout','then Position / size');values.hudRpmGaugeOffsetX=33;page.back();
 assert.strictEqual(page.open,'modes');const saved=JSON.parse(values.hudModeSetup).sport.screen;assert.strictEqual(saved.design,'rl-gg');assert.strictEqual(saved.layout.hudRpmGaugeOffsetX,33);
 assert.strictEqual(values.hudDesign,'rl-classic','the common design back');assert.strictEqual(values.hudRpmGaugeOffsetX,0,'the common positions back');
 cv=page.draw(new Canvas(1600,520));cv.targets.find(t=>t.id==='mode-sport-common').run();assert.strictEqual(JSON.parse(values.hudModeSetup).sport.screen,undefined,'back to the common screen');
}
console.log('PASS: drive-mode display: groups, the older rows when not saved, saved outputs per group, the group\'s own screen, what is read, the outputs');
