'use strict';
// 1.2.44: Favorites tab. Register keeps the whole setup (compact), Load restores it in one write (only what
// differs, nothing when in use, once per 1.5 s), Check settings shows it; no afterimage after loading; cheap.
// Usage: node redline-1-2-44.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),{EventEmitter}=require('events'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {SettingsPage,TABS}=require(root+'/settings-ui'),spec=require(root+'/kit/app-spec.json'),{Canvas}=require(root+'/kit/canvas'),R=require(root+'/kit/record');
const {settings,DEFAULTS}=require(root+'/policy'),{Outputs}=require(root+'/outputs'),ph=require(root+'/hud-compose'),pc=require(root+'/draw');
let clock=2e12;const realNow=Date.now;Date.now=()=>clock;
function fresh(){const values={};spec.settings.forEach(s=>{values[s.key]=s.default;});let writes=0;
 const store={schema:spec.settings,get:k=>values[k],set:(k,v)=>{values[k]=v;writes++;},setMany:o=>{Object.assign(values,o);writes++;}};
 return {values,store,page:new SettingsPage(store,()=>{},'test'),writes:()=>writes};}
const aux=(mode,items)=>JSON.stringify({mode,items});
function setup(S,hud,cluster,extra){const p=S.page;p.selectTab(1);S.store.setMany(p.designSwitch(hud));p.selectTab(2);S.store.setMany(p.designSwitch(cluster));S.store.setMany(extra||{});p.selectTab(4);}
// the setup as the app sees it: every key a favourite covers, unset ones at their default
const def=k=>{const d=spec.settings.find(s=>s.key===k);return d&&d.default!==undefined?d.default:DEFAULTS[k];};
const snapshot=S=>{const o={};Object.keys(S.values).concat(Object.keys(DEFAULTS)).forEach(k=>{if(!/^favorite\d|LayoutSlot|^appEnabled$|^layoutPreview$|^_/.test(k))o[k]=S.values[k]!==undefined?S.values[k]:def(k);});return JSON.stringify(o,Object.keys(o).sort());};

assert.strictEqual(TABS.length,5);assert.strictEqual(TABS[4],'Favorites');

// 1. Register: compact, overwrite needs a second press within 4 s.
{
 const S=fresh(),p=S.page;setup(S,'rl-luxury','rl-sportdial',{hudAuxConfig:aux('values',['oil','boost','torque','outside']),clusterAuxConfig:aux('gauges',['boost','oil']),hudRlGaugeOffsetX:20,shiftRpm:6200,comfortShiftRpm:4500,clusterYieldGuidance:'nosport',navColor:Object.keys({})[0]||S.values.navColor});
 assert(p.registerFavorite(1));const raw=S.values.favorite1;assert(raw.length<3000,'favourite size '+raw.length);
 S.values.shiftRpm=6000;assert.strictEqual(p.registerFavorite(1),false,'first press over a saved favourite only arms');assert.strictEqual(JSON.parse(S.values.favorite1).values.shiftRpm,6200);
 clock+=1000;assert(p.registerFavorite(1),'second press within 4 s overwrites');assert.strictEqual(JSON.parse(S.values.favorite1).values.shiftRpm,6000);
 S.values.shiftRpm=5800;clock+=1000;p.registerFavorite(1);clock+=5000;assert.strictEqual(p.registerFavorite(1),false,'an old arm expires');
}

// 2. Load brings back the whole setup (designs, layouts, auxiliary, basic, navigation), leaves the app's run state.
{
 const S=fresh(),p=S.page;
 setup(S,'rl-luxury','rl-sportdial',{hudAuxConfig:aux('values',['oil','boost']),hudRlGaugeOffsetX:20,clusterRlGaugeOffsetY:-10,shiftRpm:6200,comfortShiftRpm:4500,clusterYieldGuidance:'nosport'});p.registerFavorite(1);const A=snapshot(S);
 setup(S,'own','rl-classic',{hudAlertStyle:'circle',hudGearOffsetX:-40,clusterAuxConfig:aux('values',['outside']),shiftRpm:5500,clusterYieldGuidance:'off'});p.registerFavorite(2);const B=snapshot(S);
 setup(S,'rl-hexagon','own',{});S.values.appEnabled=false;S.values.layoutPreview='hud:RlGear@1';
 clock+=2000;assert(p.loadFavorite(1));assert.strictEqual(snapshot(S),A,'favourite 1 restored exactly');assert.strictEqual(S.values.appEnabled,false,'run state untouched');assert.strictEqual(S.values.layoutPreview,'');
 clock+=2000;assert(p.loadFavorite(2));assert.strictEqual(snapshot(S),B,'favourite 2 restored exactly');
 clock+=2000;assert(p.loadFavorite(1));assert.strictEqual(snapshot(S),A,'and back');
 const w=S.writes();clock+=2000;assert.strictEqual(p.loadFavorite(1),false,'already in use');assert.strictEqual(S.writes(),w);
}

// 3. Empty / broken favourites, rapid presses.
{
 const S=fresh(),p=S.page;setup(S,'rl-arc','own',{});
 S.values.favorite3='{broken';const w0=S.writes();
 assert.strictEqual(p.loadFavorite(3),false);assert.strictEqual(p.loadFavorite(4),false);p.viewFavorite(5);assert.strictEqual(p.open,null);assert.strictEqual(S.writes(),w0);
 p.registerFavorite(1);setup(S,'rl-ribbon','rl-dial',{});p.registerFavorite(2);
 clock+=5000;const w1=S.writes();for(let k=0;k<200;k++){clock+=10;p.loadFavorite(1+k%2);}
 const n=S.writes()-w1;assert(n>=1&&n<=2,'writes during 200 presses in 2 s: '+n);
 // controller path: focus walks the 15 buttons; activate runs the focused one
 p.focus=0;p.move(-1);assert.strictEqual(p.focus,14);p.move(1);p.move(1);assert.strictEqual(p.focus,1);
 clock+=2000;p.focus=5;p.activate();assert.strictEqual(p.open,'favView');assert.strictEqual(p.favIndex,2);p.move(1);p.back();assert.strictEqual(p.open,null);
}

// 4. Cost of each action and of the two screens (also recorded, as on the car).
{
 const S=fresh(),p=S.page;for(let n=1;n<=5;n++){setup(S,['rl-luxury','own','rl-hexagon','rl-needle','rl-sporthud'][n-1],['rl-sportdial','rl-classic','own','rl-luxury','rl-ramp'][n-1],{hudAuxConfig:aux('values',['oil','boost','torque','outside'])});clock+=10000;p.registerFavorite(n);}
 const time=(f,k)=>{const t=process.hrtime();for(let i=0;i<k;i++)f(i);const d=process.hrtime(t);return (d[0]*1e3+d[1]/1e6)/k;};
 const reg=time(i=>{clock+=10000;p.favArmed={n:1+i%5,at:clock};p.registerFavorite(1+i%5);},100);
 const load=time(i=>{clock+=2000;p.loadFavorite(1+i%5);},100);
 p.open=null;let words=0;const tab=time(()=>{const r=new R.Recorder(1600,520,{textScale:1});p.draw(r);words=r.words().length;},30);
 let vwords=0;const view=time(i=>{p.open='favView';p.favIndex=1+i%5;const r=new R.Recorder(1600,520,{textScale:1});p.draw(r);vwords=r.words().length;},30);p.open=null;
 console.log('  cost: register '+reg.toFixed(2)+' ms, load '+load.toFixed(2)+' ms, tab frame '+tab.toFixed(2)+' ms ('+words+' words), check-settings frame '+view.toFixed(2)+' ms ('+vwords+' words)');
 assert(reg<20&&load<20&&tab<40&&view<60&&words<20000&&vwords<20000);
}

// 5. End to end: favourites loaded into the running outputs; the renderer always shows the frame it was sent.
{
 const S=fresh(),p=S.page;
 const plan=[['rl-luxury','rl-sportdial',{hudRlGaugeOffsetX:30}],['own','own',{hudAlertStyle:'circle',hudGearOffsetX:-40,clusterAlertStyle:'bar'}],['rl-hexagon','rl-luxury',{hudRlReadAOffsetY:-20,clusterAuxConfig:aux('values',['oil','outside'])}]];
 plan.forEach((x,i)=>{setup(S,x[0],x[1],x[2]);clock+=10000;p.registerFavorite(i+1);});
 Object.assign(S.values,{sportClusterOutput:'redline',sportHudOutput:'redline',allClusterOutput:'redline',allHudOutput:'redline'});
 const screens=new Map(),last={};
 class Client extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}
  image(o){const id=++this.n;screens.set(id,{w:o.iw,h:o.ih,d:Buffer.alloc(o.iw*o.ih*4),target:o.target});return id;}
  pixels(ref,rects,px){const s=screens.get(ref);s.state=last[s.target];if(!rects){px.copy(s.d);return;}let o=0;for(const r of rects)for(let y=r.y;y<r.y+r.h;y++){px.copy(s.d,(y*s.w+r.x)*4,o,o+r.w*4);o+=r.w*4;}}
  showWhenSent(){}set(){}drop(ref){screens.delete(ref);}close(){}}
 const wrap=(q,target)=>Object.assign(Object.create(q),{draw:s=>{last[target]=s;return q.draw(s);}});
 const o=new Outputs(new Client(),wrap(pc,'map'),wrap(ph,'hud'));
 const cfg=()=>{const r=Object.assign({},DEFAULTS);Object.keys(S.values).forEach(k=>{if(S.values[k]!==undefined)r[k]=S.values[k];});Object.assign(r,{sportClusterOutput:'redline',sportHudOutput:'redline',allClusterOutput:'redline',allHudOutput:'redline',appEnabled:true});return settings(r);};
 let checked=0;
 for(let step=0;step<9*60;step++){const now=1000+step*50;
  if(step%60===0){clock+=2000;p.loadFavorite([1,2,3,2,1,3,1,2,3][step/60]);}
  o.policy.modeSample('SPORT',now);o.policy.rpmSample(Math.round(4300+2600*Math.sin(step/9)),now);o.gear='D4';o.aux={boost:0.4,oil:92,outside:15,gforce:0.2,gLat:0.1,gLong:0.1};
  o.tick(now,cfg());
  if(step%60===55)for(const name of ['cluster','hud']){const c=o[name],s=c.ref&&screens.get(c.ref);if(!s||!s.state)continue;
   const f=(name==='hud'?ph:pc).draw(Object.assign({},s.state)).d;let bad=0;
   for(let q=0;q<f.length;q+=4)for(let ch=0;ch<3;ch++)if(Math.abs(f[q+ch]*f[q+3]-s.d[q+ch]*s.d[q+3])/255>8){bad++;break;}
   assert.strictEqual(bad,0,name+' after loading at step '+step+': '+bad+' pixels differ');checked++;}
 }
 assert(checked>=12,'checked '+checked);
}
Date.now=realNow;
console.log('PASS: Favorites register (compact, overwrite confirm), load restores the whole setup in one write (only changes, once per 1.5 s), empty/broken handled, controller path, cheap, no afterimage');
