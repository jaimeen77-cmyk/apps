'use strict';
// Settings per driver: off reads nothing; on, the head unit's user account picks whose settings are in use; a change
// is kept for the driver at the time; a new driver keeps the current settings; car settings are shared.
const assert=require('assert');
const {DriverProfiles,IFACE,FIELD,ACCOUNT,idOf,nameOf}=require('../../apps/cluster_redline/driver-profiles');
const settle=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
(async()=>{
 const values={driverProfiles:'off',hudDesign:'own',navColor:'blue',engineProfile:'petrol',autoStart:true},listeners=[];let writes=0;
 const settings={get:k=>values[k],set:(k,v)=>{values[k]=v;listeners.forEach(f=>f(k,v));},setMany:c=>{writes++;Object.keys(c).forEach(k=>{values[k]=c[k];listeners.forEach(f=>f(k,c[k]));});},onChange:f=>listeners.push(f)};
 const files={};const fs={readFileSync:f=>{if(!(f in files))throw new Error('ENOENT');return files[f];},writeFileSync:(f,d)=>{files[f]=d;}};
 let feed=null,watched=0,shut=0;const names={'acc-A':'홍길동'},asked=[];
 const signals={hasNative:()=>true,watch:(iface,inst,handlers,log,opts)=>{
  if(iface===ACCOUNT){asked.push(inst);setTimeout(()=>{if(names[inst])handlers.name(names[inst]);},0);return Promise.resolve({available:true,shutdown(){}});}
  watched++;assert.strictEqual(iface,IFACE);assert.strictEqual(inst,IFACE);assert.strictEqual(opts.pollMs,5000);feed=handlers[FIELD];return Promise.resolve({available:true,shutdown(){shut++;}});}};
 const wait=()=>new Promise(r=>setTimeout(r,5));
 const d=new DriverProfiles({settings,signals,fs,file:'/data/driver-profiles.json',keys:()=>['hudDesign','navColor','engineProfile','autoStart','driverProfiles']});
 await settle();assert.strictEqual(watched,0,'off: nothing read');assert.strictEqual(d.status().state,'off');
 settings.set('driverProfiles','on');await settle();assert.strictEqual(watched,1);assert.strictEqual(d.status().state,'waiting');
 feed({value:'acc-A'});await settle();await wait();
 assert.deepStrictEqual(asked,['acc-A'],'the name is asked on the account the reference names');
 assert.deepStrictEqual(d.status(),{state:'ready',driver:1,drivers:1,error:null,name:'홍길동',nameState:'ready'});
 settings.set('hudDesign','rl-ramp');settings.set('engineProfile','diesel');
 feed('acc-B');await settle();await wait();assert.strictEqual(d.status().driver,2,'a new driver');assert.strictEqual(d.status().name,null,'no name read: the number shows');assert.strictEqual(values.hudDesign,'rl-ramp','a new driver keeps what is set');
 settings.set('hudDesign','own');settings.set('navColor','orange');
 feed('acc-A');assert.strictEqual(values.hudDesign,'rl-ramp','driver A gets theirs back');assert.strictEqual(values.navColor,'blue');
 assert.strictEqual(values.engineProfile,'diesel','the vehicle preset belongs to the car');
 feed('acc-A');const w=writes;feed('acc-A');assert.strictEqual(writes,w,'the same driver: no write');
 feed('acc-B');assert.strictEqual(values.hudDesign,'own');assert.strictEqual(values.navColor,'orange','driver B gets theirs back');
 const saved=JSON.parse(files['/data/driver-profiles.json']);assert.deepStrictEqual(saved.names,{'acc-A':'홍길동'},'names kept');assert.deepStrictEqual(saved.order,['acc-A','acc-B']);assert(!('engineProfile' in saved.profiles['acc-A']));
 const again=new DriverProfiles({settings,signals,fs,file:'/data/driver-profiles.json',keys:()=>['hudDesign','navColor']});await settle();assert.strictEqual(again.status().drivers,2,'kept across restarts');again.stop();
 settings.set('driverProfiles','off');await settle();assert(shut>=1,'off: reading stops');assert.strictEqual(d.status().state,'off');
 assert.strictEqual(idOf({currentUserAccountReference:7}),'7');assert.strictEqual(nameOf({value:' Kim '}),'Kim');assert.strictEqual(nameOf(''),null);assert.strictEqual(idOf(null),null);
 const none=new DriverProfiles({settings:Object.assign({},settings,{get:k=>k==='driverProfiles'?'on':values[k]}),signals:null,fs,file:'/x',keys:()=>[]});assert.strictEqual(none.status().state,'unavailable');
 // favourites per driver (1.3.15), and the shared ones handed to every driver kept before
 {const v={driverProfiles:'on',hudDesign:'own',favorite1:'shared'},L=[];const st={get:k=>v[k],set:(k,x)=>{v[k]=x;L.forEach(f=>f(k,x));},setMany:c=>Object.keys(c).forEach(k=>{v[k]=c[k];L.forEach(f=>f(k,c[k]));}),onChange:f=>L.push(f)};
  const fl={'/p':JSON.stringify({profiles:{A:{hudDesign:'own'},B:{hudDesign:'own'}},order:['A','B']})},f2={readFileSync:f=>{if(!(f in fl))throw new Error('x');return fl[f];},writeFileSync:(f,d)=>{fl[f]=d;}};
  let h=null;const sg={hasNative:()=>true,watch:(i,inst,hs)=>{if(i===IFACE)h=hs[FIELD];return Promise.resolve({available:true,shutdown(){}});}};
  const p=new DriverProfiles({settings:st,signals:sg,fs:f2,file:'/p',keys:()=>['hudDesign','favorite1']});await settle();
  assert.deepStrictEqual(JSON.parse(fl['/p']).profiles.B,{hudDesign:'own',favorite1:'shared'},'kept drivers start with the shared favourites');
  h('A');st.set('favorite1','A-fav');h('B');assert.strictEqual(v.favorite1,'shared','B keeps theirs');st.set('favorite1','B-fav');h('A');assert.strictEqual(v.favorite1,'A-fav','A gets theirs back');p.stop();}
 {const broken=new DriverProfiles({settings:{get:()=>'on',set(){},onChange(){}},signals:null,fs:{readFileSync:()=>JSON.stringify({profiles:{A:{}},order:['A']}),writeFileSync(){}},file:'/b',keys:()=>{throw new Error('no key list');}});
  assert.deepStrictEqual(broken.keys(),[],'a broken key list never stops the app');}
 if(process.argv[2]){const root=require('path').join(require('path').resolve(process.argv[2]),'source/javascript'),{driverKeys}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json');
  const k=driverKeys(spec.settings);['favorite1','favorite5','hudLayoutSlot1','clusterLayoutSlot3','navLayoutSlot2'].forEach(x=>assert(k.includes(x),x+' kept per driver'));}
 console.log('PASS: settings per driver: favourites per driver (shared ones handed to every kept driver), names from the user account (number when none), off reads nothing, the user account picks the settings, changes kept per driver, new driver keeps current, car settings shared, kept across restarts');
})().catch(e=>{console.error(e);process.exitCode=1;});
