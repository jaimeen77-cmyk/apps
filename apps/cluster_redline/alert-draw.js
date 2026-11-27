'use strict';
// Vehicle alerts on the HUD (1.3.99, the user's choice of the new design): one badge, the most important alert only.
//   speed camera (the car navigation's own event, else the public list: speed-cams.js), its section, a children's or
//   elderly zone camera > a children's zone from the navigation or a children sign > speeding against a recognised sign.
// The badge: the speed limit sign on the left; on the right what it is, how far (or the section's average speed), and the
// speed now. Cyan while within the limit, amber edge in a children's or elderly zone, red over the limit (a section: its
// average). Drawn in a 140 x 62 design, at the final size (the NAV tab's Position / size, 330 x 150 at 100 %).
const {Canvas,ScaledCanvas}=require('./kit/canvas');
const {tr}=require('./strings');
const W=330,H=150,BW=140,BH=62,SLOT=W;
const CYAN=[62,200,245],AMBER=[255,154,31],RED=[255,52,58];
const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
const dist=m=>m>=1000?(Math.round(m/100)/10)+' km':(m>=100?Math.round(m/50)*50:Math.max(0,Math.round(m/10)*10))+' m';
/** The one thing to show, or null: {kind, limit, title, main, sub, colour, over, bar} */
function pick(v){
 if(!v)return null;
 const speed=typeof v.speed==='number'?Math.round(v.speed):null,now=speed!==null?tr('Now')+' '+speed+' km/h':'';
 const c=v.camera,s=v.school;
 if(c){
  const limit=c.limit||null;
  if(c.section&&c.inside){
   const avg=typeof c.avg==='number'?c.avg:null,over=limit!==null&&avg!==null&&avg>limit;
   return {kind:'section',limit,title:tr('Section camera')+(typeof c.remain==='number'?' · '+tr('left')+' '+dist(c.remain):''),main:avg!==null?tr('Average')+' '+avg:tr('In the section'),sub:now,over,zone:null,bar:null};
  }
  const over=limit!==null&&speed!==null&&speed>limit,m=typeof c.m==='number'?c.m:null;
  const title=c.zone==='child'?tr('School zone'):c.zone==='elder'?tr('Elderly zone'):tr(c.section?'Section camera':'Speed camera');
  return {kind:'camera',limit,title:over?title+' · '+tr('Slow down'):title,main:m!==null?dist(m):c.text||'',sub:now,over,zone:c.zone||null,bar:m!==null?Math.max(0,Math.min(1,1-m/500)):null};
 }
 if(s){
  const limit=s.limit||30,over=speed!==null&&speed>limit;
  return {kind:'school',limit,title:tr('School zone'),main:s.sign?tr('Sign detected'):s.inside?tr('In the zone'):typeof s.m==='number'?dist(s.m):s.text||'',sub:now,over,zone:'child',bar:null};
 }
 if(v.speeding){const limit=v.speeding.limit||null;return {kind:'speeding',limit,title:tr('Speeding'),main:speed!==null?speed+' km/h':tr('Over limit'),sub:tr('Over limit'),over:true,zone:null,bar:null};}
 return null;
}
function badge(cv,p){
 const col=p.over?RED:p.zone?AMBER:CYAN;
 cv.roundRect(1,1,BW-2,BH-2,9,p.over?[90,8,12,235]:[10,14,20,225]);
 cv.strokeRoundRect(1,1,BW-2,BH-2,9,1.6,col.concat([255]));
 const cx=31,cy=31,r=24;cv.circle(cx,cy,r,[255,255,255,255]);cv.circle(cx,cy,r-5,[230,30,40,255]);cv.circle(cx,cy,r-9,[255,255,255,255]);
 cv.text(p.limit?String(p.limit):'!',cx,cy+7,p.limit>=100?16:19,'#111111',{font:'bold',align:'center',literal:true});
 const fit=(t,size,max)=>{let s=size;while(s>5&&cv.textWidth(t,s,{literal:true})>max)s-=0.5;return s;};
 cv.text(p.title,62,15,fit(p.title,7.5,74),p.zone&&!p.over?'#ffb547':'#c1cddd',{literal:true});
 cv.text(p.main,62,36,fit(p.main,17,74),p.over?'#ff5a5f':'#ffffff',{font:'bold',literal:true});
 if(p.sub)cv.text(p.sub,62,52,fit(p.sub,8.5,74),p.over?'#ff8a8e':hex(col),{literal:true});
 if(p.bar!==null&&p.bar!==undefined){cv.roundRect(62,56,62,3,1.5,[255,255,255,40]);if(p.bar>0)cv.roundRect(62,56,Math.max(3,62*p.bar),3,1.5,col.concat([255]));}
}
function paint(cv,v,k,ox,oy){
 const p=pick(v);if(!p)return cv;
 const s=new ScaledCanvas(BW,BH,k);s.clear([0,0,0,0]);badge(s,p);const im=s.canvas;cv.drawImage(im.d,im.w,im.h,Math.round(ox),Math.round(oy),im.w,im.h);
 return cv;
}
const K=Math.min(W/BW,H/BH);
function draw(v){const cv=new Canvas(W,H).clear([0,0,0,0]);return paint(cv,v,K,(W-BW*K)/2,(H-BH*K)/2);}
// At w x h (the Position / size scale), anti-aliased at that size rather than resampled.
function drawSized(v,w,h){const k=Math.min(w/BW,h/BH),cv=new Canvas(w,h).clear([0,0,0,0]);return paint(cv,v,k,(w-BW*k)/2,(h-BH*k)/2);}
function key(v){const p=pick(v);return p?JSON.stringify(p):'';}
module.exports={W,H,SLOT,BW,BH,draw,drawSized,key,pick,dist};
