'use strict';
// 1.2.43: the Load tab. Saved slots carry their design; loading restores design + positions, writes only what
// differs, at most once per 1.5 s; the HUD / cluster show the loaded layout with nothing left of the previous one;
// rapid presses cost nothing.
// Usage: node redline-1-2-43.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),{EventEmitter}=require('events'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {SettingsPage,TABS}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json'),{Canvas}=require(root+'/kit/canvas'),R=require(root+'/kit/record');
const {settings,DEFAULTS}=require(root+'/policy'),{Outputs}=require(root+'/outputs'),ph=require(root+'/hud-compose'),pc=require(root+'/draw');

let clock=1e9;const realNow=Date.now;Date.now=()=>clock;
function fresh(){
 const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});let writes=0,keys=0;
 const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;writes++;keys++;},setMany:o=>{Object.assign(values,o);writes++;keys+=Object.keys(o).length;}};
 const page=new SettingsPage(store,()=>{},'test');
 return {values,store,page,writes:()=>writes,keys:()=>keys};
}
const saveAs=(S,tab,design,i,extra)=>{const p=S.page;p.selectTab(tab);if(design)S.store.setMany(p.designSwitch(design));if(extra)S.store.setMany(extra);p.open='layoutPresets';p.saveSlot(i);p.open=null;};

assert.strictEqual(TABS.length,5);

// 1. Empty Load tab: no rows, moving and pressing do nothing (no NaN focus, no writes).
{
 const S=fresh();S.page.selectTab(4);
 assert.deepStrictEqual(S.page.keys(),[]);S.page.move(1);S.page.move(-1);assert.strictEqual(S.page.focus,0);
 const w=S.writes();S.page.activate();assert.strictEqual(S.writes(),w);
 S.page.draw(new Canvas(1600,520));
}

// 2. Round trip: each slot brings back its design, alert style, auxiliary information and positions.
{
 const S=fresh(),v=S.values;
 saveAs(S,1,'rl-luxury',1,{hudRlGaugeOffsetX:20,hudAuxConfig:JSON.stringify({mode:'values',items:['oil','boost']})});
 saveAs(S,1,'own',2,{hudAlertStyle:'circle',hudGearOffsetX:-30});
 saveAs(S,2,'rl-sportdial',1,{clusterRlGaugeOffsetY:10});
 saveAs(S,3,null,3,{hudNavOffsetX:40});
 // move everything elsewhere
 S.store.setMany(Object.assign(S.page.designSwitch('rl-sporthud','hud'),{hudNavOffsetX:0}));S.store.setMany(S.page.designSwitch('rl-digital','cluster'));
 S.page.selectTab(4);
 const rows=S.page.loadEntries().map(e=>e.scope+e.i);assert.deepStrictEqual(rows,['hud1','hud2','cluster1','nav3']);
 const press=(n)=>{clock+=2000;S.page.activate(n);};
 press(0);assert.strictEqual(v.hudDesign,'rl-luxury');assert.strictEqual(v.hudRlGaugeOffsetX,20);assert.strictEqual(JSON.parse(v.hudAuxConfig).items.join(),'oil,boost');
 press(1);assert.strictEqual(v.hudDesign,'own');assert.strictEqual(v.hudAlertStyle,'circle');assert.strictEqual(v.hudGearOffsetX,-30);
 press(0);assert.strictEqual(v.hudDesign,'rl-luxury');assert.strictEqual(v.hudRlGaugeOffsetX,20,'luxury positions again after the default design');
 press(2);assert.strictEqual(v.clusterDesign,'rl-sportdial');assert.strictEqual(v.clusterRlGaugeOffsetY,10);
 press(3);assert.strictEqual(v.hudNavOffsetX,40);
 // the labels name the design
 const shown=[];const cv=new Canvas(1600,520),text=cv.text.bind(cv);cv.text=(s,...a)=>{shown.push(String(s));return text(s,...a);};S.page.draw(cv);
 assert(shown.some(s=>/Slot 1|슬롯 1/.test(s)&&/Luxury|럭셔리/.test(s)),shown.join(' | '));
}

// 3. Old slots (positions only) load onto the design in use; a design not allowed on that display is not applied.
{
 const S=fresh(),v=S.values;
 S.store.set('hudLayoutSlot1',JSON.stringify({version:1,values:{hudGearOffsetX:15}}));
 S.store.set('hudLayoutSlot2',JSON.stringify({version:2,design:'rl-classic',values:{hudGearOffsetX:5}}));
 S.store.set('hudLayoutSlot3','{broken');
 S.store.setMany(S.page.designSwitch('rl-arc','hud'));
 S.page.selectTab(4);assert.strictEqual(S.page.loadEntries().length,2,'a broken slot is not listed');
 clock+=2000;S.page.activate(0);assert.strictEqual(v.hudDesign,'rl-arc');assert.strictEqual(v.hudGearOffsetX,15);
 clock+=2000;S.page.activate(1);assert.strictEqual(v.hudDesign,'rl-arc','cluster-only design is not put on the HUD');assert.strictEqual(v.hudGearOffsetX,5);
 assert.strictEqual(S.page.slotName('hud',S.page.slot(1,'hud')),S.page.slotName('hud',{values:{}}));
}

// 4. Rapid presses: one write per 1.5 s at most; pressing what is in use writes nothing; the preview marker is cleared.
{
 const S=fresh();
 saveAs(S,1,'rl-luxury',1);saveAs(S,1,'rl-ribbon',2);S.store.set('layoutPreview','hud:RlGear@1');
 S.page.selectTab(4);clock+=5000;const w0=S.writes();
 for(let k=0;k<200;k++){clock+=10;S.page.activate(k%2);}            // 200 presses in 2 s, alternating two layouts
 const w1=S.writes()-w0;assert(w1>=1&&w1<=2,'writes in 2 s of presses: '+w1);
 assert.strictEqual(S.values.layoutPreview,'','the position preview marker is cleared');
 clock+=2000;const which=S.values.hudDesign==='rl-luxury'?0:1,w2=S.writes();S.page.activate(which);assert.strictEqual(S.writes(),w2,'loading the layout in use writes nothing');
 // each write is small: only keys that change
 clock+=2000;const k0=S.keys();S.page.activate(1-which);assert(S.keys()-k0<200,'keys written '+(S.keys()-k0));
}

// 5. Cost: building the list, a load and the tab's frame (also recorded, as on the car).
{
 const S=fresh();for(let i=1;i<=3;i++){saveAs(S,1,['rl-luxury','own','rl-hexagon'][i-1],i);saveAs(S,2,['rl-sportdial','rl-classic','own'][i-1],i);saveAs(S,3,null,i);}
 S.page.selectTab(4);assert.strictEqual(S.page.loadEntries().length,9);
 let t=process.hrtime();for(let k=0;k<200;k++){clock+=2000;S.page.activate(k%9);}let d=process.hrtime(t);const loadMs=(d[0]*1e3+d[1]/1e6)/200;
 t=process.hrtime();let words=0;for(let k=0;k<50;k++){const r=new R.Recorder(1600,520,{textScale:1});S.page.draw(r);words=r.words().length;}d=process.hrtime(t);const drawMs=(d[0]*1e3+d[1]/1e6)/50;
 assert(loadMs<20,'load '+loadMs.toFixed(2)+' ms');assert(drawMs<40,'frame '+drawMs.toFixed(2)+' ms');assert(words<20000,'words '+words);
 console.log('  cost: load '+loadMs.toFixed(2)+' ms, Load tab frame '+drawMs.toFixed(2)+' ms, '+words+' words (9 slots)');
}

// 6. End to end: loads applied to the running outputs; what the renderer shows always equals a fresh draw of
// the frame it was sent (no afterimage of the previous layout), across designs and positions.
{
 const S=fresh();
 const plan=[[1,'rl-luxury',1,{hudRlGaugeOffsetX:30}],[1,'own',2,{hudAlertStyle:'circle',hudGearOffsetX:-40}],[1,'rl-hexagon',3,{hudRlReadAOffsetY:-20}],
  [2,'rl-sportdial',1,{clusterRlGaugeOffsetX:-20}],[2,'own',2,{clusterAlertStyle:'bar'}],[2,'rl-luxury',3,{}]];
 plan.forEach(p=>saveAs(S,...p));
 const screens=new Map(),last={};
 class Client extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}
  image(o){const id=++this.n;screens.set(id,{w:o.iw,h:o.ih,d:Buffer.alloc(o.iw*o.ih*4),target:o.target});return id;}
  pixels(ref,rects,px){const s=screens.get(ref);s.state=last[s.target];if(!rects){px.copy(s.d);return;}let o=0;for(const r of rects)for(let y=r.y;y<r.y+r.h;y++){px.copy(s.d,(y*s.w+r.x)*4,o,o+r.w*4);o+=r.w*4;}}
  showWhenSent(){}set(){}drop(ref){screens.delete(ref);}close(){}}
 const wrap=(p,target)=>Object.assign(Object.create(p),{draw:s=>{last[target]=s;return p.draw(s);}});
 const o=new Outputs(new Client(),wrap(pc,'map'),wrap(ph,'hud'));
 Object.assign(S.values,{sportClusterOutput:'redline',sportHudOutput:'redline',allClusterOutput:'redline',allHudOutput:'redline'});
 S.page.selectTab(4);const n=S.page.loadEntries().length;assert.strictEqual(n,6);
 const raw=()=>{const r=Object.assign({},DEFAULTS);Object.keys(S.values).forEach(k=>{if(S.values[k]!==undefined)r[k]=S.values[k];});return settings(r);};
 let checked=0;
 for(let step=0;step<n*3*60;step++){const now=1000+step*50;
  if(step%60===0){clock+=2000;S.page.activate([0,3,1,4,2,5][(step/60)%n]);}
  o.policy.modeSample('SPORT',now);o.policy.rpmSample(Math.round(4300+2600*Math.sin(step/9)),now);o.gear='D4';o.aux={boost:0.4,oil:92,outside:15,gforce:0.2,gLat:0.1,gLong:0.1};
  o.tick(now,raw());
  if(step%60===55)for(const name of ['cluster','hud']){const c=o[name],s=c.ref&&screens.get(c.ref);if(!s||!s.state)continue;
   const f=(name==='hud'?ph:pc).draw(Object.assign({},s.state)).d;let bad=0;
   for(let p=0;p<f.length;p+=4)for(let ch=0;ch<3;ch++)if(Math.abs(f[p+ch]*f[p+3]-s.d[p+ch]*s.d[p+3])/255>8){bad++;break;}
   assert.strictEqual(bad,0,name+' after loading step '+step+': '+bad+' pixels differ from the frame sent');checked++;}
 }
 assert(checked>=n*3,'checked '+checked);
}
Date.now=realNow;
console.log('PASS: Load tab lists saved slots with their design, restores design + positions, old / broken / wrong-display slots handled, one write per 1.5 s, no write when in use, no afterimage after loading');
