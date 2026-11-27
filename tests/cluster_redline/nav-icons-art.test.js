'use strict';
// The guidance icons from the user's sheet (1.3.81): every turn, the roundabout, the lane changes, the arrivals and the
// highway entries / exits have their picture; it is painted (in the chosen colour) where the drawn arrow was.
const assert=require('assert'),path=require('path');
const A=require('../../apps/cluster_redline/hud-art');
// one file a set (1.3.86): nothing read until a picture of that set is wanted
assert.deepStrictEqual(A.loadedSets(),[]);A.size('car');assert.deepStrictEqual(A.loadedSets(),['cars'],'the cars only');
['left','right','straight','slight-left','slight-right','uturn-left','uturn-right','roundabout','lane-left','lane-right','arrival-left','arrival-right',
 'in-left','in-straight','in-right','out-left','out-straight','out-right','lg-uturn-left','lg-slight-left','lg-left','lg-straight','lg-slight-right']
 .forEach(n=>['nav','neon'].forEach(st=>{assert(A.size(st+'/'+n),'icon '+st+'/'+n);if(/^lg-/.test(n))assert(A.size(st+'/'+n+'-on'),'lit '+st+'/'+n);}));
if(process.argv[2]){
 const dir=path.join(path.resolve(process.argv[2]),'source/javascript'),N=require(path.join(dir,'nav-draw')),LD=require(path.join(dir,'lane-draw'));
 const lit=(cv,box)=>{let n=0;for(let y=box[1];y<box[3];y++)for(let x=box[0];x<box[2];x++)if(cv.d[(y*cv.w+x)*4+3]>150)n++;return n;};
 const st=(o)=>Object.assign({visible:true,distanceText:'300 m',color:'blue'},o);
 ['LEFT','RIGHT','STRAIGHT_ON','SLIGHT_LEFT','SLIGHT_RIGHT','UTURN_LEFT','UTURN_RIGHT','LANE_LEFT','LANE_RIGHT','ARRIVAL_LEFT','ARRIVAL_RIGHT'].forEach(m=>
  assert(lit(N.drawSized(st({maneuver:m}),240,112),[0,0,104,112])>400,'painted '+m));
 assert(lit(N.drawSized(st({maneuver:'ROUNDABOUT',exitNumber:2}),240,112),[0,0,104,112])>800,'roundabout');
 ['IN_LEFT','IN_STRAIGHT','OUT_RIGHT'].forEach(b=>assert(lit(N.drawSized(st({kind:'branch',branchType:'HIGHWAY_'+b}),240,112),[0,0,104,112])>300,'highway '+b));
 // Arrow style 'drawn' (1.3.82): the drawn arrow again, the same pixels as a view without pictures
 const {settings}=require('../../apps/cluster_redline/policy');assert.strictEqual(settings({}).navArrowStyle,'icon');assert.strictEqual(settings({navArrowStyle:'drawn'}).navArrowStyle,'drawn');
 const a=N.drawSized(st({maneuver:'LEFT'}),240,112),b=N.drawSized(st({maneuver:'LEFT',arrowStyle:'drawn'}),240,112);assert(!Buffer.from(a.d).equals(Buffer.from(b.d)),'drawn differs from the icon');
 const vec=(st0)=>{const cv=new (require(path.join(dir,'kit/canvas')).Canvas)(240,112);cv.clear([0,0,0,0]);N.draw(st0,{line:cv.line.bind(cv),polyline:cv.polyline.bind(cv),quad:cv.quad.bind(cv),arc:cv.arc.bind(cv),text:cv.text.bind(cv),textWidth:cv.textWidth.bind(cv)});return cv;};
 assert(Buffer.from(b.d).equals(Buffer.from(vec(st({maneuver:'LEFT'})).d)),'drawn: as before');
 // the neon colour (1.3.86): the neon sheet's own icons (orange flags), the set's file read only then
 const flag=N.drawSized(st({maneuver:'ARRIVAL_LEFT',color:'lime'}),240,112);let flagOrange=0;for(let i=0;i<flag.d.length;i+=4)if(flag.d[i+3]>150&&flag.d[i]>200&&flag.d[i+1]>90&&flag.d[i+1]<190&&flag.d[i+2]<90)flagOrange++;assert(flagOrange>80,'neon: the orange flag '+flagOrange);
 const NL=LD.drawSized({visible:true,color:'lime',lanes:[{directions:['RIGHT'],other:[],highlighted:true}]},240,72);let lime=0;for(let i=0;i<NL.d.length;i+=4)if(NL.d[i+3]>200&&NL.d[i+1]>200&&NL.d[i+2]<120&&NL.d[i]>120)lime++;assert(lime>30,'neon lane lit '+lime);
 // a fork keeps its drawn diagram
 assert(N.diagramKind(st({branchType:'FORK_LEFT'}))==='branch');
 const L=LD.drawSized({visible:true,color:'orange',lanes:[{directions:['LEFT'],other:[],highlighted:false},{directions:['RIGHT'],other:[],highlighted:true}]},240,72);
 let orange=0;for(let i=0;i<L.d.length;i+=4)if(L.d[i+3]>200&&L.d[i]>200&&L.d[i+2]<120)orange++;assert(orange>40,'the selected lane lit in its colour '+orange);
}
console.log('PASS: guidance icons from the user\'s sheet'+(process.argv[2]?', painted for turns, roundabout, lane changes, arrivals, highway and lanes':''));
