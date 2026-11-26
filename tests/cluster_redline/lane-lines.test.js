'use strict';
// Lane lines on the HUD (1.3.77): the helper's LaneBoundaries decode (0xD024, 1193 bytes), the car's own lane lines,
// the near / over / lane-change levels, the overlay above the headway badge, the settings screen.
const assert=require('assert'),path=require('path');
const Module=require('module'),orig=Module._load;let lineCalls=0;Module._load=function(n){if(n==='./kit/canvas'){class C{constructor(w,h){this.w=w;this.h=h;this.d=new Uint8Array(w*h*4);}}return {ScaledCanvas:class{constructor(w,h,k){this.canvas=new C(Math.round(w*k),Math.round(h*k));}clear(){}roundRect(){}line(){lineCalls++;}}};}return orig.apply(this,arguments);};
const {decodeLanes,SPECS}=require('../../native/redline-lead/redline-lead');
const {LaneLines,LaneOverlay,egoLines,levelOf,draw}=require('../../apps/cluster_redline/lane-lines');
const D=require('../../apps/cluster_redline/display-config'),{settings}=require('../../apps/cluster_redline/policy');
// a LaneBoundaries payload: the ego lane 3.4 m wide, the left line 1.7 m left (dashed white), the right 1.7 m right (solid yellow)
const b=Buffer.alloc(1193);b.writeFloatBE(3.4,19);b[24]=2;
const put=(i,y,type,color,model)=>{const o=25+i*53,q=237+i*34;b[o+1]=1;b.writeFloatBE(0.9,o+2);b[o+14]=model||0;b.writeFloatBE(0,o+16);b.writeFloatBE(y,o+20);b.writeFloatBE(80,o+38);b[o+51]=i+1;b[q+6]=type;b[q+33]=color;};
put(0,1.7,1,1);put(1,-1.7,2,2);put(2,5.1,4,1);put(3,0,0,0,3);   // the 4th: model 3 (not available)
const d=decodeLanes(b);
assert(SPECS.indexOf('0xd024:1:1:3:0x8003')>=0,'subscribed');
assert.strictEqual(d.width,3.4);assert.strictEqual(d.visibility,2);assert.strictEqual(d.lines.length,3,'the unavailable one left out');
assert.deepStrictEqual(d.lines.map(l=>[l.y,l.type,l.color]),[[1.7,1,1],[-1.7,2,2],[5.1,4,1]]);
assert.strictEqual(decodeLanes(Buffer.alloc(100)),null,'too short');
const e=egoLines(d);
assert.deepStrictEqual(e.left,{y:1.7,slope:0,type:'dashed',color:'white',margin:0.75});
assert.deepStrictEqual(e.right,{y:-1.7,slope:0,type:'solid',color:'yellow',margin:0.75});
assert.strictEqual(e.width,3.4);
assert.deepStrictEqual([levelOf({margin:0.5}),levelOf({margin:0.1}),levelOf({margin:-0.1}),levelOf({margin:-0.1},true),levelOf({margin:0.5},true),levelOf(null)],['ok','near','over','change','ok',null]);
// the user's captures (2026-11-26, parked): in the lane, then turned slightly right. y back at the car along the line's heading.
const fx=(n)=>decodeLanes(Buffer.from(require('fs').readFileSync(path.join(__dirname,'fixtures/lanes-'+n+'.hex'),'utf8').trim(),'hex'));
{const c=egoLines(fx('center')),n=egoLines(fx('ncenter'));
 assert.strictEqual(c.width,3.04);assert.deepStrictEqual([c.left.y,c.left.type,c.right.y,c.right.type],[1.56,'double',-1.19,'dashed']);
 assert.deepStrictEqual([levelOf(c.left),levelOf(c.right)],['ok','ok'],'in the lane: no warning');
 assert(n.left.slope>0.05&&n.right.slope>0.05,'turned right: both lines run to the left ahead');
 assert.deepStrictEqual([n.left.y,n.right.y],[2.15,-0.82]);assert.deepStrictEqual([levelOf(n.left),levelOf(n.right),levelOf(n.right,true)],['ok','over','change']);}
// LaneLines through a fake helper socket
const {EventEmitter}=require('events');let sock=null,t=0;
const L=new LaneLines(()=>t,()=>{sock=new EventEmitter();sock.destroy=()=>{};return sock;});
L.sync(true);sock.emit('connect');
const msg=(lane)=>sock.emit('data',JSON.stringify({t:'lead',at:10000,lane})+'\n');
msg({rx:5,data:d,at:9900});let r=L.read(0,'off');
assert(r&&r.left.y===1.7&&r.levels.left==='ok'&&r.levels.right==='ok');
// drifting right: the right line 1.0 m away (margin 0.05): near; the turn signal right: a lane change
const d2=JSON.parse(JSON.stringify(d));d2.lines[1].y=-1.0;msg({rx:6,data:d2,at:10000});
assert.strictEqual(L.read(0,'off').levels.right,'near');assert.strictEqual(L.read(0,'right').levels.right,'change');assert.strictEqual(L.read(0,'left').levels.right,'near');
assert.strictEqual(L.read(1300,'off'),null,'stale');
msg({rx:7,data:d2,at:5000});t=2000;assert.strictEqual(L.read(2000,'off'),null,'an old lane list (helper at - lane at) is not taken');
assert.strictEqual(L.status(0).rx,7);assert.strictEqual(L.status(0).helper,'connected');
L.sync(false);assert.strictEqual(L.read(0,'off'),null);assert.strictEqual(L.status(0).helper,'off');
// the picture and the overlay
const im=draw({left:e.left,right:e.right,levels:{left:'ok',right:'over'}},112,56);assert(im.w>=112&&im.h>=56);assert(lineCalls>=5,'dashed left, solid right');
const layers=new Map();let k=0,up=0;const client={image(o){layers.set(++k,Object.assign({},o));return k;},pixels(){up++;},set(ref,o){Object.assign(layers.get(ref),o);},drop(ref){layers.delete(ref);}};
const cfg=settings(Object.assign({},D.defaults,{hudLaneLines:'on'})),O=new LaneOverlay(client);
const rect=D.laneRect(cfg),hw=D.headwayRect(cfg);assert(rect.y+rect.h<=hw.y,'above the headway badge');assert(rect.w===112&&rect.h===56);
assert.strictEqual(O.tick(null,cfg,false),false);assert.strictEqual(layers.size,0);
assert.strictEqual(O.tick(Object.assign({},e,{levels:{left:'ok',right:'ok'}}),cfg,false),true);
const l=layers.get(1);assert.strictEqual(l.target,'hud');assert.strictEqual(l.visible,true);assert.strictEqual(up,1);
O.tick(Object.assign({},e,{levels:{left:'ok',right:'ok'}}),cfg,false);assert.strictEqual(up,1,'the same picture: not drawn again');
O.tick(null,cfg,false);assert.strictEqual(l.visible,false,'nothing seen: hidden');
const off=settings(Object.assign({},D.defaults));assert.strictEqual(off.hudLaneLines,'off','off by default');
assert.strictEqual(O.tick(e,off,false),false);assert.strictEqual(O.tick(null,off,true),true,'the preview shows a sample');
O.close();assert.strictEqual(layers.size,0);
// the real canvas of a built package: the picture has pixels
if(process.argv[2]){Module._load=orig;const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),X=require(path.join(dir,'lane-lines'));
 const p=X.draw({left:e.left,right:e.right,levels:{left:'near',right:'ok'}},112,56);let lit=0;for(let i=3;i<p.d.length;i+=4)if(p.d[i])lit++;assert(lit>200,'drawn '+lit);}
console.log('lane-lines ok');
