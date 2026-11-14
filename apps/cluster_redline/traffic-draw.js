'use strict';
const {Canvas}=require('./kit/canvas');
const {tr}=require('./strings');
const W=280,H=150;
const RED='#ff3046',AMBER='#ffc23d',WHITE='#f5f7fb';
function warning(cv,x,y){
 const p=[[x+18,y],[x,y+31],[x+36,y+31],[x+18,y]];
 cv.quad(p.slice(0,3),'#05070b');cv.polyline(p,3,RED);
 cv.line(x+18,y+9,x+18,y+18,3,RED);cv.circle(x+18,y+24,1.8,RED);
}
function children(cv,x,y){
 cv.polyline([[x+44,y+2],[x+3,y+75],[x+85,y+75],[x+44,y+2]],4,AMBER);
 // Two walking children, drawn as vectors so the native HUD needs no image upload or font glyph.
 cv.circle(x+35,y+30,4.8,AMBER);
 cv.line(x+34,y+39,x+32,y+50,7,AMBER);
 cv.line(x+34,y+40,x+24,y+47,4,AMBER);
 cv.line(x+36,y+40,x+45,y+47,4,AMBER);
 cv.line(x+32,y+49,x+23,y+64,5,AMBER);
 cv.line(x+33,y+50,x+43,y+63,5,AMBER);
 cv.circle(x+56,y+39,3.8,AMBER);
 cv.line(x+55,y+46,x+53,y+55,5,AMBER);
 cv.line(x+54,y+47,x+45,y+47,3,AMBER);
 cv.line(x+56,y+48,x+65,y+54,3,AMBER);
 cv.line(x+53,y+54,x+46,y+66,4,AMBER);
 cv.line(x+54,y+54,x+64,y+65,4,AMBER);
}
function draw(state){
 const cv=new Canvas(W,H);cv.clear([0,0,0,0]);const v=state.traffic;
 if(!v||!v.visible)return cv;
 if(v.limit!==null){
  if(v.over)cv.arc(46,42,39,43,0,360,[255,48,70,65]);
  cv.arc(46,42,31,38,0,360,RED);
  cv.text(String(v.limit),46,56,36,WHITE,{align:'center',font:'num'});
  cv.text('km/h',46,105,16,WHITE,{align:'center'});
  if(v.over){warning(cv,63,57);cv.text(tr('Over limit'),46,131,17,RED,{align:'center',literal:true});}
 }
 if(v.children){
  const x=v.limit===null?46:145;children(cv,x,2);
  cv.text(tr('Children caution'),x+44,105,18,AMBER,{align:'center',literal:true});
  cv.text(tr('Sign detected'),x+44,130,16,AMBER,{align:'center',literal:true});
 }
 return cv;
}
module.exports={W,H,draw};
