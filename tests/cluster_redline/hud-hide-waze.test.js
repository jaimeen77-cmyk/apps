'use strict';
// 1.3.98: HUD · hide Waze: the Redline HUD layer hides the layers under it (Waze on Map's HUD map) in Sport (the
// default), always, or never; switched in place on the layer (set exclusive), the cluster untouched.
const assert=require('assert'),{EventEmitter}=require('events');
const {Outputs}=require('../../apps/cluster_redline/outputs'),{settings}=require('../../apps/cluster_redline/policy');
assert.strictEqual(settings({}).hudHideWaze,'sport');assert.strictEqual(settings({hudHideWaze:'always'}).hudHideWaze,'always');
assert.strictEqual(settings({hudHideWaze:'off'}).hudHideWaze,'off');assert.strictEqual(settings({hudHideWaze:'x'}).hudHideWaze,'sport');
function run(choice){
 const sets=[],made=[];
 class C extends EventEmitter{constructor(){super();this.ready=true;this.targets='map:1088x480,hud:800x480';this.n=0;}image(o){made.push(o);return ++this.n;}pixels(){}showWhenSent(){}set(ref,o){sets.push([ref,o]);}drop(){}close(){}}
 const p=(w,h)=>({W:w,H:h,draw:()=>({d:Buffer.alloc(64)}),difference:()=>({rects:[],pixels:Buffer.alloc(0)})});
 const out=new Outputs(new C(),p(1088,480),Object.assign(p(800,480),{fullTarget:true})),cfg=settings({allClusterOutput:'redline',allHudOutput:'redline',sportClusterOutput:'redline',sportHudOutput:'redline',hudHideWaze:choice});
 const t=(at,mode)=>{out.policy.modeSample(mode,at-1);out.policy.rpmSample(2000,at);return out.tick(at,cfg).outputs;};
 const hudRef=()=>made.findIndex(o=>o.target==='hud')+1,ex=()=>{const r=hudRef();const s=sets.filter(([ref,o])=>ref===r&&'exclusive' in o);return s.length?s[s.length-1][1].exclusive:0;};
 return {t,ex,made,sets,close:()=>out.close()};
}
{const h=run('sport');let at=1000;for(;at<3000;at+=100)h.t(at,4);
 assert(h.made.some(o=>o.target==='hud'&&o.exclusive===false),'the HUD layer made without exclusive');assert.strictEqual(h.ex(),0,'Comfort: Waze not hidden');
 for(;at<6000;at+=100)h.t(at,1);assert.strictEqual(h.ex(),1,'Sport: the HUD hides the layers under it');
 for(;at<9000;at+=100)h.t(at,4);assert.strictEqual(h.ex(),0,'back to Comfort: shown again');
 assert(h.made.some(o=>o.target==='map'&&o.exclusive===true),'the cluster as before');h.close();}
{const h=run('always');for(let at=1000;at<3000;at+=100)h.t(at,4);assert.strictEqual(h.ex(),1,'always: also in Comfort');h.close();}
{const h=run('off');for(let at=1000;at<5000;at+=100)h.t(at,at<3000?4:1);assert.strictEqual(h.ex(),0,'off: never');h.close();}
console.log('PASS: HUD · hide Waze: in Sport by default, always or never; the HUD layer set exclusive in place; the cluster untouched');
