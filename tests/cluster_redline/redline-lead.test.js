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
// 0.4.0 scene clips: kept only while on; a pedestrian on our path, a car beside coming in, the button; 20 s before,
// 10 s after; the oldest go past the limits
{const {Clips}=require('../../native/redline-lead/clips');const mem={};
 const fsx={mkdirSync(){},writeFileSync(p,b){mem[p]=String(b);},readFileSync(p){if(!(p in mem))throw new Error('none');return mem[p];},readdirSync(){return Object.keys(mem).map(p=>p.split('/').pop());},statSync(p){return {size:(mem['/c/'+p.split('/').pop()]||'').length};},unlinkSync(p){delete mem[p];}};
 const c=new Clips({dir:'/c',fs:fsx});
 const clipsIn=()=>Object.keys(mem).filter(n=>/\.jsonl$/.test(n));
 for(let t=0;t<5000;t+=100)c.frame({objects:[{id:1,type:0,x:10,y:0.2,tube:1}]},null,t);assert.strictEqual(clipsIn().length,0,'off: nothing kept');
 c.set(true);c.vehicle(30,'D');
 for(let t=0;t<40000;t+=50)c.frame({objects:t>25000?[{id:1,type:0,x:12,y:0.5,tube:1}]:[{id:1,type:0,x:12,y:6,tube:0}]},null,t);
 let names=clipsIn();assert.strictEqual(names.length,1,'one clip');assert(/\/001-\d{4}-\d{4}-보행자자전거\.jsonl$/.test(names[0]),'numbered, its scene in Korean '+names[0]);
 const lines=mem[names[0]].trim().split('\n'),head=JSON.parse(lines[0]),frames=lines.slice(1).map(JSON.parse);
 assert.strictEqual(head.why,'vru');assert(frames[0].t<=-19000&&frames[frames.length-1].t>=9000,'20 s before, 10 s after');assert.strictEqual(frames[0].v,30);
 // a car in the next lane, coming 0.9 m nearer in a second
 const c2=new Clips({dir:'/c',fs:fsx});c2.set(true);
 for(let t=100000;t<130000;t+=50){const y=t<110000?3.3:Math.max(0.2,3.3-(t-110000)/1000*0.9);c2.frame({objects:[{id:9,type:3,x:15,y,tube:t<112000?2:1}]},null,t);}
 assert(clipsIn().some(n=>/\/002-.*끼어들기/.test(n)),'a cut-in kept, the next number '+clipsIn());
 // the button: its own clip; a second scene meanwhile joins it
 const c3=new Clips({dir:'/c',fs:fsx});c3.set(true);for(let t=200000;t<217000;t+=100){if(t===205000)c3.save('button',t);if(t===206000)c3.save('departure',t);c3.frame({objects:[]},null,t);}
 assert(clipsIn().some(n=>/\/003-.*직접저장\+앞차출발/.test(n)),'button and departure in one clip '+clipsIn());
 c3.clear();assert.strictEqual(clipsIn().length,0,'all deleted');c3.save('button',300000);for(let t=290000;t<311000;t+=100)c3.frame({objects:[]},null,t);assert(clipsIn().some(n=>/\/004-/.test(n)),'the numbering goes on after a clear '+clipsIn());
 c3.set(false);assert.strictEqual(c3.save('button'),false,'off: no save');}
console.log('PASS: redline-lead 0.4.0 scene clips: off keeps nothing, pedestrian, cut-in, button + departure, 20 s before / 10 s after, numbered in order through a clear');
