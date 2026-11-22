'use strict';
// The blind spot warning: the door mirror lamps read from the BDC (22 D3 47 only, through the read-only link),
// every 300 ms while it is on and the engine runs; stale after 3 s; a refusal stops the reading; the signs under
// the turn arrows, amber for a car there, red with the turn signal towards it; the engine speed demanded for it.
const assert=require('assert'),path=require('path');
const {BlindSpot,parse,BDC,DID,POLL_MS,STALE_MS}=require('../../apps/cluster_redline/blind-spot');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
(async()=>{
 assert.deepStrictEqual(parse([0x62,0xD3,0x47,1,0]),{left:1,right:0});assert.deepStrictEqual(parse([0x62,0xD3,0x47,3,0xFF]),{left:2,right:0});
 assert.deepStrictEqual(parse([0x62,0xD3,0x47,0x0D,1]),{left:0,right:1},'a display fault: off');assert.strictEqual(parse([0x7F,0x22,0x31]),'refused');assert.strictEqual(parse([0x62,0xD3,0x48,1,1]),null);assert.strictEqual(parse(null),null);
 let reply=[0x62,0xD3,0x47,0,1];const asked=[];let woke=0,created=0;
 const link={ready:true,init(){return Promise.resolve(this);},wake(){woke++;},read(t,d,ms){asked.push([t,d]);return Promise.resolve(reply);}};
 const b=new BlindSpot({},null,()=>{created++;return link;});
 b.tick(0,false);assert.strictEqual(created,0,'off: no link');
 b.tick(0,true);await settle();assert.strictEqual(created,1);b.tick(10,true);await settle();
 assert.deepStrictEqual(asked,[[BDC,DID]],'only 22 D347 to the BDC');assert.deepStrictEqual(b.read(10),{left:0,right:1});
 b.tick(10+POLL_MS-1,true);await settle();assert.strictEqual(asked.length,1,'at most every 300 ms');b.tick(10+POLL_MS,true);await settle();assert.strictEqual(asked.length,2);
 reply=null;assert.deepStrictEqual(b.read(10+POLL_MS+STALE_MS-1),{left:0,right:1});assert.deepStrictEqual(b.read(10+POLL_MS+STALE_MS+1),{left:0,right:0},'stale after 3 s');
 b.tick(5000,false);assert.strictEqual(b.link,null,'engine off / switched off: link released');assert.deepStrictEqual(b.read(5000),{left:0,right:0});
 reply=[0x7F,0x22,0x31];b.tick(6000,true);await settle();b.tick(6400,true);await settle();const n=asked.length;b.tick(7000,true);await settle();assert.strictEqual(asked.length,n,'refused: not asked again');assert(b.status(7000).refused);
 // the read-only link itself refuses anything but reads (the kit's ReadOnlyDiag)
 // overlay: amber for a car, red towards the turn signal, hidden when clear (stub drawing)
 const Module=require('module'),orig=Module._load;Module._load=function(r){if(r==='./kit/canvas')return {Canvas:class{constructor(w,h){this.w=w;this.h=h;this.d=new Uint8Array(w*h*4);}clear(){}roundRect(){}arc(){}fill(){}}};return orig.apply(this,arguments);};
 const {BlindSpotOverlay,rect}=require('../../apps/cluster_redline/blind-spot-overlay'),{settings}=require('../../apps/cluster_redline/policy'),D=require('../../apps/cluster_redline/display-config');
 const layers=new Map();let k=0,up=0;const client={image(o){layers.set(++k,Object.assign({},o));return k;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
 const cfg=settings({hudTurnBlindSpot:'on'}),ov=new BlindSpotOverlay(client);
 ov.tick(cfg,{left:0,right:0},'off',false);assert.strictEqual(layers.size,0);
 ov.tick(cfg,{left:1,right:0},'off',false);assert.strictEqual(layers.size,1);const L=layers.get(1);assert(L.klass==='overlay'&&L.target==='hud'&&L.visible);
 const a=D.turnRect(cfg,'left');assert(L.y>=a.y+a.h,'under the left arrow');assert(Math.abs(L.x+L.w/2-(a.x+a.w/2))<=1,'centred on it');assert.strictEqual(ov.layers.left.color,'amber');
 ov.tick(cfg,{left:1,right:0},'left',false);assert.strictEqual(ov.layers.left.color,'red','turn signal towards it: red');assert.strictEqual(up,2);
 ov.tick(cfg,{left:2,right:0},'off',false);assert.strictEqual(ov.layers.left.color,'red','lamp flashing: red');
 ov.tick(cfg,{left:0,right:0},'off',false);assert.strictEqual(L.visible,false);
 ov.tick(cfg,null,'off',true);assert.strictEqual(layers.size,2,'preview: both');const R=rect(cfg,'right'),rb=D.turnRect(cfg,'right');assert(R.y>=rb.y+rb.h,'under the right arrow');assert(Math.abs(R.x+R.w/2-(rb.x+rb.w/2))<=1);ov.close();Module._load=orig;
 // the engine speed is demanded for it
 const {demand}=require('../../apps/cluster_redline/data-demand');const f=c=>Array.from(demand(settings(Object.assign({appEnabled:true,navDisplayMode:'stock',hudDoorAlert:'off'},c)),null).fields);
 assert(f({hudTurnBlindSpot:'on'}).includes('de.bmw.infotainment.vehicle.CDS.statusEngineSpeed2'));assert.strictEqual(settings({}).hudTurnBlindSpot,'off','off by default');
 if(process.argv[2]){const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),{ReadOnlyDiag}=require(dir+'/kit/readonly-diag');
  const r=new ReadOnlyDiag({},{warn(){},info(){}});assert.throws(()=>r.physical(0x40,0x2E,[0xD3,0x47,1,1]),'a write never leaves the head unit');
  const B=require(dir+'/blind-spot-overlay');let red=0,blue=0;const cv=B.draw(51,54,'right',B.RED);for(let i=0;i<cv.d.length;i+=4){if(cv.d[i]>200&&cv.d[i+1]<80&&cv.d[i+3]>200)red++;if(cv.d[i]<120&&cv.d[i+2]>200&&cv.d[i+3]>200)blue++;}assert(red>60,'the other car in the warning colour');assert(blue>red,'our car blue, larger');}
 console.log('PASS: blind spot warning: 22 D347 only (writes refused by the read-only link), 300 ms, stale 3 s, refusal stops, released when off; signs under the arrows (amber / red), engine speed demanded'+(process.argv[2]?', drawn':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
