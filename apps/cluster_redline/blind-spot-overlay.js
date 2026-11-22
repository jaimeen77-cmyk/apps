'use strict';
// The blind spot warning on the HUD (blind-spot.js): under each turn arrow, our car (blue) and the car in that side's
// blind spot seen from above, the other car amber while a car is in that side's blind spot, red when the turn signal is on towards it (the
// mirror lamp flashing). One overlay layer a side, above whatever the HUD shows; it moves and sizes with the turn
// arrows (Position / size of the turn signals). Drawn once a colour; a change of state only switches what is shown.
const D=require('./display-config');
const AMBER='#ff9a1f',RED='#ff2b3a',W=60,H=80,GAP=6;
// our car and the lane line keep the reference picture's blue; only the other car and the waves take the warning colour
const OURS='#4cc6f2',LANE='#3f8fc4';
// (black is see-through on the HUD: the windows are drawn black so they read as glass)
const GLASS='#05070b';
/** Where a side's sign goes: under that side's turn arrow, centred on it, sized with it (54 x 72 at 100 %). */
function rect(cfg,side){
 const a=D.turnRect(cfg,side),k=a.h/36*0.9,w=Math.round(W*k),h=Math.round(H*k);
 return {x:Math.round(a.x+a.w/2-w/2),y:a.y+a.h+GAP,w,h};
}
// Seen from above, pointing up, as the reference picture draws it: our car large in its lane, the lane line dashed,
// the other car smaller behind in the next lane (left or right: the warning's side), detection waves between them.
// w x h, transparent ground. The kit's arc angles: 0 up, clockwise (90 right).
// The car in its own units, 44 wide (52 with the mirrors) x 96 long, origin at the nose's centre; each shape is the
// right half, mirrored. Painted body, then the glass (windscreen, side and rear windows as one dark band), the roof
// over it and the sunroof: the dark left between them reads as the windows.
function bez(p0,p1,p2,p3,n){const o=[];for(let i=1;i<=n;i++){const t=i/n,u=1-t;o.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p3[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p3[1]]);}return o;}
const mirror=half=>half.concat(half.slice().reverse().map(([x,y])=>[-x,y]));
const BODY=mirror([[0,0],...bez([0,0],[13,0],[22,3],[22,17],8),[22,44],[21.2,60],[21.4,80],...bez([21.4,80],[21.4,90],[15,96],[0,96],8)]);
const GLASS_BAND=mirror([[0,27],...bez([0,27],[8,27],[15,28.5],[19.5,32],5),[18.6,58],[18,80],...bez([18,80],[14,85],[6,86],[0,86],5)]);
const ROOF=mirror([[0,38],...bez([0,38],[7,38],[13,39],[15.5,42],4),[15.5,58],[15,71],...bez([15,71],[11,73],[5,73.5],[0,73.5],4)]);
const SUNROOF=mirror([[0,46],...bez([0,46],[6,46],[9.5,46.5],[10,49],3),[9.5,58],...bez([9.5,58],[9,60],[5,60.5],[0,60.5],3)]);
const MIRROR=[[21.5,31],[26,32.5],[26.5,35.5],[21.5,37]];
// cx, top: where the car's nose is; s: units to pixels.
function car(cv,cx,top,s,color){
 const at=pts=>pts.map(([x,y])=>[cx+x*s,top+y*s]);
 cv.fill(at(BODY),color);
 cv.fill(at(MIRROR),color);cv.fill(at(MIRROR.map(([x,y])=>[-x,y])),color);
 cv.fill(at(GLASS_BAND),GLASS);cv.fill(at(ROOF),color);cv.fill(at(SUNROOF),GLASS);
}
function paint(cv,w,h,side,color){
 const k=Math.min(w/W,h/H),right=side==='right',X=x=>(right?x:W-x)*k;
 car(cv,X(17),2*k,0.56*k,OURS);                                          // ours, large (25 x 54)
 for(let y=2;y<H;y+=12)cv.roundRect(X(right?35:37),y*k,2*k,7*k,1*k,LANE);  // the lane line, dashed
 car(cv,X(48.5),48*k,0.31*k,color);                                       // the other car, smaller, behind
 const cx=X(30),cy=37*k;
 [5,9,13].forEach(r=>cv.arc(cx,cy,(r-1.2)*k,(r+1.2)*k,right?100:215,right?145:260,color));
}
function draw(w,h,side,color){const {Canvas}=require('./kit/canvas');const cv=new Canvas(w,h);cv.clear([0,0,0,0]);paint(cv,w,h,side,color);return cv;}
class BlindSpotOverlay{
 constructor(client){this.client=client;this.layers={left:null,right:null};}
 // state: { left, right } 0 nothing / 1 a car there / 2 warning; dir: the turn signal; preview: both shown.
 tick(cfg,state,dir,preview){
  ['left','right'].forEach(side=>{
   const s=preview?1:state?state[side]:0,warn=s===2||s===1&&(dir===side||dir==='both');
   if(!s){this.hide(side);return;}
   const r=rect(cfg,side),color=warn?'red':'amber';let l=this.layers[side];
   if(l&&(l.w!==r.w||l.h!==r.h)){this.client.drop(l.ref);l=this.layers[side]=null;}
   if(!l){const ref=this.client.image({target:'hud',klass:'overlay',z:12,x:r.x,y:r.y,w:r.w,h:r.h,iw:r.w,ih:r.h,visible:false});if(!ref)return;l=this.layers[side]={ref,x:r.x,y:r.y,w:r.w,h:r.h,color:null,visible:false};}
   if(l.color!==color){const cv=draw(r.w,r.h,side,color==='red'?RED:AMBER);this.client.pixels(l.ref,null,Buffer.from(cv.d.buffer,cv.d.byteOffset,cv.d.byteLength));l.color=color;}
   if(l.x!==r.x||l.y!==r.y){this.client.set(l.ref,{x:r.x,y:r.y});l.x=r.x;l.y=r.y;}
   if(!l.visible){this.client.set(l.ref,{visible:true});l.visible=true;}
  });
 }
 hide(side){(side?[side]:['left','right']).forEach(s=>{const l=this.layers[s];if(l&&l.visible){this.client.set(l.ref,{visible:false});l.visible=false;}});}
 close(){['left','right'].forEach(s=>{if(this.layers[s])this.client.drop(this.layers[s].ref);this.layers[s]=null;});}
}
module.exports={BlindSpotOverlay,rect,draw,paint,AMBER,RED,OURS};
