'use strict';
// The blind spot warning on the HUD (blind-spot.js): beside each turn arrow, on its outer side, a sign of a car with
// warning waves, amber while a car is in that side's blind spot, red when the turn signal is on towards it (the
// mirror lamp flashing). One overlay layer a side, above whatever the HUD shows; it moves and sizes with the turn
// arrows (Position / size of the turn signals). Drawn once a colour; a change of state only switches what is shown.
const D=require('./display-config');
const AMBER='#ff9a1f',RED='#ff2b3a',W=40,H=36,GAP=10;
/** Where a side's sign goes: outside that side's turn arrow, as tall as it. */
function rect(cfg,side){
 const a=D.turnRect(cfg,side),h=a.h,w=Math.round(W*h/H);
 return {x:side==='left'?a.x-GAP-w:a.x+a.w+GAP,y:a.y,w,h};
}
// A car seen from behind with two waves on the outer side (the mirror's lane change sign), w x h, transparent ground.
// The kit's arc angles: 0 up, clockwise (90 right).
function paint(cv,w,h,side,color){
 const k=h/H,right=side==='right',cx=(right?14:W-14)*k,X=v=>(right?v:W-v)*k;
 cv.roundRect(Math.min(X(4),X(24)),12*k,20*k,17*k,4*k,color);
 cv.roundRect(Math.min(X(8),X(20)),5*k,12*k,10*k,3*k,color);
 cv.roundRect(Math.min(X(5),X(9)),27*k,4*k,5*k,1.5*k,color);cv.roundRect(Math.min(X(19),X(23)),27*k,4*k,5*k,1.5*k,color);
 [16,23].forEach(r=>cv.arc(cx,19*k,(r-1.8)*k,(r+1.8)*k,right?50:230,right?130:310,color));
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
module.exports={BlindSpotOverlay,rect,draw,paint,AMBER,RED};
