'use strict';
const {Canvas}=require('./kit/canvas');
const {tr}=require('./strings');
const W=280,H=150;
function draw(state){
 const cv=new Canvas(W,H);cv.clear([0,0,0,0]);const v=state.traffic;
 if(!v||!v.visible)return cv;
 if(v.limit!==null){
  const ink=v.over?'#ff394a':'#f3f5f7';
  cv.arc(45,44,32,39,0,360,v.over?'#ff394a':'#e4e8ed');
  cv.text(String(v.limit),45,56,33,ink,{align:'center',font:'num'});
  cv.text('km/h',45,99,15,'#e4e8ed',{align:'center'});
  if(v.over)cv.text(tr('Over limit'),100,48,18,'#ff394a',{literal:true});
 }
 if(v.children){
  const y=v.limit===null?42:126;
  cv.text('!',16,y,28,'#ffc15c');cv.text(tr('Children · sign detected'),38,y,18,'#ffc15c',{literal:true});
 }
 return cv;
}
module.exports={W,H,draw};
