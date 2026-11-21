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
const Module=require('module'),orig=Module._load;Module._load=function(r){if(r==='./kit/canvas')return {Canvas:class{constructor(w,h){this.w=w;this.h=h;this.d=new Uint8Array(w*h*4);}clear(){}roundRect(){}line(){}}};return orig.apply(this,arguments);};
const layers=new Map();let n=0,up=0;const client={image(o){layers.set(++n,Object.assign({},o));return n;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
const ov=new D.DoorOverlay(client);ov.tick([]);assert.strictEqual(layers.size,0,'no door open: nothing');
ov.tick(['driverFront']);const l=layers.get(1);assert(l.target==='hud'&&l.klass==='overlay'&&l.visible);assert.strictEqual(up,1);
ov.tick(['driverFront']);assert.strictEqual(up,1,'unchanged: no pixels');ov.tick(['driverFront','passengerRear']);assert.strictEqual(up,2);
ov.tick([]);assert.strictEqual(l.visible,false,'closed: hidden');ov.close();Module._load=orig;
// demand and settings
const has=c=>Array.from(demand(settings(Object.assign({appEnabled:true,navDisplayMode:'stock'},c)),null).fields).includes('de.bmw.body.DoorsWindowsRoofMirrors.CentralLockingSystemAndPanelStatus');
assert(has({}),'on by default');assert(!has({hudDoorAlert:'off'}),'off: not read');assert.strictEqual(settings({hudDoorAlert:'x'}).hudDoorAlert,'on');
// install time: added when the car's catalog has it
const m=filterTraffic({proxies:{}},{interfaces:{'de.bmw.body.DoorsWindowsRoofMirrors':{fields:{CentralLockingSystemAndPanelStatus:{notifier:{id:32800}}}}},instanceIDs:{'de.bmw.body.DoorsWindowsRoofMirrors':{'1':1}}}).proxies;
assert.deepStrictEqual(m['de.bmw.body.DoorsWindowsRoofMirrors'],{instances:'1',attributes:{CentralLockingSystemAndPanelStatus:'s'}});
if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),R=require(path.join(dir,'door-alert'));const red=cv=>{let k=0;for(let i=0;i<cv.d.length;i+=4)if(cv.d[i]>200&&cv.d[i+1]<80&&cv.d[i+3]>200)k++;return k;};
 assert.strictEqual(red(R.draw([])),0,'all closed: no red');assert(red(R.draw(['driverFront']))>20,'an open door in red');assert(red(R.draw(['driverFront','passengerFront','driverRear','passengerRear']))>red(R.draw(['driverFront']))*3);}
console.log('PASS: door-open warning: door switches decoded, overlay while open (re-drawn on change), on by default, demand and install-time input'+(process.argv[2]?', drawn':''));
