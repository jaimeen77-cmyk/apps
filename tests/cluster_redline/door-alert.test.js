'use strict';
// The door-open HUD warning: door switches decoded as Ambient Config reads them, the overlay only while a door is
// open (also standing still), re-drawn only when the open doors change, the demand set and the install-time input.
const assert=require('assert'),path=require('path');
const D=require('../../apps/cluster_redline/door-alert'),{demand}=require('../../apps/cluster_redline/data-demand'),{settings}=require('../../apps/cluster_redline/policy');
const {filterTraffic}=require('../../apps/cluster_redline/traffic-config');
assert.deepStrictEqual(D.openDoors({statusDoorSwitchDRD:1,statusDoorSwitchPSD:0,statusDoorSwitchDRDR:'TUER_GESCHLOSSEN',statusDoorSwitchPSDR:'TUER_OFFEN'}),['driverFront','passengerRear']);
assert.deepStrictEqual(D.openDoors({value:{statusDoorSwitchDRD:0,statusDoorSwitchPSD:0}}),[],'wrapped, all closed');
assert.strictEqual(D.openDoors({other:1}),null,'names no door: keep what is known');
const st=new D.DoorState();st.sample({statusDoorSwitchPSD:1},0);assert.deepStrictEqual(st.open,['passengerFront']);st.sample({x:1},10);assert.deepStrictEqual(st.open,['passengerFront']);st.sample({statusDoorSwitchPSD:0},20);assert.deepStrictEqual(st.open,[]);assert.strictEqual(st.received,3);
// overlay (stub drawing: the kit canvas is not loaded on the host)
const Module=require('module'),orig=Module._load;Module._load=function(r){if(r==='./kit/canvas'){class C{constructor(w,h){this.w=w;this.h=h;this.d=new Uint8Array(w*h*4);}clear(){}roundRect(){}line(){}fill(){}}return {Canvas:C,ScaledCanvas:class{constructor(w,h,k){this.canvas=new C(Math.round(w*k),Math.round(h*k));}clear(){}roundRect(){}line(){}fill(){}}};}return orig.apply(this,arguments);};
const layers=new Map();let n=0,up=0;const client={image(o){layers.set(++n,Object.assign({},o));return n;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
const DC=require('../../apps/cluster_redline/display-config'),c0=settings({});
const ov=new D.DoorOverlay(client);ov.tick([],c0);assert.strictEqual(layers.size,0,'no door open: nothing');
ov.tick(['driverFront'],c0);const l=layers.get(1);assert(l.target==='hud'&&l.klass==='overlay'&&l.visible);assert.strictEqual(up,1);
const r0=DC.doorRect(c0);assert.deepStrictEqual([l.x,l.y,l.w,l.h],[r0.x,r0.y,r0.w,r0.h]);assert.strictEqual(r0.x+r0.w/2,400,'centred on the HUD by default');assert(r0.y+r0.h<=400,'inside what the HUD shows');
['left','right'].forEach(side=>{const t=DC.turnRect(settings({}),side);assert(t.y+t.h<=r0.y||t.x+t.w<=r0.x||t.x>=r0.x+r0.w,'clear of the turn arrows');});
ov.tick(['driverFront'],c0);assert.strictEqual(up,1,'unchanged: no pixels');ov.tick(['driverFront','passengerRear'],c0);assert.strictEqual(up,2);
ov.tick(['driverFront'],settings({hudDoorOffsetX:40,hudDoorOffsetY:-20}));assert.deepStrictEqual([l.x,l.y],[r0.x+40,r0.y-20],'moved with Position / size');
ov.tick(['driverFront'],settings({hudDoorScale:100}));assert.strictEqual(layers.get(1),undefined,'resized: a new layer');const l2=layers.get(2);assert.deepStrictEqual([l2.w,l2.h],[120,150]);
ov.tick(['driverFront'],settings({hudDoorHidden:true}));assert.strictEqual(l2.visible,false,'hidden in Position / size');ov.tick(D.SAMPLE,settings({hudDoorHidden:true}));assert.strictEqual(layers.get(3)?layers.get(3).visible:l2.visible,true,'preview while adjusting');
ov.tick([],c0);ov.close();Module._load=orig;
// demand and settings
const has=c=>Array.from(demand(settings(Object.assign({appEnabled:true,navDisplayMode:'stock'},c)),null).fields).includes('de.bmw.body.DoorsWindowsRoofMirrors.CentralLockingSystemAndPanelStatus');
assert(has({}),'on by default');assert(!has({hudDoorAlert:'off'}),'off: not read');assert.strictEqual(settings({hudDoorAlert:'x'}).hudDoorAlert,'on');
// install time: added when the car's catalog has it
const m=filterTraffic({proxies:{}},{interfaces:{'de.bmw.body.DoorsWindowsRoofMirrors':{fields:{CentralLockingSystemAndPanelStatus:{notifier:{id:32800}}}}},instanceIDs:{'de.bmw.body.DoorsWindowsRoofMirrors':{'1':1}}}).proxies;
assert.deepStrictEqual(m['de.bmw.body.DoorsWindowsRoofMirrors'],{instances:'1',attributes:{CentralLockingSystemAndPanelStatus:'s'}});
// an open door: the cluster gives way to the car's own warning; the HUD is not affected
{const {Outputs}=require('../../apps/cluster_redline/outputs'),{EventEmitter}=require('events');
 class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
 const p=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
 const out=new Outputs(new C(),p(1088,480),Object.assign(p(800,480),{fullTarget:true})),cfg={allClusterOutput:'redline',allHudOutput:'redline'};
 const t=at=>{out.policy.modeSample(4,at-1);out.policy.rpmSample(2000,at);return out.tick(at,cfg).outputs;};
 assert(t(1000).cluster.requested,'doors closed: the cluster shows');
 out.doorYield=true;let o=t(1200);assert(!o.cluster.requested,'a door open: the cluster gives way');assert.strictEqual(o.cluster.reason,'door_yield');assert(o.hud.requested,'the HUD stays');
 out.doorYield=false;assert(t(1400).cluster.requested,'closed again: back');out.close();}
if(process.argv[2]){const pg=path.join(path.resolve(process.argv[2]),'source/javascript'),{SettingsPage}=require(pg+'/settings-ui'),{Canvas}=require(pg+'/kit/canvas'),spec=require(pg+'/kit/app-spec.json'),vals={};spec.settings.forEach(x=>{vals[x.key]=x.default;});
 const page=new SettingsPage({schema:spec.settings,get:k=>vals[k],set:(k,v)=>{vals[k]=v;},onChange(){}},()=>{},'t');page.selectTab(0);page.focus=page.keys().indexOf('hudDoorAlert');page.activate();assert.strictEqual(page.open,'door');
 const scr=()=>{const cv=new Canvas(1600,520);page.draw(cv,'',{});return cv.targets;};scr().find(t=>t.id==='door-off').run();assert.strictEqual(vals.hudDoorAlert,'off');scr().find(t=>t.id==='door-on').run();
 scr().find(t=>t.id==='door-layout').run();assert.strictEqual(page.open,'layout');assert(/^hud:Door@/.test(vals.layoutPreview));page.adjust(0,1);page.adjust(2,1);assert.deepStrictEqual([vals.hudDoorOffsetX,vals.hudDoorScale],[10,80]);
 page.back();assert.strictEqual(page.open,'door');assert.strictEqual(vals.layoutPreview,'');}
if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),R=require(path.join(dir,'door-alert'));const red=cv=>{let k=0;for(let i=0;i<cv.d.length;i+=4)if(cv.d[i]>200&&cv.d[i+1]<80&&cv.d[i+3]>200)k++;return k;};
 assert.strictEqual(red(R.draw([])),0,'all closed: no red');assert(red(R.draw(['driverFront']))>20,'an open door in red');const one=red(R.draw(['driverFront'])),two=red(R.draw(['driverFront','passengerRear'])),four=red(R.draw(['driverFront','passengerFront','driverRear','passengerRear']));assert(two>one&&four>two,'each open door adds its own red door');}
console.log('PASS: door-open warning: centred by default, Position / size (move, size, hide, preview), the cluster gives way while a door is open, door switches decoded, overlay while open (re-drawn on change), on by default, demand and install-time input'+(process.argv[2]?', drawn':''));
