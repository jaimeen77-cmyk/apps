'use strict';
// redline-lead 0.3.0: every object the front camera measures (ObjectRecognition + ObjectPosition of one instant),
// nearest first; the car followed as before (vehicles in our lane only).
const assert=require('assert');
const L=require('../../native/redline-lead/redline-lead');
// ObjectRecognition: 24 bytes (n at [23]), then 20 x {status, movement, type, lateral, tube, id, ref}
function rec(objs,ts){const b=Buffer.alloc(24+20*7);b.writeUInt32BE(ts,12);b.writeUInt32BE(5,16);b[21]=0;b[23]=objs.length;objs.forEach((o,i)=>{const p=24+i*7;b[p]=o.status;b[p+1]=1;b[p+2]=o.type;b[p+3]=0;b[p+4]=o.tube;b[p+5]=o.id;b[p+6]=0;});return b;}
// ObjectPosition: n at [22], then 20 x {flags u8, x f32, y f32} from 23
function pos(objs,ts){const b=Buffer.alloc(23+20*9);b.writeUInt32BE(ts,12);b.writeUInt32BE(5,16);b[21]=0;b[22]=objs.length;objs.forEach((o,i)=>{const p=23+i*9;b[p]=o.flags||0;b.writeFloatBE(o.x,p+1);b.writeFloatBE(o.y,p+5);});return b;}
const objs=[{id:4,status:1,type:0,tube:1,x:14.2,y:0.3},{id:5,status:1,type:3,tube:1,x:22,y:-0.1},{id:6,status:1,type:1,tube:4,x:9.5,y:-2.6},{id:7,status:5,type:3,tube:2,x:30,y:3.4},{id:8,status:1,type:4,tube:2,x:40,y:3.5,flags:1}];
const r=L.decodeRecognition(rec(objs,77)),p=L.decodePosition(pos(objs,77)),all=L.objectsOf(r,p);
assert.deepStrictEqual(all.map(o=>[o.id,o.type,o.tube]),[[6,1,4],[4,0,1],[5,3,1]],'measured ones with a place, nearest first (not the unmeasured, not an invalid place)');
assert.strictEqual(all[1].x,14.2);assert.strictEqual(all[1].y,0.3);
assert.strictEqual(L.leadOf(r,p).id,5,'the car followed: the nearest vehicle in our lane (the pedestrian is not one)');
assert.deepStrictEqual(L.objectsOf(r,L.decodePosition(pos(objs,78))),[],'two different instants: nothing');
console.log('PASS: redline-lead 0.3.0 objects: every measured object of one instant, nearest first; the car followed unchanged');
// 0.5.0: the nav-probe.log page: only an app's own nav-probe.log can be given; the scene clips (0.4.0) are gone
{const {ALLOWED,addresses,PORT}=require('../../native/redline-lead/share');assert.notStrictEqual(PORT,require('../../apps/cluster_redline/my-picture-source').PORT,'the nav-probe page must not take the GIF player port');
 assert(ALLOWED.test('/var/opt/public/oap/oap_12211/data/nav-probe.log'));
 ['/etc/shadow','/var/opt/public/oap/oap_12211/data/../../../../etc/shadow','/var/opt/public/oap/oap_1/data/other.log','/var/opt/public/redline-clips/001.jsonl'].forEach(f=>assert(!ALLOWED.test(f),f));
 assert(Array.isArray(addresses()));
 assert.throws(()=>require('../../native/redline-lead/clips'),'clips.js removed');}
console.log('PASS: redline-lead 0.5.0: the nav-probe.log page gives that one file only; no scene clips');
// 0.6.0: the car's position (Positioning 0xFB0C instance 128): the Wgs84Coordinate3D found inside a longer message
{const L=require('../../native/redline-lead/redline-lead.js');
 assert.strictEqual(L.VERSION,'0.6.0');assert.deepStrictEqual(L.POS_SPECS,['0xfb0c:128:4:1:0x8001:f','0xfb0c:128:4:4:0x8004:f']);
 const mk=(pre,lat,lon)=>{const b=Buffer.alloc(pre+26);for(let i=0;i<pre;i++)b[i]=(i*37+11)&255;b[pre]=1;b[pre+1]=1;b.writeDoubleBE(lon,pre+2);b.writeDoubleBE(lat,pre+10);return b;};
 const w=L.decodeWgs(mk(120,37.5665,126.978));assert(w&&w.lat===37.5665&&w.lon===126.978&&w.valid&&w.endian==='be'&&w.off===120,JSON.stringify(w));
 assert.strictEqual(L.decodeWgs(Buffer.alloc(326)),null,'all zero: no position');assert.strictEqual(L.decodeWgs(Buffer.alloc(10)),null);
 let n=0,seed=7;for(let t=0;t<300;t++){const b=Buffer.alloc(326);for(let i=0;i<b.length;i++){seed=(seed*1103515245+12345)&0x7fffffff;b[i]=seed>>16&255;}if(L.decodeWgs(b))n++;}
 assert(n<=1,'random bytes read as a position '+n+' times');}
console.log('PASS: redline-lead 0.6.0: the position found inside Positioning\'s messages, none in empty or random bytes');
