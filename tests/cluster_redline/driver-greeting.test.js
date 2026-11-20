'use strict';
// The driver greeting: a recognised driver (start or change) is greeted on the HUD for 3 s, with their name when
// known (cached, or read within the wait), plainly otherwise; it waits for the HUD, at most a minute.
// Optional argument: a built stage (dist/cluster_redline) to draw it.
const assert=require('assert'),path=require('path');
const G=require('../../apps/cluster_redline/driver-greeting');
const {DriverProfiles,IFACE,ACCOUNT}=require('../../apps/cluster_redline/driver-profiles');
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
(async()=>{
 // timing: waits for the HUD, shows 3 s, given up after a minute
 G.reset();G.greet('홍길동',0);assert.strictEqual(G.read(false,1000),null,'HUD not ready: waits');
 assert.deepStrictEqual(G.read(true,2000),{name:'홍길동'});assert.deepStrictEqual(G.read(true,4900),{name:'홍길동'});assert.strictEqual(G.read(true,5000),null,'3 s');
 G.greet(null,0);assert.strictEqual(G.read(false,G.WAIT_MS+1),null);assert.strictEqual(G.read(true,G.WAIT_MS+2),null,'no HUD within a minute: dropped');
 // the driver profiles say hello: cached name at once, a new name once read, plainly when none
 const said=[];const values={driverProfiles:'on',hudDesign:'own'},L=[];
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},onChange:f=>L.push(f)};
 const files={'/p':JSON.stringify({profiles:{A:{hudDesign:'own'}},order:['A'],names:{A:'홍길동'}})},fs={readFileSync:f=>{if(!(f in files))throw new Error('x');return files[f];},writeFileSync:(f,d)=>{files[f]=d;}};
 let feed=null;const nameFor={B:'김철수'};
 const signals={hasNative:()=>true,watch:(i,inst,h)=>{if(i===IFACE)feed=h.currentUserAccountReference;if(i===ACCOUNT&&nameFor[inst])setTimeout(()=>h.name(nameFor[inst]),0);return Promise.resolve({available:true,shutdown(){}});}};
 const p=new DriverProfiles({settings,signals,fs,file:'/p',keys:()=>['hudDesign'],greet:n=>said.push(n)});await settle();
 feed('A');assert.deepStrictEqual(said,['홍길동'],'known driver: greeted at once by name');
 feed('A');assert.strictEqual(said.length,1,'the same driver: once');
 feed('B');await settle();await new Promise(r=>setTimeout(r,5));assert.deepStrictEqual(said,['홍길동','김철수'],'new driver: greeted once the name is read');
 feed('C');await settle();p.dropName(true);p.hello('C');assert.deepStrictEqual(said[2],null,'no name: a plain hello');p.stop();
 if(process.argv[2]){
  const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),O=require(path.join(dir,'greeting-overlay'));
  assert.strictEqual(O.text('홍길동'),'홍길동님 안녕하세요');assert.strictEqual(O.text(null),'안녕하세요');
  const cv=O.draw('홍길동');let n=0;for(let i=3;i<cv.d.length;i+=4)if(cv.d[i])n++;assert(n>500,'drawn');
  const layers=new Map();let k=0,up=0;const client={image(o){layers.set(++k,Object.assign({},o));return k;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
  const ov=new O.GreetingOverlay(client);ov.tick({name:'홍길동'});const l=layers.get(1);assert(l.klass==='overlay'&&l.target==='hud'&&l.visible);
  ov.tick({name:'홍길동'});assert.strictEqual(up,1,'drawn once');ov.tick(null);assert.strictEqual(l.visible,false);ov.close();
 }
 console.log('PASS: driver greeting: waits for the HUD, 3 s, a minute at most; cached name at once, new name once read, plain hello without one'+(process.argv[2]?', drawn overlay':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
