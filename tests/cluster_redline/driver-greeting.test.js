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
 // a door opened: the head unit wakes, the key's driver replaces the account it woke with; greeted at the engine start
 G.reset();G.setEnabled(true);G.engine(0,true,0);G.driver('게스트',false,0);G.driver('홍길동',true,2000);assert.strictEqual(G.read(true,2100),null,'driver change with the engine off: no greeting yet');
 G.engine(900,true,30000);assert.deepStrictEqual(G.read(true,30100),{name:'홍길동'},'then at the engine start');
 // the engine before the driver: waits for the name (up to 15 s), then a plain hello if none
 G.reset();G.setEnabled(true);G.engine(900,true,0);assert.strictEqual(G.read(true,1000),null,'engine first: waits for the driver');
 G.driver('홍길동',false,3000);assert.deepStrictEqual(G.read(true,3100),{name:'홍길동'},'then greeted by name');
 G.reset();G.setEnabled(true);G.engine(900,true,0);assert.strictEqual(G.read(true,G.NAME_WAIT_MS-1),null);assert.deepStrictEqual(G.read(true,G.NAME_WAIT_MS),{name:null},'no driver within 15 s: plain hello');
 G.reset();G.setEnabled(true);G.engine(900,true,0);assert.strictEqual(G.read(false,G.WAIT_MS+1),null);assert.strictEqual(G.read(true,G.WAIT_MS+2),null,'no display within 3 minutes: dropped');assert.strictEqual(G.status().last.what,'not_ready');
 assert.strictEqual(G.WAIT_MS,180000);
 // a short stop with a door opened (out and in again): greeted; without (auto start-stop): not, and said so
 G.reset();G.setEnabled(true);G.driver('홍길동',false,0);G.engine(900,true,1000);assert.deepStrictEqual(G.read(true,1100),{name:'홍길동'});assert.strictEqual(G.status().last.what,'shown');
 G.engine(0,true,30000);G.door(true);G.door(false);G.engine(900,true,60000);assert.deepStrictEqual(G.read(true,60100),{name:'홍길동'},'door opened while off: greeted after a short stop');
 G.engine(0,true,90000);G.engine(900,true,100000);assert.strictEqual(G.read(true,100100),null);assert.strictEqual(G.status().last.what,'shown','auto start-stop at the lights: not greeted, not noted');
 G.engine(0,true,110000);G.engine(900,true,200000);assert.strictEqual(G.read(true,200100),null);assert.strictEqual(G.status().last.what,'restart','a 1.5 min stop without a door: noted, not greeted');
 G.door(true);G.engine(900,true,100200);assert.strictEqual(G.read(true,100300),null,'a door opened while running does not count');
 assert.strictEqual(G.SHOW_MS,5000,'5 s');
 // the goodbye: the engine switched off in P (or P within 5 s): 10 s; an auto start-stop stop in D: none
 G.reset();G.setEnabled(true);G.driver('홍길동',false,0);G.engine(900,true,1000,'D');G.read(true,1100);G.read(true,1100+G.SHOW_MS);
 G.engine(0,true,200000,'D');assert.strictEqual(G.read(true,200100),null,'stopped in D (auto start-stop): no goodbye');
 G.engine(0,true,203000,'P');assert.deepStrictEqual(G.read(true,203100),{name:'홍길동',bye:true},'put in P within 5 s: goodbye');assert.strictEqual(G.read(true,203100+G.SHOW_MS),null);assert.strictEqual(G.status().last.what,'bye');
 G.engine(900,true,500000,'P');G.read(true,500100);G.read(true,500100+G.SHOW_MS);
 G.engine(0,true,600000,'D');G.engine(0,true,600000+G.PARK_MS+1,'P');assert.strictEqual(G.read(true,606000),null,'P long after the stop: no goodbye');
 G.engine(900,true,700000,'P');G.read(true,700100);G.read(true,700100+G.SHOW_MS);G.engine(0,true,800000,'P');assert.strictEqual(G.read(false,800000+G.BYE_WAIT_MS+1),null);assert.strictEqual(G.status().last.what,'bye_not_ready','display gone: dropped');
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
 // while the greeting shows, the Redline HUD face steps aside (the cluster does not)
 {const {Outputs}=require('../../apps/cluster_redline/outputs'),{EventEmitter}=require('events');
  class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(){return ++this.n;}pixels(){}showWhenSent(){}set(){}drop(){}close(){}}
  const pt=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
  const out=new Outputs(new C(),pt(1088,480),Object.assign(pt(800,480),{fullTarget:true})),cfg={allClusterOutput:'redline',allHudOutput:'redline'};
  const t=at=>{out.policy.modeSample(4,at-1);out.policy.rpmSample(2000,at);return out.tick(at,cfg).outputs;};
  assert(t(1000).hud.requested);out.greetingHold=true;let o=t(1200);assert(!o.hud.requested,'greeting: the HUD face steps aside');assert.strictEqual(o.hud.reason,'greeting');assert(!o.cluster.requested,'the cluster face too (its own greeting)');assert.strictEqual(o.cluster.reason,'greeting');
  out.greetingHold=false;assert(t(1400).hud.requested,'back after the greeting');out.close();}
 if(process.argv[2]){
  const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),O=require(path.join(dir,'greeting-overlay'));
  assert.strictEqual(O.text('홍길동'),'홍길동님 안녕하세요');
  assert(O.Y>=100&&O.Y+O.H<=239,'in the upper half of what the driver sees (y 100..378)');assert(O.X+O.W/2===400);assert.strictEqual(O.text(null),'안녕하세요');
  const cv=O.draw('홍길동');let n=0;for(let i=3;i<cv.d.length;i+=4)if(cv.d[i])n++;assert(n>500,'drawn');
  const layers=new Map();let k=0,up=0;const client={image(o){layers.set(++k,Object.assign({},o));return k;},pixels(){up++;},set(r,o){Object.assign(layers.get(r),o);},drop(r){layers.delete(r);}};
  const ov=new O.GreetingOverlay(client);ov.tick({name:'홍길동'});const l=layers.get(1);assert(l.klass==='overlay'&&l.target==='hud'&&l.visible);
  ov.tick({name:'홍길동'});assert.strictEqual(up,1,'drawn once');ov.tick(null);assert.strictEqual(l.visible,false);ov.close();
  // the cluster: its own content layer in the middle of the centre display
  assert.strictEqual(O.text('홍길동',true),'홍길동님 안녕히 가세요');
  const oc=new O.GreetingOverlay(client,'map');oc.tick({name:'홍길동'});const c=layers.get(k);assert(c.target==='map'&&c.klass==='content'&&c.visible);assert.strictEqual(c.x+c.w/2,544);
  assert.strictEqual(c.contend,true,'the cluster centre taken from the stock map while shown');oc.tick(null);assert.strictEqual(c.contend,false,'and handed back');assert.strictEqual(l.contend,undefined,'the HUD layer asks nothing');oc.close();
  const cc=O.drawCluster('홍길동');n=0;for(let i=3;i<cc.d.length;i+=4)if(cc.d[i])n++;assert(n>10000,'cluster card drawn');
 }
 console.log('PASS: driver greeting in the upper half of the seen HUD and on the cluster, both faces stepping aside meanwhile; a driver change with the engine off waits for the start; a short stop with a door opened greeted, the last outcome kept; 5 s; a goodbye when the engine is switched off in P; at engine start (not at auto start-stop restarts; a driver change at once; eDrive at recognition), waits for the driver 15 s and the HUD a minute, 3 s; cached name at once, new name once read, plain hello without one'+(process.argv[2]?', drawn overlay':''));
})().catch(e=>{console.error(e);process.exitCode=1;});
