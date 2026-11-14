'use strict';
const {Canvas,ScaledCanvas}=require('./kit/canvas');
const {tr}=require('./strings');
const W=280,H=150;
const RED='#ff122f',AMBER='#ffbf00',WHITE='#f5f7fb';
function curve(points,a,b,c){for(let i=1;i<=8;i++){const t=i/8,u=1-t;points.push([u*u*a[0]+2*u*t*b[0]+t*t*c[0],u*u*a[1]+2*u*t*b[1]+t*t*c[1]]);}}
function triangle(cv,x,y,w,h,width,color){
 const points=[[x+w*.42,y+h*.09]];
 curve(points,points[0],[x+w*.5,y-h*.06],[x+w*.58,y+h*.09]);
 points.push([x+w*.96,y+h*.84]);curve(points,points[points.length-1],[x+w*1.04,y+h],[x+w*.87,y+h]);
 points.push([x+w*.13,y+h]);curve(points,points[points.length-1],[x-w*.04,y+h],[x+w*.04,y+h*.84]);
 points.push(points[0]);cv.polyline(points,width,color);
}
function warning(cv,x,y){
 cv.quad([[x+18,y+1],[x-1,y+32],[x+37,y+32]],'#05070b');triangle(cv,x,y,36,31,3.8,RED);
 cv.line(x+18,y+10,x+18,y+19,3.6,RED);cv.circle(x+18,y+25,2,RED);
}
function children(cv,x,y){
 triangle(cv,x+3,y+1,82,75,6.4,AMBER);
 const q=p=>cv.quad(p.map(([a,b])=>[x+a,y+b]),AMBER),line=(a,b,c,d,w)=>cv.line(x+a,y+b,x+c,y+d,w,AMBER);
 // Filled shirt, shorts, dress, ponytail and walking limbs: match the sample's silhouettes, not stick figures.
 cv.circle(x+35,y+32,6,AMBER);q([[30,28],[40,28],[43,31],[35,32]]);
 cv.roundRect(x+32,y+36,6,7,2,AMBER);q([[29,40],[38,39],[42,52],[27,52]]);
 line(29,43,25,50,6.5);line(38,43,47,49,5.7);
 q([[28,50],[35,51],[32,58],[25,55]]);q([[34,51],[41,51],[43,57],[36,58]]);
 line(29,55,23,63,5.8);line(23,63,28,68,5.8);line(37,55,42,68,5.8);line(42,68,48,68,5.8);
 cv.circle(x+57,y+43,5,AMBER);cv.circle(x+50,y+43,3.2,AMBER);q([[50,41],[53,42],[50,50],[46,51]]);
 q([[53,49],[59,49],[62,60],[51,60]]);q([[52,55],[60,55],[65,63],[48,63]]);
 line(54,51,48,56,4.5);line(59,51,65,55,4.5);
 line(53,62,47,69,4.4);line(47,69,50,71,4.4);line(60,62,63,69,4.4);line(63,69,68,69,4.4);
}
function paint(cv,state){
 const v=state.traffic;
 if(!v||!v.visible)return cv;
 if(v.limit!==null){
  if(v.over){cv.arc(46,42,40,45,0,360,[255,18,47,25]);cv.arc(46,42,38,41,0,360,[255,18,47,80]);}
  cv.arc(46,42,28.5,38.5,0,360,RED);
  cv.text(String(v.limit),46,58,45,WHITE,{align:'center',font:'bold'});
  cv.text(tr(v.over?'Speed alert':'Speed limit'),46,105,17,WHITE,{align:'center',literal:true});
  cv.text(v.over?tr('Over limit'):'km/h',46,130,16,v.over?RED:'#c4c9d2',{align:'center',literal:true});
  if(v.over)warning(cv,63,57);
 }
 if(v.children){
  const x=v.limit===null?46:145;children(cv,x,2);
  cv.text(tr('Children caution'),x+44,105,18,WHITE,{align:'center',literal:true});
  cv.text(tr('Sign detected'),x+44,130,16,'#c4c9d2',{align:'center',literal:true});
 }
 return cv;
}
function draw(state){return paint(new Canvas(W,H).clear([0,0,0,0]),state);}
function drawSized(state,scale){const cv=new ScaledCanvas(W,H,scale);cv.clear([0,0,0,0]);paint(cv,state);return cv.canvas;}
module.exports={W,H,draw,drawSized};
