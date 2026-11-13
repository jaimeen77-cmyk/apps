'use strict';
// 1.2.47: gauge mode on Standard, 80s digital, VFD, Vector, Ramp, M shift lights, Data logger, Mode ribbon,
// Hexagon, Classic dial and Sport HUD: each draws its own bars, cached tiles match full draws while the values
// move, switching between values and gauges leaves nothing behind, and an item without a range stays text.
// Usage: node redline-1-2-47.test.js <built cluster_redline stage>
const assert=require('assert'),path=require('path'),root=path.join(path.resolve(process.argv[2]),'source/javascript');
const {settings}=require(root+'/policy'),RL=require(root+'/redline-hud'),HUD=require(root+'/hud-compose'),CL=require(root+'/draw');
const NEW=['standard','digital','vfd','vector','ramp','shift','logger','ribbon','hexagon','classic','sporthud'];
NEW.forEach(st=>assert(RL.GAUGE_LAYOUTS.includes(st),st+' is listed as gauge support'));
const cfgOf=(d,st,mode,items)=>settings({[d+'Design']:'rl-'+st,[d+'AuxConfig']:JSON.stringify({mode,items:items||['boost','oil']})});
const state=(cfg,i,aux)=>({config:cfg,renderRpm:true,rpm:1500+i*230,gear:'D4',mode:i%4<2?'SPORT':'COMFORT',aux:aux||{boost:(i%12)/10,oil:60+i*4,outside:15},torqueNm:250,powerPS:180,shift:false,flash:false});
const diff=(a,b)=>{let n=0;for(let k=0;k<a.length;k++)if(Math.abs(a[k]-b[k])>2)n++;return n;};
for(const [d,P] of [['hud',HUD],['cluster',CL]])for(const st of NEW){
 if(!RL.stylesFor(d).includes(st))continue;
 // 1. the gauges show: gauge mode differs from values mode with the same two items
 const g=Buffer.from(P.draw(state(cfgOf(d,st,'gauges'),5)).d),v=Buffer.from(P.draw(state(cfgOf(d,st,'values'),5)).d);
 assert(diff(g,v)>40,d+' '+st+': gauge mode draws bars');
 // 2. the bars follow the value
 const lo=Buffer.from(P.draw(state(cfgOf(d,st,'gauges'),5,{boost:0.1,oil:60})).d),hi=Buffer.from(P.draw(state(cfgOf(d,st,'gauges'),5,{boost:2.2,oil:150})).d);
 assert(diff(lo,hi)>40,d+' '+st+': bars move with the values');
 // 3. a sweep with one cache, toggling values / gauges: what the cache shows equals a full draw each frame
 const cache=P.createCache();
 for(let i=0;i<24;i++){const cfg=cfgOf(d,st,i%8<5?'gauges':'values'),a=state(cfg,i);Object.defineProperty(a,'renderCache',{value:cache});
  const n=diff(Buffer.from(P.draw(a).d),Buffer.from(P.draw(state(cfg,i)).d));assert.strictEqual(n,0,d+' '+st+' frame '+i+': cached differs by '+n+' bytes');}
 // 4. no range (the clock): no fraction, so no bar
 if(!RL.VERTICAL_GAUGES||!RL.VERTICAL_GAUGES.includes(st))assert.strictEqual(RL.readouts(state(cfgOf(d,st,'gauges',['clock']),3),d)[0].frac,null);
}
console.log('PASS: gauge mode on 11 more layouts: bars drawn, follow the values, cached = full draw across mode switches, no bar without a range');
