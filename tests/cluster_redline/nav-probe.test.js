'use strict';
// What the navigation sends (1.3.43): each turn's raw values on the Received turns screen (newest first, the same turn
// again only updates its distance), the whole turn in nav-probe.log while switched on (1 MB, then .1), the route's
// list only when its first turn changes; Navigation display → Received turns, Record to a file.
const assert=require('assert'),path=require('path');
const {NavProbe,drawnOf,fields,textOf,KEEP,FILE_MAX}=require('../../apps/cluster_redline/nav-probe');
const {settings}=require('../../apps/cluster_redline/policy');
const files={};let fail=false;
const fs={statSync:(f)=>{if(!(f in files))throw new Error('ENOENT');return {size:files[f].length};},renameSync:(a,b)=>{files[b]=files[a];delete files[a];},
 appendFileSync:(f,t)=>{if(fail)throw new Error('EROFS: read-only');files[f]=(files[f]||'')+t;}};
let clock=new Date(2026,10,22,14,32,5);
const p=new NavProbe({fs,file:'/d/nav-probe.log',wall:()=>clock});
const desc=(t)=>({elements:[{text:t}]});
const exit=(d)=>({branch:{branchType:7,unreliable:false,uid:41,formattedDistance:{distance:String(d),unit:4},distanceToDestination:9000-d,description:desc('판교IC')}});
// the screen, without the file
p.turn('dart','ANDROID_AUTO',exit(500),'highway');p.turn('dart','ANDROID_AUTO',exit(300),'highway');
let l=p.list();assert.strictEqual(l.length,1,'the same turn: one line');assert.strictEqual(l[0].count,2);assert.strictEqual(l[0].dist,'300 [4]');
assert.deepStrictEqual(l[0].fields,['branchType=7','uid=41','unreliable=false'],'raw values as they came, distances apart');
assert.strictEqual(l[0].text,'판교IC');assert.strictEqual(l[0].kind,'branch');assert.strictEqual(l[0].time,'14:32:05');assert.deepStrictEqual(files,{},'no file while off');
p.turn('dart','ANDROID_AUTO',{intersection:{direction:6,formattedDistance:{distance:'1.2',unit:1}}},'arrow');
l=p.list();assert.strictEqual(l.length,2);assert.strictEqual(l[0].kind,'intersection','newest first');
for(let i=0;i<20;i++)p.turn('dart','CAR_PLAY',{intersection:{direction:i%9}},'arrow');assert.strictEqual(p.list().length,KEEP);
assert.strictEqual(fields(null).length,0);assert.strictEqual(textOf({description:{elements:[{text:'a\nb'},{spacer:1},{text:'c'}]}}),'a b c');
p.turn('dart','X',{a:{},b:{}},'none');assert.strictEqual(p.list()[0].provider,'CAR_PLAY','not one kind: ignored');
// the file
p.record(true);assert(/recording started/.test(files['/d/nav-probe.log']));
p.turn('dart','ANDROID_AUTO',exit(800),'highway');let lines=files['/d/nav-probe.log'].trim().split('\n').map(JSON.parse);
assert.deepStrictEqual(lines[1].turn,exit(800),'the whole turn as received');assert.strictEqual(lines[1].provider,'ANDROID_AUTO');assert.strictEqual(lines[1].drawn,'highway');
p.turn('dart','ANDROID_AUTO',exit(700),'highway');assert.strictEqual(files['/d/nav-probe.log'].trim().split('\n').length,2,'only a new turn is written');
const r=(d)=>({GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[exit(d),{intersection:{direction:2}}]}]});
p.route('ANDROID_AUTO',r(600),'highway');p.route('ANDROID_AUTO',r(500),'highway');
lines=files['/d/nav-probe.log'].trim().split('\n').map(JSON.parse);assert.strictEqual(lines.length,3,'the route list once per first turn');assert.strictEqual(lines[2].events.length,2);assert.strictEqual(lines[2].source,'route');
// the route's turn list on the screen (1.3.67): how many turns, the gap between the first two, without the file
{const st=p.status().route;assert.deepStrictEqual([st.last,st.max,st.count,st.provider],[2,2,2,'ANDROID_AUTO']);assert.strictEqual(st.gap,null,'the second turn without its distance to the destination');
 const q=new NavProbe({wall:()=>clock});q.route('CAR_PLAY',{GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[exit(600)]}]},'highway');assert.deepStrictEqual([q.status().route.last,q.status().route.max],[1,1],'one turn only');
 q.route('CAR_PLAY',{GuidanceEventListError:'NO_ERROR',viewContent:[{eventsInView:[exit(600),{intersection:{direction:2,distanceToDestination:8200}}]}]},'highway');assert.strictEqual(q.status().route.gap,200,'1st to 2nd: 200 m');
 assert.strictEqual(new NavProbe({}).status().route,null);}
// at most 1 MB, then one older file
files['/d/nav-probe.log']+='x'.repeat(FILE_MAX);p.turn('dart','ANDROID_AUTO',{roundabout:{exitNumber:3}},'roundabout');
assert(files['/d/nav-probe.log.1'].length>FILE_MAX);assert(files['/d/nav-probe.log'].length<2000);
fail=true;p.turn('dart','ANDROID_AUTO',{roundabout:{exitNumber:4}},'roundabout');assert(/EROFS/.test(p.status().error),'a write error shows, nothing thrown');fail=false;
p.record(false);const before=files['/d/nav-probe.log'];p.turn('dart','ANDROID_AUTO',{roundabout:{exitNumber:5}},'roundabout');assert.strictEqual(files['/d/nav-probe.log'],before,'off: nothing written');
assert.strictEqual(new NavProbe({}).record(true),undefined);
// the setting: off unless on
assert.strictEqual(settings({}).navProbeLog,'off');assert.strictEqual(settings({navProbeLog:'on'}).navProbeLog,'on');assert.strictEqual(settings({navProbeLog:'x'}).navProbeLog,'off');
assert.strictEqual(drawnOf(null),'none');
// the screen (with a built package)
if(process.argv[2]){
 const root=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(root+'/settings-ui'),{Canvas}=require(root+'/kit/canvas'),spec=require(root+'/kit/app-spec.json'),v={};spec.settings.forEach(x=>{v[x.key]=x.default;});
 const N=require(root+'/nav-probe');assert.strictEqual(N.drawnOf({maneuver:'SLIGHT_RIGHT',kind:'branch',branchType:'HIGHWAY_OUT_RIGHT'}),'highway');assert.strictEqual(N.drawnOf({maneuver:'RIGHT',kind:'intersection'}),'arrow');
 const page=new SettingsPage({schema:spec.settings,get:k=>v[k],set:(k,x)=>{v[k]=x;},onChange(){}},()=>{},'t');page.selectTab(3);
 page.focus=page.keys().indexOf('navDisplayMode');page.activate();
 const live={navProbe:p.status()},scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',live);return cv;};
 scr().targets.find(t=>t.id==='navlog').run();assert.strictEqual(page.open,'navLog');
 assert(!scr().targets.some(t=>t.id==='navprobe-on'),'1.3.100: the recording is switched in QR log collection, not here');
 if(process.argv[3])require('fs').writeFileSync(process.argv[3],scr().png());
 page.back();assert.strictEqual(page.open,'navMode','back to Navigation display');
 // 1.3.100: Basic settings → QR log collection switches it
 page.back();page.selectTab(0);page.activate(page.keys().indexOf('qrLogs'));assert.strictEqual(page.open,'qrLogs');
 scr().targets.find(t=>t.id==='navprobe-on').run();assert.strictEqual(v.navProbeLog,'on');scr().targets.find(t=>t.id==='navprobe-off').run();assert.strictEqual(v.navProbeLog,'off');
}
console.log('PASS: navigation record: raw values per turn, newest first, one line per turn, the file while on (whole turn, route list once, 1 MB + .1, errors shown), the setting, Received turns screen'+(process.argv[2]?'':' (no package: screen not checked)'));
