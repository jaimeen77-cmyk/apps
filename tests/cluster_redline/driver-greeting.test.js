'use strict';
// The driver greeting: a recognised driver (start or change) is greeted on the HUD for 3 s, with their name when
// known (cached, or read within the wait), plainly otherwise; it waits for the HUD, at most a minute.
// Optional argument: a built stage (dist/cluster_redline) to draw it.
const assert=require('assert'),path=require('path');
const G=require('../../apps/cluster_redline/driver-greeting');
const {DriverProfiles,IFACE,ACCOUNT}=require('../../apps/cluster_redline/driver-profiles');
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
(async()=>{
 // engine start: greeted once the driver is known and the HUD is ready; auto start-stop restarts are not greeted
 const T=G.RESTART_MS;
 G.reset();G.setEnabled(true);G.engine(0,true,0);G.driver('홍길동',false,1000);assert.strictEqual(G.read(true,1100),null,'recognised at app start: no greeting yet (engine off)');
 G.engine(800,true,5000);assert.strictEqual(G.read(false,5100),null,'HUD not ready: waits');
 assert.deepStrictEqual(G.read(true,6000),{name:'홍길동'},'engine started: greeted by name');assert.strictEqual(G.read(true,6000+G.SHOW_MS),null,'3 s');
 G.engine(0,true,60000);G.engine(900,true,90000);assert.strictEqual(G.read(true,90100),null,'auto start-stop (30 s stop): not greeted');
 G.engine(0,true,100000);G.engine(900,true,100000+T);assert.deepStrictEqual(G.read(true,100000+T+10),{name:'홍길동'},'engine off 3 min or more: greeted again');
 G.driver('김철수',true,500000);assert.deepStrictEqual(G.read(true,500100),{name:'김철수'},'a driver change while running: greeted at once');
 // the engine before the driver: waits for the name (up to 15 s), then a plain hello if none
 G.reset();G.setEnabled(true);G.engine(900,true,0);assert.strictEqual(G.read(true,1000),null,'engine first: waits for the driver');
 G.driver('홍길동',false,3000);assert.deepStrictEqual(G.read(true,3100),{name:'홍길동'},'then greeted by name');
 G.reset();G.setEnabled(true);G.engine(900,true,0);assert.strictEqual(G.read(true,G.NAME_WAIT_MS-1),null);assert.deepStrictEqual(G.read(true,G.NAME_WAIT_MS),{name:null},'no driver within 15 s: plain hello');
 G.reset();G.setEnabled(true);G.engine(900,true,0);assert.strictEqual(G.read(false,G.WAIT_MS+1),null);assert.strictEqual(G.read(true,G.WAIT_MS+2),null,'no HUD within a minute: dropped');
 G.reset();G.engine(900,true,0);G.driver('홍길동',false,10);assert.strictEqual(G.read(true,20000),null,'settings per driver off: no greeting');assert.strictEqual(G.wantsEngine(),false);
 // eDrive: the driver's recognition at the start is the start
 G.reset();G.setEnabled(true);G.setHybrid(true);G.driver('홍길동',false,0);assert.deepStrictEqual(G.read(true,10),{name:'홍길동'},'eDrive: greeted when recognised');assert.strictEqual(G.wantsEngine(),false);
 G.reset();
 // the driver profiles say hello: cached name at once, a new name once read, plainly when none
 const said=[];const values={driverProfiles:'on',hudDesign:'own'},L=[];
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;L.forEach(f=>f(k,v));},onChange:f=>L.push(f)};
 const files={'/p':JSON.stringify({profiles:{A:{hudDesign:'own'}},order:['A'],names:{A:'홍길동'}})},fs={readFileSync:f=>{if(!(f in files))throw new Error('x');return files[f];},writeFileSync:(f,d)=>{files[f]=d;}};
 let feed=null;const nameFor={B:'김철수'};
 const signals={hasNative:()=>true,watch:(i,inst,h)=>{if(i===IFACE)feed=h.currentUserAccountReference;if(i===ACCOUNT&&nameFor[inst])setTimeout(()=>h.name(nameFor[inst]),0);return Promise.resolve({available:true,shutdown(){}});}};
 const p=new DriverProfiles({settings,signals,fs,file:'/p',keys:()=>['hudDesign'],greet:(n,change)=>said.push(change?'change:'+n:n)});await settle();
 feed('A');assert.deepStrictEqual(said,['홍길동'],'known driver: greeted at once by name');
 feed('A');assert.strictEqual(said.length,1,'the same driver: once');
 feed('B');await settle();await new Promise(r=>setTimeout(r,5));assert.deepStrictEqual(said,['홍길동','change:김철수'],'new driver: said once the name is read, as a change');
 feed('C');await settle();p.dropName(true);p.hello('C');assert.deepStrictEqual(said[2],'change:null','no name: a plain hello');p.stop();
 if(process.argv[2]){
  const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),O=require(path.join(dir,'greeting-overlay'));
  assert.strictEqual(O.text('홍길동'),'홍길동님 안녕하세요');assert.strictEqual(O.text(null),'안녕하세요');
  const cv=O.draw('홍길동');let n=0;for(let i=3;i<cv.d.length;i+=4)if(cv.d[i])n++;assert(n>500,'drawn');
  const layers=new Map();let k=0,up=0;const client={image(o){layers.set(++k,Object.assign({},o));return k;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
  const ov=new O.GreetingOverlay(client);ov.tick({name:'홍길동'});const l=layers.get(1);assert(l.klass==='overlay'&&l.target==='hud'&&l.visible);
  ov.tick({name:'홍길동'});assert.strictEqual(up,1,'drawn once');ov.tick(null);assert.strictEqual(l.visible,false);ov.close();
 }
 console.log('PASS: driver greeting at engine start (not at auto start-stop restarts; a driver change at once; eDrive at recognition), waits for the driver 15 s and the HUD a minute, 3 s; cached name at once, new name once read, plain hello without one'+(process.argv[2]?', drawn overlay':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
