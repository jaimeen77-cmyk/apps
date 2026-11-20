'use strict';
require('./crisp-text');
const {Canvas}=require('./kit/canvas');
const W=240,H=48;
// drawSized paints at the HUD size (no resampling); the layout is the same 240x48 design.
function drawSized(state,w,h){
 const s=(w||W)/W,cv=new Canvas(Math.max(1,Math.round(w||W)),Math.max(1,Math.round(h||H*s)));cv.clear([0,0,0,0]);
 if(!state||!state.visible||typeof state.description!=='string'||!state.description)return cv;
 const width=(t,size)=>cv.textWidth(t,size*s,{font:'bold',literal:true})/s;
 let text=state.description,size=34;
 while(size>16&&width(text,size)>W-16)size--;
 while(text.length&&width(text,size)>W-16)text=Array.from(text).slice(0,-2).join('')+'…';
 cv.text(text,W/2*s,37*s,size*s,require('./display-config').NAV_COLORS[state.textColor]||'#f4f7fb',{font:'bold',align:'center',literal:true});return cv;
}
function draw(state){return drawSized(state,W,H);}
module.exports={draw,drawSized,W,H};
