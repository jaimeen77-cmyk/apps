'use strict';
// Vehicle alert icons for the HUD (vehicle-alerts.js decides what shows). The speeding sign and the children
// crossing triangle are the 1.2.54-1.2.57 traffic alert drawings (traffic-draw.js, removed in 1.2.58); the speed
// camera is new. Up to three alerts side by side, W x H, transparent ground; drawn at the final size.
const {Canvas,ScaledCanvas}=require('./kit/canvas');
const {tr}=require('./strings');
const SLOT=110,W=SLOT*3,H=150;
const RED='#ff122f',AMBER='#ffbf00',WHITE='#f5f7fb',GREY='#c4c9d2',BLUE='#3d9bff';
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
 // Filled shirt, shorts, dress, ponytail and walking limbs (the 1.2.55 design sample's silhouettes).
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
// A speed camera: a camera body with its lens, in a blue ring (a section camera: two bodies).
function camera(cv,cx,cy,section){
 cv.arc(cx,cy,30,38,0,360,BLUE);
 const body=(x,y,s)=>{cv.roundRect(x-15*s,y-9*s,30*s,20*s,4*s,WHITE);cv.roundRect(x-6*s,y-13*s,12*s,5*s,2*s,WHITE);cv.arc(x,y+1*s,4*s,7.5*s,0,360,'#05070b');cv.circle(x,y+1*s,3*s,'#7fb8ff');};
 if(section){body(cx-10,cy-4,.7);body(cx+10,cy+6,.7);}else body(cx,cy,1);
}
function fit(cv,text,size,max){let s=size;while(s>11&&cv.textWidth(text,s,{literal:true})>max)s--;return s;}
function label(cv,x,head,sub,subColor){
 cv.text(head,x,105,fit(cv,head,17,SLOT-6),WHITE,{align:'center',literal:true});
 if(sub)cv.text(sub,x,130,fit(cv,sub,16,SLOT-6),subColor||GREY,{align:'center',literal:true});
}
function paint(cv,v){
 if(!v)return cv;
 let slot=0;const at=()=>slot++*SLOT+SLOT/2;
 if(v.speeding){
  const x=at();cv.arc(x,42,40,45,0,360,[255,18,47,25]);cv.arc(x,42,38,41,0,360,[255,18,47,80]);cv.arc(x,42,28.5,38.5,0,360,RED);
  cv.text(v.speeding.limit?String(v.speeding.limit):'!',x,58,v.speeding.limit>=100?36:45,WHITE,{align:'center',font:'bold'});
  warning(cv,x+17,57);label(cv,x,tr('Speeding'),tr('Over limit'),RED);
 }
 if(v.school){
  const x=at();children(cv,x-44,2);
  label(cv,x,tr('School zone'),v.school.inside?tr('In the zone'):v.school.text||'');
 }
 if(v.camera){
  const x=at(),c=v.camera;camera(cv,x,42,c.section);
  const sub=[c.limit?c.limit+' km/h':null,c.inside?tr('In the section'):c.text].filter(Boolean).join(' · ');
  label(cv,x,tr(c.section?'Section camera':'Speed camera'),sub);
 }
 return cv;
}
function draw(v){return paint(new Canvas(W,H).clear([0,0,0,0]),v);}
// At w x h (the Position / size scale), anti-aliased at that size rather than resampled.
function drawSized(v,w,h){const cv=new ScaledCanvas(W,H,Math.min(w/W,h/H));cv.clear([0,0,0,0]);paint(cv,v);return cv.canvas;}
function key(v){return v?JSON.stringify([v.speeding&&v.speeding.limit,!!v.speeding,v.school&&[v.school.inside,v.school.text],v.camera&&[v.camera.section,v.camera.inside,v.camera.text,v.camera.limit]]):'';}
module.exports={W,H,SLOT,draw,drawSized,key};
