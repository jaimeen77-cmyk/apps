'use strict';
// HUD turn signal shapes, drawn at their final size (w x h) on a transparent ground, pointing right; the left
// one is mirrored. arrow: the cluster's indicator arrow (head and stem); chevron3: >>>; chevron: >.
const {Canvas}=require('./kit/canvas');
const {TURN_COLORS}=require('./display-config');
function mirror(points,w,side){return side==='left'?points.map(p=>[w-p[0],p[1]]):points;}
function chevron(x0,w,h,t){
 // a filled ">" of stroke thickness t, from x0, w wide, the full height
 return [[x0,0],[x0+t,0],[x0+w,h/2],[x0+t,h],[x0,h],[x0+w-t,h/2]];
}
// count: chevrons drawn by <<< >>> (1-3, the innermost first; default all three).
function paint(cv,w,h,side,style,color,count){
 const c=TURN_COLORS[color]||TURN_COLORS.green;
 if(style==='chevron3'){
  const t=Math.max(2,w*0.13),cw=w*0.42,step=(w-cw)/2;
  const n=count>=1&&count<=3?count:3;for(let i=0;i<n;i++)cv.fill(mirror(chevron(i*step,cw,h,t),w,side),c);
 }else if(style==='chevron'){
  const t=Math.max(3,w*0.26),cw=Math.min(w,h*0.8);
  cv.fill(mirror(chevron((w-cw)/2,cw,h,t),w,side),c);
 }else{
  // head: a triangle the full height, half the width; stem: a bar a third of the height
  const head=w*0.5,bar=h*0.36;
  cv.fill(mirror([[w-head,0],[w,h/2],[w-head,h]],w,side),c);
  cv.fill(mirror([[w*0.06,h/2-bar/2],[w-head+1,h/2-bar/2],[w-head+1,h/2+bar/2],[w*0.06,h/2+bar/2]],w,side),c);
 }
}
/** A painter for retained-scene / blitScaled: W x H, draw(state) -> Canvas. */
function painter(w,h,side,style,color,count){
 return {W:w,H:h,draw:()=>{const cv=new Canvas(w,h);cv.clear([0,0,0,0]);paint(cv,w,h,side,style,color,count);return cv;},
  into:(cv)=>paint(cv,w,h,side,style,color,count)};
}
module.exports={paint,painter};
