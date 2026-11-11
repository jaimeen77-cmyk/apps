'use strict';
// "Yield to Waze map": the cluster map layer goes under Waze's map (content, z 0) and stops being exclusive
// in the chosen drive modes; the HUD and the panel never change.
const assert=require('assert'),path=require('path'),{EventEmitter}=require('events');
const {Controller}=require('../../apps/cluster_redline/controller'),D=require('../../apps/cluster_redline/display-config'),{settings}=require('../../apps/cluster_redline/policy');
class Client extends EventEmitter{constructor(){super();this.targets='map:1088x480,panel:1920x720,hud:800x480';this.ready=true;this.made=[];this.sets=[];this.next=0;}
 image(o){this.made.push(o);return ++this.next;}pixels(){}set(ref,o){this.sets.push(Object.assign({ref},o));}close(){}drop(){}}
const painter={W:1088,H:480,draw:()=>({d:Buffer.alloc(4)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})};
assert.strictEqual(settings({}).clusterWazeYield,'off','default keeps the cluster on top');
assert.strictEqual(settings({clusterWazeYield:'bad'}).clusterWazeYield,'off');
const cfg=v=>settings({clusterWazeYield:v});
assert.deepStrictEqual(['SPORT','COMFORT','PHEV_SPORT_PLUS','ECO_PRO'].map(m=>D.wazeYield(cfg('all'),m)),[true,true,true,true]);
assert.deepStrictEqual(['SPORT','COMFORT','PHEV_SPORT_PLUS','ECO_PRO'].map(m=>D.wazeYield(cfg('excludeSport'),m)),[false,true,false,true]);
assert.deepStrictEqual(['SPORT','COMFORT'].map(m=>D.wazeYield(cfg('off'),m)),[false,false]);
const run=(raw,mode)=>{const client=new Client(),c=new Controller(client,painter);c.policy.modeSample(mode,0);c.policy.rpmSample(4200,1000);
 const d=c.tick(1000,Object.assign({displayTarget:'map',displayMode:'all'},raw));return {client,c,d,layer:client.made[0]};};
{const {layer}=run({},1);assert.deepStrictEqual([layer.klass,layer.z,layer.exclusive],['content',100,true],'off: unchanged');}
{const {layer,d}=run({clusterWazeYield:'all'},1);assert.deepStrictEqual([layer.klass,layer.z,layer.exclusive],['content',-100,false],'all modes: under Waze in Sport');assert.strictEqual(d.wazeYield,true);}
{const {layer}=run({clusterWazeYield:'excludeSport'},1);assert.deepStrictEqual([layer.z,layer.exclusive],[100,true],'except Sport: on top in Sport');}
{const {layer}=run({clusterWazeYield:'excludeSport'},4);assert.deepStrictEqual([layer.z,layer.exclusive],[-100,false],'except Sport: under Waze in Comfort');}
// Changing drive mode moves the existing layer without rebuilding it.
{const {client,c}=run({clusterWazeYield:'excludeSport'},1),raw={displayTarget:'map',displayMode:'all',clusterWazeYield:'excludeSport'};
 c.policy.modeSample(4,1100);c.policy.rpmSample(4200,1100);c.tick(1200,raw);
 assert.strictEqual(client.made.length,1,'same layer');const last=client.sets.filter(s=>'z' in s).pop();assert.deepStrictEqual([last.z,last.exclusive],[-100,false]);
 c.policy.modeSample(1,1300);c.policy.rpmSample(4200,1300);c.tick(1400,raw);const back=client.sets.filter(s=>'z' in s).pop();assert.deepStrictEqual([back.z,back.exclusive],[100,true]);}
// HUD and panel are not affected.
for(const target of ['hud','panel']){const client=new Client(),c=new Controller(client,painter);c.policy.modeSample(4,0);c.policy.rpmSample(4200,1000);
 c.tick(1000,{displayTarget:target,clusterWazeYield:'all',displayMode:'all'});const l=client.made[0];if(l)assert.notStrictEqual(l.z,-100,target);}
// Settings: the cluster tab offers the three choices and stores the key outside the packaged schema.
if(process.argv[2]){const root=path.join(path.resolve(process.argv[2]),'source/javascript'),spec=require(root+'/kit/app-spec.json'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),{getLanguage,t}=require(root+'/kit/i18n');
 const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});const page=new SettingsPage({schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;},setMany(c){Object.assign(values,c);}},null,'1.2.7');
 page.selectTab(2);const at=page.keys().indexOf('clusterWazeYield');assert(at>0);
 const seen=[];const draw=()=>{const cv=new Canvas(1600,520),text=cv.text;cv.text=function(v,x,y,z,c,o){seen.push(o&&o.literal?String(v):t(v));return text.apply(this,arguments);};page.draw(cv);};
 draw();page.activate(at);assert.strictEqual(page.open,'clusterWazeYield');assert.strictEqual(page.choice,2,'Off is current');draw();
 page.choose(1);assert.strictEqual(values.clusterWazeYield,'excludeSport');page.activate(at);page.choose(0);assert.strictEqual(values.clusterWazeYield,'all');draw();
 if(getLanguage()==='ko')['Waze 지도에 양보','스포츠모드 포함 모든모드','스포츠모드 제외 모든모드','안함'].forEach(s=>assert(seen.includes(s),s));
 else ['Yield to Waze map','All modes incl. Sport','All modes except Sport',"Don't yield"].forEach(s=>assert(seen.includes(s),s));}
console.log('PASS: Yield to Waze map (all modes / except Sport / off) moves only the cluster map layer under Waze, per drive mode, without rebuilding it; settings choices and labels');
